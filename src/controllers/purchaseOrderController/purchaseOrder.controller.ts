import { Request, Response } from "express";
import { ApiResponse } from "../../utils/apiResponse";
import {
  getPIForConversionService,
  convertPIToPOService,
  listPurchaseOrdersService,
  getPurchaseOrderByIdService,
} from "../../services/purchaseOrderService/purchaseOrder.service";

const getVendorId = (req: Request) => { const id = Number(req.params.vendor_id ?? req.query.vendor_id); return isNaN(id) || id <= 0 ? null : id; };
const getUserId   = (req: Request) => { const id = Number((req as any).user?.id ?? req.body?.user_id); return isNaN(id) || id <= 0 ? null : id; };

// GET /purchase-orders/:vendor_id/pi/:pi_id/prefill
export const getPIForConversion = async (req: Request, res: Response) => {
  const vendor_id = getVendorId(req);
  const pi_id     = Number(req.params.pi_id);
  if (!vendor_id || isNaN(pi_id)) return res.status(400).json(ApiResponse.error("Invalid params", 400));
  const result = await getPIForConversionService(vendor_id, pi_id);
  return res.status(result.status ? 200 : 404).json(
    result.status ? ApiResponse.success(result.data, result.message, 200) : ApiResponse.error(result.message, 404)
  );
};

// POST /purchase-orders/:vendor_id/convert
export const convertPIToPO = async (req: Request, res: Response) => {
  const vendor_id = getVendorId(req);
  const user_id   = getUserId(req);
  if (!vendor_id) return res.status(400).json(ApiResponse.error("Invalid vendor_id", 400));
  if (!user_id)   return res.status(400).json(ApiResponse.error("Invalid user_id", 400));

  const { purchase_intent_id, expected_delivery_date, remarks, selections } = req.body;
  if (!purchase_intent_id) return res.status(400).json(ApiResponse.error("purchase_intent_id required", 400));
  if (!selections?.length) return res.status(400).json(ApiResponse.error("At least one selection required", 400));

  const result = await convertPIToPOService({ vendor_id, user_id, purchase_intent_id, expected_delivery_date, remarks, selections });
  return res.status(result.status ? 201 : 400).json(
    result.status ? ApiResponse.success(result.data, result.message, 201) : ApiResponse.error(result.message, 400)
  );
};

// GET /purchase-orders/:vendor_id
export const listPurchaseOrders = async (req: Request, res: Response) => {
  const vendor_id = getVendorId(req);
  if (!vendor_id) return res.status(400).json(ApiResponse.error("Invalid vendor_id", 400));
  const page   = Math.max(1, Number(req.query.page) || 1);
  const status = req.query.status ? String(req.query.status) : undefined;
  const search = req.query.search ? String(req.query.search) : undefined;
  const result = await listPurchaseOrdersService(vendor_id, page, status, search);
  return res.status(200).json(ApiResponse.success(result.data, result.message, 200));
};

// GET /purchase-orders/:vendor_id/:id
export const getPurchaseOrderById = async (req: Request, res: Response) => {
  const vendor_id = getVendorId(req);
  const id        = Number(req.params.id);
  if (!vendor_id || isNaN(id)) return res.status(400).json(ApiResponse.error("Invalid params", 400));
  const result = await getPurchaseOrderByIdService(id, vendor_id);
  return res.status(result.status ? 200 : 404).json(
    result.status ? ApiResponse.success(result.data, result.message, 200) : ApiResponse.error(result.message, 404)
  );
};

import {
  updatePOItemService, deletePOItemService,
  updatePOStatusService, cancelPOService,
} from "../../services/purchaseOrderService/purchaseOrder.service";

// PATCH /purchase-orders/:vendor_id/:id/items/:item_id
export const updatePOItem = async (req: Request, res: Response) => {
  const vendor_id = getVendorId(req);
  const po_id     = Number(req.params.id);
  const item_id   = Number(req.params.item_id);
  if (!vendor_id || isNaN(po_id) || isNaN(item_id))
    return res.status(400).json(ApiResponse.error("Invalid params", 400));
  const result = await updatePOItemService(po_id, item_id, vendor_id, req.body);
  return res.status(result.status ? 200 : 400).json(
    result.status ? ApiResponse.success(result.data, result.message, 200) : ApiResponse.error(result.message, 400)
  );
};

// DELETE /purchase-orders/:vendor_id/:id/items/:item_id
export const deletePOItem = async (req: Request, res: Response) => {
  const vendor_id = getVendorId(req);
  const po_id     = Number(req.params.id);
  const item_id   = Number(req.params.item_id);
  if (!vendor_id || isNaN(po_id) || isNaN(item_id))
    return res.status(400).json(ApiResponse.error("Invalid params", 400));
  const result = await deletePOItemService(po_id, item_id, vendor_id);
  return res.status(result.status ? 200 : 400).json(
    result.status ? ApiResponse.success(null, result.message, 200) : ApiResponse.error(result.message, 400)
  );
};

// PATCH /purchase-orders/:vendor_id/:id/status
export const updatePOStatus = async (req: Request, res: Response) => {
  const vendor_id = getVendorId(req);
  const user_id   = getUserId(req);
  const id        = Number(req.params.id);

  if (!vendor_id) return res.status(400).json(ApiResponse.error("Invalid vendor_id", 400));
  if (!user_id)   return res.status(400).json(ApiResponse.error("Invalid or missing user_id", 400));
  if (isNaN(id))  return res.status(400).json(ApiResponse.error("Invalid id", 400));

  const { status, remarks } = req.body;
  if (!status) return res.status(400).json(ApiResponse.error("status is required", 400));

  const validStatuses = ["Draft", "Approved", "Cancelled"];  // PartiallyReceived/Received are GRN-driven only
  if (!validStatuses.includes(status))
    return res.status(400).json(ApiResponse.error(`Cannot manually set status to ${status}. Valid manual statuses: ${validStatuses.join(", ")}. PartiallyReceived and Received are automatically set by GRN confirmation.`, 400));

  const result = await updatePOStatusService(id, vendor_id, user_id, status, remarks);
  return res.status(result.status ? 200 : 400).json(
    result.status ? ApiResponse.success(result.data, result.message, 200) : ApiResponse.error(result.message, 400)
  );
};

// PATCH /purchase-orders/:vendor_id/:id/cancel
export const cancelPO = async (req: Request, res: Response) => {
  const vendor_id = getVendorId(req);
  const user_id   = getUserId(req);
  const id        = Number(req.params.id);

  if (!vendor_id) return res.status(400).json(ApiResponse.error("Invalid vendor_id", 400));
  if (!user_id)   return res.status(400).json(ApiResponse.error("Invalid or missing user_id", 400));
  if (isNaN(id))  return res.status(400).json(ApiResponse.error("Invalid id", 400));

  const { remarks } = req.body;
  const result = await cancelPOService(id, vendor_id, user_id, remarks);
  return res.status(result.status ? 200 : 400).json(
    result.status ? ApiResponse.success(null, result.message, 200) : ApiResponse.error(result.message, 400)
  );
};