import { Request, Response } from "express";
import { ClientDocumentationService } from "../../../services/leadModuleServices/clientDocumentationStage/clientDocumentation.service";

const clientDocumentationService = new ClientDocumentationService();

export class ClientDocumentationController {
  public static async create(req: Request, res: Response): Promise<void> {
    try {
      const { lead_id, account_id, vendor_id, created_by } = req.body;
      const documents = req.files as Express.Multer.File[];

      if (!lead_id || !account_id || !vendor_id || !created_by) {
        res.status(400).json({ success: false, message: "Missing required fields" });
        return;
      }

      if (!documents || documents.length === 0) {
        res.status(400).json({ success: false, message: "At least one client documentation file is required" });
        return;
      }

      // ✅ File type validation
      const allowedExtensions = [".ppt", ".pptx", ".pdf", ".jpg", ".jpeg", ".png", ".doc", ".docx", ".pyo"];
      const invalidFiles = documents.filter(
        (file) =>
          !allowedExtensions.includes("." + file.originalname.split(".").pop()?.toLowerCase())
      );

      if (invalidFiles.length > 0) {
        res.status(400).json({
          success: false,
          message: `Invalid file types: ${invalidFiles.map((f) => f.originalname).join(", ")}`,
        });
        return;
      }

      const dto = {
        lead_id: parseInt(lead_id),
        account_id: parseInt(account_id),
        vendor_id: parseInt(vendor_id),
        created_by: parseInt(created_by),
        documents,
      };

      const result = await clientDocumentationService.createClientDocumentationStage(dto);
      res.status(201).json({ success: true, message: "Client documentation stage completed", data: result });
    } catch (error: any) {
      console.error("[ClientDocumentationController] Error:", error);
      res.status(500).json({ success: false, message: error.message || "Internal server error" });
    }
  }

  public static async get(req: Request, res: Response): Promise<void> {
    try {
      const vendorId = parseInt(req.params.vendorId);
      const leadId = parseInt(req.params.leadId);

      if (!vendorId || !leadId) {
        res.status(400).json({ success: false, message: "vendorId and leadId are required" });
        return;
      }

      const data = await clientDocumentationService.getClientDocumentation(vendorId, leadId);

      res.status(200).json({
        success: true,
        message: "Client documentation fetched successfully",
        data,
      });
    } catch (error: any) {
      console.error("[ClientDocumentationController] Error:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Internal server error",
      });
    }
  }

  public static async addMoreDocuments(req: Request, res: Response): Promise<void> {
    try {
      const { lead_id, account_id, vendor_id, created_by } = req.body;
      const documents = req.files as Express.Multer.File[];
  
      if (!lead_id || !account_id || !vendor_id || !created_by) {
        res.status(400).json({ success: false, message: "Missing required fields" });
        return;
      }
  
      if (!documents || documents.length === 0) {
        res.status(400).json({ success: false, message: "At least one client documentation file is required" });
        return;
      }
  
      // ✅ File type validation
      const allowedExtensions = [".ppt", ".pptx", ".pdf", ".jpg", ".jpeg", ".png", ".doc", ".docx", ".pyo"];
      const invalidFiles = documents.filter(
        (file) =>
          !allowedExtensions.includes("." + file.originalname.split(".").pop()?.toLowerCase())
      );
  
      if (invalidFiles.length > 0) {
        res.status(400).json({
          success: false,
          message: `Invalid file types: ${invalidFiles.map((f) => f.originalname).join(", ")}`,
        });
        return;
      }
  
      const dto = {
        lead_id: parseInt(lead_id),
        account_id: parseInt(account_id),
        vendor_id: parseInt(vendor_id),
        created_by: parseInt(created_by),
        documents,
      };
  
      const result = await clientDocumentationService.addMoreClientDocumentation(dto);
      res.status(201).json({ success: true, message: "Additional client documentation uploaded successfully", data: result });
    } catch (error: any) {
      console.error("[ClientDocumentationController] Error:", error);
      res.status(500).json({ success: false, message: error.message || "Internal server error" });
    }
  }

  public static getAllClientDocumentations = async (req: Request, res: Response) => {
    try {
      const vendorId = parseInt(req.params.vendorId);
      const userId = parseInt(req.params.userId);
  
      if (!vendorId || !userId) {
        return res.status(400).json({
          success: false,
          message: "Vendor ID and User ID are required",
        });
      }
  
      const leads = await clientDocumentationService.getLeadsWithStatusClientDocumentation(
        vendorId,
        userId
      );
  
      return res.status(200).json({
        success: true,
        message: "Client Documentation leads fetched successfully",
        data: leads,
      });
    } catch (error: any) {
      console.error("[ClientDocumentationController] getAllClientDocumentations Error:", error);
      return res.status(500).json({
        success: false,
        message: error.message || "Something went wrong",
      });
    }
  };
  
}