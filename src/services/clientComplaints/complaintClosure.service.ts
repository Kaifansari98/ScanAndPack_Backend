import { prisma, Prisma } from "../../prisma/client";
import { ComplaintStatus } from "../../prisma/generated";
import { deleteWasabiObjects } from "../../utils/wasabiClient";
import { ComplaintActor, ComplaintError, ComplaintUpload } from "./clientComplaints.service";
import {
  attachmentRows,
  classifyUploads,
  clientReferenceOf,
  decisionData,
  isComplaintStaff,
  isHead,
  LoadedComplaint,
  loadComplaint,
  log,
  moveStatus,
  remarksOf,
  requireHead,
  requireStatus,
  setComplaintStatus,
  uploadAll,
  versionOf,
} from "./complaintWorkflow.shared";
import { chargeBalance } from "./complaintPayment.service";
import { OPEN_EXECUTION } from "./complaintExecution.service";

// Client confirmation, reopening, HO closure (spec 16) and cancellation.
// A complaint is CLOSED only after client confirmation (or an HO-authorised
// no-response closure, recorded as such) and HO's final approval.

const FINISHED: ComplaintStatus[] = ["CLOSED", "REJECTED", "CANCELLED"];

// Anything still owed or unverified blocks closure (spec 16.3 financial clearance).
async function financialIssues(db: typeof prisma | Prisma.TransactionClient, complaint: { id: number; current_cycle_id: number }) {
  const [charges, pending] = await Promise.all([
    db.complaintCharge.findMany({
      where: { complaint_id: complaint.id, cycle_id: complaint.current_cycle_id, status: "OPEN" },
      select: { id: true, charge_type: true },
    }),
    db.complaintPayment.count({
      where: { complaint_id: complaint.id, cycle_id: complaint.current_cycle_id, status: "PENDING_VERIFICATION" },
    }),
  ]);
  const issues: string[] = [];
  if (pending) issues.push(`${pending} payment${pending === 1 ? "" : "s"} awaiting verification`);
  for (const charge of charges) {
    const b = await chargeBalance(db, charge.id);
    // A charge on a visit that never happened was voided; anything open must be paid.
    if (b.verified < b.amount)
      issues.push(`${charge.charge_type === "VISIT" ? "Visiting" : "Repair"} charge has ₹${(b.amount - b.verified).toFixed(2)} unpaid`);
  }
  return issues;
}

export async function closurePermissions(
  actor: ComplaintActor,
  complaint: { id: number; status: ComplaintStatus; assigned_ss_id: number | null; current_cycle_id: number | null },
) {
  const head = isHead(actor.role);
  const staff = isComplaintStaff(actor, complaint);
  const awaitingClient = complaint.status === "AWAITING_CLIENT_CONFIRMATION";
  return {
    can_record_client_confirmation: staff && awaitingClient,
    can_close_without_response: head && awaitingClient,
    ho_closure:
      head && complaint.status === "AWAITING_HO_CLOSURE_APPROVAL" && complaint.current_cycle_id
        ? { financial_issues: await financialIssues(prisma, { id: complaint.id, current_cycle_id: complaint.current_cycle_id }) }
        : null,
    can_cancel: head && !FINISHED.includes(complaint.status),
  };
}

async function upsertClosure(
  tx: Prisma.TransactionClient,
  actor: ComplaintActor,
  complaint: LoadedComplaint,
  data: Omit<Prisma.ComplaintClosureUncheckedCreateInput, "vendor_id" | "complaint_id" | "cycle_id">,
) {
  return tx.complaintClosure.upsert({
    where: { cycle_id: complaint.current_cycle_id },
    create: { vendor_id: actor.vendorId, complaint_id: complaint.id, cycle_id: complaint.current_cycle_id, ...data },
    update: data,
  });
}

// Spec 16.4: the original cycle stays untouched; work continues in a new cycle.
async function reopenTx(tx: Prisma.TransactionClient, actor: ComplaintActor, complaint: LoadedComplaint, reason: string) {
  const now = new Date();
  await tx.complaintCycle.update({
    where: { id: complaint.current_cycle_id },
    data: { ended_at: now, end_reason: "REOPENED" },
  });
  const last = await tx.complaintCycle.aggregate({ where: { complaint_id: complaint.id }, _max: { cycle_number: true } });
  const cycle = await tx.complaintCycle.create({
    data: {
      vendor_id: actor.vendorId,
      complaint_id: complaint.id,
      cycle_number: (last._max.cycle_number ?? 1) + 1,
      reopened_reason: reason,
      opened_by_actor_type: "STAFF",
      opened_by_user_id: actor.actorId,
    },
  });
  await tx.complaintMaster.update({
    where: { id: complaint.id },
    data: { current_cycle_id: cycle.id, status: "REOPENED", status_changed_at: now },
  });
  await tx.complaintActivityLog.create({
    data: {
      vendor_id: actor.vendorId,
      complaint_id: complaint.id,
      cycle_id: cycle.id,
      action: "CYCLE_OPENED",
      from_status: complaint.status,
      to_status: "REOPENED",
      actor_type: "STAFF",
      actor_user_id: actor.actorId,
      remarks: reason,
    },
  });
  return cycle;
}

export async function recordClientConfirmation(
  actor: ComplaintActor,
  id: number,
  body: Record<string, unknown>,
  photos: ComplaintUpload[],
) {
  const complaint = await loadComplaint(actor, id);
  if (!isComplaintStaff(actor, complaint))
    throw new ComplaintError("Only HO or the assigned site supervisor can record the client's confirmation.", 403);
  requireStatus(complaint, ["AWAITING_CLIENT_CONFIRMATION"], "record the client's confirmation");
  const version = versionOf(body.version);
  const satisfied = body.outcome === "SATISFIED";
  if (!satisfied && body.outcome !== "NOT_SATISFIED") throw new ComplaintError("Choose whether the client is satisfied.");
  const clientReference = clientReferenceOf(body.client_reference);
  const remarks = remarksOf(body.remarks, satisfied ? "Client remarks" : "Reason for reopening", !satisfied);
  const uploaded = await uploadAll(actor, classifyUploads(photos, 10));

  let status: ComplaintStatus = complaint.status;
  try {
    await prisma.$transaction(async (tx) => {
      await moveStatus(tx, complaint, version, {});
      const decision = await tx.complaintDecision.create({
        data: decisionData(actor, complaint, {
          decision_type: "CLIENT_RESOLUTION_CONFIRMATION",
          outcome: satisfied ? "SATISFIED" : "NOT_SATISFIED",
          remarks,
          acting_on_behalf_of_client: true,
          actor_client_reference: clientReference,
        }),
      });
      if (uploaded.length)
        await tx.complaintAttachment.createMany({
          data: attachmentRows(actor, complaint, uploaded, { category: "CLIENT_CONFIRMATION", decision_id: decision.id }),
        });
      const closure = await upsertClosure(tx, actor, complaint, {
        client_confirmation_status: satisfied ? "SATISFIED" : "NOT_SATISFIED",
        client_confirmation_decision_id: decision.id,
      });
      status = satisfied ? "AWAITING_HO_CLOSURE_APPROVAL" : "REOPENED";
      if (satisfied) await setComplaintStatus(tx, complaint, status);
      await log(tx, actor, complaint, {
        action: satisfied ? "CLIENT_CONFIRMED_RESOLUTION" : "COMPLAINT_REOPENED",
        from_status: complaint.status,
        to_status: status,
        remarks,
        decision_id: decision.id,
        closure_id: closure.id,
        acting_on_behalf_of_client: true,
        actor_client_reference: clientReference,
      });
      if (!satisfied) await reopenTx(tx, actor, complaint, remarks!);
    });
  } catch (error) {
    await deleteWasabiObjects(uploaded.map((u) => u.key));
    throw error;
  }
  return { status };
}

// Spec 16.5: HO may close without the client's answer; it is never shown as client-confirmed.
export async function closeWithoutResponse(actor: ComplaintActor, id: number, body: Record<string, unknown>) {
  requireHead(actor, "authorise a closure without client response");
  const complaint = await loadComplaint(actor, id);
  requireStatus(complaint, ["AWAITING_CLIENT_CONFIRMATION"], "authorise a no-response closure");
  const version = versionOf(body.version);
  const reason = remarksOf(body.remarks, "Reason for closing without client confirmation")!.slice(0, 2000);
  await prisma.$transaction(async (tx) => {
    await moveStatus(tx, complaint, version, {});
    const closure = await upsertClosure(tx, actor, complaint, {
      client_confirmation_status: "NO_RESPONSE_HO_AUTHORISED",
      no_response_reason: reason,
    });
    await setComplaintStatus(tx, complaint, "AWAITING_HO_CLOSURE_APPROVAL");
    await log(tx, actor, complaint, {
      action: "NO_RESPONSE_CLOSURE_AUTHORISED",
      from_status: complaint.status,
      to_status: "AWAITING_HO_CLOSURE_APPROVAL",
      remarks: reason,
      closure_id: closure.id,
    });
  });
  return { status: "AWAITING_HO_CLOSURE_APPROVAL" as const };
}

export async function approveClosure(actor: ComplaintActor, id: number, body: Record<string, unknown>) {
  requireHead(actor, "approve closure");
  const complaint = await loadComplaint(actor, id);
  requireStatus(complaint, ["AWAITING_HO_CLOSURE_APPROVAL"], "close the complaint");
  const version = versionOf(body.version);
  if (body.reports_reviewed !== true)
    throw new ComplaintError("Confirm you have reviewed the inspection and completion reports.");
  const remarks = remarksOf(body.remarks, "Closure remarks")!;
  const issues = await financialIssues(prisma, complaint);
  if (issues.length) throw new ComplaintError(`Financial clearance pending: ${issues.join("; ")}.`, 409);
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await moveStatus(tx, complaint, version, { status: "CLOSED", status_changed_at: now });
    const closure = await tx.complaintClosure.update({
      where: { cycle_id: complaint.current_cycle_id },
      data: {
        status: "CLOSED",
        completion_verified_by: actor.actorId,
        completion_verified_at: now,
        financial_verified_by: actor.actorId,
        financial_verified_at: now,
        closed_by: actor.actorId,
        closed_at: now,
        closure_remarks: remarks,
      },
    });
    await tx.complaintCycle.update({
      where: { id: complaint.current_cycle_id },
      data: { closed_at: now, ended_at: now, end_reason: "CLOSED" },
    });
    await tx.complaintTask.updateMany({
      where: { complaint_id: complaint.id, cycle_id: complaint.current_cycle_id, status: { in: ["open", "in_progress"] } },
      data: { status: "closed" },
    });
    await log(tx, actor, complaint, {
      action: "COMPLAINT_CLOSED",
      from_status: complaint.status,
      to_status: "CLOSED",
      remarks,
      closure_id: closure.id,
    });
  });
  return { status: "CLOSED" as const };
}

export async function cancelComplaint(actor: ComplaintActor, id: number, body: Record<string, unknown>) {
  requireHead(actor, "cancel complaints");
  const complaint = await loadComplaint(actor, id);
  if (FINISHED.includes(complaint.status)) throw new ComplaintError("This complaint is already finished.", 409);
  const version = versionOf(body.version);
  const reason = remarksOf(body.remarks, "Reason for cancellation")!;
  const pending = await prisma.complaintPayment.count({
    where: { complaint_id: complaint.id, cycle_id: complaint.current_cycle_id, status: "PENDING_VERIFICATION" },
  });
  if (pending) throw new ComplaintError("Verify or reject the recorded payments before cancelling.", 409);
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await moveStatus(tx, complaint, version, { status: "CANCELLED", status_changed_at: now });
    const where = { complaint_id: complaint.id, cycle_id: complaint.current_cycle_id };
    await tx.complaintVisit.updateMany({
      where: { ...where, status: { notIn: ["COMPLETED", "CANCELLED", "CLIENT_NOT_AVAILABLE", "SITE_NOT_ACCESSIBLE"] } },
      data: { status: "CANCELLED", remarks: reason.slice(0, 4000) },
    });
    await tx.complaintExecution.updateMany({
      where: { ...where, status: { in: OPEN_EXECUTION } },
      data: { status: "CANCELLED" },
    });
    // Unpaid charges are void; anything already paid stays on record for refund review.
    for (const charge of await tx.complaintCharge.findMany({ where: { ...where, status: "OPEN" }, select: { id: true } })) {
      const b = await chargeBalance(tx, charge.id);
      if (b.verified === 0) await tx.complaintCharge.update({ where: { id: charge.id }, data: { status: "VOIDED" } });
    }
    await tx.complaintTask.updateMany({
      where: { ...where, status: { in: ["open", "in_progress"] } },
      data: { status: "cancelled" },
    });
    await tx.complaintCycle.update({
      where: { id: complaint.current_cycle_id },
      data: { ended_at: now, end_reason: "CANCELLED" },
    });
    await log(tx, actor, complaint, {
      action: "COMPLAINT_CANCELLED",
      from_status: complaint.status,
      to_status: "CANCELLED",
      remarks: reason,
    });
  });
  return { status: "CANCELLED" as const };
}
