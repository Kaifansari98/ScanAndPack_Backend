import { Request, Response } from "express";
import {
  getPaymentRequisitionByIdService,
  listPaymentRequisitionsService,
  markPaymentDoneService,
  reschedulePaymentRequisitionService,
} from "../../services/inventoryService/payment-requisition.service";
import { ApiResponse } from "../../utils/apiResponse";

const toNumber = (value: any) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

/**
 * GET /api/inventory/payment-requisitions/:vendor_id
 *
 * Query params:
 * page
 * page_size
 * search
 * status
 * due = today | overdue | upcoming
 * supplier_id
 */
export const listPaymentRequisitions = async (
  req: Request,
  res: Response
) => {
  try {
    const vendorId = toNumber(req.params.vendor_id);

    if (!vendorId || vendorId <= 0) {
      return res
        .status(200)
        .json(ApiResponse.error("Invalid vendor_id", 400));
    }

    const result = await listPaymentRequisitionsService(vendorId, {
      page: req.query.page ? toNumber(req.query.page) : undefined,
      page_size: req.query.page_size
        ? toNumber(req.query.page_size)
        : undefined,

      search: req.query.search
        ? String(req.query.search).trim()
        : undefined,

      status: req.query.status
        ? String(req.query.status).trim()
        : undefined,

      due: req.query.due
        ? (String(req.query.due).trim() as
            | "today"
            | "overdue"
            | "upcoming")
        : undefined,

      supplier_id: req.query.supplier_id
        ? toNumber(req.query.supplier_id)
        : undefined,
    });

    if (result.status === 0) {
      return res
        .status(200)
        .json(ApiResponse.error(result.message, 400));
    }

    return res
      .status(200)
      .json(ApiResponse.success(result.data, result.message, 200));
  } catch (error: any) {
    console.error("listPaymentRequisitions controller error:", error);

    return res
      .status(500)
      .json(
        ApiResponse.error(
          error.message || "Failed to fetch payment requisitions",
          500
        )
      );
  }
};

/**
 * GET /api/inventory/payment-requisitions/:vendor_id/:id
 */
export const getPaymentRequisitionById = async (
  req: Request,
  res: Response
) => {
  try {
    const vendorId = toNumber(req.params.vendor_id);
    const scheduleId = toNumber(req.params.id);

    if (!vendorId || vendorId <= 0) {
      return res
        .status(200)
        .json(ApiResponse.error("Invalid vendor_id", 400));
    }

    if (!scheduleId || scheduleId <= 0) {
      return res
        .status(200)
        .json(ApiResponse.error("Invalid payment schedule id", 400));
    }

    const result = await getPaymentRequisitionByIdService(
      scheduleId,
      vendorId
    );

    if (result.status === 0) {
      return res
        .status(200)
        .json(ApiResponse.error(result.message, 404));
    }

    return res
      .status(200)
      .json(ApiResponse.success(result.data, result.message, 200));
  } catch (error: any) {
    console.error("getPaymentRequisitionById controller error:", error);

    return res
      .status(500)
      .json(
        ApiResponse.error(
          error.message || "Failed to fetch payment requisition",
          500
        )
      );
  }
};

/**
 * PATCH /api/inventory/payment-requisitions/:vendor_id/:id/reschedule
 *
 * Body:
 * {
 *   user_id: number;
 *   due_date: string; // yyyy-mm-dd
 *   remarks?: string;
 * }
 */
export const reschedulePaymentRequisition = async (
  req: Request,
  res: Response
) => {
  try {
    const vendorId = toNumber(req.params.vendor_id);
    const scheduleId = toNumber(req.params.id);

    const userId = toNumber(req.body.user_id);
    const dueDate = req.body.due_date
      ? String(req.body.due_date).trim()
      : "";

    const remarks = req.body.remarks
      ? String(req.body.remarks).trim()
      : undefined;

    if (!vendorId || vendorId <= 0) {
      return res
        .status(200)
        .json(ApiResponse.error("Invalid vendor_id", 400));
    }

    if (!scheduleId || scheduleId <= 0) {
      return res
        .status(200)
        .json(ApiResponse.error("Invalid payment schedule id", 400));
    }

    if (!userId || userId <= 0) {
      return res
        .status(200)
        .json(ApiResponse.error("Invalid user_id", 400));
    }

    if (!dueDate) {
      return res
        .status(200)
        .json(ApiResponse.error("Due date is required", 400));
    }

    const parsedDueDate = new Date(dueDate);

    if (Number.isNaN(parsedDueDate.getTime())) {
      return res
        .status(200)
        .json(ApiResponse.error("Invalid due date", 400));
    }

    const result = await reschedulePaymentRequisitionService(
      scheduleId,
      vendorId,
      userId,
      dueDate,
      remarks
    );

    if (result.status === 0) {
      return res
        .status(200)
        .json(ApiResponse.error(result.message, 400));
    }

    return res
      .status(200)
      .json(ApiResponse.success(result.data, result.message, 200));
  } catch (error: any) {
    console.error("reschedulePaymentRequisition controller error:", error);

    return res
      .status(500)
      .json(
        ApiResponse.error(
          error.message || "Failed to reschedule payment",
          500
        )
      );
  }
};

/**
 * POST /api/inventory/payment-requisitions/:vendor_id/:id/payments
 *
 * Body:
 * {
 *   user_id: number;
 *   amount: number;
 *   payment_date: string;
 *   payment_mode: "Cash" | "BankTransfer" | "Cheque" | "UPI" | "RTGS" | "NEFT";
 *   reference_no?: string;
 *   remarks?: string;
 * }
 */
export const markPaymentDone = async (req: Request, res: Response) => {
  try {
    const vendorId = toNumber(req.params.vendor_id);
    const scheduleId = toNumber(req.params.id);

    const userId = toNumber(req.body.user_id);
    const amount = Number(req.body.amount || 0);

    const paymentDate = req.body.payment_date
      ? String(req.body.payment_date).trim()
      : "";

    const paymentMode = req.body.payment_mode
      ? String(req.body.payment_mode).trim()
      : "";

    const referenceNo = req.body.reference_no
      ? String(req.body.reference_no).trim()
      : undefined;

    const remarks = req.body.remarks
      ? String(req.body.remarks).trim()
      : undefined;

    const allowedPaymentModes = [
      "Cash",
      "BankTransfer",
      "Cheque",
      "UPI",
      "RTGS",
      "NEFT",
    ];

    if (!vendorId || vendorId <= 0) {
      return res
        .status(200)
        .json(ApiResponse.error("Invalid vendor_id", 400));
    }

    if (!scheduleId || scheduleId <= 0) {
      return res
        .status(200)
        .json(ApiResponse.error("Invalid payment schedule id", 400));
    }

    if (!userId || userId <= 0) {
      return res
        .status(200)
        .json(ApiResponse.error("Invalid user_id", 400));
    }

    if (!amount || amount <= 0) {
      return res
        .status(200)
        .json(ApiResponse.error("Invalid payment amount", 400));
    }

    if (!paymentDate) {
      return res
        .status(200)
        .json(ApiResponse.error("Payment date is required", 400));
    }

    const parsedPaymentDate = new Date(paymentDate);

    if (Number.isNaN(parsedPaymentDate.getTime())) {
      return res
        .status(200)
        .json(ApiResponse.error("Invalid payment date", 400));
    }

    if (!paymentMode) {
      return res
        .status(200)
        .json(ApiResponse.error("Payment mode is required", 400));
    }

    if (!allowedPaymentModes.includes(paymentMode)) {
      return res
        .status(200)
        .json(ApiResponse.error("Invalid payment mode", 400));
    }

    const result = await markPaymentDoneService(
      scheduleId,
      vendorId,
      userId,
      {
        amount,
        payment_date: paymentDate,
        payment_mode: paymentMode as
          | "Cash"
          | "BankTransfer"
          | "Cheque"
          | "UPI"
          | "RTGS"
          | "NEFT",
        reference_no: referenceNo,
        remarks,
      }
    );

    if (result.status === 0) {
      return res
        .status(200)
        .json(ApiResponse.error(result.message, 400));
    }

    return res
      .status(200)
      .json(ApiResponse.success(result.data, result.message, 200));
  } catch (error: any) {
    console.error("markPaymentDone controller error:", error);

    return res
      .status(500)
      .json(
        ApiResponse.error(
          error.message || "Failed to mark payment done",
          500
        )
      );
  }
};