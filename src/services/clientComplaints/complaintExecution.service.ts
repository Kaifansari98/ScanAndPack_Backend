import { prisma, Prisma } from "../../prisma/client";
import { ComplaintExecutionStatus, ComplaintStatus } from "../../prisma/generated";
import { deleteWasabiObjects } from "../../utils/wasabiClient";
import { createTaskHistoryLog } from "../task/taskHistory.service";
import { ComplaintActor, ComplaintError, ComplaintUpload } from "./clientComplaints.service";
import {
  attachmentRows,
  classifyUploads,
  dateOnly,
  upcomingDate,
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
import { insertPaymentTx, prepareVisitCash } from "./complaintPayment.service";

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

const MANUAL_MATERIAL: ExecutionAction[] = ["MATERIAL_ORDERED", "MATERIAL_RECEIVED", "MATERIAL_READY"];

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
  const misc = materialRequired ? await createFactoryRequestTx(tx, actor, complaint, execution.id) : null;
  const toStatus = COMPLAINT_STATUS_FOR[status];
  await setComplaintStatus(tx, complaint, toStatus);
  if (misc)
    await log(tx, actor, complaint, {
      action: "FACTORY_REQUEST_RAISED",
      remarks: `Miscellaneous request #${misc.id} raised for the factory.`,
      execution_id: execution.id,
    });
  await log(tx, actor, complaint, {
    action: "EXECUTION_STARTED",
    from_status: complaint.status,
    to_status: toStatus,
    remarks: materialRequired ? "Material procurement required." : "No material required; ready for repair scheduling.",
    execution_id: execution.id,
  });
  return toStatus;
}

// Raises the factory's Miscellaneous request for the material listed in the
// inspection report; it then follows the usual Miscl approval → factory → RTD
// flow. Only complaints on a CRM lead can use it (Miscl tasks belong to a lead);
// others record procurement on the complaint by hand.
async function createFactoryRequestTx(
  tx: Prisma.TransactionClient,
  actor: ComplaintActor,
  complaint: LoadedComplaint,
  executionId: number,
) {
  if (!complaint.lead_id || !complaint.account_id) return null;
  const report = await tx.complaintInspectionReport.findFirst({
    where: { complaint_id: complaint.id, cycle_id: complaint.current_cycle_id },
    orderBy: { submitted_at: "desc" },
    select: {
      issue_observed: true,
      misc_type_id: true,
      materials: {
        orderBy: { sequence: "asc" },
        select: { material_name: true, quantity: true, unit: true, specification: true, finish_colour: true },
      },
    },
  });
  // Reports from before the type was asked fall back to the vendor's "Others".
  const miscTypeId =
    report?.misc_type_id ??
    (
      await tx.miscellaneousTypeMaster.findFirst({
        where: { vendor_id: actor.vendorId, status: "active", name: { equals: "Others", mode: "insensitive" } },
        select: { id: true },
      })
    )?.id;
  if (!miscTypeId) return null;
  const details =
    report?.materials
      .map((m) =>
        [
          `${m.material_name} × ${Number(m.quantity)}${m.unit ? ` ${m.unit}` : ""}`,
          m.specification,
          m.finish_colour,
        ]
          .filter(Boolean)
          .join(", "),
      )
      .join("; ") || "Material as per inspection report";
  const problem = report?.issue_observed ?? "Client complaint repair";
  const misc = await tx.miscellaneousMaster.create({
    data: {
      vendor_id: actor.vendorId,
      lead_id: complaint.lead_id,
      account_id: complaint.account_id,
      complaint_id: complaint.id,
      complaint_execution_id: executionId,
      misc_type_id: miscTypeId,
      problem_description: problem,
      reorder_material_details: details,
      created_by: actor.actorId,
    },
  });

  // Same approval task the Miscl module creates: the lead's Miscl user, else
  // the vendor's, else an admin.
  const miscType = { user_type: { user_type: { equals: "miscellaneous", mode: "insensitive" as const } } };
  const assigneeId =
    (
      await tx.leadUserMapping.findFirst({
        where: { vendor_id: actor.vendorId, lead_id: complaint.lead_id, status: "active", user: { status: "active", ...miscType } },
        orderBy: { created_at: "asc" },
        select: { user_id: true },
      })
    )?.user_id ??
    (
      await tx.userMaster.findFirst({
        where: { vendor_id: actor.vendorId, status: "active", ...miscType },
        orderBy: { id: "asc" },
        select: { id: true },
      })
    )?.id ??
    (
      await tx.userMaster.findFirst({
        where: {
          vendor_id: actor.vendorId,
          status: "active",
          user_type: { user_type: { in: ["super-admin", "admin"], mode: "insensitive" } },
        },
        orderBy: { id: "asc" },
        select: { id: true },
      })
    )?.id ??
    actor.actorId;
  const lead = await tx.leadMaster.findUnique({
    where: { id: complaint.lead_id },
    select: { franchise_id: true, status_id: true },
  });
  const leadStage = lead?.status_id
    ? ((await tx.statusTypeMaster.findUnique({ where: { id: lead.status_id }, select: { type: true } }))?.type ?? null)
    : null;
  const task = await tx.userLeadTask.create({
    data: {
      vendor_id: actor.vendorId,
      lead_id: complaint.lead_id,
      account_id: complaint.account_id,
      franchise_id: lead?.franchise_id ?? null,
      user_id: assigneeId,
      task_type: "Miscellaneous Approval",
      lead_stage: leadStage,
      due_date: new Date(),
      remark: `[misc:${misc.id}] ${details} - ${problem}`,
      status: "open",
      created_by: actor.actorId,
    },
  });
  await createTaskHistoryLog({ db: tx, task, createdBy: actor.actorId, actionType: "CREATE" });
  return misc;
}

// Called when the factory marks a Miscellaneous request ready (RTD): a complaint
// waiting on it moves on to Start Resolution.
export async function onFactoryRequestReady(miscId: number, readyBy: number) {
  const misc = await prisma.miscellaneousMaster.findUnique({
    where: { id: miscId },
    select: { vendor_id: true, complaint_id: true, complaint_execution_id: true },
  });
  if (!misc?.complaint_id || !misc.complaint_execution_id) return;
  await prisma.$transaction(async (tx) => {
    const execution = await tx.complaintExecution.findFirst({
      where: {
        id: misc.complaint_execution_id!,
        status: { in: ["MATERIAL_APPROVAL_PENDING", "PROCUREMENT_PENDING", "MATERIAL_ORDERED"] },
      },
      select: { id: true, cycle_id: true },
    });
    if (!execution) return;
    const complaint = await tx.complaintMaster.findUniqueOrThrow({
      where: { id: misc.complaint_id! },
      select: { id: true, status: true, current_cycle_id: true },
    });
    if (complaint.current_cycle_id !== execution.cycle_id) return;
    const now = new Date();
    await tx.complaintExecution.update({
      where: { id: execution.id },
      data: { status: "MATERIAL_READY", material_received_date: now },
    });
    const toStatus = COMPLAINT_STATUS_FOR.MATERIAL_READY;
    await tx.complaintMaster.update({
      where: { id: complaint.id },
      data: { status: toStatus, status_changed_at: now, version: { increment: 1 } },
    });
    await tx.complaintActivityLog.create({
      data: {
        vendor_id: misc.vendor_id,
        complaint_id: complaint.id,
        cycle_id: execution.cycle_id,
        action: "FACTORY_REQUEST_READY",
        from_status: complaint.status,
        to_status: toStatus,
        actor_type: "STAFF",
        actor_user_id: readyBy,
        remarks: `Factory marked Miscellaneous request #${miscId} ready; the resolution can start.`,
        execution_id: execution.id,
      },
    });
  });
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
    select: {
      id: true,
      status: true,
      material_required: true,
      scheduled_for: true,
      miscellaneous: { select: { id: true }, orderBy: { id: "desc" }, take: 1 },
    },
  });
  if (!execution) return null;
  const factoryRequest = execution.miscellaneous[0] ?? null;
  return {
    id: execution.id,
    status: execution.status,
    material_required: execution.material_required,
    scheduled_for: execution.scheduled_for,
    // Material comes through the factory's Miscl flow; the complaint waits for RTD.
    factory_request_id: factoryRequest?.id ?? null,
    actions: (Object.keys(ACTIONS_FROM) as ExecutionAction[]).filter(
      (a) => ACTIONS_FROM[a].includes(execution.status) && !(factoryRequest && MANUAL_MATERIAL.includes(a)),
    ),
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
      if (!ssId) throw new ComplaintError("Assign a site supervisor before starting the resolution.");
      // Start Resolution: the resolution visit date is recorded and the work
      // is under way; the completion report follows.
      next = action === "SCHEDULE_REPAIR" ? "WORK_IN_PROGRESS" : "REPAIR_SCHEDULED";
      if (action === "SCHEDULE_REPAIR") data.started_at = new Date();
      when = upcomingDate(body.scheduled_for, "Resolution visit date");
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
    if (action === "START_WORK" || action === "SCHEDULE_REPAIR")
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
  files: { before: ComplaintUpload[]; after: ComplaintUpload[]; paymentProof?: ComplaintUpload[] },
) {
  const { complaint, execution } = await loadForExecution(actor, id, executionId, "COMPLETE_WORK");
  const version = versionOf(body.version);
  const completionRemarks = remarksOf(body.completion_remarks, "Work completion remarks")!;
  const fields = {
    material_used: remarksOf(body.material_used, "Material used", false),
    replacement_details: remarksOf(body.replacement_details, "Replacement details", false),
    client_remarks: remarksOf(body.client_remarks, "Client remarks", false),
    pending_work: remarksOf(body.pending_work, "Pending work"),
  };
  if (files.after.length === 0) throw new ComplaintError("Add at least one after-repair photo.");
  const before = classifyUploads(files.before, MAX_COMPLETION_PHOTOS);
  const after = classifyUploads(files.after, MAX_COMPLETION_PHOTOS);
  // Cash an installation team collected at its visit comes with this report.
  const cash = await prepareVisitCash(actor, complaint, body.visit_payment, files.paymentProof ?? []);
  let uploadedBefore: Awaited<ReturnType<typeof uploadAll>> = [];
  let uploadedAfter: Awaited<ReturnType<typeof uploadAll>> = [];
  const now = new Date();
  try {
    uploadedBefore = await uploadAll(actor, before);
    uploadedAfter = await uploadAll(actor, after);
    await prisma.$transaction(async (tx) => {
      await moveStatus(tx, complaint, version, {});
      if (cash) await insertPaymentTx(tx, actor, complaint, cash.charge, cash.prepared, true);
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
    await deleteWasabiObjects(
      [...uploadedBefore, ...uploadedAfter, ...(cash?.prepared.uploaded ?? [])].map((u) => u.key),
    );
    throw error;
  }
  return { status: "AWAITING_CLIENT_CONFIRMATION" as const };
}
