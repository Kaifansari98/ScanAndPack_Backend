import { Request, Response } from "express";
import {
    addProductType,
    deleteProductType,
    getAllProductTypes,
    updateProductTypeStatus,
} from "../../services/leadModuleServices/productType.service";
import { ProductTypeInput } from "../../types/leadModule.types";

export const createProductType = async (req: Request, res: Response) => {
    console.log("[CONTROLLER] createProductType called", { body: req.body });

    try{
        const { vendor_id, type, tag } = req.body as ProductTypeInput;

        if(!vendor_id || !type || !tag) {
            console.warn("[CONTROLLER] Missing required fields", { vendor_id, type });
            return res.status(400).json({ error: "vendor_id tag and type are required" });
        }

        const productType = await addProductType({vendor_id, type, tag});

        console.log("[CONTROLLER] ProductType created successfully", productType);
        return res.status(201).json({ success: true, data: productType });
    }
    catch (error: any){
        console.error("[CONTROLLER] Error creating product type", { error: error.message });
        return res.status(500).json({ success: false, error: error.message });
    }
}

export const fetchAllProductTypes = async (req: Request, res: Response) => {
    console.log("[CONTROLLER] fetchAllProductTypes called", { query: req.query });

    try {
    const vendor_id = Number(req.params.vendor_id);
    if (!vendor_id) {
      console.warn("[CONTROLLER] Missing vendor_id");
      return res.status(400).json({ error: "vendor_id is required" });
    }

    const productTypes = await getAllProductTypes(vendor_id);
    return res.status(200).json({ success: true, data: productTypes });
    } 
    catch (error: any) {
    console.error("[CONTROLLER] Error fetching product types", { error: error.message });
    return res.status(500).json({ success: false, error: error.message });
    }
}

export const removeProductType = async (req: Request, res: Response) => {
    console.log("[CONTROLLER] removeProductType called", { params: req.params });
  
    try {
      const id = Number(req.params.id);
      if (!id) {
        console.warn("[CONTROLLER] Missing product type id");
        return res.status(400).json({ error: "id is required" });
      }
  
      await deleteProductType(id);
      return res.status(200).json({ success: true, message: "ProductType deleted successfully" });
    } catch (error: any) {
      console.error("[CONTROLLER] Error deleting product type", { error: error.message });
      return res.status(500).json({ success: false, error: error.message });
    }
};

export const toggleProductTypeStatus = async (req: Request, res: Response) => {
    console.log("[CONTROLLER] toggleProductTypeStatus called", {
        params: req.params,
        body: req.body,
    });

    try {
        const id = Number(req.params.id);
        const { status } = req.body as { status?: string };

        if (!id) {
            console.warn("[CONTROLLER] Missing product type id");
            return res.status(400).json({ error: "id is required" });
        }

        if (!status) {
            console.warn("[CONTROLLER] Missing status");
            return res.status(400).json({ error: "status is required" });
        }

        const normalizedStatus = status.toLowerCase();
        if (!["active", "inactive"].includes(normalizedStatus)) {
            console.warn("[CONTROLLER] Invalid status value", { status });
            return res.status(400).json({
                error: "status must be either 'active' or 'inactive'",
            });
        }

        const updated = await updateProductTypeStatus(id, normalizedStatus);
        return res.status(200).json({ success: true, data: updated });
    } catch (error: any) {
        console.error("[CONTROLLER] Error updating product type status", {
            error: error.message,
        });
        return res.status(500).json({ success: false, error: error.message });
    }
};
