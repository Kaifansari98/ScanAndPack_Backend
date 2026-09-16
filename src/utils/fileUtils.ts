import path from "path";
import { DocumentType } from "../prisma/generated";
import { Request } from "express";
import { prisma } from "../../src/prisma/client";
export const getDocumentTypeFromFile = (
  file: Express.Multer.File,
): DocumentType => {
  // You can extend this logic based on file types, field names, etc.
  const extension = path.extname(file.originalname).toLowerCase();

  switch (extension) {
    case ".pdf":
      return DocumentType.site_photo; // or add more document types
    case ".jpg":
    case ".jpeg":
    case ".png":
    case ".gif":
      return DocumentType.site_photo;
    default:
      return DocumentType.site_photo;
  }
};

export const sanitizeFilename = (filename: string): string => {
  return filename.replace(/[^a-zA-Z0-9.-]/g, "_");
};

export const resolveClientBaseUrl = (req: Request): string => {
  const origin = req.headers.origin;
  if (typeof origin === "string" && origin.trim().length > 0) {
    return origin.replace(/\/$/, "");
  }

  const referer = req.headers.referer;
  if (typeof referer === "string" && referer.trim().length > 0) {
    try {
      return new URL(referer).origin;
    } catch {
      return "http://localhost:3000";
    }
  }

  return "http://localhost:3000";
};

export async function resolveLeadCode(
  vendorId: number,
  leadId: number,
  instanceId?: number,
): Promise<string> {
  const lead = await prisma.leadMaster.findFirst({
    where: {
      id: leadId,
      vendor_id: vendorId,
    },
    select: { lead_code: true },
  });

  if (!lead) throw new Error("Lead not found");

  const baseLeadCode = lead.lead_code;

  // If no instanceId → always return base
  if (!instanceId) {
    return baseLeadCode;
  }

  // Count how many instances exist for this lead
  const totalInstances = await prisma.leadProductStructureInstance.count({
    where: {
      lead_id: leadId,
      vendor_id: vendorId,
    },
  });

  // 🔑 If only one instance exists → do NOT append quantity_index
  if (totalInstances <= 1) {
    return baseLeadCode;
  }

  // Fetch instance info
  const instanceInfo = await prisma.leadProductStructureInstance.findFirst({
    where: {
      id: instanceId,
      lead_id: leadId,
      vendor_id: vendorId,
    },
    select: {
      quantity_index: true,
    },
  });

  if (!instanceInfo) {
    return baseLeadCode;
  }

  return `${baseLeadCode}.${instanceInfo.quantity_index}`;
}
