import { prisma, Prisma } from "../../prisma/client";
import { ComplaintStatus } from "../../prisma/generated";
import { deleteWasabiObjects, uploadComplaintFile } from "../../utils/wasabiClient";
import { PHOTO_TYPES, validFMFileSignature } from "../fmRequirements/schema";
import {
  canViewAllComplaints,
  ComplaintActor,
  ComplaintError,
  ComplaintUpload,
  COMPLAINT_MAX_PHOTO_SIZE,
  COMPLAINT_MAX_VIDEO_SIZE,
  VIDEO_TYPES,
} from "./clientComplaints.service";

// Helpers shared by every complaint workflow stage.

export const isHead = (role: string) => canViewAllComplaints(role);

export function remarksOf(value: unknown, label = "Remarks", required = true) {
  const missing = `${label} ${label.endsWith("s") ? "are" : "is"} required.`;
  if (value === undefined || value === null || value === "") {
    if (required) throw new ComplaintError(missing);
    return null;
  }
  if (typeof value !== "string") throw new ComplaintError(`${label} must be text.`);
  const trimmed = value.trim();
  if (!trimmed) {
    if (required) throw new ComplaintError(missing);
    return null;
  }
  if (trimmed.length > 4000) throw new ComplaintError(`${label} must be at most 4000 characters.`);
  return trimmed;
}

export function versionOf(value: unknown) {
  const version = Number(value);
  if (!Number.isSafeInteger(version) || version < 1)
    throw new ComplaintError("Refresh the complaint and try again.");
  return version;
}

export async function loadComplaint(actor: ComplaintActor, id: number) {
  const complaint = await prisma.complaintMaster.findFirst({
    where: {
      id,
      vendor_id: actor.vendorId,
      ...(isHead(actor.role) ? {} : { assigned_ss_id: actor.actorId }),
    },
    select: {
      id: true,
      status: true,
      version: true,
      priority: true,
      possible_duplicate: true,
      duplicate_reviewed_at: true,
      assigned_ss_id: true,
      assigned_hss_id: true,
      current_cycle_id: true,
      lead: { select: { franchise_id: true } },
    },
  });
  if (!complaint) throw new ComplaintError("Complaint not found or access denied.", 404);
  if (!complaint.current_cycle_id)
    throw new ComplaintError("This complaint has no active cycle.", 409);
  return complaint as typeof complaint & { current_cycle_id: number };
}

export type LoadedComplaint = Awaited<ReturnType<typeof loadComplaint>>;

// Applies the update only if nobody else changed the complaint since the viewer
// loaded it; every successful action bumps the version.
export async function moveStatus(
  tx: Prisma.TransactionClient,
  complaint: LoadedComplaint,
  version: number,
  data: Prisma.ComplaintMasterUncheckedUpdateManyInput,
) {
  const updated = await tx.complaintMaster.updateMany({
    where: { id: complaint.id, version },
    data: { ...data, version: { increment: 1 } },
  });
  if (updated.count === 0)
    throw new ComplaintError("This complaint was updated by someone else. Refresh and try again.", 409);
}

export function log(
  tx: Prisma.TransactionClient,
  actor: ComplaintActor,
  complaint: LoadedComplaint,
  entry: Omit<
    Prisma.ComplaintActivityLogUncheckedCreateInput,
    "vendor_id" | "complaint_id" | "cycle_id" | "actor_type" | "actor_user_id"
  >,
) {
  return tx.complaintActivityLog.create({
    data: {
      vendor_id: actor.vendorId,
      complaint_id: complaint.id,
      cycle_id: complaint.current_cycle_id,
      actor_type: "STAFF",
      actor_user_id: actor.actorId,
      ...entry,
    },
  });
}

export type MediaKind = "PHOTO" | "VIDEO" | "DOCUMENT";

// Photos, videos and PDFs, checked against their real file signatures.
export function classifyUploads(files: ComplaintUpload[], max: number, allowVideo = true) {
  if (files.length > max) throw new ComplaintError(`Add up to ${max} files.`);
  return files.map((file) => {
    const photo = PHOTO_TYPES.includes(file.mimetype);
    const video = allowVideo && VIDEO_TYPES.includes(file.mimetype);
    const pdf = file.mimetype === "application/pdf";
    if (!photo && !video && !pdf)
      throw new ComplaintError(
        `${file.originalname}: upload a photo${allowVideo ? ", video" : ""} or PDF.`,
      );
    const limit = video ? COMPLAINT_MAX_VIDEO_SIZE : COMPLAINT_MAX_PHOTO_SIZE;
    if (file.size > limit) throw new ComplaintError(`${file.originalname} is too large.`);
    const signatureOk = pdf
      ? file.buffer.subarray(0, 5).toString() === "%PDF-"
      : validFMFileSignature(file.buffer, file.mimetype);
    if (!signatureOk)
      throw new ComplaintError(`${file.originalname}: file contents do not match its format.`);
    return { file, media: (photo ? "PHOTO" : video ? "VIDEO" : "DOCUMENT") as MediaKind };
  });
}

// Sets the complaint status inside a transaction that already passed moveStatus.
export async function setComplaintStatus(
  tx: Prisma.TransactionClient,
  complaint: LoadedComplaint,
  status: ComplaintStatus,
) {
  if (status !== complaint.status)
    await tx.complaintMaster.update({
      where: { id: complaint.id },
      data: { status, status_changed_at: new Date() },
    });
}

export function decisionData(
  actor: ComplaintActor,
  complaint: LoadedComplaint,
  data: Pick<Prisma.ComplaintDecisionUncheckedCreateInput, "decision_type" | "outcome" | "remarks"> &
    Partial<
      Pick<
        Prisma.ComplaintDecisionUncheckedCreateInput,
        "visit_id" | "quotation_id" | "client_response" | "acting_on_behalf_of_client" | "actor_client_reference"
      >
    >,
): Prisma.ComplaintDecisionUncheckedCreateInput {
  return {
    vendor_id: actor.vendorId,
    complaint_id: complaint.id,
    cycle_id: complaint.current_cycle_id,
    actor_type: "STAFF",
    actor_user_id: actor.actorId,
    ...data,
  };
}

// Staff recording a client's answer must say how the client gave it.
export function clientReferenceOf(value: unknown) {
  return remarksOf(value, "How the client confirmed")!.slice(0, 255);
}

export const isAssignedSs = (actor: ComplaintActor, complaint: { assigned_ss_id: number | null }) =>
  complaint.assigned_ss_id === actor.actorId;

// Staff who may work a complaint day to day: HO or its assigned site supervisor.
export const isComplaintStaff = (actor: ComplaintActor, complaint: { assigned_ss_id: number | null }) =>
  isHead(actor.role) || isAssignedSs(actor, complaint);

export function requireHead(actor: ComplaintActor, what: string) {
  if (!isHead(actor.role)) throw new ComplaintError(`Only HO can ${what}.`, 403);
}

export function requireStatus(complaint: { status: ComplaintStatus }, allowed: ComplaintStatus[], what: string) {
  if (!allowed.includes(complaint.status))
    throw new ComplaintError(`The complaint is not at a stage where you can ${what}.`, 409);
}

export async function uploadAll(
  actor: ComplaintActor,
  files: { file: ComplaintUpload; media: MediaKind }[],
) {
  const uploaded: { key: string; file: ComplaintUpload; media: MediaKind }[] = [];
  try {
    for (const { file, media } of files)
      uploaded.push({ key: await uploadComplaintFile(file.buffer, actor.vendorId, file.mimetype), file, media });
  } catch (error) {
    await deleteWasabiObjects(uploaded.map((u) => u.key));
    throw error;
  }
  return uploaded;
}

export function attachmentRows(
  actor: ComplaintActor,
  complaint: LoadedComplaint,
  uploaded: { key: string; file: ComplaintUpload; media: MediaKind }[],
  extra: Pick<
    Prisma.ComplaintAttachmentCreateManyInput,
    "category" | "visit_id" | "inspection_report_id" | "execution_id" | "decision_id"
  >,
): Prisma.ComplaintAttachmentCreateManyInput[] {
  return uploaded.map(({ key, file, media }) => ({
    vendor_id: actor.vendorId,
    complaint_id: complaint.id,
    cycle_id: complaint.current_cycle_id,
    storage_key: key,
    original_name: file.originalname.slice(0, 255),
    mime_type: file.mimetype,
    size_bytes: file.size,
    media_type: media,
    actor_type: "STAFF",
    actor_user_id: actor.actorId,
    ...extra,
  }));
}

export function dateOnly(value: unknown, label: string, opts: { required?: boolean; notFuture?: boolean } = {}) {
  if (value === undefined || value === null || value === "") {
    if (opts.required) throw new ComplaintError(`${label} is required.`);
    return null;
  }
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    throw new ComplaintError(`${label} must be a date (YYYY-MM-DD).`);
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) throw new ComplaintError(`${label} is not a valid date.`);
  if (opts.notFuture && date.getTime() > Date.now()) throw new ComplaintError(`${label} cannot be in the future.`);
  return date;
}

export function futureDateTime(value: unknown, label: string) {
  if (typeof value !== "string" || !value) throw new ComplaintError(`${label} is required.`);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new ComplaintError(`${label} is not a valid date and time.`);
  if (date.getTime() < Date.now() - 5 * 60 * 1000) throw new ComplaintError(`${label} must be in the future.`);
  return date;
}

export function money(value: unknown, label: string, opts: { allowZero?: boolean } = {}) {
  const amount = Number(value);
  if (
    !Number.isFinite(amount) ||
    amount < 0 ||
    (!opts.allowZero && amount === 0) ||
    amount > 100_000_000 ||
    Math.abs(amount * 100 - Math.round(amount * 100)) > 1e-6
  )
    throw new ComplaintError(`${label} must be a valid amount.`);
  return Math.round(amount * 100) / 100;
}
