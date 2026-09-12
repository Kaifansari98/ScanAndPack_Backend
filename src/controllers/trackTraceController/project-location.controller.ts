import { Request, Response } from "express";
import logger from "../../utils/logger";
import {
  getProjectLocationsService,
  importProjectLocationsExcelService,
  saveProjectLocationsService,
} from "../../services/trackTraceServices/project-location.service";

const getUniqueProjectId = (req: Request) => {
  const value = req.params.unique_project_id;
  return Array.isArray(value) ? value[0] : value;
};

const getVendorId = (req: Request) =>
  Number(req.body?.vendorId ?? req.query.vendorId ?? req.query.vendor_id);

const validateRequestContext = (req: Request) => {
  const uniqueProjectId = getUniqueProjectId(req);
  const vendorId = getVendorId(req);

  if (!uniqueProjectId) {
    throw new Error("unique_project_id is required");
  }

  if (!vendorId || Number.isNaN(vendorId)) {
    throw new Error("Valid vendorId is required");
  }

  return { uniqueProjectId, vendorId };
};

const sendValidationError = (res: Response, error: unknown) => {
  const message =
    error instanceof Error ? error.message : "Invalid project location data";

  return res.status(400).json({
    success: false,
    message,
    data: null,
  });
};

export const getProjectLocationsController = async (
  req: Request,
  res: Response
) => {
  try {
    const { uniqueProjectId, vendorId } = validateRequestContext(req);
    const result = await getProjectLocationsService(uniqueProjectId, vendorId);

    return res.status(200).json(result);
  } catch (error) {
    logger.error("getProjectLocationsController error", { error });
    return sendValidationError(res, error);
  }
};

export const saveProjectLocationsController = async (
  req: Request,
  res: Response
) => {
  try {
    const { uniqueProjectId, vendorId } = validateRequestContext(req);
    const result = await saveProjectLocationsService({
      uniqueProjectId,
      vendorId,
      locations: req.body?.locations,
    });

    return res.status(200).json(result);
  } catch (error) {
    logger.error("saveProjectLocationsController error", { error });
    return sendValidationError(res, error);
  }
};

export const importProjectLocationsExcelController = async (
  req: Request,
  res: Response
) => {
  try {
    const { uniqueProjectId, vendorId } = validateRequestContext(req);

    if (!req.file?.buffer) {
      return res.status(400).json({
        success: false,
        message: "Location Excel file is required",
        data: null,
      });
    }

    const result = await importProjectLocationsExcelService({
      uniqueProjectId,
      vendorId,
      fileBuffer: req.file.buffer,
    });

    return res.status(200).json(result);
  } catch (error) {
    logger.error("importProjectLocationsExcelController error", { error });
    return sendValidationError(res, error);
  }
};
