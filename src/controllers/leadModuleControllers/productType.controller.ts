import { Request, Response } from "express";
import { addProductType, deleteProductType, getAllProductTypes } from "../../services/leadModuleServices/productType.service";
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
    const vendor_id = parseInt(req.params.vendor_id);
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
      const id = parseInt(req.params.id);
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