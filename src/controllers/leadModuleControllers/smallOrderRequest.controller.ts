import { Request, Response } from "express";
import logger from "../../utils/logger";
import { ApiResponse } from "../../utils/apiResponse";
import {
  createSmallOrderRequest,
  CreateSmallOrderRequestInput,
  getSmallOrderRequestsByLead,
  markSmallOrderRequestResolved,
  reuploadSmallOrderRequestDocument,
  SmallOrderDocumentError,
} from "../../services/leadModuleServices/smallOrderRequest.service";

const getSingleValue = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

export const createSmallOrderRequestController = async (
  req: Request,
  res: Response,
) => {
  try {
    const leadId = Number(getSingleValue(req.body.lead_id));
    const vendorId = Number(getSingleValue(req.body.vendor_id));
    const createdBy = Number(getSingleValue(req.body.created_by));
    const requestSource = getSingleValue(req.body.request_source);
    const requestTypeId = Number(getSingleValue(req.body.request_type_id));
    const requiredDate = getSingleValue(req.body.required_date);
    const remarks = getSingleValue(req.body.remarks);
    const documents = (req.files as Express.Multer.File[]) ?? [];

    if (requestSource !== "post_dispatch" && requestSource !== "final_handover") {
      return res
        .status(400)
        .json(ApiResponse.error("request_source is invalid", 400));
    }

    const payload: CreateSmallOrderRequestInput = {
      lead_id: leadId,
      vendor_id: vendorId,
      created_by: createdBy,
      request_source: requestSource,
      request_type_id: requestTypeId,
      required_date: requiredDate ?? "",
      remarks: remarks ?? null,
      documents,
    };

    const result = await createSmallOrderRequest(payload);

    return res
      .status(201)
      .json(
        ApiResponse.success(
          result,
          "Small order request created successfully",
          201,
        ),
      );
  } catch (error: any) {
    logger.error("[SmallOrderRequestController] create:", error);
    const message =
      error.message || "Failed to create small order request";
    const statusCode =
      message.startsWith("Validation failed") ||
      message.includes("not found") ||
      message.includes("not allowed") ||
      message.includes("missing") ||
      message.includes("No approval recipients") ||
      message.includes("Required Date")
        ? 400
        : 500;
    return res
      .status(statusCode)
      .json(ApiResponse.error(message, statusCode));
  }
};

export const getSmallOrderRequestsByLeadController = async (
  req: Request,
  res: Response,
) => {
  try {
    const leadId = Number(req.params.leadId);
    const vendorId = Number(req.params.vendorId);

    if (!leadId || Number.isNaN(leadId)) {
      return res
        .status(400)
        .json(ApiResponse.error("Invalid lead ID provided", 400));
    }

    if (!vendorId || Number.isNaN(vendorId)) {
      return res
        .status(400)
        .json(ApiResponse.error("Invalid vendor ID provided", 400));
    }

    const result = await getSmallOrderRequestsByLead(vendorId, leadId);

    return res
      .status(200)
      .json(
        ApiResponse.success(
          result,
          "Small order requests fetched successfully",
          200,
        ),
      );
  } catch (error: any) {
    logger.error("[SmallOrderRequestController] listByLead:", error);
    const message = error?.message || "Failed to fetch small order requests";

    return res.status(500).json(ApiResponse.error(message, 500));
  }
};

export const markSmallOrderRequestResolvedController = async (
  req: Request,
  res: Response,
) => {
  try {
    const requestId = Number(req.params.requestId);
    const vendorId = Number(req.params.vendorId);
    const updatedBy = Number(req.body.updated_by);

    if (!requestId || Number.isNaN(requestId)) {
      return res
        .status(400)
        .json(ApiResponse.error("Invalid request ID provided", 400));
    }

    if (!vendorId || Number.isNaN(vendorId)) {
      return res
        .status(400)
        .json(ApiResponse.error("Invalid vendor ID provided", 400));
    }

    if (!updatedBy || Number.isNaN(updatedBy)) {
      return res
        .status(400)
        .json(ApiResponse.error("Invalid updated_by provided", 400));
    }

    const result = await markSmallOrderRequestResolved(
      vendorId,
      requestId,
      updatedBy,
    );

    return res
      .status(200)
      .json(
        ApiResponse.success(
          result,
          "Small order request marked as resolved successfully",
          200,
        ),
      );
  } catch (error: any) {
    logger.error("[SmallOrderRequestController] markResolved:", error);
    const message =
      error?.message || "Failed to mark small order request as resolved";
    const statusCode = message.includes("not found") ? 404 : 500;

    return res.status(statusCode).json(ApiResponse.error(message, statusCode));
  }
};

/** Super-admin only: replace an approved document of a small order lead. */
export const reuploadSmallOrderRequestDocumentController = async (req: Request, res: Response) => {
  const file = req.file;
  try {
    const user = (req as any).user;
    const vendorId = Number(req.params.vendorId);
    const leadId = Number(req.params.leadId);
    const requestDocumentId = Number(req.params.documentId);
    const userType = String(user?.user_type ?? "").trim().toLowerCase().replace(/[_\s]+/g, "-");

    if (!Number.isSafeInteger(vendorId) || Number(user?.vendor_id) !== vendorId)
      return res.status(403).json(ApiResponse.error("Vendor access denied.", 403));
    if (userType !== "super-admin")
      return res.status(403).json(ApiResponse.error("Only a super admin can re-upload documents.", 403));
    if (!Number.isSafeInteger(leadId) || leadId <= 0 || !Number.isSafeInteger(requestDocumentId) || requestDocumentId <= 0)
      return res.status(400).json(ApiResponse.error("Invalid lead or document.", 400));
    if (!file) return res.status(400).json(ApiResponse.error("Choose a file to upload.", 400));

    const result = await reuploadSmallOrderRequestDocument({
      vendorId,
      leadId,
      requestDocumentId,
      userId: Number(user.id),
      file,
    });
    return res.status(200).json(ApiResponse.success(result, "Document re-uploaded", 200));
  } catch (error: any) {
    if (error instanceof SmallOrderDocumentError)
      return res.status(error.statusCode).json(ApiResponse.error(error.message, error.statusCode));
    logger.error("[small-order] re-upload document", error);
    return res.status(500).json(ApiResponse.error("Couldn't re-upload the document.", 500));
  }
};
