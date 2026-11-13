import { prisma } from "../../prisma/client";
import { ComplaintQuotationItemCategory, ComplaintStatus } from "../../prisma/generated";
import { ComplaintActor, ComplaintError } from "./clientComplaints.service";
import {
  clientReferenceOf,
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
  versionOf,
} from "./complaintWorkflow.shared";
import { startExecutionTx } from "./complaintExecution.service";
import { chargeBalance } from "./complaintPayment.service";

// Repair quotations (spec 13): prepared by HO, approved by the department head,
// shared with and answered by the client. Revisions keep every earlier version.
// The visiting charge is never part of a quotation.

const EDITABLE = ["DRAFT", "SENT_FOR_REVISION", "MODIFICATION_REQUESTED"] as const;
const round2 = (n: number) => Math.round(n * 100) / 100;

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
  const latest = await latestQuotation(complaint.id, complaint.current_cycle_id);
  let repairCharge = null;
  if (complaint.status === "AWAITING_PAYMENT" && isComplaintStaff(actor, complaint)) {
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
  const is = (s: ComplaintStatus, q: string) => complaint.status === s && latest?.status === q;
  return {
    latest_id: latest?.id ?? null,
    can_edit: head && complaint.status === "QUOTATION_PREPARATION",
    // Prefill source when editing: the draft itself or the version being revised.
    edit_from_id: latest && (EDITABLE as readonly string[]).includes(latest.status) ? latest.id : null,
    can_review: head && is("DEPARTMENT_HEAD_APPROVAL", "PENDING_HSS_APPROVAL"),
    can_share: head && is("DEPARTMENT_HEAD_APPROVAL", "HSS_APPROVED"),
    can_record_client_response: head && is("QUOTATION_SHARED", "SHARED"),
    repair_charge: repairCharge,
  };
}

type ItemInput = {
  category?: unknown;
  description?: unknown;
  quantity?: unknown;
  unit?: unknown;
  unit_rate?: unknown;
  warranty_covered_amount?: unknown;
  chargeable_reason?: unknown;
};

export async function saveQuotation(actor: ComplaintActor, id: number, body: Record<string, unknown>) {
  requireHead(actor, "prepare quotations");
  const complaint = await loadComplaint(actor, id);
  requireStatus(complaint, ["QUOTATION_PREPARATION"], "edit the quotation");
  const version = versionOf(body.version);
  const { warranty_status: warranty } = await prisma.complaintMaster.findUniqueOrThrow({
    where: { id: complaint.id },
    select: { warranty_status: true },
  });
  const underWarranty = warranty === "COVERED" || warranty === "PARTIALLY_COVERED";

  if (!Array.isArray(body.items) || body.items.length === 0) throw new ComplaintError("Add at least one quotation line.");
  if (body.items.length > 100) throw new ComplaintError("Add up to 100 quotation lines.");
  const items = (body.items as ItemInput[]).map((item, i) => {
    const line = `Line ${i + 1}`;
    const category = item.category as ComplaintQuotationItemCategory;
    if (!Object.values(ComplaintQuotationItemCategory).includes(category))
      throw new ComplaintError(`${line}: choose material, hardware, labour, transportation or other.`);
    const quantity = Number(item.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) throw new ComplaintError(`${line}: enter a quantity above 0.`);
    const rate = money(item.unit_rate, `${line} rate`, { allowZero: true });
    const total = round2(quantity * rate);
    const covered = money(item.warranty_covered_amount ?? 0, `${line} warranty-covered amount`, { allowZero: true });
    if (covered > total) throw new ComplaintError(`${line}: the warranty-covered amount exceeds the line total.`);
    if (covered > 0 && !underWarranty)
      throw new ComplaintError("Record a warranty decision of covered or partially covered before marking items as warranty covered.");
    const payable = round2(total - covered);
    // Spec 13.4: any chargeable amount on a warranty complaint needs a reason.
    const reason = remarksOf(item.chargeable_reason, `${line} reason for charging`, underWarranty && payable > 0);
    return {
      sequence: i + 1,
      category,
      description: remarksOf(item.description, `${line} description`)!.slice(0, 2000),
      quantity,
      unit: remarksOf(item.unit, `${line} unit`, false)?.slice(0, 40) ?? null,
      unit_rate: rate,
      line_total: total,
      warranty_covered_amount: covered,
      client_payable_amount: payable,
      chargeable_reason: reason?.slice(0, 2000) ?? null,
    };
  });
  const tax = money(body.tax_amount ?? 0, "Applicable taxes", { allowZero: true });
  const subtotal = round2(items.reduce((t, i) => t + i.line_total, 0));
  const covered = round2(items.reduce((t, i) => t + i.warranty_covered_amount, 0));
  const totals = {
    subtotal,
    tax_amount: tax,
    total_amount: round2(subtotal + tax),
    warranty_covered_amount: covered,
    client_payable_amount: round2(subtotal + tax - covered),
  };
  const submit = body.submit === true;

  const latest = await latestQuotation(complaint.id, complaint.current_cycle_id);
  const report = await prisma.complaintInspectionReport.findFirst({
    where: { complaint_id: complaint.id, cycle_id: complaint.current_cycle_id },
    orderBy: { submitted_at: "desc" },
    select: { id: true },
  });

  return prisma.$transaction(async (tx) => {
    await moveStatus(tx, complaint, version, {});
    let quotationId: number;
    const status = submit ? "PENDING_HSS_APPROVAL" : "DRAFT";
    if (latest?.status === "DRAFT") {
      quotationId = latest.id;
      await tx.complaintQuotationItem.deleteMany({ where: { quotation_id: latest.id } });
      await tx.complaintQuotation.update({ where: { id: latest.id }, data: { ...totals, status } });
    } else {
      const revising = latest && (EDITABLE as readonly string[]).includes(latest.status);
      if (latest && revising)
        await tx.complaintQuotation.update({ where: { id: latest.id }, data: { status: "SUPERSEDED" } });
      const last = await tx.complaintQuotation.aggregate({
        where: { complaint_id: complaint.id },
        _max: { quotation_number: true },
      });
      const created = await tx.complaintQuotation.create({
        data: {
          vendor_id: actor.vendorId,
          complaint_id: complaint.id,
          cycle_id: complaint.current_cycle_id,
          quotation_number: revising ? latest!.quotation_number : (last._max.quotation_number ?? 0) + 1,
          revision: revising ? latest!.revision + 1 : 1,
          inspection_report_id: report?.id ?? null,
          created_by: actor.actorId,
          status,
          ...totals,
        },
      });
      quotationId = created.id;
    }
    await tx.complaintQuotationItem.createMany({
      data: items.map((item) => ({
        vendor_id: actor.vendorId,
        complaint_id: complaint.id,
        cycle_id: complaint.current_cycle_id,
        quotation_id: quotationId,
        ...item,
      })),
    });
    if (submit) await setComplaintStatus(tx, complaint, "DEPARTMENT_HEAD_APPROVAL");
    await log(tx, actor, complaint, {
      action: submit ? "QUOTATION_SUBMITTED_FOR_APPROVAL" : "QUOTATION_DRAFT_SAVED",
      from_status: complaint.status,
      to_status: submit ? "DEPARTMENT_HEAD_APPROVAL" : complaint.status,
      remarks: `Total ₹${totals.total_amount.toFixed(2)} · client payable ₹${totals.client_payable_amount.toFixed(2)}`,
      quotation_id: quotationId,
    });
    return { quotation_id: quotationId, status };
  });
}

export type QuotationAction =
  | "APPROVE"
  | "SEND_FOR_REVISION"
  | "SHARE"
  | "CLIENT_ACCEPTED"
  | "CLIENT_REJECTED"
  | "MODIFICATION_REQUESTED";

export async function runQuotationAction(
  actor: ComplaintActor,
  id: number,
  quotationId: number,
  body: Record<string, unknown>,
) {
  requireHead(actor, "act on quotations");
  const complaint = await loadComplaint(actor, id);
  const version = versionOf(body.version);
  const action = body.action as QuotationAction;
  const quotation = await prisma.complaintQuotation.findFirst({
    where: { id: quotationId, complaint_id: complaint.id, cycle_id: complaint.current_cycle_id },
    select: { id: true, status: true, quotation_number: true, revision: true, client_payable_amount: true },
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
  const payable = Number(quotation.client_payable_amount);
  const label = `Quotation Q${quotation.quotation_number} rev ${quotation.revision}`;
  let status: ComplaintStatus = complaint.status;

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
        },
      });
      if (action === "CLIENT_REJECTED") status = "ON_HOLD";
      else if (action === "MODIFICATION_REQUESTED") status = "QUOTATION_PREPARATION";
    }
    if (action === "CLIENT_ACCEPTED" && payable > 0) {
      await tx.complaintCharge.create({
        data: {
          vendor_id: actor.vendorId,
          complaint_id: complaint.id,
          cycle_id: complaint.current_cycle_id,
          charge_type: "REPAIR",
          quotation_id: quotation.id,
          amount: payable,
          created_by: actor.actorId,
        },
      });
      status = "AWAITING_PAYMENT";
    }
    if (action !== "CLIENT_ACCEPTED" || payable > 0) await setComplaintStatus(tx, complaint, status);
    await log(tx, actor, complaint, {
      action: `QUOTATION_${action}`,
      from_status: complaint.status,
      to_status: status,
      remarks: remarks ?? label,
      quotation_id: quotation.id,
      decision_id: decisionId,
      acting_on_behalf_of_client: clientAction,
      actor_client_reference: clientReference,
      metadata: clientAction ? { quotation: label, client_payable: payable } : undefined,
    });
    // Nothing for the client to pay (e.g. fully warranty covered): start the work.
    if (action === "CLIENT_ACCEPTED" && payable === 0)
      status = await startExecutionTx(tx, actor, complaint, { quotationId: quotation.id });
  });
  return { status };
}
