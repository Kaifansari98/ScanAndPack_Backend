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

export const resolveDateRange = (
  date_range?: string,
  start_date?: string,
  end_date?: string
) => {
  const now = new Date();

  let startDate: Date;
  let endDate: Date;

  const setStartOfDay = (date: Date) => {
    date.setHours(0, 0, 0, 0);
    return date;
  };

  const setEndOfDay = (date: Date) => {
    date.setHours(23, 59, 59, 999);
    return date;
  };

  switch (date_range) {
    case "yesterday": {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      startDate = setStartOfDay(yesterday);
      endDate = setEndOfDay(new Date(yesterday));
      break;
    }

    case "last7days": {
      const start = new Date();
      start.setDate(start.getDate() - 7);
      startDate = setStartOfDay(start);
      endDate = setEndOfDay(new Date());
      break;
    }

    // ✅ ADDED: was missing, frontend sends "last30days"
    case "last30days": {
      const start = new Date();
      start.setDate(start.getDate() - 30);
      startDate = setStartOfDay(start);
      endDate = setEndOfDay(new Date());
      break;
    }

    case "thisMonth": {
      startDate = setStartOfDay(new Date(now.getFullYear(), now.getMonth(), 1));
      endDate = setEndOfDay(new Date());
      break;
    }

    case "lastMonth": {
      startDate = setStartOfDay(new Date(now.getFullYear(), now.getMonth() - 1, 1));
      endDate = setEndOfDay(new Date(now.getFullYear(), now.getMonth(), 0));
      break;
    }

    case "custom": {
      if (!start_date || !end_date) {
        // Fallback to today if custom dates not provided
        startDate = setStartOfDay(new Date());
        endDate = setEndOfDay(new Date());
      } else {
        startDate = setStartOfDay(new Date(start_date));
        endDate = setEndOfDay(new Date(end_date));
      }
      break;
    }

    case "today":
    default: {
      startDate = setStartOfDay(new Date());
      endDate = setEndOfDay(new Date());
      break;
    }
  }

  return { startDate, endDate };
};

export const resolvePreviousRange = (startDate: Date, endDate: Date) => {
  const duration = endDate.getTime() - startDate.getTime();

  const previousEnd = new Date(startDate);
  previousEnd.setMilliseconds(previousEnd.getMilliseconds() - 1);

  const previousStart = new Date(previousEnd.getTime() - duration);

  return { previousStart, previousEnd };
};