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


export const createHSN = async (req: Request, res: Response) => {
  try {
    const vendor_id = Number(req.params.vendor_id);

    const result = await inventoryService.createHSNService(vendor_id, req.body);

    return res.status(200).json(result);
  } catch (error) {
    console.error("createHSN controller error:", error);
    return res.status(500).json({
      status: 0,
      message: "Failed to create HSN",
    });
  }
};

export const getAdditionalCostMasters = async (req: Request, res: Response) => {
  try {
    const vendor_id = Number(req.params.vendor_id);

    const result = await inventoryService.getAdditionalCostMastersService(vendor_id);

    return res.status(200).json(result);
  } catch (error) {
    console.error("getAdditionalCostMasters error:", error);

    return res.status(500).json({
      status: 0,
      message: "Failed to fetch additional costs",
    });
  }
};


export const createAdditionalCostMaster = async (req: Request, res: Response) => {
  try {
    const vendor_id = Number(req.params.vendor_id);

    const result = await inventoryService.createAdditionalCostMasterService(vendor_id, req.body);

    return res.status(200).json(result);
  } catch (error) {
    console.error("createAdditionalCostMaster error:", error);

    return res.status(500).json({
      status: 0,
      message: "Failed to create additional cost",
    });
  }
};

export const createSubCategory = async (req: Request, res: Response) => {
  try {
    const vendor_id = Number(req.params.vendor_id);
    const result = await inventoryService.createSubCategoryService(vendor_id, req.body);
    return res.status(200).json(result);
  } catch (error) {
    console.error("createSubCategory controller error:", error);
    return res.status(500).json({ status: 0, message: "Failed to create subcategory" });
  }
};

export const createCoreProduct = async (req: Request, res: Response) => {
  try {
    const vendor_id = Number(req.params.vendor_id);
    const result = await inventoryService.createCoreProductService(vendor_id, req.body);
    return res.status(200).json(result);
  } catch (error) {
    console.error("createCoreProduct controller error:", error);
    return res.status(500).json({ status: 0, message: "Failed to create core product" });
  }
};

export const createGrade = async (req: Request, res: Response) => {
  try {
    const vendor_id = Number(req.params.vendor_id);
    const result = await inventoryService.createGradeService(vendor_id, req.body);
    return res.status(200).json(result);
  } catch (error) {
    console.error("createGrade controller error:", error);
    return res.status(500).json({ status: 0, message: "Failed to create grade" });
  }
};

export const createFinish = async (req: Request, res: Response) => {
  try {
    const vendor_id = Number(req.params.vendor_id);
    const result = await inventoryService.createFinishService(vendor_id, req.body);
    return res.status(200).json(result);
  } catch (error) {
    console.error("createFinish controller error:", error);
    return res.status(500).json({ status: 0, message: "Failed to create finish" });
  }
};

export const createSize = async (req: Request, res: Response) => {
  try {
    const vendor_id = Number(req.params.vendor_id);
    const result = await inventoryService.createSizeService(vendor_id, req.body);
    return res.status(200).json(result);
  } catch (error) {
    console.error("createSize controller error:", error);
    return res.status(500).json({ status: 0, message: "Failed to create size" });
  }
};

export const deleteSubCategory = async (req: Request, res: Response) => {
  try {
    const vendor_id = Number(req.params.vendor_id);
    const id = Number(req.params.id);
    const result = await inventoryService.deleteSubCategoryService(vendor_id, id);
    return res.status(200).json(result);
  } catch (error) {
    console.error("deleteSubCategory controller error:", error);
    return res.status(500).json({ status: 0, message: "Failed to delete subcategory" });
  }
};

export const deleteCoreProduct = async (req: Request, res: Response) => {
  try {
    const vendor_id = Number(req.params.vendor_id);
    const id = Number(req.params.id);
    const result = await inventoryService.deleteCoreProductService(vendor_id, id);
    return res.status(200).json(result);
  } catch (error) {
    console.error("deleteCoreProduct controller error:", error);
    return res.status(500).json({ status: 0, message: "Failed to delete core product" });
  }
};

export const deleteGrade = async (req: Request, res: Response) => {
  try {
    const vendor_id = Number(req.params.vendor_id);
    const id = Number(req.params.id);
    const result = await inventoryService.deleteGradeService(vendor_id, id);
    return res.status(200).json(result);
  } catch (error) {
    console.error("deleteGrade controller error:", error);
    return res.status(500).json({ status: 0, message: "Failed to delete grade" });
  }
};

export const deleteFinish = async (req: Request, res: Response) => {
  try {
    const vendor_id = Number(req.params.vendor_id);
    const id = Number(req.params.id);
    const result = await inventoryService.deleteFinishService(vendor_id, id);
    return res.status(200).json(result);
  } catch (error) {
    console.error("deleteFinish controller error:", error);
    return res.status(500).json({ status: 0, message: "Failed to delete finish" });
  }
};

export const deleteSize = async (req: Request, res: Response) => {
  try {
    const vendor_id = Number(req.params.vendor_id);
    const id = Number(req.params.id);
    const result = await inventoryService.deleteSizeService(vendor_id, id);
    return res.status(200).json(result);
  } catch (error) {
    console.error("deleteSize controller error:", error);
    return res.status(500).json({ status: 0, message: "Failed to delete size" });
  }
};

export const createBrand = async (req: Request, res: Response) => {
  try {
    const vendor_id = Number(req.params.vendor_id);
    const result = await inventoryService.createBrandService(vendor_id, req.body);
    return res.status(200).json(result);
  } catch (error) {
    console.error("createBrand controller error:", error);
    return res.status(500).json({ status: 0, message: "Failed to create brand" });
  }
};

export const deleteBrand = async (req: Request, res: Response) => {
  try {
    const vendor_id = Number(req.params.vendor_id);
    const id = Number(req.params.id);
    const result = await inventoryService.deleteBrandService(vendor_id, id);
    return res.status(200).json(result);
  } catch (error) {
    console.error("deleteBrand controller error:", error);
    return res.status(500).json({ status: 0, message: "Failed to delete brand" });
  }
};

export const createProductType = async (req: Request, res: Response) => {
  try {
    const vendor_id = Number(req.params.vendor_id);
    const result = await inventoryService.createProductTypeService(vendor_id, req.body);
    return res.status(200).json(result);
  } catch (error) {
    console.error("createProductType controller error:", error);
    return res.status(500).json({ status: 0, message: "Failed to create product type" });
  }
};

export const deleteProductType = async (req: Request, res: Response) => {
  try {
    const vendor_id = Number(req.params.vendor_id);
    const id = Number(req.params.id);
    const result = await inventoryService.deleteProductTypeService(vendor_id, id);
    return res.status(200).json(result);
  } catch (error) {
    console.error("deleteProductType controller error:", error);
    return res.status(500).json({ status: 0, message: "Failed to delete product type" });
  }
};