import { Request, Response } from 'express';
import { ApiResponse } from '../../../src/utils/apiResponse';

import * as inventoryService from '../../services/inventoryService/inventory.service';

export const syncCadbidProduct = async (req: Request, res: Response) => {
  try {
    // console.log(req.body);return;
    const vendor_id = Number(
      req.body.vendor_id ?? req.query.vendor_id
    );

    if (isNaN(vendor_id)) {
      return res
        .status(400)
        .json(ApiResponse.error("Invalid vendor_id", 400));
    }

    const result =
      await inventoryService.syncCadbidProductFromExternalService(
        vendor_id
      );

    if (result.status === 0) {
      return res
        .status(200)
        .json(ApiResponse.error(result.message, 500));
    }

    return res
      .status(200)
      .json(
        ApiResponse.success(
          result.data,
          result.message,
          200
        )
      );
  } catch (err) {
    console.error("syncProducts error:", err);

    return res
      .status(500)
      .json(
        ApiResponse.error(
          "Internal server error",
          500
        )
      );
  }
};



export const getProductMaster = async (req: Request, res: Response) => {
  try {
    const vendor_id   = Number(req.params.vendor_id);
    const page        = Math.max(1, Number(req.query.page) || 1);
    const search      = String(req.query.search ?? "").trim();
    const category_id = req.query.category_id ? Number(req.query.category_id) : undefined;
    const brand_id    = req.query.brand_id    ? Number(req.query.brand_id)    : undefined;
    const active      = req.query.active      ? String(req.query.active)      : undefined;
    const procurement = req.query.procurement ? String(req.query.procurement) : undefined;
 
    if (isNaN(vendor_id))
      return res.status(400).json(ApiResponse.error("Invalid vendor_id", 400));
 console.log("getProductMaster");
    const result = await inventoryService.getProductMasterService(vendor_id, page, search, category_id, brand_id, active, procurement);
    if (result.status === 0)
      return res.status(500).json(ApiResponse.error(result.message, 500));
 
    return res.status(200).json(ApiResponse.success(result.data, result.message, 200));
  } catch (err) {
    console.error(err);
    return res.status(500).json(ApiResponse.error("Internal server error", 500));
  }
};
 
// GET /products/:vendor_id/filters
export const getProductFilters = async (req: Request, res: Response) => {
  try {
    const vendor_id = Number(req.params.vendor_id);
    if (isNaN(vendor_id))
      return res.status(400).json(ApiResponse.error("Invalid vendor_id", 400));
 
    const result = await inventoryService.getProductFiltersService(vendor_id);
    return res.status(200).json(ApiResponse.success(result.data, result.message, 200));
  } catch (err) {
    return res.status(500).json(ApiResponse.error("Internal server error", 500));
  }
};


export const getProductPurchaseHistory = async (req: Request, res: Response) => {
  const vendor_id  = Number(req.params.vendor_id);
  const product_id = Number(req.params.product_id);
  if (isNaN(vendor_id) || isNaN(product_id))
    return res.status(400).json(ApiResponse.error("Invalid params", 400));
  const result = await inventoryService.getProductPurchaseHistoryService(vendor_id, product_id);
  return res.status(result.status ? 200 : 404).json(
    result.status
      ? ApiResponse.success(result.data, result.message, 200)
      : ApiResponse.error(result.message, 404)
  );
};