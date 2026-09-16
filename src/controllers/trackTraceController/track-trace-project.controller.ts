import { Request, Response } from "express";
import {
  createProjectService,
  searchTrackTraceLeadsService,
  getTrackTraceVendorConfigService,
  getTrackTraceProjectService,
  updateTrackTraceProjectService,
}
  from "../../../src/services/trackTraceServices/track-trace-project.service";
import logger from "../../utils/logger";
import { PackingType } from "../../../generated/prisma_client/enums";


const parseBoxInfoFields = (
  value: any
) => {
  if (!value) {
    return [];
  }

  if (
    Array.isArray(
      value
    )
  ) {
    return value;
  }

  try {
    const parsed =
      JSON.parse(
        value
      );

    return Array.isArray(
      parsed
    )
      ? parsed
      : [];
  } catch {
    return [];
  }
};

export const createProjectController = async (
  req: Request,
  res: Response
) => {
  try {
    const {
      projectName,
      vendorId,
      lead_id,
      order_no,
      client_name,
      client_address,
      client_contact_no,
      packing_type,
      no_of_boxes,
      box_info_fields,
      created_by,
    } = req.body;
    
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
      lead_id !== undefined &&
        lead_id !== null &&
        lead_id !== ""
        ? Number(lead_id)
        : null;

    const resolvedPackingType: PackingType =
      packing_type === PackingType.GROUPWISE
        ? PackingType.GROUPWISE
        : PackingType.DEFAULT;

    const parsedBoxInfoFields =
      parseBoxInfoFields(box_info_fields);

    const result = await createProjectService({
      projectName,

      vendorId: Number(vendorId),

      leadId: parsedLeadId,

      order_no,

      client_name,

      client_address,

      client_contact_no,

      packing_type: resolvedPackingType,

      no_of_boxes,

      box_info_fields: parsedBoxInfoFields,

      created_by: created_by
        ? Number(created_by)
        : undefined,

      file: req.file,
    });

    return res.status(201).json({
      ...result,
      message:
        result.message ||
        "Project created successfully",
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
      error.message.includes("Vendor token not found") ||
      error.message.includes("Duplicate box field") ||
      error.message.includes("No of boxes") ||
      error.message.includes("boxes cannot") ||
      error.message.includes("empty boxes");

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

export const getTrackTraceProjectController = async (
  req: Request,
  res: Response
) => {
  try {
    const uniqueProjectIdParam =
      req.params.unique_project_id;

    const unique_project_id =
      Array.isArray(
        uniqueProjectIdParam
      )
        ? uniqueProjectIdParam[0]
        : uniqueProjectIdParam;

    if (!unique_project_id) {
      return res
        .status(400)
        .json({
          success: false,

          message:
            "unique_project_id is required",

          data: null,
        });
    }

    const result =
      await getTrackTraceProjectService(
        unique_project_id
      );

    return res
      .status(
        result.success
          ? 200
          : 404
      )
      .json(
        result
      );
  } catch (
  error: any
  ) {
    logger.error(
      "getTrackTraceProjectController error",
      {
        error:
          error.message,
      }
    );

    return res
      .status(500)
      .json({
        success: false,

        message:
          error.message ||
          "Failed to fetch project",

        data: null,
      });
  }
};

export const updateTrackTraceProjectController = async (
  req: Request,
  res: Response
) => {
  try {
    const uniqueProjectIdParam =
      req.params.unique_project_id;

    const unique_project_id =
      Array.isArray(uniqueProjectIdParam)
        ? uniqueProjectIdParam[0]
        : uniqueProjectIdParam;

    if (!unique_project_id) {
      return res.status(400).json({
        success: false,
        message: "unique_project_id is required",
        data: null,
      });
    }

    const parsedBoxInfoFields =
      req.body.box_info_fields !== undefined
        ? parseBoxInfoFields(req.body.box_info_fields)
        : undefined;

    const parsedRemoveBoxIds =
      req.body.remove_box_ids !== undefined
        ? parseRemoveBoxIds(req.body.remove_box_ids)
        : undefined;

    const result =
      await updateTrackTraceProjectService(
        unique_project_id,
        {
          ...req.body,

          box_info_fields:
            parsedBoxInfoFields,

          remove_box_ids:
            parsedRemoveBoxIds,

          file:
            req.file,
        }
      );

    return res
      .status(result.success ? 200 : 400)
      .json(result);
  } catch (error: any) {
    logger.error(
      "updateTrackTraceProjectController error",
      {
        error: error.message,
      }
    );

    return res.status(500).json({
      success: false,
      message:
        error.message ||
        "Failed to update project",
      data: null,
    });
  }
};

const parseRemoveBoxIds = (value: any): number[] => {
  if (!value) return [];

  if (Array.isArray(value)) {
    return value
      .map((id) => Number(id))
      .filter((id) => Number.isFinite(id) && id > 0);
  }

  try {
    const parsed = JSON.parse(value);

    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((id) => Number(id))
      .filter((id) => Number.isFinite(id) && id > 0);
  } catch {
    return String(value)
      .split(",")
      .map((id) => Number(id.trim()))
      .filter((id) => Number.isFinite(id) && id > 0);
  }
};