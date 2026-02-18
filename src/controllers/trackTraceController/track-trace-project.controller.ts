import { Request, Response } from "express";
import { createProjectService } from "../../../src/services/trackTraceServices/track-trace-project.service";
import logger from "../../utils/logger";

export const createProjectController = async (req: Request, res: Response) => {
  try {
    const { vendorToken, projectName, vendorId } = req.body;

    /* ── Basic field guards ── */
    if (!vendorToken || !projectName || !vendorId) {
      return res.status(400).json({
        success: false,
        message: "vendorToken, vendorId and projectName are required",
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Excel file is required",
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
      message: "Project created successfully",
    });
  } catch (error: any) {
    logger.error("createProjectController error", { error: error.message });

    /* Validation errors come as a readable comma-separated string from service */
    const isValidationError =
      error.message.includes("is required") ||
      error.message.includes("is missing") ||
      error.message.includes("must be") ||
      error.message.includes("Excel file is empty");

    return res.status(isValidationError ? 422 : 500).json({
      success: false,
      message: error.message,
    });
  }
};
