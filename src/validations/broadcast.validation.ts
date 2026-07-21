import { z } from "zod";

// ─── Audience ────────────────────────────────────────────────────────────────

const audienceSchema = z.object({
  audienceType: z.enum(["ALL", "ROLE", "USER", "FRANCHISE"], {
    message: "audienceType must be one of: ALL, ROLE, USER, FRANCHISE",
  }),
  targetId: z.number().int().positive("targetId must be a positive integer").nullable().optional(),
});

// ─── Attachment ──────────────────────────────────────────────────────────────

const attachmentSchema = z.object({
  attachmentType: z.enum(["FILE", "YOUTUBE"], {
    message: "attachmentType must be one of: FILE, YOUTUBE",
  }),
  title: z.string().min(1, "Attachment title is required"),
  fileUrl: z.string().url("fileUrl must be a valid URL").optional(),
});

// ─── Create Broadcast ────────────────────────────────────────────────────────

export const createBroadcastSchema = z.object({
  title: z.string().min(1, "title is required"),
  content: z.string().min(1, "content is required"),
  type: z.enum(["CIRCULAR", "DOCUMENT"], {
    message: "type must be one of: CIRCULAR, DOCUMENT",
  }),
  status: z.enum(["ACTIVE", "INACTIVE"], {
    message: "status must be one of: ACTIVE, INACTIVE",
  }),
  publishAt: z.string().datetime({ message: "publishAt must be a valid ISO datetime string" }).nullable().optional(),
  vendorId: z.number().int().positive("vendorId must be a positive integer").nullable().optional(),
  audiences: z.array(audienceSchema).min(1, "At least one audience entry is required"),
  attachments: z.array(attachmentSchema).optional(),
});

// ─── Update Broadcast ────────────────────────────────────────────────────────

export const updateBroadcastSchema = z.object({
  title: z.string().min(1, "title cannot be empty").optional(),
  content: z.string().min(1, "content cannot be empty").optional(),
  type: z.enum(["CIRCULAR", "DOCUMENT"], {
    message: "type must be one of: CIRCULAR, DOCUMENT",
  }).optional(),
  status: z.enum(["ACTIVE", "INACTIVE"], {
    message: "status must be one of: ACTIVE, INACTIVE",
  }).optional(),
  publishAt: z.string().datetime({ message: "publishAt must be a valid ISO datetime string" }).nullable().optional(),
  vendorId: z.number().int().positive("vendorId must be a positive integer").nullable().optional(),
  // When provided, fully replaces existing audiences
  audiences: z.array(audienceSchema).min(1, "At least one audience entry is required").optional(),
  // When provided, fully replaces existing attachments
  attachments: z.array(attachmentSchema).optional(),
});

// ─── List Broadcasts Query ────────────────────────────────────────────────────

export const listBroadcastsSchema = z.object({
  vendorId: z.coerce.number().int().positive().optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
  type: z.enum(["CIRCULAR", "DOCUMENT"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  // If 'forMe=true' the list is filtered to only broadcasts visible to current user
  forMe: z
    .preprocess((val) => {
      if (typeof val === "string") return val.toLowerCase() === "true";
      return Boolean(val);
    }, z.boolean())
    .default(false),
});

export type CreateBroadcastInput = z.infer<typeof createBroadcastSchema>;
export type UpdateBroadcastInput = z.infer<typeof updateBroadcastSchema>;
export type ListBroadcastsInput = z.infer<typeof listBroadcastsSchema>;
