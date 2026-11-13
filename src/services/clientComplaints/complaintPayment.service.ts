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
// and proof, and only HO can verify it.

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
  const amount = money(body.amount, "Payment amount");
  if (amount > balance.outstanding)
    throw new ComplaintError(`The amount exceeds the outstanding ₹${balance.outstanding.toFixed(2)}.`);
  const method = body.method as ComplaintPaymentMethod;
  if (!Object.values(ComplaintPaymentMethod).includes(method)) throw new ComplaintError("Select the payment method.");
  const reference = remarksOf(body.transaction_reference, "Transaction reference")!.slice(0, 255);
  const paymentDate = dateOnly(body.payment_date, "Payment date", { required: true, notFuture: true })!;
  if (proofs.length !== 1) throw new ComplaintError("Attach one payment proof (photo or PDF).");
  const uploaded = await uploadAll(actor, classifyUploads(proofs, 1, false));
  const prefix = balance.charge.charge_type;

  try {
    return await prisma.$transaction(async (tx) => {
      await moveStatus(tx, complaint, version, {});
      const [row] = attachmentRows(actor, complaint, uploaded, {
        category: "PAYMENT_PROOF",
        visit_id: balance.charge.visit_id,
      });
      const proof = await tx.complaintAttachment.create({ data: row });
      const payment = await tx.complaintPayment.create({
        data: {
          vendor_id: actor.vendorId,
          complaint_id: complaint.id,
          cycle_id: complaint.current_cycle_id,
          amount,
          method,
          transaction_reference: reference,
          payment_date: paymentDate,
          proof_attachment_id: proof.id,
          actor_type: "STAFF",
          actor_user_id: actor.actorId,
        },
      });
      await tx.complaintPaymentAllocation.create({
        data: {
          vendor_id: actor.vendorId,
          complaint_id: complaint.id,
          cycle_id: complaint.current_cycle_id,
          payment_id: payment.id,
          charge_id: chargeId,
          amount,
          allocated_by: actor.actorId,
        },
      });
      await log(tx, actor, complaint, {
        action: `${prefix}_PAYMENT_RECORDED`,
        remarks: `₹${amount.toFixed(2)} via ${method} · ${reference}`,
        visit_id: balance.charge.visit_id,
        quotation_id: balance.charge.quotation_id,
        payment_id: payment.id,
      });
      return { payment_id: payment.id };
    });
  } catch (error) {
    await deleteWasabiObjects(uploaded.map((u) => u.key));
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
