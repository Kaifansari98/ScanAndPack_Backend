import { Request, Response } from "express";
import { FinalMeasurementService } from "../../../services/leadModuleServices/finalMeasurementStage/finalMeasurement.service";
import logger from "../../../utils/logger";

const finalMeasurementService = new FinalMeasurementService();

export class FinalMeasurementController {
  public createFinalMeasurementStage = async (req: Request, res: Response): Promise<void> => {
    try {
      const { lead_id, account_id, vendor_id, created_by, critical_discussion_notes } = req.body;

      if (!lead_id || !account_id || !vendor_id || !created_by) {
        res.status(400).json({ success: false, message: "Missing required fields" });
        return;
      }

      const files = req.files as { [fieldname: string]: Express.Multer.File[] };
      const finalMeasurementDocs = files?.final_measurement_doc || [];
      const sitePhotos = files?.site_photos || [];

      if (!finalMeasurementDocs || finalMeasurementDocs.length === 0) {
        res.status(400).json({ success: false, message: "At least one Final Measurement document is required" });
        return;
      }
      if (!sitePhotos || sitePhotos.length === 0) {
        res.status(400).json({ success: false, message: "At least one site photo is required" });
        return;
      }

      const dto = {
        lead_id: parseInt(lead_id),
        account_id: parseInt(account_id),
        vendor_id: parseInt(vendor_id),
        created_by: parseInt(created_by),
        critical_discussion_notes: critical_discussion_notes || null,
        finalMeasurementDocs,
        sitePhotos,
      };

      const result = await finalMeasurementService.createFinalMeasurementStage(dto);
      res.status(201).json({ success: true, message: "Final measurement stage completed", data: result });

    } catch (error: any) {
      console.error("[FinalMeasurementController] Error:", error);
      res.status(500).json({ success: false, message: error.message || "Internal server error" });
    }
  };

  public getAllFinalMeasurementLeadsByVendorId = async (req: Request, res: Response): Promise<void> => {
    try {
      const vendorId = parseInt(req.params.vendorId);
      const userId = Number(req.query.userId);
  
      if (!vendorId || !userId) {
        res.status(400).json({
          success: false,
          message: "vendorId and userId are required",
        });
        return;
      }
  
      const leads = await finalMeasurementService.getAllFinalMeasurementLeadsByVendorId(vendorId, userId);
  
      res.status(200).json({
        success: true,
        message: "Final Measurement leads fetched successfully",
        data: leads,
      });
    } catch (error: any) {
      console.error("[FinalMeasurementController] Error:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Internal server error",
      });
    }
  }; 

  public getFinalMeasurementLead = async (req: Request, res: Response): Promise<void> => {
    try {
      const vendorId = parseInt(req.params.vendorId);
      const leadId = parseInt(req.params.leadId);
  
      if (!vendorId || !leadId) {
        res.status(400).json({ success: false, message: "vendorId and leadId are required" });
        return;
      }
  
      const lead = await finalMeasurementService.getFinalMeasurementLead(vendorId, leadId);
  
      res.status(200).json({
        success: true,
        message: "Final Measurement lead fetched successfully",
        data: lead,
      });
    } catch (error: any) {
      console.error("[FinalMeasurementController] Error:", error);
      res.status(500).json({ success: false, message: error.message || "Internal server error" });
    }
  };
  
  public updateCriticalDiscussionNotes = async (req: Request, res: Response): Promise<void> => {
    try {
      const vendorId = parseInt(req.params.vendorId);
      const leadId = parseInt(req.params.leadId);
      const { notes } = req.body;
  
      if (!notes) {
        res.status(400).json({ success: false, message: "Notes are required" });
        return;
      }
  
      const updatedLead = await finalMeasurementService.updateCriticalDiscussionNotes(
        vendorId,
        leadId,
        notes
      );
  
      res.status(200).json({
        success: true,
        message: "Critical discussion notes updated successfully",
        data: updatedLead,
      });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  };  

  public addMoreFinalMeasurementFiles = async (req: Request, res: Response): Promise<void> => {
    try {
      const { lead_id, vendor_id, account_id, created_by } = req.body;
  
      if (!lead_id || !vendor_id || !account_id || !created_by) {
        res.status(400).json({ success: false, message: "Missing required fields" });
        return;
      }
  
      const files = req.files as { [fieldname: string]: Express.Multer.File[] };
      const sitePhotos = files?.site_photos || [];
  
      if (!sitePhotos || sitePhotos.length === 0) {
        res.status(400).json({ success: false, message: "At least one file (final measurement or final site photo) is required" });
        return;
      }
  
      const result = await finalMeasurementService.addMoreFinalMeasurementFiles({
        lead_id: parseInt(lead_id),
        vendor_id: parseInt(vendor_id),
        account_id: parseInt(account_id),
        created_by: parseInt(created_by),
        sitePhotos,
      });
  
      res.status(201).json({
        success: true,
        message: "Additional files uploaded successfully",
        data: result,
      });
    } catch (error: any) {
      console.error("[FinalMeasurementController] Error:", error);
      res.status(500).json({ success: false, message: error.message || "Internal server error" });
    }
  };

  public getFinalMeasurementLeads = async (req: Request, res: Response) => {
    try {
      const vendorId = parseInt(req.params.vendorId);
      const userId = parseInt(req.params.userId); // ✅ take userId also
  
      if (!vendorId || !userId) {
        return res.status(400).json({ success: false, message: "Vendor ID and User ID are required" });
      }
  
      const leads = await finalMeasurementService.getLeadsWithStatusFinalMeasurement(vendorId, userId);
  
      return res.status(200).json({
        success: true,
        message: "Final Measurement leads fetched successfully",
        data: leads,
      });
    } catch (error: any) {
      console.error("[FinalMeasurementController] getFinalMeasurementLeads Error:", error);
      return res.status(500).json({
        success: false,
        message: error.message || "Something went wrong",
      });
    }
  };

  public async assignTaskFM(req: Request, res: Response): Promise<Response> {
    logger.info("[CONTROLLER] assignTaskISM called");
    try {
      const leadId = Number(req.params.leadId);
      const {
        task_type,
        due_date,
        remark,
        user_id,       // assignee
        created_by,    // optional: if you carry user id from FE; otherwise derive from auth
      } = req.body;

      // Minimal validation here (service re-validates too)
      if (!leadId || !task_type || !due_date || !user_id) {
        return res.status(400).json({
          success: false,
          error: "Validation failed",
          details: [
            !leadId && { field: "leadId", message: "leadId (param) is required" },
            !task_type && { field: "task_type", message: "task_type is required" },
            !due_date && { field: "due_date", message: "due_date is required" },
            !user_id && { field: "user_id", message: "user_id is required" },
          ].filter(Boolean),
        });
      }

      const actorId = created_by ?? (req as any).user?.id; // if you attach auth user to req
      const result = await finalMeasurementService.assignTaskFMService({
        lead_id: leadId,
        task_type,
        due_date,
        remark,
        assignee_user_id: Number(user_id),
        created_by: Number(actorId),
      });

      return res.status(201).json({
        success: true,
        message: "FM task assigned and lead status updated",
        data: result,
      });
    } catch (error: any) {
      logger.error("[ERROR] assignTaskISM:", { err: error });
      return res.status(500).json({
        success: false,
        error: "Internal server error",
        details: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };
  
}