import { Request, Response } from "express";
import { createProjectService } from "../../../src/services/trackTraceServices/track-trace-project.service";
import logger from "../../utils/logger";

/* ── Patterns that map to 422 Unprocessable Entity ──
   Covers both our custom messages AND any Zod internal
   messages that might slip through in edge cases.       */
const VALIDATION_PATTERNS = [
  "is required",
  "is missing",
  "must be",
  "must not exceed",
  "is empty",
  "no data rows",
  "column(s) missing",
  "column(s) with no header",
  "unrecognized column",
  "cut list download template",
  "invalid or expired vendor token",
  "no admin user found",
  "at least one item",
  "is duplicated",
  "unique code",
  "missing or invalid",
  // Zod internal messages — treated as validation errors, not 500s
  "invalid input",
  "expected string",
  "expected number",
  "required",
  // Alphabet-in-numeric-field errors
  "alphabets are not allowed",
  // Unique code DB existence
  "already exists in the system",
  // Unique code min length
  "must be at least",
];

function isValidationError(message: string): boolean {
  const lower = message.toLowerCase();
  return VALIDATION_PATTERNS.some((p) => lower.includes(p.toLowerCase()));
}

export const createProjectController = async (req: Request, res: Response) => {
  try {
    const { vendorToken, projectName, vendorId } = req.body;

    /* ── Required field guards ── */
    if (!vendorToken || !projectName || !vendorId) {
      return res.status(400).json({
        success: false,
        message: "vendorToken, vendorId and projectName are required.",
      });
    }

    if (typeof projectName === "string" && projectName.trim().length === 0) {
      return res.status(422).json({
        success: false,
        message: "projectName must not be empty.",
      });
    }

    if (typeof projectName === "string" && projectName.length > 255) {
      return res.status(422).json({
        success: false,
        message: "projectName must not exceed 255 characters.",
      });
    }

    /* ── File guard ── */
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Excel file is required.",
      });
    }

    /* ── MIME type guard ── */
    const allowedMimeTypes = [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
    ];

    if (!allowedMimeTypes.includes(req.file.mimetype)) {
      return res.status(422).json({
        success: false,
        message:
          "Invalid file type. Only Excel files (.xlsx, .xls) are accepted.",
      });
    }

    const result = await createProjectService(
      vendorToken,
      projectName,
      Number(vendorId),
      req.file,
    );

    return res.status(201).json({
      ...result,
      message: "Project created successfully.",
    });
  } catch (error: any) {
    logger.error("createProjectController error", { error: error.message });

    return res.status(isValidationError(error.message) ? 422 : 500).json({
      success: false,
      message: error.message,
    });
  }
};