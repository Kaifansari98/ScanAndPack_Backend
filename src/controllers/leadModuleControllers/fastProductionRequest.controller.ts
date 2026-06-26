import { Request, Response } from "express";
import logger from "../../utils/logger";
import { ApiResponse } from "../../utils/apiResponse";
import {
  actOnFastProductionRequestTask,
  finalizeFastProductionRequestBatch,
  FinalizeFastProductionBatchInput,
  saveFastProductionRequestDraft,
  SaveFastProductionDraftInput,
  limitFastProductionCreation,
  getFastProductionRequestDraft,
  revokeFastProductionRequest,
  RevokeFastProductionInput,
} from "../../services/leadModuleServices/fastProductionRequest.service";

const getSingleValue = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

const getArrayValue = (value: string | string[] | undefined) => {
  if (Array.isArray(value)) {
    return value.map((item) => item.trim()).filter(Boolean);
  }

  if (typeof value === "string" && value.trim()) {
    return [value.trim()];
  }

  return [];
};

export const createFastProductionRequestController = async (
  req: Request,
  res: Response,
) => {
  try {
    const payload: SaveFastProductionDraftInput = {
      lead_id: Number(getSingleValue(req.body.lead_id)),
      vendor_id: Number(getSingleValue(req.body.vendor_id)),
      created_by: Number(getSingleValue(req.body.created_by)),
      instance_id: Number(getSingleValue(req.body.instance_id)),
      carcass_finish_category: getArrayValue(req.body.carcass_finish_category),
      carcass_finish_description:
        getSingleValue(req.body.carcass_finish_description) ?? "",
      shutter_finish_category: getArrayValue(req.body.shutter_finish_category),
      shutter_finish_description:
        getSingleValue(req.body.shutter_finish_description) ?? "",
      handles_finish_category: getArrayValue(req.body.handles_finish_category),
      handles_finish_description:
        getSingleValue(req.body.handles_finish_description) ?? "",
      hardware_selection: getSingleValue(req.body.hardware_selection) ?? "",
      accessory_selection: getSingleValue(req.body.accessory_selection) ?? "",
      special_requirements: getSingleValue(req.body.special_requirements) ?? "",
      client_required_delivery_date:
        getSingleValue(req.body.client_required_delivery_date) ?? "",
      remarks: getSingleValue(req.body.remarks) ?? null,
      terms_version: getSingleValue(req.body.terms_version) ?? null,
      documents: (req.files as Express.Multer.File[]) ?? [],
    };

    const result = await saveFastProductionRequestDraft(payload);

    return res.status(201).json(
      ApiResponse.success(
        result,
        "Fast production draft saved successfully",
        201,
      ),
    );
  } catch (error: any) {
    logger.error("[FastProductionRequestController] create:", error);
    const message =
      error?.message || "Failed to create fast production request";
    const statusCode =
      message.startsWith("Validation failed") ||
      message.includes("not found") ||
      message.includes("already") ||
      message.includes("missing") ||
      message.includes("No active")
        ? 400
        : 500;

    return res.status(statusCode).json(ApiResponse.error(message, statusCode));
  }
};

export const finalizeFastProductionRequestBatchController = async (
  req: Request,
  res: Response,
) => {
  try {
    const payload: FinalizeFastProductionBatchInput = {
      batch_id: req.body.batch_id
        ? Number(getSingleValue(req.body.batch_id))
        : undefined,
      lead_id: Number(getSingleValue(req.body.lead_id)),
      vendor_id: Number(getSingleValue(req.body.vendor_id)),
      created_by: Number(getSingleValue(req.body.created_by)),
    };

    const result = await finalizeFastProductionRequestBatch(payload);

    return res.status(200).json(
      ApiResponse.success(
        result,
        "Fast production request submitted successfully",
        200,
      ),
    );
  } catch (error: any) {
    logger.error("[FastProductionRequestController] finalize:", error);
    const message =
      error?.message || "Failed to submit fast production request";
    const statusCode =
      message.startsWith("Validation failed") ||
      message.includes("not found") ||
      message.includes("already") ||
      message.includes("missing") ||
      message.includes("Only") ||
      message.includes("All instances")
        ? 400
        : 500;

    return res.status(statusCode).json(ApiResponse.error(message, statusCode));
  }
};

export const actOnFastProductionRequestTaskController = async (
  req: Request,
  res: Response,
) => {
  try {
    const leadId = Number(req.params.leadId);
    const taskId = Number(req.params.taskId);
    const actedBy = Number(req.body.acted_by);
    const action = getSingleValue(req.body.action);
    const remark = getSingleValue(req.body.remark) ?? null;

    const result = await actOnFastProductionRequestTask({
      lead_id: leadId,
      task_id: taskId,
      action: action as "approve" | "reject",
      acted_by: actedBy,
      remark,
    });

    return res.status(200).json(
      ApiResponse.success(
        result,
        "Fast production request updated successfully",
        200,
      ),
    );
  } catch (error: any) {
    logger.error("[FastProductionRequestController] act:", error);
    const message =
      error?.message || "Failed to update fast production request";
    const statusCode =
      message.startsWith("Validation failed") ||
      message.includes("not found") ||
      message.includes("already") ||
      message.includes("Only") ||
      message.includes("allowed") ||
      message.includes("required")
        ? 400
        : 500;

    return res.status(statusCode).json(ApiResponse.error(message, statusCode));
  }
};

export const checkFastProductionLimitController = async (
  req: Request,
  res: Response,
) => {
  try {
    const vendorId = Number(getSingleValue(req.query.vendor_id as string | string[]));
    const userId = Number(getSingleValue(req.query.user_id as string | string[]));
    const franchiseId = Number(getSingleValue(req.query.franchise_id as string | string[]));

    if (!vendorId || !userId) {
      return res.status(400).json(ApiResponse.error("vendor_id and user_id are required", 400));
    }

    await limitFastProductionCreation(vendorId, userId, franchiseId);

    return res.status(200).json(
      ApiResponse.success(
        { canCreate: true },
        "User can create fast production request",
        200,
      ),
    );
  } catch (error: any) {
    logger.error("[FastProductionRequestController] checkLimit:", error);
    const message = error?.message || "Failed to check fast production limit";
    return res.status(400).json(ApiResponse.error(message, 400));
  }
};

export const checkFastProductionStatusController = async (
  req: Request,
  res: Response,
) => {
  try {
    const leadId = Number(req.params.leadId);
    const vendorId = req.params.vendorId ? Number(req.params.vendorId) : undefined;
    const franchiseId = req.query.franchise_id ? Number(req.query.franchise_id) : undefined;

    if (!leadId) {
      return res.status(400).json(ApiResponse.error("leadId is required", 400));
    }

    const { checkFastProductionStatusForLead } = await import(
      "../../services/leadModuleServices/fastProductionRequest.service"
    );

    const isApprovedOrRejected = await checkFastProductionStatusForLead(
      leadId,
      vendorId,
      franchiseId
    );

    return res.status(200).json(
      ApiResponse.success(
        isApprovedOrRejected,
        "Fast production request status retrieved successfully",
        200,
      ),
    );
  } catch (error: any) {
    logger.error("[FastProductionRequestController] checkStatus:", error);
    const message = error?.message || "Failed to check fast production status";
    return res.status(400).json(ApiResponse.error(message, 400));
  }
};

export const revokeFastProductionRequestController = async (
  req: Request,
  res: Response,
) => {
  try {
    const payload: RevokeFastProductionInput = {
      lead_id: Number(getSingleValue(req.body.leadId)),
      vendor_id: Number(getSingleValue(req.body.vendorId)),
      revoked_by: Number(getSingleValue(req.body.userId)),
      remark: getSingleValue(req.body.remark) ?? "",
    };

    const result = await revokeFastProductionRequest(payload);

    return res.status(200).json(
      ApiResponse.success(
        result,
        "Fast production draft fetched successfully",
        200,
      ),
    );
  } catch (error: any) {
    logger.error("[FastProductionRequestController] getDraft:", error);
    return res
      .status(500)
      .json(ApiResponse.error("Failed to fetch fast production draft", 500));
  }
};
