import { Request, Response } from "express";
import { ApiResponse } from "../../utils/apiResponse";
import {
  createProduct,
  deleteProduct,
  getProductById,
  getProductMasters,
  listProducts,
  updateProduct,
} from "../../services/inventoryService/product.service";
import {
  generateProductTemplateService,
  processProductBulkUploadService,
} from "../../services/inventoryService/product-bulk-upload.service";
import { getNextItemCodeService } from "../../services/inventoryService/product-code.service";

const getVendorId = (req: Request) => Number(req.params.vendor_id);

export const productMasters = async (req: Request, res: Response) => {
  const vendor_id = getVendorId(req);

  const result = await getProductMasters(vendor_id);

  return res.status(result.status ? 200 : 400).json(
    result.status
      ? ApiResponse.success(result.data, result.message, 200)
      : ApiResponse.error(result.message, 400)
  );
};

export const productList = async (req: Request, res: Response) => {
  const vendor_id = getVendorId(req);
  const search = String(req.query.search || "");
  const page = Number(req.query.page || 1);
  const pageSize = Number(req.query.page_size || 20);

  const category_id = req.query.category_id ? Number(req.query.category_id) : undefined;
  const brand_id = req.query.brand_id ? Number(req.query.brand_id) : undefined;
  const active = req.query.active ? String(req.query.active) : undefined;
  const procurement = req.query.procurement ? String(req.query.procurement) : undefined;

  const result = await listProducts(vendor_id, search, page, pageSize, {
    category_id,
    brand_id,
    active,
    procurement,
  });

  return res.status(result.status ? 200 : 400).json(
    result.status
      ? ApiResponse.success(result.data, result.message, 200)
      : ApiResponse.error(result.message, 400)
  );
};

export const productDetail = async (req: Request, res: Response) => {
  const vendor_id = getVendorId(req);
  const id = Number(req.params.id);

  const result = await getProductById(vendor_id, id);

  return res.status(result.status ? 200 : 404).json(
    result.status
      ? ApiResponse.success(result.data, result.message, 200)
      : ApiResponse.error(result.message, 404)
  );
};

export const productCreate = async (req: Request, res: Response) => {
  const vendor_id = getVendorId(req);

  const result = await createProduct({
    ...req.body,
    vendor_id,
  });

  return res.status(result.status ? 201 : 400).json(
    result.status
      ? ApiResponse.success(result.data, result.message, 201)
      : ApiResponse.error(result.message, 400)
  );
};

export const productUpdate = async (req: Request, res: Response) => {
  const vendor_id = getVendorId(req);
  const id = Number(req.params.id);

  const result = await updateProduct(id, {
    ...req.body,
    vendor_id,
  });

  return res.status(result.status ? 200 : 400).json(
    result.status
      ? ApiResponse.success(result.data, result.message, 200)
      : ApiResponse.error(result.message, 400)
  );
};

export const productRemove = async (req: Request, res: Response) => {
  const vendor_id = getVendorId(req);
  const id = Number(req.params.id);
  const user_id = Number(req.body.user_id || req.query.user_id || 0);

  const result = await deleteProduct(id, vendor_id, user_id);

  return res.status(result.status ? 200 : 400).json(
    result.status
      ? ApiResponse.success(result.data, result.message, 200)
      : ApiResponse.error(result.message, 400)
  );
};

export const downloadProductsTemplate = async (req: Request, res: Response) => {
  try {
    const buffer = await generateProductTemplateService();
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="product_bulk_template.xlsx"'
    );
    return res.status(200).send(buffer);
  } catch (error: any) {
    console.error("downloadProductsTemplate error:", error);
    return res.status(500).json(ApiResponse.error("Failed to generate template", 500));
  }
};

export const uploadProductsBulk = async (req: Request, res: Response) => {
  try {
    const vendor_id = getVendorId(req);
    const user_id = Number(req.body.user_id || req.query.user_id || 0);

    if (!req.file) {
      return res.status(400).json(ApiResponse.error("No file uploaded", 400));
    }

    const { response, errorFileBuffer } = await processProductBulkUploadService(
      vendor_id,
      user_id,
      req.file.buffer
    );

    let errorFileBase64: string | undefined = undefined;
    if (errorFileBuffer) {
      errorFileBase64 = errorFileBuffer.toString("base64");
    }

    const finalData = {
      ...(response.data || {}),
      errorFileBase64,
    };

    return res.status(response.status ? 200 : 400).json(
      response.status
        ? ApiResponse.success(finalData, response.message, 200)
        : ApiResponse.error(response.message, 400)
    );
  } catch (error: any) {
    console.error("uploadProductsBulk error:", error);
    return res.status(500).json(ApiResponse.error("Failed to process bulk upload", 500));
  }
};

export const getNextItemCode = async (req: Request, res: Response) => {
  try {
    const vendor_id = getVendorId(req);
    const category_id = Number(req.query.category_id);

    if (!category_id) {
      return res.status(400).json(ApiResponse.error("category_id is required", 400));
    }

    const nextCode = await getNextItemCodeService(vendor_id, category_id);

    return res.status(200).json(ApiResponse.success(nextCode, "Next item code generated successfully", 200));
  } catch (error: any) {
    console.error("getNextItemCode error:", error);
    return res.status(500).json(ApiResponse.error(error.message || "Failed to generate next item code", 500));
  }
};