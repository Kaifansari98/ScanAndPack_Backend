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

  const result = await listProducts(vendor_id, search, page, pageSize);

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