import { Request, Response } from "express";
import { PreProductionService } from "../../../../services/production/pre-production/PreProduction.service";

const service = new PreProductionService();

export class PreProductionController {
  async getAllPreProductionLeads(req: Request, res: Response) {
    try {
      const vendorId = parseInt(req.params.vendorId);
      const userId = parseInt(req.params.userId);

      if (!vendorId || !userId) {
        return res.status(400).json({
          success: false,
          message: "Vendor ID and User ID are required",
        });
      }

      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;

      const leads = await service.getLeadsWithStatusPreProduction(
        vendorId,
        userId,
        limit,
        page
      );

      return res.status(200).json({
        success: true,
        message: "Pre-Production leads fetched successfully",
        count: leads.total,
        data: leads,
        ...leads,
      });
    } catch (error: any) {
      console.error(
        "[PreProductionController] getAllPreProductionLeads Error:",
        error
      );
      return res.status(500).json({
        success: false,
        message: error.message || "Internal server error",
      });
    }
  }

  async handleOrderLoginCompletion(req: Request, res: Response) {
    try {
      const { vendorId, leadId } = req.params;
      const { updates } = req.body; // [{ id, estimated_completion_date, is_completed, updated_by }]

      if (!vendorId || !leadId)
        return res.status(400).json({
          success: false,
          message: "vendorId and leadId are required",
        });

      if (!Array.isArray(updates) || updates.length === 0)
        return res
          .status(400)
          .json({ success: false, message: "updates array is required" });

      const { results, errors } = await service.handleOrderLoginCompletion(
        Number(vendorId),
        Number(leadId),
        updates
      );

      return res.status(200).json({
        success: true,
        message: "Order login completion updates processed successfully",
        total_submitted: updates.length,
        total_success: results.length,
        total_failed: errors.length,
        data: results,
        errors,
      });
    } catch (error: any) {
      console.error("Error in handleOrderLoginCompletion:", error);
      return res.status(500).json({
        success: false,
        message: error.message || "Internal server error",
      });
    }
  }

  async handleFactoryVendorSelection(req: Request, res: Response) {
    try {
      const { vendorId, leadId } = req.params;
      const { updates } = req.body; // [{ id, company_vendor_id, remark, updated_by }]

      if (!vendorId || !leadId)
        return res.status(400).json({
          success: false,
          message: "vendorId and leadId are required",
        });

      if (!Array.isArray(updates) || updates.length === 0)
        return res
          .status(400)
          .json({ success: false, message: "updates array is required" });

      const { results, errors } = await service.handleFactoryVendorSelection(
        Number(vendorId),
        Number(leadId),
        updates
      );

      return res.status(200).json({
        success: true,
        message: "Factory vendor selection updates processed successfully",
        total_submitted: updates.length,
        total_success: results.length,
        total_failed: errors.length,
        data: results,
        errors,
      });
    } catch (error: any) {
      console.error("Error in handleFactoryVendorSelection:", error);
      return res.status(500).json({
        success: false,
        message: error.message || "Internal server error",
      });
    }
  }

  static async updateExpectedOrderLoginReadyDate(req: Request, res: Response) {
    try {
      const vendorId = parseInt(req.params.vendorId);
      const leadId = parseInt(req.params.leadId);
      const { expected_order_login_ready_date, updated_by } = req.body;

      if (
        !vendorId ||
        !leadId ||
        !expected_order_login_ready_date ||
        !updated_by
      ) {
        return res.status(400).json({
          success: false,
          message:
            "vendorId, leadId, expected_order_login_ready_date and updated_by are required",
        });
      }

      const updatedLead = await service.updateExpectedOrderLoginReadyDate(
        vendorId,
        leadId,
        expected_order_login_ready_date,
        updated_by
      );

      return res.status(200).json({
        success: true,
        message: "Expected Order Login Ready Date updated successfully",
        data: updatedLead,
      });
    } catch (error: any) {
      console.error("[PreProductionController] Error:", error);
      return res.status(500).json({
        success: false,
        message: error.message || "Internal server error",
      });
    }
  }

  static async checkPostProductionReady(req: Request, res: Response) {
    try {
      const vendorId = parseInt(req.params.vendorId);
      const leadId = parseInt(req.params.leadId);

      if (!vendorId || !leadId) {
        return res.status(400).json({
          success: false,
          message: "vendorId and leadId are required",
        });
      }

      const result = await service.checkPostProductionReady(vendorId, leadId);

      return res.status(200).json({
        success: true,
        ...result,
        message: result.readyForPostProduction
          ? "Lead is ready for Post-Production"
          : "Lead is not yet ready for Post-Production",
      });
    } catch (error: any) {
      console.error(
        "[PreProductionController] checkPostProductionReady error:",
        error
      );
      return res.status(500).json({
        success: false,
        message: error.message || "Internal server error",
      });
    }
  }

  static async getLatestOrderLoginByLead(req: Request, res: Response) {
    try {
      const { vendorId } = req.params;
      const { lead_id } = req.query;

      if (!vendorId || !lead_id) {
        return res.status(400).json({
          success: false,
          message: "vendorId and lead_id are required.",
        });
      }

      const result = await service.getLatestOrderLoginByLead(
        Number(vendorId),
        Number(lead_id)
      );

      return res.status(200).json({
        success: true,
        message: result.message,
        data: result.data,
      });
    } catch (error: any) {
      console.error(
        "[PreProductionController] getLatestOrderLoginByLead error:",
        error
      );
      return res.status(error.statusCode || 500).json({
        success: false,
        message:
          error.message ||
          "Internal server error while fetching latest order login details",
      });
    }
  }
}
