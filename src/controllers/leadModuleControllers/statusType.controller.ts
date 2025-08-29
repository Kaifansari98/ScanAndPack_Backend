import { Request, Response } from "express";
import { addStatusType, deleteStatusType, getAllStatusTypes } from "../../services/leadModuleServices/status.service";
import { StatusType } from "../../types/leadModule.types";

export const createStatusType = async (req: Request, res: Response) => {
    console.log("[CONTROLLER] createStatusType called", { body: req.body });

    try {
        const {vendor_id, type} = req.body as StatusType;

        if(!vendor_id || !type){
            console.warn("[CONTROLLER] Missing required fields", { vendor_id, type });
            return res.status(400).json({ error: "vendor_id and type are required" });
        }

        const statusType = await addStatusType({vendor_id, type});

        console.log("[CONTROLLER] createStatusType created successfully", statusType);
        return res.status(201).json({ success: true, data: statusType });
    }
    catch (error: any) {
        console.error("[CONTROLLER] Error creating status type", { error: error.message });
        return res.status(500).json({ success: false, error: error.message });
    }

}

export const fetchAllStatusTypes = async (req: Request, res: Response) => {
    console.log("[CONTROLLER] fetchAllStatusTypes called", { query: req.query });

    try {
    const vendor_id = parseInt(req.params.vendor_id);
    if (!vendor_id) {
      console.warn("[CONTROLLER] Missing vendor_id");
      return res.status(400).json({ error: "vendor_id is required" });
    }

    const statusTypes = await getAllStatusTypes(vendor_id);
    return res.status(200).json({ success: true, data: statusTypes });
    } 
    catch (error: any) {
    console.error("[CONTROLLER] Error fetching Document types", { error: error.message });
    return res.status(500).json({ success: false, error: error.message });
    }
}

export const removeStatusType = async (req: Request, res: Response) => {
    console.log("[CONTROLLER] removeStatusType called", { params: req.params });
  
    try {
      const id = parseInt(req.params.id);
      if (!id) {
        console.warn("[CONTROLLER] Missing Status type id");
        return res.status(400).json({ error: "id is required" });
      }
  
      await deleteStatusType(id);
      return res.status(200).json({ success: true, message: "Status Type deleted successfully" });
    } catch (error: any) {
      console.error("[CONTROLLER] Error deleting Status type", { error: error.message });
      return res.status(500).json({ success: false, error: error.message });
    }
};