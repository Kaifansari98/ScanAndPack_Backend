import { Request, Response } from "express";
import { FinalMeasurementService } from "../../../services/leadModuleServices/finalMeasurementStage/finalMeasurement.service";

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
      const finalMeasurementDoc = files?.final_measurement_doc?.[0];
      const sitePhotos = files?.site_photos || [];

      if (!finalMeasurementDoc) {
        res.status(400).json({ success: false, message: "Final measurement document is required" });
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
        finalMeasurementDoc,
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
  
      if (!vendorId) {
        res.status(400).json({ success: false, message: "VendorId is required" });
        return;
      }
  
      const leads = await finalMeasurementService.getAllFinalMeasurementLeadsByVendorId(vendorId);
  
      res.status(200).json({
        success: true,
        message: "Final Measurement leads fetched successfully",
        data: leads,
      });
    } catch (error: any) {
      console.error("[FinalMeasurementController] Error:", error);
      res.status(500).json({ success: false, message: error.message || "Internal server error" });
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
  
}
