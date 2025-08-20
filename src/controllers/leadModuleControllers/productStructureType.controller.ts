import { Request, Response } from "express";
import { addProductStructureType, deleteProductStructureType, getAllProductStructureTypes } from "../../services/leadModuleServices/productStructureType.service";
import { ProductStructureType, ProductStructureTypeInput } from "../../types/leadModule.types";

export const createProductStructureType = async (req: Request, res: Response) => {
    console.log("[CONTROLLER] createProductStructureType called", { body: req.body });

    try {
        const {vendor_id, type} = req.body as ProductStructureTypeInput;

        if(!vendor_id || !type){
            console.warn("[CONTROLLER] Missing required fields", { vendor_id, type });
            return res.status(400).json({ error: "vendor_id and type are required" });
        }

        const productStructureType = await addProductStructureType({vendor_id, type});

        console.log("[CONTROLLER] createProductStructureType created successfully", productStructureType);
        return res.status(201).json({ success: true, data: productStructureType });
    }
    catch (error: any) {
        console.error("[CONTROLLER] Error creating product type", { error: error.message });
        return res.status(500).json({ success: false, error: error.message });
    }

}

export const fetchAllProductStructureTypes = async (req: Request, res: Response) => {
    console.log("[CONTROLLER] fetchAllProductStructureTypes called", { query: req.query });

    try {
    const vendor_id = parseInt(req.params.vendor_id);
    if (!vendor_id) {
      console.warn("[CONTROLLER] Missing vendor_id");
      return res.status(400).json({ error: "vendor_id is required" });
    }

    const productStructureTypes = await getAllProductStructureTypes(vendor_id);
    return res.status(200).json({ success: true, data: productStructureTypes });
    } 
    catch (error: any) {
    console.error("[CONTROLLER] Error fetching ProductStructure types", { error: error.message });
    return res.status(500).json({ success: false, error: error.message });
    }
}

export const removeProductStructureType = async (req: Request, res: Response) => {
    console.log("[CONTROLLER] removeProductStructureType called", { params: req.params });
  
    try {
      const id = parseInt(req.params.id);
      if (!id) {
        console.warn("[CONTROLLER] Missing ProductStructure type id");
        return res.status(400).json({ error: "id is required" });
      }
  
      await deleteProductStructureType(id);
      return res.status(200).json({ success: true, message: "ProductStructure deleted successfully" });
    } catch (error: any) {
      console.error("[CONTROLLER] Error deleting ProductStructure type", { error: error.message });
      return res.status(500).json({ success: false, error: error.message });
    }
};