import { Request, Response } from "express";
import logger from "../../utils/logger";
import { ApiResponse } from "../../utils/apiResponse";
import {
  createSmallOrderRequest,
  CreateSmallOrderRequestInput,
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
