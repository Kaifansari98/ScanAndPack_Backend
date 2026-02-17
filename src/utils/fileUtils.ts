import path from "path";
import { DocumentType } from "../prisma/generated";
import { Request } from "express";
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
