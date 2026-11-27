import { prisma, Prisma } from "../../prisma/client";
import { ComplaintStatus } from "../../prisma/generated";
import { deleteWasabiObjects } from "../../utils/wasabiClient";
import { ComplaintActor, ComplaintError, ComplaintUpload } from "./clientComplaints.service";
import {
  attachmentRows,
  classifyUploads,
  clientReferenceOf,
  LoadedComplaint,
  decisionData,
  isComplaintStaff,
  isHead,
  loadComplaint,
  log,
  money,
  moveStatus,
  remarksOf,
  requireHead,
  requireStatus,
  setComplaintStatus,
  uploadAll,
  versionOf,
} from "./complaintWorkflow.shared";
import { startExecutionTx } from "./complaintExecution.service";
import {
  chargeBalance,
  insertPaymentTx,
  preparePayment,
  resolutionPaymentDue,
} from "./complaintPayment.service";

// Repair quotations (spec 13): the quotation is an uploaded file that is
// shared with the client as soon as it is uploaded. HO prepares it and
// records the client's answer together with any payment. Revisions keep
// every earlier version. The visiting charge is never part of a quotation.

const EDITABLE = ["DRAFT", "SENT_FOR_REVISION", "MODIFICATION_REQUESTED"] as const;

export const canPrepareQuotation = (actor: ComplaintActor) => isHead(actor.role);
const MAX_QUOTATION_FILES = 5;

async function latestQuotation(complaintId: number, cycleId: number) {
  return prisma.complaintQuotation.findFirst({
    where: { complaint_id: complaintId, cycle_id: cycleId, status: { not: "SUPERSEDED" } },
    orderBy: [{ quotation_number: "desc" }, { revision: "desc" }],
    select: { id: true, quotation_number: true, revision: true, status: true, client_payable_amount: true },
  });
}

export async function quotationPermissions(
  actor: ComplaintActor,
  complaint: { id: number; status: ComplaintStatus; assigned_ss_id: number | null; current_cycle_id: number | null },
) {
  if (!complaint.current_cycle_id) return null;
  const head = isHead(actor.role);
  const staff = isComplaintStaff(actor, complaint);
  const latest = await latestQuotation(complaint.id, complaint.current_cycle_id);
  let repairCharge = null;
  if (complaint.status === "AWAITING_PAYMENT" && staff) {
    const charge = await prisma.complaintCharge.findFirst({
      where: { complaint_id: complaint.id, cycle_id: complaint.current_cycle_id, charge_type: "REPAIR", status: "OPEN" },
      orderBy: { id: "desc" },
      select: { id: true },
    });
    if (charge) {
      const b = await chargeBalance(prisma, charge.id);
      repairCharge = {
        charge_id: charge.id,
        amount: b.amount,
        outstanding: b.outstanding,
        payment_pending_verification: b.pending,
        can_record: b.outstanding > 0,
        can_waive: head && b.committed === 0,
      };
    }
  }
  const due = staff ? await resolutionPaymentDue(prisma, complaint) : null;
  const is = (s: ComplaintStatus, q: string) => complaint.status === s && latest?.status === q;
  return {
    latest_id: latest?.id ?? null,
    can_upload: canPrepareQuotation(actor) && complaint.status === "QUOTATION_PREPARATION",
    // Quotations sent for approval before uploads replaced it.
    can_review: head && is("DEPARTMENT_HEAD_APPROVAL", "PENDING_HSS_APPROVAL"),
    can_share: head && is("DEPARTMENT_HEAD_APPROVAL", "HSS_APPROVED"),
    can_record_client_response: head && is("QUOTATION_SHARED", "SHARED"),
    repair_charge: repairCharge,
    // Repair amount the client pays once the work is resolved.
    resolution_payment: due ? { quotation_id: due.id, can_waive: head } : null,
  };
}

// Creates the next quotation (or revision) from the uploaded file and shares
// it with the client. The caller has checked the version.
export async function shareQuotationTx(
  tx: Prisma.TransactionClient,
  actor: ComplaintActor,
  complaint: LoadedComplaint,
  uploaded: Awaited<ReturnType<typeof uploadAll>>,
  remarks: string | null,
  clientPayable: number | null = null,
) {
  const latest = await tx.complaintQuotation.findFirst({
    where: { complaint_id: complaint.id, cycle_id: complaint.current_cycle_id, status: { not: "SUPERSEDED" } },
    orderBy: [{ quotation_number: "desc" }, { revision: "desc" }],
    select: { id: true, quotation_number: true, revision: true, status: true },
  });
  const revising = latest && !["CLIENT_ACCEPTED", "CANCELLED"].includes(latest.status);
  if (latest && revising && (EDITABLE as readonly string[]).includes(latest.status))
    await tx.complaintQuotation.update({ where: { id: latest.id }, data: { status: "SUPERSEDED" } });
  const last = await tx.complaintQuotation.aggregate({
    where: { complaint_id: complaint.id },
    _max: { quotation_number: true },
  });
  const report = await tx.complaintInspectionReport.findFirst({
    where: { complaint_id: complaint.id, cycle_id: complaint.current_cycle_id },
    orderBy: { submitted_at: "desc" },
    select: { id: true },
  });
  // Amounts live in the uploaded file; the client pays what HO records.
  const quotation = await tx.complaintQuotation.create({
    data: {
      vendor_id: actor.vendorId,
      complaint_id: complaint.id,
      cycle_id: complaint.current_cycle_id,
      quotation_number: revising ? latest!.quotation_number : (last._max.quotation_number ?? 0) + 1,
      revision: revising ? latest!.revision + 1 : 1,
      inspection_report_id: report?.id ?? null,
      created_by: actor.actorId,
      status: "SHARED",
      shared_at: new Date(),
      // Optional amount HO enters from the file, so the client app can show it
      // and prefill the UPI payment.
      subtotal: clientPayable ?? 0,
      total_amount: clientPayable ?? 0,
      client_payable_amount: clientPayable ?? 0,
    },
  });
  await tx.complaintAttachment.createMany({
    data: attachmentRows(actor, complaint, uploaded, { category: "QUOTATION", quotation_id: quotation.id }),
  });
  await setComplaintStatus(tx, complaint, "QUOTATION_SHARED");
  await log(tx, actor, complaint, {
    action: "QUOTATION_SHARED",
    from_status: complaint.status,
    to_status: "QUOTATION_SHARED",
    remarks: remarks ?? `Quotation Q${quotation.quotation_number} rev ${quotation.revision} shared with the client.`,
    quotation_id: quotation.id,
  });
  return quotation;
}

export function quotationFiles(files: ComplaintUpload[], required: boolean) {
  if (required && files.length === 0) throw new ComplaintError("Upload the quotation file.");
  return classifyUploads(files, MAX_QUOTATION_FILES, false);
}

export async function uploadQuotation(
  actor: ComplaintActor,
  id: number,
  body: Record<string, unknown>,
  files: ComplaintUpload[],
) {
  if (!canPrepareQuotation(actor)) throw new ComplaintError("Only HO can upload quotations.", 403);
  const complaint = await loadComplaint(actor, id);
  requireStatus(complaint, ["QUOTATION_PREPARATION"], "upload the quotation");
  const version = versionOf(body.version);
  const remarks = remarksOf(body.remarks, "Remarks", false);
  const amount =
    body.client_payable_amount === undefined || body.client_payable_amount === null || body.client_payable_amount === ""
      ? null
      : money(body.client_payable_amount, "Amount payable by the client", { allowZero: true });
  const uploaded = await uploadAll(actor, quotationFiles(files, true));
  try {
    const quotation = await prisma.$transaction(async (tx) => {
      await moveStatus(tx, complaint, version, {});
      return shareQuotationTx(tx, actor, complaint, uploaded, remarks, amount);
    });
    return { quotation_id: quotation.id, status: "QUOTATION_SHARED" as const };
  } catch (error) {
    await deleteWasabiObjects(uploaded.map((u) => u.key));
    throw error;
  }
}

export type QuotationAction =
  | "APPROVE"
  | "SEND_FOR_REVISION"
  | "SHARE"
  | "CLIENT_ACCEPTED"
  | "CLIENT_REJECTED"
  | "MODIFICATION_REQUESTED";

// How the client pays an accepted quotation.
const PAYMENT_OPTIONS = ["PAID_NOW", "AT_RESOLUTION", "NONE"] as const;

export async function runQuotationAction(
  actor: ComplaintActor,
  id: number,
  quotationId: number,
  body: Record<string, unknown>,
  proofs: ComplaintUpload[] = [],
) {
  requireHead(actor, "act on quotations");
  const complaint = await loadComplaint(actor, id);
  const version = versionOf(body.version);
  const action = body.action as QuotationAction;
  const quotation = await prisma.complaintQuotation.findFirst({
    where: { id: quotationId, complaint_id: complaint.id, cycle_id: complaint.current_cycle_id },
    select: { id: true, status: true, quotation_number: true, revision: true },
  });
  if (!quotation) throw new ComplaintError("Quotation not found for this complaint.", 404);

  const rules: Record<QuotationAction, [ComplaintStatus, string]> = {
    APPROVE: ["DEPARTMENT_HEAD_APPROVAL", "PENDING_HSS_APPROVAL"],
    SEND_FOR_REVISION: ["DEPARTMENT_HEAD_APPROVAL", "PENDING_HSS_APPROVAL"],
    SHARE: ["DEPARTMENT_HEAD_APPROVAL", "HSS_APPROVED"],
    CLIENT_ACCEPTED: ["QUOTATION_SHARED", "SHARED"],
    CLIENT_REJECTED: ["QUOTATION_SHARED", "SHARED"],
    MODIFICATION_REQUESTED: ["QUOTATION_SHARED", "SHARED"],
  };
  if (!rules[action]) throw new ComplaintError("Unknown quotation action.");
  const [needComplaint, needQuotation] = rules[action];
  if (complaint.status !== needComplaint || quotation.status !== needQuotation)
    throw new ComplaintError("This quotation action is not available at the current stage.", 409);

  const clientAction = action.startsWith("CLIENT_") || action === "MODIFICATION_REQUESTED";
  const remarksRequired = !["SHARE", "CLIENT_ACCEPTED"].includes(action);
  const remarks = remarksOf(
    body.remarks,
    action === "CLIENT_REJECTED" ? "Client's reason" : action === "MODIFICATION_REQUESTED" ? "Requested changes" : "Remarks",
    remarksRequired,
  );
  const clientReference = clientAction ? clientReferenceOf(body.client_reference) : null;
  const paymentOption = body.payment_option as (typeof PAYMENT_OPTIONS)[number];
  if (action === "CLIENT_ACCEPTED" && !PAYMENT_OPTIONS.includes(paymentOption))
    throw new ComplaintError("Choose how the client pays for the repair.");
  // Accepting and paying are recorded together.
  const payment =
    action === "CLIENT_ACCEPTED" && paymentOption === "PAID_NOW" ? await preparePayment(actor, body, proofs) : null;
  const label = `Quotation Q${quotation.quotation_number} rev ${quotation.revision}`;
  let status: ComplaintStatus = complaint.status;

  try {
    await prisma.$transaction(async (tx) => {
      await moveStatus(tx, complaint, version, {});
      let decisionId: number | undefined;
      if (action === "APPROVE" || action === "SEND_FOR_REVISION") {
        const decision = await tx.complaintDecision.create({
          data: decisionData(actor, complaint, {
            decision_type: "HSS_QUOTATION_APPROVAL",
            outcome: action === "APPROVE" ? "APPROVED" : "SENT_FOR_REVISION",
            remarks,
            quotation_id: quotation.id,
          }),
        });
        decisionId = decision.id;
        await tx.complaintQuotation.update({
          where: { id: quotation.id },
          data: {
            status: action === "APPROVE" ? "HSS_APPROVED" : "SENT_FOR_REVISION",
            hss_approval_decision_id: decision.id,
          },
        });
        status = action === "APPROVE" ? "DEPARTMENT_HEAD_APPROVAL" : "QUOTATION_PREPARATION";
      } else if (action === "SHARE") {
        await tx.complaintQuotation.update({
          where: { id: quotation.id },
          data: { status: "SHARED", shared_at: new Date() },
        });
        status = "QUOTATION_SHARED";
      } else {
        const outcome = action === "CLIENT_ACCEPTED" ? "ACCEPTED" : action === "CLIENT_REJECTED" ? "REJECTED" : "MODIFICATION_REQUESTED";
        const decision = await tx.complaintDecision.create({
          data: decisionData(actor, complaint, {
            decision_type: "CLIENT_QUOTATION_RESPONSE",
            outcome,
            remarks,
            quotation_id: quotation.id,
            acting_on_behalf_of_client: true,
            actor_client_reference: clientReference,
          }),
        });
        decisionId = decision.id;
        await tx.complaintQuotation.update({
          where: { id: quotation.id },
          data: {
            status: action === "CLIENT_ACCEPTED" ? "CLIENT_ACCEPTED" : action === "CLIENT_REJECTED" ? "CLIENT_REJECTED" : "MODIFICATION_REQUESTED",
            client_response_decision_id: decision.id,
            payment_at_resolution: action === "CLIENT_ACCEPTED" && paymentOption === "AT_RESOLUTION",
          },
        });
        if (action === "CLIENT_REJECTED") status = "ON_HOLD";
        else if (action === "MODIFICATION_REQUESTED") status = "QUOTATION_PREPARATION";
      }
      if (action !== "CLIENT_ACCEPTED") await setComplaintStatus(tx, complaint, status);
      await log(tx, actor, complaint, {
        action: `QUOTATION_${action}`,
        from_status: complaint.status,
        to_status: action === "CLIENT_ACCEPTED" ? null : status,
        remarks:
          remarks ??
          (action === "CLIENT_ACCEPTED"
            ? `${label} accepted · ${paymentOption === "PAID_NOW" ? "paid now" : paymentOption === "AT_RESOLUTION" ? "pays at resolution" : "nothing to pay"}`
            : label),
        quotation_id: quotation.id,
        decision_id: decisionId,
        acting_on_behalf_of_client: clientAction,
        actor_client_reference: clientReference,
        metadata: clientAction ? { quotation: label, payment_option: paymentOption ?? null } : undefined,
      });
      if (action === "CLIENT_ACCEPTED") {
        if (payment) {
          const charge = await tx.complaintCharge.create({
            data: {
              vendor_id: actor.vendorId,
              complaint_id: complaint.id,
              cycle_id: complaint.current_cycle_id,
              charge_type: "REPAIR",
              quotation_id: quotation.id,
              amount: payment.amount,
              created_by: actor.actorId,
            },
          });
          await insertPaymentTx(tx, actor, complaint, charge, payment, true);
        }
        status = await startExecutionTx(tx, actor, complaint, { quotationId: quotation.id });
      }
    });
  } catch (error) {
    if (payment) await deleteWasabiObjects(payment.uploaded.map((u) => u.key));
    throw error;
  }
  return { status };
}
