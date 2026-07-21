// ─── Enums ────────────────────────────────────────────────────────────────────

export type BroadcastType = "CIRCULAR" | "DOCUMENT";

export type BroadcastStatus = "ACTIVE" | "INACTIVE";

export type AudienceType = "ALL" | "ROLE" | "USER" | "FRANCHISE";

export type AttachmentType = "FILE" | "YOUTUBE";

// ─── Payload Types ─────────────────────────────────────────────────────────────

export interface BroadcastAudiencePayload {
  audienceType: AudienceType;
  targetId?: number | null;
}

export interface BroadcastAttachmentPayload {
  attachmentType: AttachmentType;
  title: string;
  fileUrl?: string; // required for YOUTUBE; for FILE, resolved after upload
}

export interface CreateBroadcastPayload {
  title: string;
  content: string;
  type: BroadcastType;
  status: BroadcastStatus;
  publishAt?: string | null;
  vendorId?: number | null;
  audiences: BroadcastAudiencePayload[];
  attachments?: BroadcastAttachmentPayload[];
}
