import { Request, Response } from "express";
import { SiteReadinessService } from "../../../services/installation/site-readiness/SiteReadiness.service";
import logger from "../../../utils/logger";

const service = new SiteReadinessService();

export class SiteReadinessController {
  /** ✅ Get all leads under Site Readiness (Type 12) */
  async getAllSiteReadinessLeads(req: Request, res: Response) {
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

      const leads = await service.getLeadsWithStatusSiteReadiness(
        vendorId,
        userId,
        limit,
        page
      );

      return res.status(200).json({
        success: true,
        message: "Site Readiness leads fetched successfully",
        count: leads.total,
        data: leads,
        ...leads,
      });
    } catch (error: any) {
      logger.error("[SiteReadinessController] getAllSiteReadinessLeads Error:", error);
      return res.status(500).json({
        success: false,
        message: error.message || "Internal server error",
      });
    }
  }
}
