import { prisma, Prisma } from "../../prisma/client";
import { ComplaintPaymentMethod, ComplaintStatus } from "../../prisma/generated";
import { deleteWasabiObjects } from "../../utils/wasabiClient";
import { ComplaintActor, ComplaintError, ComplaintUpload } from "./clientComplaints.service";
import {
  attachmentRows,
  classifyUploads,
  dateOnly,
  LoadedComplaint,
  loadComplaint,
  log,
  isComplaintStaff,
  isHead,
  money,
  moveStatus,
  remarksOf,
  requireHead,
  setComplaintStatus,
  uploadAll,
  versionOf,
} from "./complaintWorkflow.shared";
import { startExecutionTx } from "./complaintExecution.service";

// Payments against visit and repair charges (spec 14). Visiting and repair
// charges stay separate records; every payment needs a transaction reference
// and proof. Visiting-charge payments and payments HO records are accepted as
// recorded; a site supervisor's repair payment is verified by HO.

type Db = Prisma.TransactionClient | typeof prisma;

export async function chargeBalance(db: Db, chargeId: number) {
  const charge = await db.complaintCharge.findUniqueOrThrow({
    where: { id: chargeId },
    select: {
      id: true,
      charge_type: true,
      status: true,
      amount: true,
      visit_id: true,
      quotation_id: true,
      allocations: { select: { amount: true, payment: { select: { status: true } } } },
    },
  });
  const sum = (statuses: string[]) =>
    charge.allocations
      .filter((a) => statuses.includes(a.payment.status))
      .reduce((total, a) => total + Number(a.amount), 0);
  const amount = Number(charge.amount);
  const committed = sum(["VERIFIED", "PENDING_VERIFICATION"]);
  return {
    charge,
    amount,
    verified: sum(["VERIFIED"]),
    committed,
    outstanding: Math.max(0, Math.round((amount - committed) * 100) / 100),
    pending: charge.allocations.some((a) => a.payment.status === "PENDING_VERIFICATION"),
  };
}

// A charge is settled when waived, voided, or fully covered by verified payments.
export const isSettled = (b: Awaited<ReturnType<typeof chargeBalance>>) =>
  b.charge.status !== "OPEN" || b.verified >= b.amount;

// Validates the payment fields and uploads the proof, before any transaction.
// Without `outstanding` the amount is not capped (file-only quotations).
export async function preparePayment(
  actor: ComplaintActor,
  body: Record<string, unknown>,
  proofs: ComplaintUpload[],
  outstanding?: number,
) {
  const amount = money(body.amount, "Payment amount");
  if (outstanding !== undefined && amount > outstanding)
    throw new ComplaintError(`The amount exceeds the outstanding ₹${outstanding.toFixed(2)}.`);
  const method = body.method as ComplaintPaymentMethod;
  if (!Object.values(ComplaintPaymentMethod).includes(method)) throw new ComplaintError("Select the payment method.");
  // Cash has no transaction reference; the receipt photo is the proof.
  const reference = (
    method === "CASH"
      ? (remarksOf(body.transaction_reference, "Transaction reference", false) ?? "Cash")
      : remarksOf(body.transaction_reference, "Transaction reference")!
  ).slice(0, 255);
  const paymentDate = dateOnly(body.payment_date, "Payment date", { required: true, notFuture: true })!;
  if (proofs.length !== 1) throw new ComplaintError("Attach one payment proof (photo or PDF).");
  const uploaded = await uploadAll(actor, classifyUploads(proofs, 1, false));
  return { amount, method, reference, paymentDate, uploaded };
}

export type PreparedPayment = Awaited<ReturnType<typeof preparePayment>>;

// Cash the client paid to the visiting team, recorded with the report that
// follows the visit (inspection report, or the completion report for an
// installation team visit). Returns null when no payment was sent.
export async function prepareVisitCash(
  actor: ComplaintActor,
  complaint: LoadedComplaint,
  raw: unknown,
  proofs: ComplaintUpload[],
  visitId?: number,
) {
  if (!raw || typeof raw !== "object") return null;
  const charge = await prisma.complaintCharge.findFirst({
    where: {
      vendor_id: actor.vendorId,
      complaint_id: complaint.id,
      cycle_id: complaint.current_cycle_id,
      charge_type: "VISIT",
      status: "OPEN",
      visit: { pay_at_visit: true, ...(visitId ? { id: visitId } : {}) },
    },
    orderBy: { id: "desc" },
    select: { id: true },
  });
  if (!charge) throw new ComplaintError("There is no visiting charge to collect for this visit.", 409);
  const balance = await chargeBalance(prisma, charge.id);
  if (balance.outstanding <= 0) throw new ComplaintError("The visiting charge is already paid.", 409);
  const prepared = await preparePayment(actor, raw as Record<string, unknown>, proofs, balance.outstanding);
  return { charge: balance.charge, prepared };
}

export type VisitCash = NonNullable<Awaited<ReturnType<typeof prepareVisitCash>>>;

// Stores the proof, the payment and its allocation to one charge.
export async function insertPaymentTx(
  tx: Prisma.TransactionClient,
  actor: ComplaintActor,
  complaint: LoadedComplaint,
  charge: { id: number; charge_type: string; visit_id: number | null; quotation_id: number | null },
  p: PreparedPayment,
  verified: boolean,
) {
  const [row] = attachmentRows(actor, complaint, p.uploaded, {
    category: "PAYMENT_PROOF",
    visit_id: charge.visit_id,
  });
  const proof = await tx.complaintAttachment.create({ data: row });
  const payment = await tx.complaintPayment.create({
    data: {
      vendor_id: actor.vendorId,
      complaint_id: complaint.id,
      cycle_id: complaint.current_cycle_id,
      amount: p.amount,
      method: p.method,
      transaction_reference: p.reference,
      payment_date: p.paymentDate,
      proof_attachment_id: proof.id,
      actor_type: "STAFF",
      actor_user_id: actor.actorId,
      ...(verified ? { status: "VERIFIED", verified_by: actor.actorId, verified_at: new Date() } : {}),
    },
  });
  await tx.complaintPaymentAllocation.create({
    data: {
      vendor_id: actor.vendorId,
      complaint_id: complaint.id,
      cycle_id: complaint.current_cycle_id,
      payment_id: payment.id,
      charge_id: charge.id,
      amount: p.amount,
      allocated_by: actor.actorId,
    },
  });
  await log(tx, actor, complaint, {
    action: `${charge.charge_type}_PAYMENT_RECORDED`,
    remarks: `₹${p.amount.toFixed(2)} via ${p.method} · ${p.reference}`,
    visit_id: charge.visit_id,
    quotation_id: charge.quotation_id,
    payment_id: payment.id,
  });
  return payment;
}

export async function recordChargePayment(
  actor: ComplaintActor,
  complaint: LoadedComplaint,
  version: number,
  chargeId: number,
  body: Record<string, unknown>,
  proofs: ComplaintUpload[],
) {
  const balance = await chargeBalance(prisma, chargeId);
  if (balance.charge.status !== "OPEN") throw new ComplaintError("This charge is no longer payable.", 409);
  const prepared = await preparePayment(actor, body, proofs, balance.outstanding);
  // Visiting charges, and anything HO records itself, count as verified;
  // a supervisor's repair payment still waits for HO.
  const autoVerified = balance.charge.charge_type === "VISIT" || isHead(actor.role);

  try {
    return await prisma.$transaction(async (tx) => {
      await moveStatus(tx, complaint, version, {});
      const payment = await insertPaymentTx(tx, actor, complaint, balance.charge, prepared, autoVerified);
      let status: ComplaintStatus = complaint.status;
      if (autoVerified) {
        const settled = await chargeBalance(tx, chargeId);
        if (isSettled(settled)) status = (await onChargeSettled(tx, actor, complaint, settled)) ?? status;
      }
      return { payment_id: payment.id, status };
    });
  } catch (error) {
    await deleteWasabiObjects(prepared.uploaded.map((u) => u.key));
    throw error;
  }
}

// Runs once a charge becomes settled: releases its visit or starts the repair.
async function onChargeSettled(
  tx: Prisma.TransactionClient,
  actor: ComplaintActor,
  complaint: LoadedComplaint,
  balance: Awaited<ReturnType<typeof chargeBalance>>,
): Promise<ComplaintStatus | null> {
  const { charge } = balance;
  if (charge.visit_id) {
    const visit = await tx.complaintVisit.findUnique({ where: { id: charge.visit_id }, select: { status: true } });
    if (visit?.status !== "AWAITING_PAYMENT") return null;
    await tx.complaintVisit.update({ where: { id: charge.visit_id }, data: { status: "READY_TO_SCHEDULE" } });
    await setComplaintStatus(tx, complaint, "APPROVED_FOR_VISIT");
    await log(tx, actor, complaint, {
      action: "VISIT_CHARGE_SETTLED",
      from_status: complaint.status,
      to_status: "APPROVED_FOR_VISIT",
      remarks: "Visiting charge settled; visit ready to schedule.",
      visit_id: charge.visit_id,
    });
    return "APPROVED_FOR_VISIT";
  }
  if (charge.quotation_id && complaint.status === "AWAITING_PAYMENT")
    return startExecutionTx(tx, actor, complaint, { quotationId: charge.quotation_id });
  return null;
}

export async function verifyPayment(actor: ComplaintActor, id: number, paymentId: number, body: Record<string, unknown>) {
  requireHead(actor, "verify payments");
  const complaint = await loadComplaint(actor, id);
  const version = versionOf(body.version);
  const outcome = body.outcome;
  if (outcome !== "VERIFIED" && outcome !== "REJECTED") throw new ComplaintError("Choose verify or reject.");
  const remarks = remarksOf(body.remarks, "Rejection reason", outcome === "REJECTED");
  const payment = await prisma.complaintPayment.findFirst({
    where: { id: paymentId, vendor_id: actor.vendorId, complaint_id: complaint.id },
    select: {
      id: true,
      status: true,
      allocations: { select: { charge: { select: { id: true, charge_type: true } } } },
    },
  });
  if (!payment) throw new ComplaintError("Payment not found for this complaint.", 404);
  if (payment.status !== "PENDING_VERIFICATION") throw new ComplaintError("This payment has already been reviewed.", 409);
  const prefix = payment.allocations[0]?.charge.charge_type ?? "VISIT";

  let complaintStatus: ComplaintStatus = complaint.status;
  await prisma.$transaction(async (tx) => {
    await moveStatus(tx, complaint, version, {});
    await tx.complaintPayment.update({
      where: { id: payment.id },
      data:
        outcome === "VERIFIED"
          ? { status: "VERIFIED", verified_by: actor.actorId, verified_at: new Date() }
          : {
              status: "REJECTED",
              verified_by: actor.actorId,
              verified_at: new Date(),
              rejection_remarks: remarks!.slice(0, 2000),
            },
    });
    // Logged first so the history reads payment → what it released.
    await log(tx, actor, complaint, {
      action: `${prefix}_PAYMENT_${outcome}`,
      remarks,
      payment_id: payment.id,
    });
    if (outcome === "VERIFIED")
      for (const { charge } of payment.allocations) {
        const balance = await chargeBalance(tx, charge.id);
        if (balance.charge.status === "OPEN" && balance.verified >= balance.amount)
          complaintStatus = (await onChargeSettled(tx, actor, complaint, balance)) ?? complaintStatus;
      }
  });
  return { status: complaintStatus };
}

// HO waiver of an open charge (spec 7.2 visiting-charge exceptions, 14 waivers).
export async function waiveChargeTx(
  tx: Prisma.TransactionClient,
  actor: ComplaintActor,
  complaint: LoadedComplaint,
  chargeId: number,
  remarks: string,
) {
  const balance = await chargeBalance(tx, chargeId);
  if (balance.charge.status !== "OPEN" || balance.committed > 0)
    throw new ComplaintError("Only an unpaid charge can be waived. Reject or settle recorded payments first.", 409);
  const decision = await tx.complaintDecision.create({
    data: {
      vendor_id: actor.vendorId,
      complaint_id: complaint.id,
      cycle_id: complaint.current_cycle_id,
      decision_type: "CHARGE_WAIVER",
      outcome: "APPROVED",
      remarks,
      actor_type: "STAFF",
      actor_user_id: actor.actorId,
      visit_id: balance.charge.visit_id,
      quotation_id: balance.charge.quotation_id,
    },
  });
  await tx.complaintCharge.update({
    where: { id: chargeId },
    data: { status: "WAIVED", waiver_decision_id: decision.id },
  });
  return { decision, balance };
}

// Repair charge only; visit charges are waived through the visit actions.
export async function waiveRepairCharge(actor: ComplaintActor, id: number, chargeId: number, body: Record<string, unknown>) {
  requireHead(actor, "waive charges");
  const complaint = await loadComplaint(actor, id);
  const version = versionOf(body.version);
  const remarks = remarksOf(body.remarks, "Reason for the waiver")!;
  const charge = await prisma.complaintCharge.findFirst({
    where: { id: chargeId, complaint_id: complaint.id, cycle_id: complaint.current_cycle_id, charge_type: "REPAIR" },
    select: { id: true },
  });
  if (!charge) throw new ComplaintError("Repair charge not found for this complaint.", 404);
  let status: ComplaintStatus = complaint.status;
  await prisma.$transaction(async (tx) => {
    await moveStatus(tx, complaint, version, {});
    const { decision, balance } = await waiveChargeTx(tx, actor, complaint, chargeId, remarks);
    status = (await onChargeSettled(tx, actor, complaint, { ...balance, charge: { ...balance.charge, status: "WAIVED" } })) ?? status;
    await log(tx, actor, complaint, {
      action: "REPAIR_CHARGE_WAIVED",
      from_status: complaint.status,
      to_status: status,
      remarks,
      decision_id: decision.id,
      quotation_id: balance.charge.quotation_id,
    });
  });
  return { status };
}

export async function recordRepairPayment(
  actor: ComplaintActor,
  id: number,
  chargeId: number,
  body: Record<string, unknown>,
  proofs: ComplaintUpload[],
) {
  const complaint = await loadComplaint(actor, id);
  if (complaint.status !== "AWAITING_PAYMENT")
    throw new ComplaintError("The complaint is not awaiting a repair payment.", 409);
  const charge = await prisma.complaintCharge.findFirst({
    where: { id: chargeId, complaint_id: complaint.id, cycle_id: complaint.current_cycle_id, charge_type: "REPAIR" },
    select: { id: true },
  });
  if (!charge) throw new ComplaintError("Repair charge not found for this complaint.", 404);
  return recordChargePayment(actor, complaint, versionOf(body.version), chargeId, body, proofs);
}

// Stages after the client accepted a quotation, up to closure.
const RESOLUTION_STAGE: ComplaintStatus[] = [
  "PROCUREMENT_PENDING",
  "MATERIAL_RECEIVED",
  "REPAIR_SCHEDULED",
  "WORK_IN_PROGRESS",
  "AWAITING_CLIENT_CONFIRMATION",
  "AWAITING_HO_CLOSURE_APPROVAL",
];

// The accepted quotation whose repair amount the client pays at resolution,
// while that payment is still unrecorded.
export async function resolutionPaymentDue(db: Db, complaint: { id: number; current_cycle_id: number | null }) {
  if (!complaint.current_cycle_id) return null;
  return db.complaintQuotation.findFirst({
    where: {
      complaint_id: complaint.id,
      cycle_id: complaint.current_cycle_id,
      status: "CLIENT_ACCEPTED",
      payment_at_resolution: true,
      charges: { none: {} },
    },
    select: { id: true, quotation_number: true, revision: true },
  });
}

async function loadResolutionDue(actor: ComplaintActor, id: number, quotationId: number) {
  const complaint = await loadComplaint(actor, id);
  if (!RESOLUTION_STAGE.includes(complaint.status))
    throw new ComplaintError("The repair payment can be recorded once the work is under way.", 409);
  const due = await resolutionPaymentDue(prisma, complaint);
  if (!due || due.id !== quotationId)
    throw new ComplaintError("No repair payment is due at resolution for this quotation.", 409);
  return complaint;
}

function repairChargeData(actor: ComplaintActor, complaint: LoadedComplaint, quotationId: number, amount: number) {
  return {
    vendor_id: actor.vendorId,
    complaint_id: complaint.id,
    cycle_id: complaint.current_cycle_id,
    charge_type: "REPAIR" as const,
    quotation_id: quotationId,
    amount,
    created_by: actor.actorId,
  };
}

// Repair payment the client agreed to pay when the work is resolved.
export async function recordResolutionPayment(
  actor: ComplaintActor,
  id: number,
  quotationId: number,
  body: Record<string, unknown>,
  proofs: ComplaintUpload[],
) {
  const complaint = await loadResolutionDue(actor, id, quotationId);
  if (!isComplaintStaff(actor, complaint))
    throw new ComplaintError("Only HO or the assigned site supervisor can record payments.", 403);
  const version = versionOf(body.version);
  const prepared = await preparePayment(actor, body, proofs);
  try {
    await prisma.$transaction(async (tx) => {
      await moveStatus(tx, complaint, version, {});
      const charge = await tx.complaintCharge.create({
        data: repairChargeData(actor, complaint, quotationId, prepared.amount),
      });
      await insertPaymentTx(tx, actor, complaint, charge, prepared, isHead(actor.role));
    });
  } catch (error) {
    await deleteWasabiObjects(prepared.uploaded.map((u) => u.key));
    throw error;
  }
  return { status: complaint.status };
}

// HO decides nothing is collected after all.
export async function waiveResolutionPayment(
  actor: ComplaintActor,
  id: number,
  quotationId: number,
  body: Record<string, unknown>,
) {
  requireHead(actor, "waive charges");
  const complaint = await loadResolutionDue(actor, id, quotationId);
  const version = versionOf(body.version);
  const remarks = remarksOf(body.remarks, "Reason for the waiver")!;
  await prisma.$transaction(async (tx) => {
    await moveStatus(tx, complaint, version, {});
    const charge = await tx.complaintCharge.create({ data: repairChargeData(actor, complaint, quotationId, 0) });
    const { decision } = await waiveChargeTx(tx, actor, complaint, charge.id, remarks);
    await log(tx, actor, complaint, {
      action: "REPAIR_CHARGE_WAIVED",
      remarks,
      decision_id: decision.id,
      quotation_id: quotationId,
    });
  });
  return { status: complaint.status };
}
