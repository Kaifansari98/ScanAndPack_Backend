import { prisma } from "../../prisma/client";
import {
  ComplaintAssigneeRole,
  ComplaintDecisionOutcome,
  ComplaintPriority,
  ComplaintStatus,
} from "../../prisma/generated";
import { deleteWasabiObjects, uploadComplaintFile } from "../../utils/wasabiClient";
import { ComplaintActor, ComplaintError, ComplaintUpload } from "./clientComplaints.service";
import {
  classifyUploads,
  isHead,
  LoadedComplaint,
  loadComplaint,
  log,
  MediaKind,
  moveStatus,
  remarksOf,
  versionOf,
} from "./complaintWorkflow.shared";
import { createVisitTx } from "./complaintVisit.service";

// HO verification stage (spec section 8). Every action is remarked, logged and
// guarded by the complaint's version so two people cannot act on a stale view.

export type VerificationAction =
  | "START_REVIEW"
  | "INFORMATION_RECEIVED"
  | "RESUME"
  | "DECIDE"
  | "SET_PRIORITY"
  | "REASSIGN";

const DECISION_OUTCOMES = [
  "APPROVED_FOR_VISIT",
  "MORE_INFORMATION_REQUIRED",
  "REMOTE_RESOLUTION",
  "REJECTED",
  "ON_HOLD",
] as const satisfies readonly ComplaintDecisionOutcome[];
type VerificationOutcome = (typeof DECISION_OUTCOMES)[number];

const OUTCOME_STATUS: Record<VerificationOutcome, ComplaintStatus> = {
  APPROVED_FOR_VISIT: "APPROVED_FOR_VISIT",
  MORE_INFORMATION_REQUIRED: "MORE_INFORMATION_REQUIRED",
  // The client still has to confirm the remote fix before HO can close it.
  REMOTE_RESOLUTION: "AWAITING_CLIENT_CONFIRMATION",
  REJECTED: "REJECTED",
  ON_HOLD: "ON_HOLD",
};

// The only status moves this stage may make. Anything else is refused.
const STAGE_TRANSITIONS: Record<
  Exclude<VerificationAction, "SET_PRIORITY" | "REASSIGN">,
  ComplaintStatus[]
> = {
  START_REVIEW: ["NEW", "REOPENED"],
  INFORMATION_RECEIVED: ["MORE_INFORMATION_REQUIRED"],
  RESUME: ["ON_HOLD"],
  DECIDE: ["UNDER_VERIFICATION"],
};

// Priority and ownership stay editable until the complaint is finished.
const FINISHED: ComplaintStatus[] = ["CLOSED", "REJECTED", "CANCELLED"];

const MAX_INFO_FILES = 10;

// Which buttons the details page should offer this viewer.
export function availableVerificationActions(
  actor: ComplaintActor,
  complaint: { status: ComplaintStatus; priority: ComplaintPriority | null; assigned_ss_id: number | null },
): VerificationAction[] {
  const head = isHead(actor.role);
  const assignedSs = complaint.assigned_ss_id === actor.actorId;
  const actions: VerificationAction[] = [];
  if (head) {
    for (const [action, from] of Object.entries(STAGE_TRANSITIONS))
      if (from.includes(complaint.status)) actions.push(action as VerificationAction);
  } else if (assignedSs && complaint.status === "MORE_INFORMATION_REQUIRED") {
    // The SS chases the client for missing details and can hand them back to HO.
    actions.push("INFORMATION_RECEIVED");
  }
  if (!FINISHED.includes(complaint.status)) {
    if (head || (assignedSs && !complaint.priority)) actions.push("SET_PRIORITY");
    if (head) actions.push("REASSIGN");
  }
  return actions;
}

function requireAction(actor: ComplaintActor, complaint: LoadedComplaint, action: VerificationAction) {
  if (!availableVerificationActions(actor, complaint).includes(action))
    throw new ComplaintError("This action is not available for the complaint's current status.", 409);
}

async function simpleTransition(
  actor: ComplaintActor,
  id: number,
  body: Record<string, unknown>,
  action: "START_REVIEW" | "RESUME",
) {
  const complaint = await loadComplaint(actor, id);
  requireAction(actor, complaint, action);
  const remarks = remarksOf(body.remarks, "Remarks", action === "RESUME");
  const version = versionOf(body.version);
  await prisma.$transaction(async (tx) => {
    await moveStatus(tx, complaint, version, {
      status: "UNDER_VERIFICATION",
      status_changed_at: new Date(),
    });
    await log(tx, actor, complaint, {
      action: action === "START_REVIEW" ? "VERIFICATION_STARTED" : "VERIFICATION_RESUMED",
      from_status: complaint.status,
      to_status: "UNDER_VERIFICATION",
      remarks,
    });
  });
  return { status: "UNDER_VERIFICATION" as const };
}

export const startVerification = (actor: ComplaintActor, id: number, body: Record<string, unknown>) =>
  simpleTransition(actor, id, body, "START_REVIEW");

export const resumeVerification = (actor: ComplaintActor, id: number, body: Record<string, unknown>) =>
  simpleTransition(actor, id, body, "RESUME");

export async function decideVerification(actor: ComplaintActor, id: number, body: Record<string, unknown>) {
  const complaint = await loadComplaint(actor, id);
  requireAction(actor, complaint, "DECIDE");
  const outcome = body.outcome as VerificationOutcome;
  if (!DECISION_OUTCOMES.includes(outcome)) throw new ComplaintError("Choose a verification decision.");
  const version = versionOf(body.version);

  const label: Record<VerificationOutcome, string> = {
    APPROVED_FOR_VISIT: "Remarks",
    MORE_INFORMATION_REQUIRED: "Details of the missing information",
    REMOTE_RESOLUTION: "Remarks",
    REJECTED: "Rejection reason",
    ON_HOLD: "Reason for hold",
  };
  const remarks = remarksOf(body.remarks, label[outcome])!;
  const remoteInstructions =
    outcome === "REMOTE_RESOLUTION" ? remarksOf(body.remote_instructions, "Advice / instructions given")! : null;
  const clientResponse =
    outcome === "REMOTE_RESOLUTION" ? remarksOf(body.client_response, "Client's response", false) : null;

  // HO must look at a flagged possible duplicate before acting on it.
  const duplicateRemarks =
    complaint.possible_duplicate && !complaint.duplicate_reviewed_at
      ? remarksOf(body.duplicate_review_remarks, "Duplicate review remarks")
      : null;

  // A complaint must never go to the field without an owner.
  if (outcome === "APPROVED_FOR_VISIT" && !complaint.assigned_ss_id)
    throw new ComplaintError("Assign a site supervisor before approving the visit.");

  let toStatus = OUTCOME_STATUS[outcome];
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await moveStatus(tx, complaint, version, {
      status: toStatus,
      status_changed_at: now,
      ...(duplicateRemarks
        ? { duplicate_reviewed_by: actor.actorId, duplicate_reviewed_at: now, duplicate_review_remarks: duplicateRemarks.slice(0, 2000) }
        : {}),
    });
    const decision = await tx.complaintDecision.create({
      data: {
        vendor_id: actor.vendorId,
        complaint_id: complaint.id,
        cycle_id: complaint.current_cycle_id,
        decision_type: "HO_VERIFICATION",
        outcome,
        remarks,
        remote_instructions: remoteInstructions,
        client_response: clientResponse,
        actor_type: "STAFF",
        actor_user_id: actor.actorId,
      },
    });
    if (outcome === "REJECTED")
      await tx.complaintCycle.update({
        where: { id: complaint.current_cycle_id },
        data: { ended_at: now, end_reason: "REJECTED" },
      });
    if (outcome === "REMOTE_RESOLUTION")
      await tx.complaintCycle.update({
        where: { id: complaint.current_cycle_id },
        data: { resolved_at: now },
      });
    await log(tx, actor, complaint, {
      action: `VERIFICATION_${outcome}`,
      from_status: complaint.status,
      to_status: toStatus,
      remarks,
      decision_id: decision.id,
      metadata: duplicateRemarks ? { duplicate_review_remarks: duplicateRemarks } : undefined,
    });
    // Spec 10.3: approval generates the first chargeable visit and its ₹800 charge.
    if (outcome === "APPROVED_FOR_VISIT")
      toStatus = await createVisitTx(tx, actor, { ...complaint, status: toStatus }, { chargeMode: "CHARGEABLE" });
  });
  return { status: toStatus };
}

export async function markInformationReceived(
  actor: ComplaintActor,
  id: number,
  body: Record<string, unknown>,
  files: ComplaintUpload[],
) {
  const complaint = await loadComplaint(actor, id);
  requireAction(actor, complaint, "INFORMATION_RECEIVED");
  const remarks = remarksOf(body.remarks, "Information received")!;
  const version = versionOf(body.version);
  const checked = classifyUploads(files, MAX_INFO_FILES);

  const uploaded: { key: string; file: ComplaintUpload; media: MediaKind }[] = [];
  try {
    for (const { file, media } of checked)
      uploaded.push({ key: await uploadComplaintFile(file.buffer, actor.vendorId, file.mimetype), file, media });
    await prisma.$transaction(async (tx) => {
      await moveStatus(tx, complaint, version, { status: "UNDER_VERIFICATION", status_changed_at: new Date() });
      if (uploaded.length)
        await tx.complaintAttachment.createMany({
          data: uploaded.map(({ key, file, media }) => ({
            vendor_id: actor.vendorId,
            complaint_id: complaint.id,
            cycle_id: complaint.current_cycle_id,
            storage_key: key,
            original_name: file.originalname.slice(0, 255),
            mime_type: file.mimetype,
            size_bytes: file.size,
            media_type: media,
            category: "ADDITIONAL_INFORMATION" as const,
            actor_type: "STAFF" as const,
            actor_user_id: actor.actorId,
          })),
        });
      await log(tx, actor, complaint, {
        action: "INFORMATION_RECEIVED",
        from_status: complaint.status,
        to_status: "UNDER_VERIFICATION",
        remarks,
        metadata: { files: uploaded.length },
      });
    });
  } catch (error) {
    await deleteWasabiObjects(uploaded.map((u) => u.key));
    throw error;
  }
  return { status: "UNDER_VERIFICATION" as const };
}

export async function setComplaintPriority(actor: ComplaintActor, id: number, body: Record<string, unknown>) {
  const complaint = await loadComplaint(actor, id);
  requireAction(actor, complaint, "SET_PRIORITY");
  const priority = body.priority as ComplaintPriority;
  if (!Object.values(ComplaintPriority).includes(priority)) throw new ComplaintError("Select a priority.");
  if (priority === complaint.priority) throw new ComplaintError("The complaint already has this priority.");
  // The SS picks the first priority; any later revision by HO must be explained.
  const remarks = remarksOf(body.remarks, "Reason for revising the priority", !!complaint.priority);
  const version = versionOf(body.version);
  await prisma.$transaction(async (tx) => {
    await moveStatus(tx, complaint, version, { priority });
    await log(tx, actor, complaint, {
      action: complaint.priority ? "PRIORITY_REVISED" : "PRIORITY_SET",
      remarks,
      metadata: { from: complaint.priority, to: priority },
    });
  });
  return { priority };
}

const SS_TYPES = ["site-supervisor", "site supervisor", "site_supervisor"];
const HSS_TYPES = ["head-site-supervisor", "head site supervisor", "head_site_supervisor"];

// Every active SS / HSS of the vendor; those covering the lead's franchise come first.
export async function getAssigneeOptions(actor: ComplaintActor, id: number) {
  const complaint = await loadComplaint(actor, id);
  requireAction(actor, complaint, "REASSIGN");
  const franchiseId = complaint.lead?.franchise_id ?? null;
  const users = await prisma.userMaster.findMany({
    where: {
      vendor_id: actor.vendorId,
      status: "active",
      user_type: { user_type: { in: [...SS_TYPES, ...HSS_TYPES], mode: "insensitive" } },
    },
    orderBy: { user_name: "asc" },
    select: {
      id: true,
      user_name: true,
      franchise_id: true,
      user_type: { select: { user_type: true } },
      siteSupervisorFranchiseMappings: franchiseId
        ? { where: { vendor_id: actor.vendorId, franchise_id: franchiseId }, select: { id: true } }
        : { where: { id: -1 }, select: { id: true } },
      headSiteSupervisorFranchiseMappings: franchiseId
        ? { where: { vendor_id: actor.vendorId, franchise_id: franchiseId, status: true }, select: { id: true } }
        : { where: { id: -1 }, select: { id: true } },
    },
  });
  const toOption = (u: (typeof users)[number], mapped: boolean) => ({
    id: u.id,
    name: u.user_name,
    in_franchise: !!franchiseId && (u.franchise_id === franchiseId || mapped),
  });
  const byFranchise = (a: { in_franchise: boolean }, b: { in_franchise: boolean }) =>
    Number(b.in_franchise) - Number(a.in_franchise);
  const type = (u: (typeof users)[number]) => u.user_type.user_type.toLowerCase();
  return {
    site_supervisors: users
      .filter((u) => SS_TYPES.includes(type(u)))
      .map((u) => toOption(u, u.siteSupervisorFranchiseMappings.length > 0))
      .sort(byFranchise),
    head_site_supervisors: users
      .filter((u) => HSS_TYPES.includes(type(u)))
      .map((u) => toOption(u, u.headSiteSupervisorFranchiseMappings.length > 0))
      .sort(byFranchise),
  };
}

export async function reassignComplaint(actor: ComplaintActor, id: number, body: Record<string, unknown>) {
  const complaint = await loadComplaint(actor, id);
  requireAction(actor, complaint, "REASSIGN");
  const role = body.role as ComplaintAssigneeRole;
  if (role !== "SITE_SUPERVISOR" && role !== "DEPARTMENT_HEAD")
    throw new ComplaintError("Choose whether to reassign the site supervisor or the head site supervisor.");
  const userId = Number(body.user_id);
  if (!Number.isSafeInteger(userId) || userId <= 0) throw new ComplaintError("Select the new owner.");
  const reason = remarksOf(body.reason, "Reason for reassignment")!.slice(0, 2000);
  const version = versionOf(body.version);

  const options = await getAssigneeOptions(actor, id);
  const pool = role === "SITE_SUPERVISOR" ? options.site_supervisors : options.head_site_supervisors;
  if (!pool.some((o) => o.id === userId))
    throw new ComplaintError("The selected user is not an active supervisor for this vendor.");
  const previous = role === "SITE_SUPERVISOR" ? complaint.assigned_ss_id : complaint.assigned_hss_id;
  if (previous === userId) throw new ComplaintError("This user already owns the complaint.");

  await prisma.$transaction(async (tx) => {
    await moveStatus(
      tx,
      complaint,
      version,
      role === "SITE_SUPERVISOR" ? { assigned_ss_id: userId } : { assigned_hss_id: userId },
    );
    const assignment = await tx.complaintAssignment.create({
      data: {
        vendor_id: actor.vendorId,
        complaint_id: complaint.id,
        cycle_id: complaint.current_cycle_id,
        role,
        previous_user_id: previous,
        new_user_id: userId,
        reason,
        assigned_by_actor_type: "STAFF",
        assigned_by: actor.actorId,
      },
    });
    await log(tx, actor, complaint, {
      action: previous ? "OWNER_REASSIGNED" : "OWNER_ASSIGNED",
      remarks: reason,
      assignment_id: assignment.id,
      metadata: { role, from: previous, to: userId },
    });
  });
  return { role, user_id: userId };
}
