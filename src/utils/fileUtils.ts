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

/**
 * Lead code with instance suffix generate karta hai
 * - Single instance → "vloq-46"
 * - Multiple instances → "vloq-46.2" (quantity_index se)
 */
export async function resolveLeadCode(
  vendorId: number,
  leadId: number,
  instanceId?: number,
): Promise<string> {
  console.log("🔍 resolveLeadCode called →", { vendorId, leadId, instanceId });

  const lead = await prisma.leadMaster.findUnique({
    where: { id: leadId, vendor_id: vendorId },
    select: { lead_code: true },
  });

  console.log("📋 lead found →", lead);
  if (!lead) throw new Error("Lead not found");

  const baseLeadCode = lead.lead_code;

  if (!instanceId) {
    console.log("⚠️ No instanceId → returning base:", baseLeadCode);
    return baseLeadCode;
  }

  const instanceInfo = await prisma.leadProductStructureInstance.findUnique({
    where: { id: instanceId },
    select: {
      quantity_index: true,
      product_structure_id: true,
    },
  });

  console.log("🏗️ instanceInfo →", instanceInfo);

  if (!instanceInfo) {
    console.log("⚠️ instanceInfo not found → returning base:", baseLeadCode);
    return baseLeadCode;
  }


  const finalCode = `${baseLeadCode}.${instanceInfo.quantity_index}`;
  console.log("✅ Final leadCode →", finalCode);
  return finalCode;
}
