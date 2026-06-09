import { Request, Response } from "express";
import { createProjectService,searchTrackTraceLeadsService,getTrackTraceVendorConfigService } from "../../../src/services/trackTraceServices/track-trace-project.service";
import logger from "../../utils/logger";


export const createProjectController = async (req: Request, res: Response) => {
  try {
    const { projectName, vendorId, lead_id } = req.body;

    if (!projectName || !vendorId) {
      return res.status(400).json({
        success: false,
        message: "vendorId and projectName are required",
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Excel file is required",
      });
    }

    const parsedLeadId =
      lead_id !== undefined && lead_id !== null && lead_id !== ""
        ? Number(lead_id)
        : null;

    const result = await createProjectService(
      projectName,
      Number(vendorId),
      parsedLeadId,
      req.file
    );

    return res.status(201).json({
      ...result,
      message: result.message || "Project created successfully",
    });
  } catch (error: any) {
    logger.error("createProjectController error", {
      error: error.message,
    });

    const isValidationError =
      error.message.includes("missing") ||
      error.message.includes("blank") ||
      error.message.includes("required") ||
      error.message.includes("must be") ||
      error.message.includes("Excel file is empty") ||
      error.message.includes("Duplicate barcodes") ||
      error.message.includes("Invalid lead_id") ||
      error.message.includes("Vendor not found") ||
      error.message.includes("Vendor token not found");

    return res.status(isValidationError ? 422 : 500).json({
      success: false,
      message: error.message,
    });
  }
};


export const searchTrackTraceLeadsController = async (
  req: Request,
  res: Response
) => {
  try {
    const vendorId = Number(req.params.vendor_id);
    const search = String(req.query.search || "");

    if (!vendorId || Number.isNaN(vendorId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid vendor_id",
      });
    }

    const result = await searchTrackTraceLeadsService(vendorId, search);

    return res.status(result.success ? 200 : 400).json(result);
  } catch (error: any) {
    logger.error("searchTrackTraceLeadsController error", {
      error: error.message,
    });

    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch leads",
      data: [],
    });
  }
};

export const getTrackTraceVendorConfigController = async (
  req: Request,
  res: Response
) => {
  try {
    const vendorId = Number(req.params.vendor_id);

    if (!vendorId || Number.isNaN(vendorId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid vendor_id",
      });
    }

    const result = await getTrackTraceVendorConfigService(vendorId);

    return res.status(result.success ? 200 : 400).json(result);
  } catch (error: any) {
    logger.error("getTrackTraceVendorConfigController error", {
      error: error.message,
    });

    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch vendor config",
      data: null,
    });
  }
};