import { Request, Response } from "express";
import { ApiResponse } from "../../utils/apiResponse";
import {
  getPOForGRNService, createGRNService, confirmGRNService,
  listGRNsService, getGRNByIdService,
  createDCNService, createRedeliveryService,
  rejectionReportService, delayReportService,
  vendorPerformanceReportService, grnSummaryService,
} from "../../services/grn/grn.service";

const vid  = (req: Request) => { const id = Number(req.params.vendor_id ?? req.query.vendor_id); return isNaN(id) || id <= 0 ? null : id; };
const uid  = (req: Request) => { const id = Number((req as any).user?.id ?? req.body?.user_id);  return isNaN(id) || id <= 0 ? null : id; };

const ok  = (res: Response, data: any, msg: string, code = 200) => res.status(code).json(ApiResponse.success(data, msg, code));
const err = (res: Response, msg: string, code = 400)            => res.status(code).json(ApiResponse.error(msg, code));

// GET /grn/:vendor_id/po/:po_id/prefill
export const getPOForGRN = async (req: Request, res: Response) => {
  const v = vid(req); const poId = Number(req.params.po_id);
  if (!v || isNaN(poId)) return err(res, "Invalid params");
  const r = await getPOForGRNService(v, poId);
  return r.status ? ok(res, r.data, r.message) : err(res, r.message, 404);
};

// POST /grn/:vendor_id
export const createGRN = async (req: Request, res: Response) => {
  const v = vid(req); const u = uid(req);
  if (!v) return err(res, "Invalid vendor_id");
  if (!u) return err(res, "Invalid user_id");
  const { purchase_order_id, company_vendor_id, received_date, items } = req.body;
  if (!purchase_order_id || !received_date || !items?.length)
    return err(res, "purchase_order_id, received_date and items are required");
  const r = await createGRNService({ vendor_id: v, user_id: u, company_vendor_id, purchase_order_id, received_date, ...req.body });
  return r.status ? ok(res, r.data, r.message, 201) : err(res, r.message);
};

// PATCH /grn/:vendor_id/:id/confirm
export const confirmGRN = async (req: Request, res: Response) => {
  const v = vid(req); const u = uid(req); const id = Number(req.params.id);
  if (!v || !u || isNaN(id)) return err(res, "Invalid params");
  const r = await confirmGRNService(id, v, u);
  return r.status ? ok(res, null, r.message) : err(res, r.message);
};

// GET /grn/:vendor_id
export const listGRNs = async (req: Request, res: Response) => {
  const v = vid(req);
  if (!v) return err(res, "Invalid vendor_id");
  const page   = Math.max(1, Number(req.query.page) || 1);
  const po_id  = req.query.po_id  ? Number(req.query.po_id)  : undefined;
  const search = req.query.search ? String(req.query.search)  : undefined;
  const status = req.query.status ? String(req.query.status)  : undefined;
  const r = await listGRNsService(v, page, po_id, search, status);
  return ok(res, r.data, r.message);
};

// GET /grn/:vendor_id/:id
export const getGRNById = async (req: Request, res: Response) => {
  const v = vid(req); const id = Number(req.params.id);
  if (!v || isNaN(id)) return err(res, "Invalid params");
  const r = await getGRNByIdService(id, v);
  return r.status ? ok(res, r.data, r.message) : err(res, r.message, 404);
};

// POST /grn/:vendor_id/dcn
export const createDCN = async (req: Request, res: Response) => {
  const v = vid(req); const u = uid(req);
  if (!v || !u) return err(res, "Invalid params");
  const { grn_id, company_vendor_id, type, amount, reason } = req.body;
  if (!grn_id || !type || !amount || !reason) return err(res, "grn_id, type, amount, reason required");
  const r = await createDCNService({ vendor_id: v, user_id: u, grn_id, company_vendor_id, type, amount, reason, remarks: req.body.remarks });
  return r.status ? ok(res, r.data, r.message, 201) : err(res, r.message);
};

// POST /grn/:vendor_id/redelivery
export const createRedelivery = async (req: Request, res: Response) => {
  const v = vid(req); const u = uid(req);
  if (!v || !u) return err(res, "Invalid params");
  const { grn_item_id, company_vendor_id, requested_qty } = req.body;
  if (!grn_item_id || !company_vendor_id || !requested_qty) return err(res, "grn_item_id, company_vendor_id, requested_qty required");
  const r = await createRedeliveryService({ vendor_id: v, user_id: u, ...req.body });
  return r.status ? ok(res, r.data, r.message, 201) : err(res, r.message);
};

// ── Reports ───────────────────────────────────────────────────────────────────

const getDateRange = (req: Request) => ({
  from: String(req.query.from ?? new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0]),
  to:   String(req.query.to   ?? new Date().toISOString().split("T")[0]),
});

export const rejectionReport        = async (req: Request, res: Response) => { const v = vid(req); if (!v) return err(res, "Invalid vendor_id"); const { from, to } = getDateRange(req); const r = await rejectionReportService(v, from, to);        ok(res, r.data, r.message); };
export const delayReport            = async (req: Request, res: Response) => { const v = vid(req); if (!v) return err(res, "Invalid vendor_id"); const { from, to } = getDateRange(req); const r = await delayReportService(v, from, to);            ok(res, r.data, r.message); };
export const vendorPerformanceReport= async (req: Request, res: Response) => { const v = vid(req); if (!v) return err(res, "Invalid vendor_id"); const { from, to } = getDateRange(req); const r = await vendorPerformanceReportService(v, from, to); ok(res, r.data, r.message); };
export const grnSummary             = async (req: Request, res: Response) => { const v = vid(req); if (!v) return err(res, "Invalid vendor_id"); const { from, to } = getDateRange(req); const r = await grnSummaryService(v, from, to);             ok(res, r.data, r.message); };