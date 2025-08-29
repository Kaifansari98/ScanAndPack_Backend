import { Request, Response } from "express";
import { addDocumentType, deleteDocumentType, getAllDocumentTypes } from "../../services/leadModuleServices/documentType.service";
import { DocumentTypeInput } from "../../types/leadModule.types";

export const createDocumentType = async (req: Request, res: Response) => {
    console.log("[CONTROLLER] createDocumentType called", { body: req.body });

    try {
        const {vendor_id, type} = req.body as DocumentTypeInput;

        if(!vendor_id || !type){
            console.warn("[CONTROLLER] Missing required fields", { vendor_id, type });
            return res.status(400).json({ error: "vendor_id and type are required" });
        }

        const documentType = await addDocumentType({vendor_id, type});

        console.log("[CONTROLLER] createDocumentType created successfully", documentType);
        return res.status(201).json({ success: true, data: documentType });
    }
    catch (error: any) {
        console.error("[CONTROLLER] Error creating product type", { error: error.message });
        return res.status(500).json({ success: false, error: error.message });
    }

}

export const fetchAllDocumentTypes = async (req: Request, res: Response) => {
    console.log("[CONTROLLER] fetchAllDocumentTypes called", { query: req.query });

    try {
    const vendor_id = parseInt(req.params.vendor_id);
    if (!vendor_id) {
      console.warn("[CONTROLLER] Missing vendor_id");
      return res.status(400).json({ error: "vendor_id is required" });
    }

    const documentTypes = await getAllDocumentTypes(vendor_id);
    return res.status(200).json({ success: true, data: documentTypes });
    } 
    catch (error: any) {
    console.error("[CONTROLLER] Error fetching Document types", { error: error.message });
    return res.status(500).json({ success: false, error: error.message });
    }
}

export const removeDocumentType = async (req: Request, res: Response) => {
    console.log("[CONTROLLER] removeDocumentType called", { params: req.params });
  
    try {
      const id = parseInt(req.params.id);
      if (!id) {
        console.warn("[CONTROLLER] Missing Document type id");
        return res.status(400).json({ error: "id is required" });
      }
  
      await deleteDocumentType(id);
      return res.status(200).json({ success: true, message: "Document Type deleted successfully" });
    } catch (error: any) {
      console.error("[CONTROLLER] Error deleting ProductStructure type", { error: error.message });
      return res.status(500).json({ success: false, error: error.message });
    }
};