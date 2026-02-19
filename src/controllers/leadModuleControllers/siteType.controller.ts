import { Request, Response } from "express";
import {
    addSiteType,
    deleteSiteType,
    getAllSiteTypes,
    updateSiteTypeStatus,
} from "../../services/leadModuleServices/siteType.service";
import { SiteTypeInput } from "../../types/leadModule.types";

export const createSiteType = async (req: Request, res: Response) => {

    console.log("[CONTROLLER] createSiteType called", { body: req.body });

    try{
        const { vendor_id, type } = req.body as SiteTypeInput;

        if(!vendor_id || !type) {
            console.warn("[CONTROLLER] Missing required fields", { vendor_id, type });
            return res.status(400).json({ error: "vendor_id and type are required" });
        }

        const siteType = await addSiteType({vendor_id, type});

        console.log("[CONTROLLER] SiteType created successfully", siteType);
        return res.status(201).json({
            success: true,
            data: siteType
        })
    }
    catch (error: any){
        console.error("[CONTROLLER] Error creating site type", { error: error.message });
        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
}

export const fetchAllSiteTypes = async (req: Request, res: Response) => {
    console.log("[CONTROLLER] fetchAllSiteTypes called", { query: req.query });

    try {
    const vendor_id = Number(req.params.vendor_id);
    if (!vendor_id) {
      console.warn("[CONTROLLER] Missing vendor_id");
      return res.status(400).json({ error: "vendor_id is required" });
    }

    const siteTypes = await getAllSiteTypes(vendor_id);
    return res.status(200).json({ success: true, data: siteTypes });
    } 
    catch (error: any) {
    console.error("[CONTROLLER] Error fetching site types", { error: error.message });
    return res.status(500).json({ success: false, error: error.message });
    }
}

export const removeSiteType = async (req: Request, res: Response) => {
    console.log("[CONTROLLER] removeSiteType called", { params: req.params });
  
    try {
      const id = Number(req.params.id);
      if (!id) {
        console.warn("[CONTROLLER] Missing site type id");
        return res.status(400).json({ error: "id is required" });
      }
  
      await deleteSiteType(id);
      return res.status(200).json({ success: true, message: "SiteType deleted successfully" });
    } catch (error: any) {
      console.error("[CONTROLLER] Error deleting site type", { error: error.message });
      return res.status(500).json({ success: false, error: error.message });
    }
};

export const toggleSiteTypeStatus = async (req: Request, res: Response) => {
    console.log("[CONTROLLER] toggleSiteTypeStatus called", {
        params: req.params,
        body: req.body,
    });

    try {
        const id = Number(req.params.id);
        const { status } = req.body as { status?: string };

        if (!id) {
            console.warn("[CONTROLLER] Missing site type id");
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

        const updated = await updateSiteTypeStatus(id, normalizedStatus);
        return res.status(200).json({ success: true, data: updated });
    } catch (error: any) {
        console.error("[CONTROLLER] Error updating site type status", {
            error: error.message,
        });
        return res.status(500).json({ success: false, error: error.message });
    }
};
