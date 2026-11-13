import { prisma } from "../../prisma/client";
import {
  ComplaintRepairAction,
  ComplaintResponsibility,
  ComplaintStatus,
  ComplaintWarrantyStatus,
} from "../../prisma/generated";
import { deleteWasabiObjects } from "../../utils/wasabiClient";
import { ComplaintActor, ComplaintError, ComplaintUpload } from "./clientComplaints.service";
import {
  attachmentRows,
  classifyUploads,
  dateOnly,
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

// Warranty decision (spec 8), site inspection report (spec 12) and HO's call on
// how a submitted inspection proceeds.

const FINISHED: ComplaintStatus[] = ["CLOSED", "REJECTED", "CANCELLED"];

export const WARRANTY_OUTCOMES = ["COVERED", "PARTIALLY_COVERED", "NOT_COVERED"] as const;

export async function setWarranty(actor: ComplaintActor, id: number, body: Record<string, unknown>) {
  requireHead(actor, "decide warranty");
  const complaint = await loadComplaint(actor, id);
  if (FINISHED.includes(complaint.status)) throw new ComplaintError("This complaint is already finished.", 409);
  const outcome = body.outcome as (typeof WARRANTY_OUTCOMES)[number];
  if (!WARRANTY_OUTCOMES.includes(outcome)) throw new ComplaintError("Choose the warranty decision.");
  const remarks = remarksOf(body.remarks, "Reason for the warranty decision")!;
  const version = versionOf(body.version);
  await prisma.$transaction(async (tx) => {
    await moveStatus(tx, complaint, version, { warranty_status: outcome as ComplaintWarrantyStatus });
    const decision = await tx.complaintDecision.create({
      data: decisionData(actor, complaint, { decision_type: "WARRANTY_DECISION", outcome, remarks }),
    });
    await log(tx, actor, complaint, { action: `WARRANTY_${outcome}`, remarks, decision_id: decision.id });
  });
  return { warranty_status: outcome };
}

// The completed visit still waiting for its inspection report, if any.
async function visitAwaitingReport(complaintId: number, cycleId: number) {
  return prisma.complaintVisit.findFirst({
    where: { complaint_id: complaintId, cycle_id: cycleId, status: "COMPLETED", inspectionReports: { none: {} } },
    orderBy: { visit_number: "desc" },
    select: { id: true, visit_number: true, completed_at: true },
  });
}

export async function inspectionPermissions(
  actor: ComplaintActor,
  complaint: { id: number; status: ComplaintStatus; assigned_ss_id: number | null; current_cycle_id: number | null },
) {
  const head = isHead(actor.role);
  const staff = isComplaintStaff(actor, complaint);
  const pendingVisit =
    staff && complaint.current_cycle_id && complaint.status === "VISIT_SCHEDULED"
      ? await visitAwaitingReport(complaint.id, complaint.current_cycle_id)
      : null;
  let latestReport: { material_required: boolean } | null = null;
  if (head && complaint.status === "INSPECTION_SUBMITTED" && complaint.current_cycle_id)
    latestReport = await prisma.complaintInspectionReport.findFirst({
      where: { complaint_id: complaint.id, cycle_id: complaint.current_cycle_id },
      orderBy: { submitted_at: "desc" },
      select: { material_required: true },
    });
  return {
    can_set_warranty: head && !FINISHED.includes(complaint.status),
    // Completed visit that needs its inspection report.
    report_visit: pendingVisit
      ? { id: pendingVisit.id, visit_number: pendingVisit.visit_number, completed_at: pendingVisit.completed_at }
      : null,
    // HO decides how a submitted inspection proceeds.
    after_inspection: latestReport ? { material_required: latestReport.material_required } : null,
  };
}

// Matches the route's 15 photos + 5 videos + 5 documents.
const MAX_INSPECTION_FILES = 25;

type MaterialInput = {
  material_name?: unknown;
  quantity?: unknown;
  unit?: unknown;
  specification?: unknown;
  finish_colour?: unknown;
  estimated_cost?: unknown;
  remarks?: unknown;
};

function parseMaterials(value: unknown) {
  if (!Array.isArray(value) || value.length === 0)
    throw new ComplaintError("List the material required.");
  if (value.length > 50) throw new ComplaintError("Add up to 50 material lines.");
  return (value as MaterialInput[]).map((m, i) => {
    const line = `Material line ${i + 1}`;
    const quantity = Number(m.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) throw new ComplaintError(`${line}: enter a quantity above 0.`);
    return {
      sequence: i + 1,
      material_name: remarksOf(m.material_name, `${line} name`)!.slice(0, 250),
      quantity,
      unit: remarksOf(m.unit, `${line} unit`, false)?.slice(0, 40) ?? null,
      specification: remarksOf(m.specification, `${line} specification`, false)?.slice(0, 2000) ?? null,
      finish_colour: remarksOf(m.finish_colour, `${line} finish / colour`, false)?.slice(0, 200) ?? null,
      estimated_cost:
        m.estimated_cost === undefined || m.estimated_cost === null || m.estimated_cost === ""
          ? null
          : money(m.estimated_cost, `${line} estimated cost`, { allowZero: true }),
      remarks: remarksOf(m.remarks, `${line} remarks`, false)?.slice(0, 2000) ?? null,
    };
  });
}

export async function submitInspection(
  actor: ComplaintActor,
  id: number,
  body: Record<string, unknown>,
  files: { photos: ComplaintUpload[]; videos: ComplaintUpload[]; documents: ComplaintUpload[] },
) {
  const complaint = await loadComplaint(actor, id);
  if (!isComplaintStaff(actor, complaint))
    throw new ComplaintError("Only HO or the assigned site supervisor can submit the inspection.", 403);
  requireStatus(complaint, ["VISIT_SCHEDULED"], "submit an inspection");
  const visit = await visitAwaitingReport(complaint.id, complaint.current_cycle_id);
  if (!visit || visit.id !== Number(body.visit_id))
    throw new ComplaintError("Mark the visit completed before submitting its inspection report.", 409);
  const version = versionOf(body.version);

  const responsibility = body.responsibility as ComplaintResponsibility;
  if (!Object.values(ComplaintResponsibility).includes(responsibility))
    throw new ComplaintError("Select the responsibility classification.");
  const repairActions = Array.isArray(body.repair_actions) ? (body.repair_actions as ComplaintRepairAction[]) : [];
  if (repairActions.length === 0 || repairActions.some((a) => !Object.values(ComplaintRepairAction).includes(a)))
    throw new ComplaintError("Select the adjustment / repair required.");
  const materialRequired = body.material_required === true;
  const estimatedDays =
    body.estimated_work_days === undefined || body.estimated_work_days === null || body.estimated_work_days === ""
      ? null
      : Number(body.estimated_work_days);
  if (estimatedDays !== null && (!Number.isSafeInteger(estimatedDays) || estimatedDays < 0 || estimatedDays > 365))
    throw new ComplaintError("Estimated work duration must be a whole number of days.");
  const report = {
    actual_visit_date:
      dateOnly(body.actual_visit_date, "Actual visit date", { required: true, notFuture: true })!,
    client_available: body.client_available === true,
    issue_observed: remarksOf(body.issue_observed, "Issue observed")!,
    root_cause: remarksOf(body.root_cause, "Root cause")!,
    affected_product: remarksOf(body.affected_product, "Affected product")!.slice(0, 200),
    affected_unit_number: remarksOf(body.affected_unit_number, "Affected unit number")!.slice(0, 100),
    responsibility,
    responsibility_remarks:
      remarksOf(body.responsibility_remarks, "Responsibility remarks", responsibility === "OTHER")?.slice(0, 2000) ?? null,
    repair_actions: [...new Set(repairActions)],
    material_required: materialRequired,
    remarks: remarksOf(body.remarks, "Remarks", false),
    estimated_work_days: estimatedDays,
    expected_completion_date: dateOnly(body.expected_completion_date, "Expected completion date"),
    additional_visit_required: body.additional_visit_required === true,
    further_approval_required: body.further_approval_required === true,
  };
  const materials = materialRequired ? parseMaterials(body.materials) : [];
  if (files.photos.length === 0) throw new ComplaintError("Add at least one damage photograph.");
  const checked = classifyUploads([...files.photos, ...files.videos, ...files.documents], MAX_INSPECTION_FILES);
  const uploaded = await uploadAll(actor, checked);

  try {
    await prisma.$transaction(async (tx) => {
      await moveStatus(tx, complaint, version, {});
      const created = await tx.complaintInspectionReport.create({
        data: {
          vendor_id: actor.vendorId,
          complaint_id: complaint.id,
          cycle_id: complaint.current_cycle_id,
          visit_id: visit.id,
          submitted_by: actor.actorId,
          ...report,
        },
      });
      if (materials.length)
        await tx.complaintInspectionMaterial.createMany({
          data: materials.map((m) => ({
            vendor_id: actor.vendorId,
            complaint_id: complaint.id,
            cycle_id: complaint.current_cycle_id,
            inspection_report_id: created.id,
            ...m,
          })),
        });
      await tx.complaintAttachment.createMany({
        data: attachmentRows(actor, complaint, uploaded, {
          category: "INSPECTION",
          inspection_report_id: created.id,
          visit_id: visit.id,
        }),
      });
      await setComplaintStatus(tx, complaint, "INSPECTION_SUBMITTED");
      await log(tx, actor, complaint, {
        action: "INSPECTION_SUBMITTED",
        from_status: complaint.status,
        to_status: "INSPECTION_SUBMITTED",
        remarks: report.issue_observed.slice(0, 4000),
        visit_id: visit.id,
        metadata: { responsibility, material_required: materialRequired, files: uploaded.length },
      });
    });
  } catch (error) {
    await deleteWasabiObjects(uploaded.map((u) => u.key));
    throw error;
  }
  return { status: "INSPECTION_SUBMITTED" as const };
}

export type AfterInspectionAction = "START_QUOTATION" | "PROCEED_WITHOUT_QUOTATION" | "RESOLVE_WITHOUT_REPAIR";

// HO's decision once the inspection is in (spec 12 → 13 / 15 / 16).
export async function afterInspection(actor: ComplaintActor, id: number, body: Record<string, unknown>) {
  requireHead(actor, "decide how the inspection proceeds");
  const complaint = await loadComplaint(actor, id);
  requireStatus(complaint, ["INSPECTION_SUBMITTED"], "act on the inspection");
  const version = versionOf(body.version);
  const action = body.action as AfterInspectionAction;
  if (!["START_QUOTATION", "PROCEED_WITHOUT_QUOTATION", "RESOLVE_WITHOUT_REPAIR"].includes(action))
    throw new ComplaintError("Choose how the complaint proceeds.");
  const remarks = remarksOf(body.remarks, "Remarks", action !== "START_QUOTATION");
  let status: ComplaintStatus = complaint.status;

  await prisma.$transaction(async (tx) => {
    await moveStatus(tx, complaint, version, {});
    if (action === "START_QUOTATION") {
      status = "QUOTATION_PREPARATION";
      await setComplaintStatus(tx, complaint, status);
      await log(tx, actor, complaint, { action: "QUOTATION_PREPARATION_STARTED", from_status: complaint.status, to_status: status, remarks });
    } else if (action === "PROCEED_WITHOUT_QUOTATION") {
      // e.g. fully warranty-covered work or a simple adjustment with no cost.
      const decision = await tx.complaintDecision.create({
        data: decisionData(actor, complaint, { decision_type: "QUOTATION_SKIP", outcome: "SKIPPED", remarks: remarks! }),
      });
      await log(tx, actor, complaint, { action: "QUOTATION_SKIPPED", remarks, decision_id: decision.id });
      status = await startExecutionTx(tx, actor, complaint, {
        quotationSkipDecisionId: decision.id,
        materialRequired: typeof body.material_required === "boolean" ? body.material_required : undefined,
      });
    } else {
      const now = new Date();
      await tx.complaintCycle.update({ where: { id: complaint.current_cycle_id }, data: { resolved_at: now } });
      status = "AWAITING_CLIENT_CONFIRMATION";
      await setComplaintStatus(tx, complaint, status);
      await log(tx, actor, complaint, { action: "RESOLVED_WITHOUT_REPAIR", from_status: complaint.status, to_status: status, remarks });
    }
  });
  return { status };
}
