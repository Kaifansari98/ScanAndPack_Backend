import { Request, Response } from "express";
import { addSourceType, deleteSourceType, getAllSourceTypes } from "../../services/leadModuleServices/sourceMaster.service";
import { SourceTypeInput, SourceType } from "../../types/leadModule.types";

export const createSourceType = async(req: Request, res: Response) => {

    console.log("[CONTROLLER] createSourceType called", { body: req.body });

    try {
        const { vendor_id, type } = req.body as SourceTypeInput;

        if(!vendor_id || !type){
            console.warn("[CONTROLLER] Missing required fields", { vendor_id, type });
            return res.status(400).json({ error: "vendor_id and type are required" });
        }

        const sourceType = await addSourceType({
            vendor_id,
            type
        });

        console.log("[CONTROLLER] SourceType created successfully", sourceType);
        return res.status(201).json({
            success: true,
            data: sourceType
        });
    }
    catch (error: any){
        console.error("[CONTROLLER] Error creating source type", { error: error.message });
        return res.status(500).json({ success: false, error: error.message });
    }
}

export const fetchAllSourceTypes = async (req: Request, res: Response) => {
    console.log("[CONTROLLER] fetchAllSourceTypes called", { query: req.query });

    try {
    const vendor_id = parseInt(req.params.vendor_id);
    if (!vendor_id) {
      console.warn("[CONTROLLER] Missing vendor_id");
      return res.status(400).json({ error: "vendor_id is required" });
    }

    const siteTypes = await getAllSourceTypes(vendor_id);
    return res.status(200).json({ success: true, data: siteTypes });
    } 
    catch (error: any) {
    console.error("[CONTROLLER] Error fetching Source types", { error: error.message });
    return res.status(500).json({ success: false, error: error.message });
    }
}

export const removeSourceType = async (req: Request, res: Response) => {
    console.log("[CONTROLLER] removeSourceType called", { params: req.params });
  
    try {
      const id = parseInt(req.params.id);
      if (!id) {
        console.warn("[CONTROLLER] Missing source type id");
        return res.status(400).json({ error: "id is required" });
      }
  
      await deleteSourceType(id);
      return res.status(200).json({ success: true, message: "SourceType deleted successfully" });
    } catch (error: any) {
      console.error("[CONTROLLER] Error deleting source type", { error: error.message });
      return res.status(500).json({ success: false, error: error.message });
    }
};