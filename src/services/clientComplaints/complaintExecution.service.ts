import { prisma, Prisma } from "../../prisma/client";
import { ComplaintExecutionStatus, ComplaintStatus } from "../../prisma/generated";
import { deleteWasabiObjects } from "../../utils/wasabiClient";
import { ComplaintActor, ComplaintError, ComplaintUpload } from "./clientComplaints.service";
import {
  attachmentRows,
  classifyUploads,
  dateOnly,
  futureDateTime,
  isComplaintStaff,
  LoadedComplaint,
  loadComplaint,
  log,
  moveStatus,
  remarksOf,
  setComplaintStatus,
  uploadAll,
  versionOf,
} from "./complaintWorkflow.shared";

// Material procurement and repair execution (spec 15), ending with the site
// supervisor's completion report (spec 16.1).

// The complaint status mirrors the execution's progress.
const COMPLAINT_STATUS_FOR: Record<ComplaintExecutionStatus, ComplaintStatus> = {
  // Nothing to procure: the repair just needs scheduling.
  MATERIAL_NOT_REQUIRED: "MATERIAL_RECEIVED",
  MATERIAL_APPROVAL_PENDING: "PROCUREMENT_PENDING",
  PROCUREMENT_PENDING: "PROCUREMENT_PENDING",
  MATERIAL_ORDERED: "PROCUREMENT_PENDING",
  MATERIAL_RECEIVED: "MATERIAL_RECEIVED",
  MATERIAL_READY: "MATERIAL_RECEIVED",
  REPAIR_SCHEDULED: "REPAIR_SCHEDULED",
  WORK_IN_PROGRESS: "WORK_IN_PROGRESS",
  WORK_COMPLETED: "AWAITING_CLIENT_CONFIRMATION",
  CANCELLED: "ON_HOLD",
};

export type ExecutionAction =
  | "MATERIAL_ORDERED"
  | "MATERIAL_RECEIVED"
  | "MATERIAL_READY"
  | "SCHEDULE_REPAIR"
  | "RESCHEDULE_REPAIR"
  | "START_WORK"
  | "COMPLETE_WORK";

const ACTIONS_FROM: Record<ExecutionAction, ComplaintExecutionStatus[]> = {
  MATERIAL_ORDERED: ["PROCUREMENT_PENDING"],
  MATERIAL_RECEIVED: ["PROCUREMENT_PENDING", "MATERIAL_ORDERED"],
  MATERIAL_READY: ["MATERIAL_RECEIVED"],
  SCHEDULE_REPAIR: ["MATERIAL_NOT_REQUIRED", "MATERIAL_RECEIVED", "MATERIAL_READY"],
  RESCHEDULE_REPAIR: ["REPAIR_SCHEDULED"],
  START_WORK: ["REPAIR_SCHEDULED"],
  COMPLETE_WORK: ["WORK_IN_PROGRESS"],
};

export const OPEN_EXECUTION: ComplaintExecutionStatus[] = [
  "MATERIAL_NOT_REQUIRED",
  "MATERIAL_APPROVAL_PENDING",
  "PROCUREMENT_PENDING",
  "MATERIAL_ORDERED",
  "MATERIAL_RECEIVED",
  "MATERIAL_READY",
  "REPAIR_SCHEDULED",
  "WORK_IN_PROGRESS",
];

// Starts execution inside a caller's transaction and returns the new complaint status.
// Material need comes from the inspection report unless HO overrides it.
export async function startExecutionTx(
  tx: Prisma.TransactionClient,
  actor: ComplaintActor,
  complaint: LoadedComplaint,
  opts: { quotationId?: number; quotationSkipDecisionId?: number; materialRequired?: boolean },
) {
  let materialRequired = opts.materialRequired;
  if (materialRequired === undefined) {
    const report = opts.quotationId
      ? (
          await tx.complaintQuotation.findUnique({
            where: { id: opts.quotationId },
            select: { inspectionReport: { select: { material_required: true } } },
          })
        )?.inspectionReport
      : null;
    const latest =
      report ??
      (await tx.complaintInspectionReport.findFirst({
        where: { complaint_id: complaint.id, cycle_id: complaint.current_cycle_id },
        orderBy: { submitted_at: "desc" },
        select: { material_required: true },
      }));
    materialRequired = latest?.material_required ?? false;
  }
  const status: ComplaintExecutionStatus = materialRequired ? "PROCUREMENT_PENDING" : "MATERIAL_NOT_REQUIRED";
  const execution = await tx.complaintExecution.create({
    data: {
      vendor_id: actor.vendorId,
      complaint_id: complaint.id,
      cycle_id: complaint.current_cycle_id,
      quotation_id: opts.quotationId ?? null,
      quotation_skip_decision_id: opts.quotationSkipDecisionId ?? null,
      material_required: materialRequired,
      status,
      assigned_ss_id: complaint.assigned_ss_id,
      created_by: actor.actorId,
    },
  });
  const toStatus = COMPLAINT_STATUS_FOR[status];
  await setComplaintStatus(tx, complaint, toStatus);
  await log(tx, actor, complaint, {
    action: "EXECUTION_STARTED",
    from_status: complaint.status,
    to_status: toStatus,
    remarks: materialRequired ? "Material procurement required." : "No material required; ready for repair scheduling.",
    execution_id: execution.id,
  });
  return toStatus;
}

async function openExecution(db: typeof prisma | Prisma.TransactionClient, complaint: LoadedComplaint) {
  return db.complaintExecution.findFirst({
    where: { complaint_id: complaint.id, cycle_id: complaint.current_cycle_id, status: { in: OPEN_EXECUTION } },
    orderBy: { id: "desc" },
    select: { id: true, status: true, assigned_ss_id: true, scheduled_for: true },
  });
}

export async function executionPermissions(
  actor: ComplaintActor,
  complaint: { id: number; assigned_ss_id: number | null; current_cycle_id: number | null },
) {
  if (!complaint.current_cycle_id || !isComplaintStaff(actor, complaint)) return null;
  const execution = await prisma.complaintExecution.findFirst({
    where: { complaint_id: complaint.id, cycle_id: complaint.current_cycle_id, status: { in: OPEN_EXECUTION } },
    orderBy: { id: "desc" },
    select: { id: true, status: true, material_required: true, scheduled_for: true },
  });
  if (!execution) return null;
  return {
    id: execution.id,
    status: execution.status,
    material_required: execution.material_required,
    scheduled_for: execution.scheduled_for,
    actions: (Object.keys(ACTIONS_FROM) as ExecutionAction[]).filter((a) => ACTIONS_FROM[a].includes(execution.status)),
  };
}

async function loadForExecution(actor: ComplaintActor, id: number, executionId: number, action: ExecutionAction) {
  const complaint = await loadComplaint(actor, id);
  if (!isComplaintStaff(actor, complaint)) throw new ComplaintError("Only HO or the assigned site supervisor can update execution.", 403);
  const execution = await openExecution(prisma, complaint);
  if (!execution || execution.id !== executionId) throw new ComplaintError("No open execution matches this request.", 404);
  if (!ACTIONS_FROM[action].includes(execution.status))
    throw new ComplaintError("This step is not available at the execution's current stage.", 409);
  return { complaint, execution };
}

export async function runExecutionAction(
  actor: ComplaintActor,
  id: number,
  executionId: number,
  body: Record<string, unknown>,
) {
  const action = body.action as ExecutionAction;
  if (!(action in ACTIONS_FROM) || action === "COMPLETE_WORK")
    throw new ComplaintError("Unknown execution step.");
  const { complaint, execution } = await loadForExecution(actor, id, executionId, action);
  const version = versionOf(body.version);
  const remarks = remarksOf(body.remarks, action === "RESCHEDULE_REPAIR" ? "Reason for rescheduling" : "Remarks", action === "RESCHEDULE_REPAIR");
  const data: Prisma.ComplaintExecutionUncheckedUpdateInput = {};
  let next: ComplaintExecutionStatus;
  let when: Date | null = null;
  const ssId = execution.assigned_ss_id ?? complaint.assigned_ss_id;

  switch (action) {
    case "MATERIAL_ORDERED":
      next = "MATERIAL_ORDERED";
      data.purchase_order_reference = remarksOf(body.purchase_order_reference, "Purchase order reference", false)?.slice(0, 255) ?? null;
      data.material_expected_date = dateOnly(body.material_expected_date, "Expected material date");
      break;
    case "MATERIAL_RECEIVED":
      next = "MATERIAL_RECEIVED";
      data.material_received_date = dateOnly(body.material_received_date, "Material received date", { required: true, notFuture: true });
      break;
    case "MATERIAL_READY":
      next = "MATERIAL_READY";
      break;
    case "SCHEDULE_REPAIR":
    case "RESCHEDULE_REPAIR":
      if (!ssId) throw new ComplaintError("Assign a site supervisor before scheduling the repair.");
      next = "REPAIR_SCHEDULED";
      when = futureDateTime(body.scheduled_for, "Repair date and time");
      data.scheduled_for = when;
      data.assigned_ss_id = ssId;
      {
        const team = remarksOf(body.team_details, "Team details", false);
        if (team) data.team_details = team.slice(0, 2000);
      }
      break;
    case "START_WORK":
      next = "WORK_IN_PROGRESS";
      data.started_at = new Date();
      break;
  }
  data.status = next;
  const toStatus = COMPLAINT_STATUS_FOR[next];
  const taskKey = `REPAIR:${execution.id}`;

  await prisma.$transaction(async (tx) => {
    await moveStatus(tx, complaint, version, {});
    await tx.complaintExecution.update({ where: { id: execution.id }, data });
    if (when)
      await tx.complaintTask.upsert({
        where: { cycle_id_task_key: { cycle_id: complaint.current_cycle_id, task_key: taskKey } },
        create: {
          vendor_id: actor.vendorId,
          complaint_id: complaint.id,
          cycle_id: complaint.current_cycle_id,
          task_type: "REPAIR",
          task_key: taskKey,
          assigned_to: ssId!,
          due_date: when,
          execution_id: execution.id,
          remark: remarks,
          created_by: actor.actorId,
        },
        update: { assigned_to: ssId!, due_date: when, status: "open", remark: remarks },
      });
    if (action === "START_WORK")
      await tx.complaintTask.updateMany({
        where: { cycle_id: complaint.current_cycle_id, task_key: taskKey },
        data: { status: "in_progress" },
      });
    await setComplaintStatus(tx, complaint, toStatus);
    await log(tx, actor, complaint, {
      action: `EXECUTION_${action}`,
      from_status: complaint.status,
      to_status: toStatus,
      remarks,
      execution_id: execution.id,
      metadata: when ? { scheduled_for: when.toISOString() } : undefined,
    });
  });
  return { status: toStatus };
}

const MAX_COMPLETION_PHOTOS = 10;

// Spec 16.1: the supervisor's completion report. After-photos are mandatory.
export async function completeExecution(
  actor: ComplaintActor,
  id: number,
  executionId: number,
  body: Record<string, unknown>,
  files: { before: ComplaintUpload[]; after: ComplaintUpload[] },
) {
  const { complaint, execution } = await loadForExecution(actor, id, executionId, "COMPLETE_WORK");
  const version = versionOf(body.version);
  const completionRemarks = remarksOf(body.completion_remarks, "Work completion remarks")!;
  const fields = {
    material_used: remarksOf(body.material_used, "Material used", false),
    replacement_details: remarksOf(body.replacement_details, "Replacement details", false),
    client_remarks: remarksOf(body.client_remarks, "Client remarks", false),
    pending_work: remarksOf(body.pending_work, "Pending work", false),
  };
  if (files.after.length === 0) throw new ComplaintError("Add at least one after-repair photo.");
  const before = classifyUploads(files.before, MAX_COMPLETION_PHOTOS);
  const after = classifyUploads(files.after, MAX_COMPLETION_PHOTOS);
  const uploadedBefore = await uploadAll(actor, before);
  let uploadedAfter: Awaited<ReturnType<typeof uploadAll>> = [];
  const now = new Date();
  try {
    uploadedAfter = await uploadAll(actor, after);
    await prisma.$transaction(async (tx) => {
      await moveStatus(tx, complaint, version, {});
      await tx.complaintExecution.update({
        where: { id: execution.id },
        data: {
          status: "WORK_COMPLETED",
          completed_at: now,
          completed_by: actor.actorId,
          completion_remarks: completionRemarks,
          ...fields,
        },
      });
      await tx.complaintAttachment.createMany({
        data: [
          ...attachmentRows(actor, complaint, uploadedBefore, { category: "BEFORE_EXECUTION", execution_id: execution.id }),
          ...attachmentRows(actor, complaint, uploadedAfter, { category: "AFTER_EXECUTION", execution_id: execution.id }),
        ],
      });
      await tx.complaintTask.updateMany({
        where: { cycle_id: complaint.current_cycle_id, task_key: `REPAIR:${execution.id}` },
        data: { status: "completed", completed_by: actor.actorId, completed_at: now },
      });
      await tx.complaintCycle.update({ where: { id: complaint.current_cycle_id }, data: { resolved_at: now } });
      await setComplaintStatus(tx, complaint, "AWAITING_CLIENT_CONFIRMATION");
      await log(tx, actor, complaint, {
        action: "EXECUTION_WORK_COMPLETED",
        from_status: complaint.status,
        to_status: "AWAITING_CLIENT_CONFIRMATION",
        remarks: completionRemarks,
        execution_id: execution.id,
        metadata: { before_photos: uploadedBefore.length, after_photos: uploadedAfter.length },
      });
    });
  } catch (error) {
    await deleteWasabiObjects([...uploadedBefore, ...uploadedAfter].map((u) => u.key));
    throw error;
  }
  return { status: "AWAITING_CLIENT_CONFIRMATION" as const };
}
