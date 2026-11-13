import { prisma, Prisma } from "../../prisma/client";
import { ComplaintStatus, ComplaintVisitStatus } from "../../prisma/generated";
import { ComplaintActor, ComplaintError, ComplaintUpload } from "./clientComplaints.service";
import {
  decisionData,
  futureDateTime,
  isHead,
  LoadedComplaint,
  loadComplaint,
  log,
  moveStatus,
  remarksOf,
  setComplaintStatus,
  versionOf,
} from "./complaintWorkflow.shared";
import { recordChargePayment } from "./complaintPayment.service";

// Site visits and the visiting charge (spec sections 10–11; ₹800 by default,
// configurable per vendor).
// The charge always stays separate from repair quotations, a visit cannot be
// completed without a verified payment or an approved exception, and only
// HO can make a visit free.

// Complaint statuses during which visits can be worked on.
const VISIT_STAGE: ComplaintStatus[] = [
  "APPROVED_FOR_VISIT",
  "AWAITING_CLIENT_ACCEPTANCE",
  "PAYMENT_PENDING",
  "VISIT_SCHEDULED",
];

const ENDED: ComplaintVisitStatus[] = ["COMPLETED", "CANCELLED", "CLIENT_NOT_AVAILABLE", "SITE_NOT_ACCESSIBLE"];

// The complaint's status mirrors where its current visit stands.
const COMPLAINT_STATUS_FOR: Record<ComplaintVisitStatus, ComplaintStatus> = {
  PENDING_FREE_APPROVAL: "APPROVED_FOR_VISIT",
  AWAITING_CHARGE_ACCEPTANCE: "AWAITING_CLIENT_ACCEPTANCE",
  AWAITING_PAYMENT: "PAYMENT_PENDING",
  READY_TO_SCHEDULE: "APPROVED_FOR_VISIT",
  SCHEDULED: "VISIT_SCHEDULED",
  CONFIRMED: "VISIT_SCHEDULED",
  // Inspection pending until the report is submitted.
  COMPLETED: "VISIT_SCHEDULED",
  CLIENT_NOT_AVAILABLE: "APPROVED_FOR_VISIT",
  SITE_NOT_ACCESSIBLE: "APPROVED_FOR_VISIT",
  CANCELLED: "APPROVED_FOR_VISIT",
};

export type VisitAction =
  | "ACCEPT_CHARGE"
  | "DECLINE_CHARGE"
  | "WAIVE_CHARGE"
  | "RECORD_PAYMENT"
  | "APPROVE_FREE"
  | "DECLINE_FREE"
  | "SCHEDULE"
  | "CONFIRM"
  | "RESCHEDULE"
  | "COMPLETE"
  | "CLIENT_NOT_AVAILABLE"
  | "SITE_NOT_ACCESSIBLE"
  | "CANCEL";

type Db = Prisma.TransactionClient | typeof prisma;

function loadVisits(db: Db, vendorId: number, complaintId: number, cycleId: number) {
  return db.complaintVisit.findMany({
    where: { vendor_id: vendorId, complaint_id: complaintId, cycle_id: cycleId },
    orderBy: { visit_number: "asc" },
    select: {
      id: true,
      visit_number: true,
      status: true,
      charge_mode: true,
      standard_fee: true,
      assigned_ss_id: true,
      free_approval_decision_id: true,
      charges: {
        select: {
          id: true,
          amount: true,
          status: true,
          allocations: { select: { amount: true, payment: { select: { status: true } } } },
        },
      },
    },
  });
}

type VisitRow = Awaited<ReturnType<typeof loadVisits>>[number];

function money(visit: VisitRow) {
  const charge = visit.charges[0];
  if (!charge) return { charge: null, amount: 0, verified: 0, committed: 0, pending: false };
  const sum = (statuses: string[]) =>
    charge.allocations
      .filter((a) => statuses.includes(a.payment.status))
      .reduce((total, a) => total + Number(a.amount), 0);
  return {
    charge,
    amount: Number(charge.amount),
    verified: sum(["VERIFIED"]),
    committed: sum(["VERIFIED", "PENDING_VERIFICATION"]),
    pending: charge.allocations.some((a) => a.payment.status === "PENDING_VERIFICATION"),
  };
}

type ComplaintForActions = { status: ComplaintStatus; assigned_ss_id: number | null };

function visitActions(actor: ComplaintActor, complaint: ComplaintForActions, visit: VisitRow): VisitAction[] {
  const head = isHead(actor.role);
  if (!VISIT_STAGE.includes(complaint.status)) return [];
  if (!head && complaint.assigned_ss_id !== actor.actorId) return [];
  const m = money(visit);
  const actions: VisitAction[] = [];
  switch (visit.status) {
    case "PENDING_FREE_APPROVAL":
      if (head) actions.push("APPROVE_FREE", "DECLINE_FREE");
      actions.push("CANCEL");
      break;
    case "AWAITING_CHARGE_ACCEPTANCE":
      actions.push("ACCEPT_CHARGE", "DECLINE_CHARGE");
      if (head) actions.push("WAIVE_CHARGE");
      actions.push("CANCEL");
      break;
    case "AWAITING_PAYMENT":
      if (m.amount - m.committed > 0) actions.push("RECORD_PAYMENT");
      if (head && m.committed === 0) actions.push("WAIVE_CHARGE");
      if (!m.pending) actions.push("CANCEL");
      break;
    case "READY_TO_SCHEDULE":
      actions.push("SCHEDULE", "CANCEL");
      break;
    case "SCHEDULED":
      actions.push("CONFIRM");
    // falls through
    case "CONFIRMED":
      actions.push("RESCHEDULE", "COMPLETE", "CLIENT_NOT_AVAILABLE", "SITE_NOT_ACCESSIBLE", "CANCEL");
      break;
  }
  return actions;
}

// What the details page needs to render the visit stage for this viewer.
export async function visitPermissions(
  actor: ComplaintActor,
  complaint: ComplaintForActions & { id: number; current_cycle_id: number | null },
) {
  const visitFee = await vendorVisitFee(prisma, actor.vendorId);
  if (!complaint.current_cycle_id)
    return { visit_fee: visitFee, can_create_visit: false, repeatable_visits: [], visit_actions: {}, verifiable_payment_ids: [] };
  const [visits, pendingPayments] = await Promise.all([
    loadVisits(prisma, actor.vendorId, complaint.id, complaint.current_cycle_id),
    isHead(actor.role)
      ? prisma.complaintPayment.findMany({
          where: { vendor_id: actor.vendorId, complaint_id: complaint.id, status: "PENDING_VERIFICATION" },
          select: { id: true },
        })
      : Promise.resolve([]),
  ]);
  const staff = isHead(actor.role) || complaint.assigned_ss_id === actor.actorId;
  return {
    // Fee a new visit would carry; existing visits keep their own.
    visit_fee: visitFee,
    can_create_visit:
      staff &&
      ["APPROVED_FOR_VISIT", "VISIT_SCHEDULED", "INSPECTION_SUBMITTED"].includes(complaint.status) &&
      visits.every((v) => ENDED.includes(v.status)),
    // Only a completed visit that failed to resolve the issue can be repeated free.
    repeatable_visits: visits
      .filter((v) => v.status === "COMPLETED")
      .map((v) => ({ id: v.id, visit_number: v.visit_number })),
    visit_actions: Object.fromEntries(
      visits
        .filter((v) => !ENDED.includes(v.status))
        .map((v) => {
          const m = money(v);
          return [
            v.id,
            {
              actions: visitActions(actor, complaint, v),
              fee: Number(v.standard_fee),
              outstanding: Math.max(0, m.amount - m.committed),
              payment_pending_verification: m.pending,
            },
          ];
        }),
    ),
    verifiable_payment_ids: pendingPayments.map((p) => p.id),
  };
}

// The vendor's current visiting charge; visits snapshot it when created.
export async function vendorVisitFee(db: Db, vendorId: number) {
  const vendor = await db.vendorMaster.findUniqueOrThrow({
    where: { id: vendorId },
    select: { complaint_visit_fee: true },
  });
  return Number(vendor.complaint_visit_fee);
}

function createVisitCharge(
  tx: Prisma.TransactionClient,
  actor: ComplaintActor,
  complaint: LoadedComplaint,
  visitId: number,
  amount: Prisma.Decimal | number,
) {
  return tx.complaintCharge.create({
    data: {
      vendor_id: actor.vendorId,
      complaint_id: complaint.id,
      cycle_id: complaint.current_cycle_id,
      charge_type: "VISIT",
      visit_id: visitId,
      amount,
      created_by: actor.actorId,
    },
  });
}

// Creates the next visit inside an existing transaction and returns the
// complaint's resulting status. The caller has already checked the version.
export async function createVisitTx(
  tx: Prisma.TransactionClient,
  actor: ComplaintActor,
  complaint: LoadedComplaint,
  opts: { chargeMode: "CHARGEABLE" } | { chargeMode: "FREE_REPEAT"; repeatOfVisitId: number; remarks: string },
) {
  const last = await tx.complaintVisit.aggregate({
    where: { complaint_id: complaint.id },
    _max: { visit_number: true },
  });
  const fee = await vendorVisitFee(tx, actor.vendorId);
  const head = isHead(actor.role);
  const free = opts.chargeMode === "FREE_REPEAT";
  // HO's own free-repeat request is its approval; an SS request waits for HO.
  // A vendor charging ₹0 has nothing for the client to accept or pay.
  const status: ComplaintVisitStatus = !free
    ? fee > 0
      ? "AWAITING_CHARGE_ACCEPTANCE"
      : "READY_TO_SCHEDULE"
    : head
      ? "READY_TO_SCHEDULE"
      : "PENDING_FREE_APPROVAL";
  const visit = await tx.complaintVisit.create({
    data: {
      vendor_id: actor.vendorId,
      complaint_id: complaint.id,
      cycle_id: complaint.current_cycle_id,
      visit_number: (last._max.visit_number ?? 0) + 1,
      purpose: "INSPECTION",
      // The DB only lets a free visit leave PENDING once its approval is linked.
      status: free ? "PENDING_FREE_APPROVAL" : status,
      charge_mode: opts.chargeMode,
      standard_fee: fee,
      assigned_ss_id: complaint.assigned_ss_id,
      repeat_of_visit_id: free ? opts.repeatOfVisitId : null,
      repeat_remarks: free ? opts.remarks.slice(0, 2000) : null,
      created_by: actor.actorId,
    },
  });
  if (!free) await createVisitCharge(tx, actor, complaint, visit.id, fee);
  else if (head) {
    const decision = await tx.complaintDecision.create({
      data: {
        vendor_id: actor.vendorId,
        complaint_id: complaint.id,
        cycle_id: complaint.current_cycle_id,
        decision_type: "FREE_REPEAT_VISIT",
        outcome: "APPROVED",
        remarks: opts.remarks,
        actor_type: "STAFF",
        actor_user_id: actor.actorId,
        visit_id: visit.id,
      },
    });
    await tx.complaintVisit.update({
      where: { id: visit.id },
      data: { free_approval_decision_id: decision.id, status },
    });
  }
  const toStatus = COMPLAINT_STATUS_FOR[status];
  await setComplaintStatus(tx, complaint, toStatus);
  await log(tx, actor, complaint, {
    action: free ? "FREE_REPEAT_VISIT_CREATED" : "VISIT_CREATED",
    from_status: complaint.status,
    to_status: toStatus,
    remarks: free ? opts.remarks : `Visit ${visit.visit_number} created with ₹${fee} visiting charge.`,
    visit_id: visit.id,
  });
  return toStatus;
}

export async function createVisit(actor: ComplaintActor, id: number, body: Record<string, unknown>) {
  const complaint = await loadComplaint(actor, id);
  const version = versionOf(body.version);
  const perms = await visitPermissions(actor, complaint);
  if (!perms.can_create_visit)
    throw new ComplaintError("A new visit cannot be created at this stage.", 409);
  const mode = body.charge_mode;
  if (mode !== "CHARGEABLE" && mode !== "FREE_REPEAT") throw new ComplaintError("Choose the visit type.");
  let opts: Parameters<typeof createVisitTx>[3] = { chargeMode: "CHARGEABLE" };
  if (mode === "FREE_REPEAT") {
    const repeatOf = Number(body.repeat_of_visit_id);
    if (!perms.repeatable_visits.some((v) => v.id === repeatOf))
      throw new ComplaintError("Select the completed visit that failed to resolve the issue.");
    opts = {
      chargeMode: "FREE_REPEAT",
      repeatOfVisitId: repeatOf,
      remarks: remarksOf(body.remarks, "Reason the issue is still unresolved")!,
    };
  }
  let status: ComplaintStatus = complaint.status;
  await prisma.$transaction(async (tx) => {
    await moveStatus(tx, complaint, version, {});
    status = await createVisitTx(tx, actor, complaint, opts);
  });
  return { status };
}

async function findVisit(actor: ComplaintActor, complaint: LoadedComplaint, visitId: number) {
  const visits = await loadVisits(prisma, actor.vendorId, complaint.id, complaint.current_cycle_id);
  const visit = visits.find((v) => v.id === visitId);
  if (!visit) throw new ComplaintError("Visit not found for this complaint.", 404);
  return visit;
}

// Single entry point for every status move on a visit.
export async function runVisitAction(
  actor: ComplaintActor,
  id: number,
  visitId: number,
  body: Record<string, unknown>,
) {
  const complaint = await loadComplaint(actor, id);
  const version = versionOf(body.version);
  const visit = await findVisit(actor, complaint, visitId);
  const action = body.action as VisitAction;
  if (!visitActions(actor, complaint, visit).includes(action))
    throw new ComplaintError("This action is not available for the visit's current status.", 409);
  const m = money(visit);
  const ssId = visit.assigned_ss_id ?? complaint.assigned_ss_id;
  const now = new Date();

  // Validate everything before opening the transaction.
  const remarksRequired: VisitAction[] = [
    "DECLINE_CHARGE",
    "WAIVE_CHARGE",
    "APPROVE_FREE",
    "DECLINE_FREE",
    "RESCHEDULE",
    "CLIENT_NOT_AVAILABLE",
    "SITE_NOT_ACCESSIBLE",
    "CANCEL",
  ];
  const remarks = remarksOf(body.remarks, "Remarks", remarksRequired.includes(action));
  // Staff answering for the client must record how the client confirmed it.
  const onBehalf = action === "ACCEPT_CHARGE" || action === "DECLINE_CHARGE";
  const clientReference = onBehalf
    ? remarksOf(body.client_reference, "How the client confirmed")!.slice(0, 255)
    : null;
  const when =
    action === "SCHEDULE" || action === "RESCHEDULE" ? futureDateTime(body.scheduled_for, "Visit date and time") : null;
  const team = action === "SCHEDULE" ? remarksOf(body.team_details, "Team details", false) : null;
  if ((action === "SCHEDULE" || action === "RESCHEDULE") && !ssId)
    throw new ComplaintError("Assign a site supervisor before scheduling the visit.");
  if (action === "COMPLETE") {
    // Spec 10.4: never complete without verified payment or an approved exception.
    const cleared =
      visit.charge_mode === "FREE_REPEAT"
        ? !!visit.free_approval_decision_id
        : m.charge?.status === "WAIVED" || (m.charge?.status === "OPEN" && m.verified >= m.amount);
    if (!cleared) throw new ComplaintError("The visiting charge is not cleared for this visit.", 409);
  }

  const next: Record<VisitAction, ComplaintVisitStatus> = {
    ACCEPT_CHARGE: "AWAITING_PAYMENT",
    DECLINE_CHARGE: "CANCELLED",
    WAIVE_CHARGE: "READY_TO_SCHEDULE",
    RECORD_PAYMENT: "AWAITING_PAYMENT",
    APPROVE_FREE: "READY_TO_SCHEDULE",
    DECLINE_FREE: "AWAITING_CHARGE_ACCEPTANCE",
    SCHEDULE: "SCHEDULED",
    CONFIRM: "CONFIRMED",
    RESCHEDULE: "SCHEDULED",
    COMPLETE: "COMPLETED",
    CLIENT_NOT_AVAILABLE: "CLIENT_NOT_AVAILABLE",
    SITE_NOT_ACCESSIBLE: "SITE_NOT_ACCESSIBLE",
    CANCEL: "CANCELLED",
  };
  const zeroFee = Number(visit.standard_fee) === 0;
  const visitStatus =
    zeroFee && (action === "DECLINE_FREE" || action === "ACCEPT_CHARGE") ? "READY_TO_SCHEDULE" : next[action];
  // A client who refuses the ₹800 puts the complaint on hold for HO review.
  const complaintStatus = action === "DECLINE_CHARGE" ? "ON_HOLD" : COMPLAINT_STATUS_FOR[visitStatus];
  const taskKey = `SITE_VISIT:${visit.id}`;

  await prisma.$transaction(async (tx) => {
    await moveStatus(tx, complaint, version, {});
    const visitData: Prisma.ComplaintVisitUncheckedUpdateInput = { status: visitStatus };
    if (remarks) visitData.remarks = remarks;
    let decisionId: number | undefined;

    switch (action) {
      case "ACCEPT_CHARGE":
      case "DECLINE_CHARGE": {
        const decision = await tx.complaintDecision.create({
          data: decisionData(actor, complaint, { visit_id: visit.id,
            decision_type: "VISIT_CHARGE_ACCEPTANCE",
            outcome: action === "ACCEPT_CHARGE" ? "ACCEPTED" : "DECLINED",
            remarks,
            acting_on_behalf_of_client: true,
            actor_client_reference: clientReference,
          }),
        });
        decisionId = decision.id;
        if (action === "DECLINE_CHARGE" && m.charge)
          await tx.complaintCharge.update({ where: { id: m.charge.id }, data: { status: "VOIDED" } });
        break;
      }
      case "WAIVE_CHARGE": {
        const decision = await tx.complaintDecision.create({
          data: decisionData(actor, complaint, { visit_id: visit.id, decision_type: "CHARGE_WAIVER", outcome: "APPROVED", remarks }),
        });
        decisionId = decision.id;
        await tx.complaintCharge.update({
          where: { id: m.charge!.id },
          data: { status: "WAIVED", waiver_decision_id: decision.id },
        });
        break;
      }
      case "APPROVE_FREE":
      case "DECLINE_FREE": {
        const decision = await tx.complaintDecision.create({
          data: decisionData(actor, complaint, { visit_id: visit.id,
            decision_type: "FREE_REPEAT_VISIT",
            outcome: action === "APPROVE_FREE" ? "APPROVED" : "DECLINED",
            remarks,
          }),
        });
        decisionId = decision.id;
        if (action === "APPROVE_FREE") visitData.free_approval_decision_id = decision.id;
        else {
          visitData.charge_mode = "CHARGEABLE";
          await createVisitCharge(tx, actor, complaint, visit.id, visit.standard_fee);
        }
        break;
      }
      case "SCHEDULE":
      case "RESCHEDULE":
        visitData.scheduled_for = when;
        visitData.assigned_ss_id = ssId;
        if (team) visitData.team_details = team;
        if (action === "RESCHEDULE") visitData.reschedule_count = { increment: 1 };
        // Spec: no site visit without an approved CRM task.
        await tx.complaintTask.upsert({
          where: { cycle_id_task_key: { cycle_id: complaint.current_cycle_id, task_key: taskKey } },
          create: {
            vendor_id: actor.vendorId,
            complaint_id: complaint.id,
            cycle_id: complaint.current_cycle_id,
            task_type: "SITE_VISIT",
            task_key: taskKey,
            assigned_to: ssId!,
            due_date: when,
            visit_id: visit.id,
            remark: remarks,
            created_by: actor.actorId,
          },
          update: { assigned_to: ssId!, due_date: when, status: "open", remark: remarks },
        });
        break;
      case "COMPLETE":
        visitData.completed_at = now;
        await tx.complaintTask.updateMany({
          where: { cycle_id: complaint.current_cycle_id, task_key: taskKey },
          data: { status: "completed", completed_by: actor.actorId, completed_at: now },
        });
        break;
      case "CLIENT_NOT_AVAILABLE":
      case "SITE_NOT_ACCESSIBLE":
      case "CANCEL":
        await tx.complaintTask.updateMany({
          where: { cycle_id: complaint.current_cycle_id, task_key: taskKey },
          data: { status: "cancelled", remark: remarks },
        });
        // An unpaid charge on a cancelled visit is void; anything already paid
        // stays on record for HO to refund or carry forward.
        if (action === "CANCEL" && m.charge?.status === "OPEN" && m.verified === 0)
          await tx.complaintCharge.update({ where: { id: m.charge.id }, data: { status: "VOIDED" } });
        break;
    }

    await tx.complaintVisit.update({ where: { id: visit.id }, data: visitData });
    await setComplaintStatus(tx, complaint, complaintStatus);
    await log(tx, actor, complaint, {
      action: `VISIT_${action}`,
      from_status: complaint.status,
      to_status: complaintStatus,
      remarks,
      visit_id: visit.id,
      decision_id: decisionId,
      acting_on_behalf_of_client: onBehalf,
      actor_client_reference: clientReference,
      metadata: when ? { scheduled_for: when.toISOString() } : undefined,
    });
  });
  return { status: complaintStatus, visit_status: visitStatus };
}

export async function recordVisitPayment(
  actor: ComplaintActor,
  id: number,
  visitId: number,
  body: Record<string, unknown>,
  proofs: ComplaintUpload[],
) {
  const complaint = await loadComplaint(actor, id);
  const version = versionOf(body.version);
  const visit = await findVisit(actor, complaint, visitId);
  if (!visitActions(actor, complaint, visit).includes("RECORD_PAYMENT"))
    throw new ComplaintError("A payment cannot be recorded for this visit now.", 409);
  return recordChargePayment(actor, complaint, version, visit.charges[0]!.id, body, proofs);
}
