import { prisma, Prisma } from "../../prisma/client";
import { ProjectTrackerStageKey } from "../../prisma/generated";
import { deleteWasabiObjects, uploadProjectTrackerFile } from "../../utils/wasabiClient";
import { PHOTO_TYPES, validFMFileSignature } from "../fmRequirements/schema";
import {
  buildTracker,
  dateOnly,
  STAGE_KEYS,
  STAGES,
  TrackerError,
  trackerUpdates,
  userNames,
} from "./projectTracker.core";

// CRM side of the Client Project Tracker. The lead's assigned team and HO
// (admin / super-admin) keep the client-facing information up to date; only
// admin / super-admin approve date revisions.

export type TrackerActor = { vendorId: number; userId: number; role: string };
export type TrackerUpload = Express.Multer.File;

const APPROVER_ROLES = ["admin", "super-admin"];
export const canApprove = (actor: TrackerActor) => APPROVER_ROLES.includes(actor.role);

const VIDEO_TYPES = ["video/mp4", "video/quicktime", "video/webm"];
export const TRACKER_MAX_FILES = 10;
export const TRACKER_MAX_FILE_SIZE = 50 * 1024 * 1024;
const MAX_PHOTO_SIZE = 15 * 1024 * 1024;

async function canEdit(actor: TrackerActor, leadId: number) {
  if (canApprove(actor)) return true;
  const mapped = await prisma.leadUserMapping.count({
    where: { lead_id: leadId, vendor_id: actor.vendorId, user_id: actor.userId, status: "active" },
  });
  return mapped > 0;
}

const text = (value: unknown, label: string, max: number, required = true) => {
  const v = typeof value === "string" ? value.trim() : "";
  if (!v) {
    if (required) throw new TrackerError(`${label} is required.`);
    return null;
  }
  if (v.length > max) throw new TrackerError(`${label} must be at most ${max} characters.`);
  return v;
};

const day = (value: unknown, label: string, required = true) => {
  if (value === undefined || value === null || value === "") {
    if (required) throw new TrackerError(`${label} is required.`);
    return null;
  }
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    throw new TrackerError(`${label} must be a date (YYYY-MM-DD).`);
  const d = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) throw new TrackerError(`${label} is not a valid date.`);
  return d;
};

const stageKey = (value: unknown) => {
  if (!STAGE_KEYS.includes(value as ProjectTrackerStageKey)) throw new TrackerError("Unknown stage.");
  return value as ProjectTrackerStageKey;
};
const stageName = (key: ProjectTrackerStageKey) => STAGES.find((s) => s.key === key)!.name;
const formatDay = (d: Date | null) =>
  d ? d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "—";

// Loads the tracker for a change: the actor must be allowed and the project open.
async function forChange(actor: TrackerActor, leadId: number) {
  if (!(await canEdit(actor, leadId)))
    throw new TrackerError("Only the lead's team or HO can update the client tracker.", 403);
  const tracker = await buildTracker(leadId, actor.vendorId);
  if (tracker.completed) throw new TrackerError("This project is completed; its tracker is read-only.", 409);
  return tracker;
}

async function stageRow(tx: Prisma.TransactionClient, actor: TrackerActor, leadId: number, stage: ProjectTrackerStageKey) {
  return tx.projectTrackerStage.upsert({
    where: { lead_id_stage: { lead_id: leadId, stage } },
    create: { vendor_id: actor.vendorId, lead_id: leadId, stage },
    update: {},
  });
}

const audit = (
  tx: Prisma.TransactionClient,
  actor: TrackerActor,
  leadId: number,
  stage: ProjectTrackerStageKey | null,
  action: string,
  details: Prisma.InputJsonValue,
) => tx.projectTrackerLog.create({ data: { vendor_id: actor.vendorId, lead_id: leadId, stage, action, details, created_by: actor.userId } });

const publish = (
  tx: Prisma.TransactionClient,
  actor: TrackerActor,
  leadId: number,
  stage: ProjectTrackerStageKey,
  kind: string,
  title: string,
  description: string | null,
) =>
  tx.projectTrackerUpdate.create({
    data: { vendor_id: actor.vendorId, lead_id: leadId, stage, kind, title, description, published_by: actor.userId },
  });

/** Staff view: the client's view plus hold details, revisions, overdue flags and the audit log. */
export async function getStaffTracker(actor: TrackerActor, leadId: number) {
  const tracker = await buildTracker(leadId, actor.vendorId, { staff: true });
  const [revisions, logs, updates, editable] = await Promise.all([
    prisma.projectTrackerDateRevision.findMany({ where: { lead_id: leadId }, orderBy: { requested_at: "desc" } }),
    prisma.projectTrackerLog.findMany({ where: { lead_id: leadId }, orderBy: { created_at: "desc" }, take: 100 }),
    trackerUpdates(tracker, { withNames: true }),
    canEdit(actor, leadId),
  ]);
  const names = await userNames([
    ...revisions.flatMap((r) => [r.requested_by, r.decided_by]),
    ...logs.map((l) => l.created_by),
    ...[...tracker.rows.values()].map((r) => r.original_set_by),
  ]);
  return {
    ...tracker.view,
    permissions: {
      can_edit: editable && !tracker.completed,
      can_approve: canApprove(actor) && !tracker.completed,
    },
    stage_details: Object.fromEntries(
      STAGES.map((s) => {
        const row = tracker.rows.get(s.key);
        return [
          s.key,
          {
            client_remark: row?.client_remark ?? null,
            client_remark_at: row?.client_remark_at?.toISOString() ?? null,
            original_set_by: row?.original_set_by ? names.get(row.original_set_by) ?? null : null,
            original_set_at: row?.original_set_at?.toISOString() ?? null,
          },
        ];
      }),
    ),
    revisions: revisions.map((r) => ({
      id: r.id,
      stage: r.stage,
      stage_name: stageName(r.stage),
      previous_date: dateOnly(r.previous_date),
      proposed_date: dateOnly(r.proposed_date),
      approved_date: dateOnly(r.approved_date),
      reason: r.reason,
      status: r.status,
      requested_by: names.get(r.requested_by) ?? null,
      requested_at: r.requested_at.toISOString(),
      decided_by: r.decided_by ? names.get(r.decided_by) ?? null : null,
      decided_at: r.decided_at?.toISOString() ?? null,
      decision_remarks: r.decision_remarks,
    })),
    audit: logs.map((l) => ({
      id: l.id,
      stage: l.stage,
      action: l.action,
      details: l.details,
      by: names.get(l.created_by) ?? null,
      at: l.created_at.toISOString(),
    })),
    updates,
  };
}

/**
 * Client-facing status of the current stage. On Hold needs a reason and the
 * action being taken; Delayed also needs a revised date, which goes through
 * the date-revision approval. In Progress clears a hold (work resumed).
 */
export async function setStageStatus(actor: TrackerActor, leadId: number, key: unknown, body: Record<string, unknown>) {
  const stage = stageKey(key);
  const tracker = await forChange(actor, leadId);
  if (tracker.view.current?.key !== stage)
    throw new TrackerError("Only the current stage's status can be changed.", 409);
  const status = body.status;
  if (status !== "IN_PROGRESS" && status !== "ON_HOLD" && status !== "DELAYED")
    throw new TrackerError("Choose In Progress, On Hold or Delayed.");
  const previous = tracker.rows.get(stage)?.hold_status ?? "IN_PROGRESS";
  if (status === previous && status === "IN_PROGRESS") throw new TrackerError("The stage is already in progress.", 409);

  if (status === "IN_PROGRESS") {
    const note = text(body.remarks, "Update for the client", 2000, false);
    await prisma.$transaction(async (tx) => {
      await stageRow(tx, actor, leadId, stage);
      await tx.projectTrackerStage.update({
        where: { lead_id_stage: { lead_id: leadId, stage } },
        data: { hold_status: null, hold_reason: null, hold_action: null, hold_resume_date: null, hold_since: null, updated_by: actor.userId },
      });
      await audit(tx, actor, leadId, stage, "STATUS_IN_PROGRESS", { from: previous, remarks: note });
      await publish(tx, actor, leadId, stage, "RESUMED", `${stageName(stage)} resumed`, note ?? "Work is back in progress.");
    });
    return { status };
  }

  const reason = text(body.reason, status === "ON_HOLD" ? "Reason for hold" : "Reason for delay", 2000)!;
  const action = text(body.action, status === "ON_HOLD" ? "Action being taken" : "Action plan", 2000)!;
  const resumeDate = status === "ON_HOLD" ? day(body.resume_date, "Expected resumption date", false) : null;
  const revisedDate = status === "DELAYED" ? day(body.revised_date, "Revised expected completion date") : null;

  const result = await prisma.$transaction(async (tx) => {
    const row = await stageRow(tx, actor, leadId, stage);
    await tx.projectTrackerStage.update({
      where: { id: row.id },
      data: {
        hold_status: status,
        hold_reason: reason,
        hold_action: action,
        hold_resume_date: resumeDate,
        hold_since: previous === status ? row.hold_since : new Date(),
        updated_by: actor.userId,
      },
    });
    await audit(tx, actor, leadId, stage, `STATUS_${status}`, {
      from: previous,
      reason,
      action,
      resume_date: dateOnly(resumeDate),
      revised_date: dateOnly(revisedDate),
    });
    await publish(
      tx,
      actor,
      leadId,
      stage,
      status === "ON_HOLD" ? "HOLD" : "DELAYED",
      status === "ON_HOLD" ? `${stageName(stage)} is on hold` : `${stageName(stage)} is delayed`,
      `${reason}\n\nWhat we're doing: ${action}`,
    );
    const revision = revisedDate ? await requestRevisionTx(tx, actor, leadId, stage, row, revisedDate, reason) : null;
    return { status, revision };
  });
  return result;
}

/** Sets a stage's first expected date. Later changes go through a revision. */
export async function setExpectedDate(actor: TrackerActor, leadId: number, key: unknown, body: Record<string, unknown>) {
  const stage = stageKey(key);
  await forChange(actor, leadId);
  const date = day(body.date, "Expected completion date")!;
  return prisma.$transaction(async (tx) => {
    const row = await stageRow(tx, actor, leadId, stage);
    if (row.original_expected_date)
      throw new TrackerError("This stage already has an expected date; request a date revision instead.", 409);
    await tx.projectTrackerStage.update({
      where: { id: row.id },
      data: { original_expected_date: date, original_set_at: new Date(), original_set_by: actor.userId, updated_by: actor.userId },
    });
    await audit(tx, actor, leadId, stage, "EXPECTED_DATE_SET", { date: dateOnly(date) });
    return { original_expected_date: dateOnly(date) };
  });
}

export async function requestRevision(actor: TrackerActor, leadId: number, key: unknown, body: Record<string, unknown>) {
  const stage = stageKey(key);
  await forChange(actor, leadId);
  const proposed = day(body.proposed_date, "Revised date")!;
  const reason = text(body.reason, "Reason for revision", 2000)!;
  return prisma.$transaction(async (tx) => {
    const row = await stageRow(tx, actor, leadId, stage);
    return requestRevisionTx(tx, actor, leadId, stage, row, proposed, reason);
  });
}

// One pending revision per stage; an approver's own request applies at once.
async function requestRevisionTx(
  tx: Prisma.TransactionClient,
  actor: TrackerActor,
  leadId: number,
  stage: ProjectTrackerStageKey,
  row: { id: number; original_expected_date: Date | null; approved_expected_date: Date | null },
  proposed: Date,
  reason: string,
) {
  if (!row.original_expected_date)
    throw new TrackerError("Set the stage's expected date before revising it.", 409);
  const current = row.approved_expected_date ?? row.original_expected_date;
  if (current.getTime() === proposed.getTime()) throw new TrackerError("The revised date is the same as the current one.");
  const pending = await tx.projectTrackerDateRevision.findFirst({
    where: { lead_id: leadId, stage, status: "PENDING" },
    select: { id: true },
  });
  if (pending) throw new TrackerError("A date revision for this stage is already waiting for approval.", 409);
  const revision = await tx.projectTrackerDateRevision.create({
    data: { vendor_id: actor.vendorId, lead_id: leadId, stage, previous_date: current, proposed_date: proposed, reason, requested_by: actor.userId },
  });
  await audit(tx, actor, leadId, stage, "REVISION_REQUESTED", { revision_id: revision.id, from: dateOnly(current), to: dateOnly(proposed), reason });
  if (canApprove(actor)) await approveTx(tx, actor, revision.id, proposed, null);
  return { id: revision.id, status: canApprove(actor) ? "APPROVED" : "PENDING" };
}

async function approveTx(tx: Prisma.TransactionClient, actor: TrackerActor, revisionId: number, date: Date, remarks: string | null) {
  const revision = await tx.projectTrackerDateRevision.update({
    where: { id: revisionId },
    data: { status: "APPROVED", approved_date: date, decided_by: actor.userId, decided_at: new Date(), decision_remarks: remarks },
  });
  const row = await tx.projectTrackerStage.update({
    where: { lead_id_stage: { lead_id: revision.lead_id, stage: revision.stage } },
    data: { approved_expected_date: date, updated_by: actor.userId },
  });
  await audit(tx, actor, revision.lead_id, revision.stage, "REVISION_APPROVED", {
    revision_id: revision.id,
    proposed: dateOnly(revision.proposed_date),
    approved: dateOnly(date),
    remarks,
  });
  await publish(
    tx,
    actor,
    revision.lead_id,
    revision.stage,
    "REVISION",
    `${stageName(revision.stage)} date revised`,
    `Originally ${formatDay(row.original_expected_date)}, now expected by ${formatDay(date)}.\n\n${revision.reason}`,
  );
}

export async function decideRevision(actor: TrackerActor, revisionId: number, body: Record<string, unknown>) {
  if (!canApprove(actor)) throw new TrackerError("Only an admin or super-admin can approve date revisions.", 403);
  const revision = await prisma.projectTrackerDateRevision.findFirst({
    where: { id: revisionId, vendor_id: actor.vendorId },
  });
  if (!revision) throw new TrackerError("Date revision not found.", 404);
  if (revision.status !== "PENDING") throw new TrackerError("This revision is already decided.", 409);
  const tracker = await buildTracker(revision.lead_id, actor.vendorId);
  if (tracker.completed) throw new TrackerError("This project is completed; its tracker is read-only.", 409);
  const outcome = body.outcome;
  const remarks = text(body.remarks, "Remarks", 2000, outcome === "REJECTED");
  await prisma.$transaction(async (tx) => {
    if (outcome === "APPROVED") {
      // The approver may set a different date from the one proposed.
      const date = day(body.approved_date, "Approved date", false) ?? revision.proposed_date;
      await approveTx(tx, actor, revision.id, date, remarks);
    } else if (outcome === "REJECTED") {
      await tx.projectTrackerDateRevision.update({
        where: { id: revision.id },
        data: { status: "REJECTED", decided_by: actor.userId, decided_at: new Date(), decision_remarks: remarks },
      });
      await audit(tx, actor, revision.lead_id, revision.stage, "REVISION_REJECTED", { revision_id: revision.id, remarks });
    } else throw new TrackerError("Approve or reject the revision.");
  });
  return { outcome };
}

/** Pending date revisions across the vendor, for the approval queue. */
export async function pendingRevisions(actor: TrackerActor) {
  const rows = await prisma.projectTrackerDateRevision.findMany({
    where: { vendor_id: actor.vendorId, status: "PENDING" },
    orderBy: { requested_at: "asc" },
  });
  const [names, leads] = await Promise.all([
    userNames(rows.map((r) => r.requested_by)),
    prisma.leadMaster.findMany({
      where: { id: { in: rows.map((r) => r.lead_id) } },
      select: { id: true, lead_code: true, firstname: true, lastname: true },
    }),
  ]);
  const leadOf = new Map(leads.map((l) => [l.id, l]));
  return {
    can_approve: canApprove(actor),
    rows: rows.map((r) => ({
      id: r.id,
      lead_id: r.lead_id,
      lead_code: leadOf.get(r.lead_id)?.lead_code ?? null,
      client_name: `${leadOf.get(r.lead_id)?.firstname ?? ""} ${leadOf.get(r.lead_id)?.lastname ?? ""}`.trim(),
      stage: r.stage,
      stage_name: stageName(r.stage),
      previous_date: dateOnly(r.previous_date),
      proposed_date: dateOnly(r.proposed_date),
      reason: r.reason,
      requested_by: names.get(r.requested_by) ?? null,
      requested_at: r.requested_at.toISOString(),
    })),
  };
}

/** Client-facing remark on a stage (shown on the current-stage card). */
export async function setRemark(actor: TrackerActor, leadId: number, key: unknown, body: Record<string, unknown>) {
  const stage = stageKey(key);
  await forChange(actor, leadId);
  const remark = text(body.remark, "Remark", 2000)!;
  await prisma.$transaction(async (tx) => {
    await stageRow(tx, actor, leadId, stage);
    await tx.projectTrackerStage.update({
      where: { lead_id_stage: { lead_id: leadId, stage } },
      data: { client_remark: remark, client_remark_at: new Date(), updated_by: actor.userId },
    });
    await audit(tx, actor, leadId, stage, "REMARK_PUBLISHED", { remark });
  });
  return { remark };
}

/** Publishes a client update; only the files staff attach here are shown. */
export async function publishUpdate(actor: TrackerActor, leadId: number, body: Record<string, unknown>, files: TrackerUpload[]) {
  const stage = stageKey(body.stage);
  await forChange(actor, leadId);
  const title = text(body.title, "Title", 200)!;
  const description = text(body.description, "Description", 4000, false);
  if (files.length > TRACKER_MAX_FILES) throw new TrackerError(`Attach up to ${TRACKER_MAX_FILES} files.`);
  const checked = files.map((file) => {
    const photo = PHOTO_TYPES.includes(file.mimetype);
    const video = VIDEO_TYPES.includes(file.mimetype);
    const pdf = file.mimetype === "application/pdf";
    if (!photo && !video && !pdf) throw new TrackerError(`${file.originalname}: attach a photo, video or PDF.`);
    if (file.size > (video ? TRACKER_MAX_FILE_SIZE : MAX_PHOTO_SIZE))
      throw new TrackerError(`${file.originalname} is too large.`);
    const ok = pdf ? file.buffer.subarray(0, 5).toString() === "%PDF-" : validFMFileSignature(file.buffer, file.mimetype);
    if (!ok) throw new TrackerError(`${file.originalname}: file contents do not match its format.`);
    return { file, media: photo ? "PHOTO" : video ? "VIDEO" : "DOCUMENT" };
  });

  const uploaded: { key: string; file: TrackerUpload; media: string }[] = [];
  try {
    for (const c of checked)
      uploaded.push({ key: await uploadProjectTrackerFile(c.file.buffer, actor.vendorId, leadId, c.file.mimetype), ...c });
    return await prisma.$transaction(async (tx) => {
      const update = await publish(tx, actor, leadId, stage, "MANUAL", title, description);
      if (uploaded.length)
        await tx.projectTrackerUpdateFile.createMany({
          data: uploaded.map((u) => ({
            vendor_id: actor.vendorId,
            update_id: update.id,
            storage_key: u.key,
            original_name: u.file.originalname.slice(0, 255),
            mime_type: u.file.mimetype,
            size_bytes: u.file.size,
            media_type: u.media,
          })),
        });
      await audit(tx, actor, leadId, stage, "UPDATE_PUBLISHED", { update_id: update.id, title, files: uploaded.length });
      return { id: update.id };
    });
  } catch (error) {
    await deleteWasabiObjects(uploaded.map((u) => u.key));
    throw error;
  }
}
