import { Request, Response } from "express";
import { ApiResponse } from "../../utils/apiResponse";
import {
  downloadStockSheetService,
  uploadStockSheetService,
  getProductStockHistoryService,
  getStockUploadBatchesService,
} from "../../services/inventoryService/stock.service";
import multer from "multer";

// multer — memory storage, accept any file (validate in handler)
// Note: do NOT filter by mimetype here — browsers send inconsistent
// mimetypes for xlsx (application/octet-stream, application/zip, etc.)
export const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 10 * 1024 * 1024 },  // 10 MB
});

const getVid = (req: Request) => { const id = Number(req.params.vendor_id ?? req.query.vendor_id); return isNaN(id) || id <= 0 ? null : id; };
const getUid = (req: Request) => { const id = Number((req as any).user?.id ?? req.body?.user_id); return isNaN(id) || id <= 0 ? null : id; };

// GET /inventory/stock/:vendor_id/download
export const downloadStockSheet = async (req: Request, res: Response) => {
  const vendor_id = getVid(req);
  if (!vendor_id) return res.status(400).json(ApiResponse.error("Invalid vendor_id", 400));

  const filters = {
    search:      req.query.search      ? String(req.query.search)      : undefined,
    category_id: req.query.category_id ? Number(req.query.category_id) : undefined,
    brand_id:    req.query.brand_id    ? Number(req.query.brand_id)    : undefined,
    active:      req.query.active      ? String(req.query.active)      : undefined,
    procurement: req.query.procurement ? String(req.query.procurement) : undefined,
  };

  const result = await downloadStockSheetService(vendor_id, filters);
  if (!result.status) return res.status(500).json(ApiResponse.error(result.message, 500));

  const { buffer, count } = result.data;
  const filename = `stock_${vendor_id}_${new Date().toISOString().split("T")[0]}.xlsx`;

  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.setHeader("X-Product-Count", count);
  return res.send(buffer);
};

// POST /inventory/stock/:vendor_id/upload   (multipart/form-data, field: "file")
export const uploadStockSheet = async (req: Request, res: Response) => {
  const vendor_id = getVid(req);
  const user_id   = getUid(req);
  if (!vendor_id) return res.status(400).json(ApiResponse.error("Invalid vendor_id", 400));
  if (!user_id)   return res.status(400).json(ApiResponse.error("Invalid or missing user_id", 400));
  if (!req.file) return res.status(400).json(ApiResponse.error("No file uploaded. Send the .xlsx as multipart/form-data field named 'file'", 400));
  if (!req.file.originalname.toLowerCase().endsWith(".xlsx"))
    return res.status(400).json(ApiResponse.error("Only .xlsx files are supported", 400));

  const result = await uploadStockSheetService(vendor_id, user_id, req.file.buffer);
  return res.status(result.status ? 200 : 400).json(
    result.status
      ? ApiResponse.success(result.data, result.message, 200)
      : ApiResponse.error(result.message, 400)
  );
};

// GET /inventory/stock/:vendor_id/history/:product_id
export const getProductStockHistory = async (req: Request, res: Response) => {
  const vendor_id  = getVid(req);
  const product_id = Number(req.params.product_id);
  const page       = Math.max(1, Number(req.query.page) || 1);
  if (!vendor_id || isNaN(product_id)) return res.status(400).json(ApiResponse.error("Invalid params", 400));

  const result = await getProductStockHistoryService(vendor_id, product_id, page);
  return res.status(200).json(ApiResponse.success(result.data, result.message, 200));
};

// GET /inventory/stock/:vendor_id/batches
export const getStockUploadBatches = async (req: Request, res: Response) => {
  const vendor_id = getVid(req);
  const page      = Math.max(1, Number(req.query.page) || 1);
  if (!vendor_id) return res.status(400).json(ApiResponse.error("Invalid vendor_id", 400));

  const result = await getStockUploadBatchesService(vendor_id, page);
  return res.status(200).json(ApiResponse.success(result.data, result.message, 200));
};