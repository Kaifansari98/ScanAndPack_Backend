import { Request, Response } from "express";
import { ApiResponse } from "../../utils/apiResponse";
import {
  getPICategories,
  getPIProducts,
  getPICompanyVendors,
  getPIPaymentTerms,
  createPurchaseIntent,
  listPurchaseIntents,
  getPurchaseIntentById,
  updatePIStatus,
  deletePurchaseIntent,
  updatePurchaseIntentService,
  getVendorStateIdService,
} from "../../services/inventoryService/purchaseIntent.service";
import { PurchaseIntentStatus } from "../../prisma/generated";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const getVendorId = (req: Request): number | null => {
  const id = Number(
    req.params.vendor_id ?? req.query.vendor_id ?? req.body.vendor_id,
  );
  return isNaN(id) || id <= 0 ? null : id;
};

const getUserId = (req: Request): number | null => {
  const id = Number(
    (req as any).user?.id ??
      (req as any).user?.user_id ??
      req.body?.user_id ??
      req.query?.user_id,
  );
  return isNaN(id) || id <= 0 ? null : id;
};

/** Parse and validate each vendor entry including pricing fields */
function parseVendors(vendors: any[]): any[] | null {
  for (const v of vendors) {
    if (
      !v.company_vendor_id ||
      !v.required_qty ||
      Number(v.required_qty) <= 0
    ) {
      return null;
    }
  }

  return vendors.map((v) => ({
    company_vendor_id: Number(v.company_vendor_id),

    payment_term_id:
      v.payment_term_id !== undefined &&
      v.payment_term_id !== null &&
      v.payment_term_id !== ""
        ? Number(v.payment_term_id)
        : null,

    required_qty: Number(v.required_qty),
    required_by_date: v.required_by_date ?? undefined,

    estimated_price:
      v.estimated_price != null ? Number(v.estimated_price) : undefined,

    remarks: v.remarks ?? undefined,

    // Pricing
    mrp: v.mrp != null ? Number(v.mrp) : null,
    discount_pct: v.discount_pct != null ? Number(v.discount_pct) : null,
    rate: v.rate != null ? Number(v.rate) : null,
    tax_pct: v.tax_pct != null ? Number(v.tax_pct) : null,
    cgst_pct: v.cgst_pct != null ? Number(v.cgst_pct) : null,
    sgst_pct: v.sgst_pct != null ? Number(v.sgst_pct) : null,
    igst_pct: v.igst_pct != null ? Number(v.igst_pct) : null,
    tax_amount: v.tax_amount != null ? Number(v.tax_amount) : null,
    amount: v.amount != null ? Number(v.amount) : null,
    total_amount: v.total_amount != null ? Number(v.total_amount) : null,
  }));
}

// ─── GET categories ───────────────────────────────────────────────────────────

export const getCategories = async (req: Request, res: Response) => {
  const vendor_id = getVendorId(req);
  if (!vendor_id)
    return res.status(400).json(ApiResponse.error("Invalid vendor_id", 400));
  const result = await getPICategories(vendor_id);
  return res
    .status(200)
    .json(ApiResponse.success(result.data, result.message, 200));
};

// ─── GET products (with HSN tax rates) ───────────────────────────────────────

export const getProducts = async (req: Request, res: Response) => {
  const vendor_id = getVendorId(req);
  //const category_id = Number(req.query.category_id);
  const search = String(req.query.search ?? "").trim();
  if (!vendor_id)
    return res.status(400).json(ApiResponse.error("Invalid vendor_id", 400));
  // if (!category_id || isNaN(category_id))
  //   return res.status(400).json(ApiResponse.error("category_id is required", 400));
  const result = await getPIProducts(vendor_id, 0, search);
  return res
    .status(200)
    .json(ApiResponse.success(result.data, result.message, 200));
};

// ─── GET company vendors ──────────────────────────────────────────────────────

export const getCompanyVendors = async (req: Request, res: Response) => {
  const vendor_id = getVendorId(req);
  const search = String(req.query.search ?? "").trim();
  if (!vendor_id)
    return res.status(400).json(ApiResponse.error("Invalid vendor_id", 400));
  const result = await getPICompanyVendors(vendor_id, search);
  return res
    .status(200)
    .json(ApiResponse.success(result.data, result.message, 200));
};

export const getPaymentTerms = async (req: Request, res: Response) => {
  console.log("getPaymentTerms");
  const vendor_id = getVendorId(req);

  console.log("vendor_id", vendor_id);
  if (!vendor_id) {
    return res.status(400).json(ApiResponse.error("Invalid vendor_id", 400));
  }

  const result = await getPIPaymentTerms(vendor_id);

  return res
    .status(result.status ? 200 : 400)
    .json(
      result.status
        ? ApiResponse.success(result.data, result.message, 200)
        : ApiResponse.error(result.message, 400),
    );
};

export const getVendorStateId = async (req: Request, res: Response) => {
  const vendor_id = getVendorId(req);
  if (!vendor_id)
    return res.status(400).json(ApiResponse.error("Invalid vendor_id", 400));
  const result = await getVendorStateIdService(vendor_id);
  return res
    .status(200)
    .json(ApiResponse.success(result.data, result.message, 200));
};

// ─── POST create ──────────────────────────────────────────────────────────────

export const create = async (req: Request, res: Response) => {
  const vendor_id = getVendorId(req);
  const user_id = getUserId(req);
  if (!vendor_id)
    return res.status(400).json(ApiResponse.error("Invalid vendor_id", 400));
  if (!user_id)
    return res
      .status(400)
      .json(ApiResponse.error("Invalid or missing user_id", 400));

  const { category_id, priority, remarks, items } = req.body;
  console.log("items?.length", items?.length);
  if (!items?.length)
    return res
      .status(400)
      .json(ApiResponse.error("Atleast one item are required", 400));

  for (const item of items) {
    if (!item.product_id)
      return res
        .status(400)
        .json(ApiResponse.error("Each item needs product_id", 400));
    const parsed = parseVendors(item.vendors ?? []);
    if (parsed === null)
      return res
        .status(400)
        .json(
          ApiResponse.error(
            "Each vendor entry needs company_vendor_id and required_qty > 0",
            400,
          ),
        );
    item.vendors = parsed;
  }

  const result = await createPurchaseIntent({
    vendor_id,
    user_id,
    category_id,
    priority,
    remarks,
    items,
  });
  return res
    .status(result.status ? 201 : 400)
    .json(
      result.status
        ? ApiResponse.success(result.data, result.message, 201)
        : ApiResponse.error(result.message, 400),
    );
};

// ─── GET list ─────────────────────────────────────────────────────────────────

export const list = async (req: Request, res: Response) => {
  const vendor_id = getVendorId(req);
  if (!vendor_id)
    return res.status(400).json(ApiResponse.error("Invalid vendor_id", 400));
  const page = Math.max(1, Number(req.query.page) || 1);
  const status = req.query.status ? String(req.query.status) : undefined;
  const search = req.query.search ? String(req.query.search) : undefined;
  const result = await listPurchaseIntents(vendor_id, page, status, search);
  return res
    .status(200)
    .json(ApiResponse.success(result.data, result.message, 200));
};

// ─── GET by id ────────────────────────────────────────────────────────────────

export const getById = async (req: Request, res: Response) => {
  const vendor_id = getVendorId(req);
  const id = Number(req.params.id);
  if (!vendor_id)
    return res.status(400).json(ApiResponse.error("Invalid vendor_id", 400));
  if (isNaN(id))
    return res.status(400).json(ApiResponse.error("Invalid id", 400));
  const result = await getPurchaseIntentById(id, vendor_id);
  return res
    .status(result.status ? 200 : 404)
    .json(
      result.status
        ? ApiResponse.success(result.data, result.message, 200)
        : ApiResponse.error(result.message, 404),
    );
};

// ─── PATCH status ─────────────────────────────────────────────────────────────

export const patchStatus = async (req: Request, res: Response) => {
  const vendor_id = getVendorId(req);
  const user_id = getUserId(req);
  const id = Number(req.params.id);
  if (!vendor_id)
    return res.status(400).json(ApiResponse.error("Invalid vendor_id", 400));
  if (!user_id)
    return res
      .status(400)
      .json(ApiResponse.error("Invalid or missing user_id", 400));
  if (isNaN(id))
    return res.status(400).json(ApiResponse.error("Invalid id", 400));

  const { status, remarks } = req.body;
  if (!status)
    return res.status(400).json(ApiResponse.error("status is required", 400));
  const valid = Object.values(PurchaseIntentStatus);
  if (!valid.includes(status))
    return res
      .status(400)
      .json(
        ApiResponse.error(`Invalid status. Valid: ${valid.join(", ")}`, 400),
      );

  const result = await updatePIStatus(id, vendor_id, user_id, status, remarks);
  return res
    .status(result.status ? 200 : 400)
    .json(
      result.status
        ? ApiResponse.success(result.data, result.message, 200)
        : ApiResponse.error(result.message, 400),
    );
};

// ─── DELETE ───────────────────────────────────────────────────────────────────

export const remove = async (req: Request, res: Response) => {
  const vendor_id = getVendorId(req);
  const user_id = getUserId(req);
  const id = Number(req.params.id);
  if (!vendor_id)
    return res.status(400).json(ApiResponse.error("Invalid vendor_id", 400));
  if (!user_id)
    return res
      .status(400)
      .json(ApiResponse.error("Invalid or missing user_id", 400));
  if (isNaN(id))
    return res.status(400).json(ApiResponse.error("Invalid id", 400));
  const result = await deletePurchaseIntent(id, vendor_id, user_id);
  return res
    .status(result.status ? 200 : 400)
    .json(
      result.status
        ? ApiResponse.success(null, result.message, 200)
        : ApiResponse.error(result.message, 400),
    );
};

// ─── PUT update ───────────────────────────────────────────────────────────────

export const update = async (req: Request, res: Response) => {
  try {
    const vendor_id = getVendorId(req);
    const user_id = getUserId(req);
    const id = Number(req.params.id);

    if (!vendor_id)
      return res.status(400).json(ApiResponse.error("Invalid vendor_id", 400));
    if (!user_id)
      return res
        .status(400)
        .json(ApiResponse.error("Invalid or missing user_id", 400));
    if (isNaN(id))
      return res.status(400).json(ApiResponse.error("Invalid id", 400));

    const { category_id, priority, remarks, items } = req.body;
    if (!items || !Array.isArray(items) || items.length === 0)
      return res
        .status(400)
        .json(ApiResponse.error("At least one item is required", 400));

    for (const item of items) {
      if (!item.product_id)
        return res
          .status(400)
          .json(ApiResponse.error("Each item must have a product_id", 400));
      if (!Array.isArray(item.vendors))
        return res
          .status(400)
          .json(ApiResponse.error("Each item must have a vendors array", 400));
      const parsed = parseVendors(item.vendors);
      if (parsed === null)
        return res
          .status(400)
          .json(
            ApiResponse.error(
              `Each vendor entry needs company_vendor_id and required_qty > 0 (product_id: ${item.product_id})`,
              400,
            ),
          );
      item.vendors = parsed;
    }

    const result = await updatePurchaseIntentService(id, vendor_id, user_id, {
      category_id,
      priority,
      remarks,
      items,
    });

    if (!result.status) {
      const code = result.message.includes("not found") ? 404 : 400;
      return res.status(code).json(ApiResponse.error(result.message, code));
    }
    return res
      .status(200)
      .json(ApiResponse.success(result.data, result.message, 200));
  } catch (err) {
    console.error("update PI error:", err);
    return res
      .status(500)
      .json(ApiResponse.error("Internal server error", 500));
  }
};
