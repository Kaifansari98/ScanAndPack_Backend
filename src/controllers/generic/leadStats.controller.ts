import { Request, Response } from "express";
import { LeadStatsService } from "../../services/generic/leadStats.service";
import logger from "../../utils/logger";

export class LeadStatsController {
  static async getStats(req: Request, res: Response) {
    try {
      const vendorId = Number(req.params.vendorId);
      const userId = req.query.userId ? Number(req.query.userId) : undefined;

      if (isNaN(vendorId)) {
        logger.warn("Invalid vendorId provided", { vendorId: req.params.vendorId });
        return res.status(400).json({ success: false, message: "Invalid vendorId" });
      }

      if (userId && isNaN(userId)) {
        logger.warn("Invalid userId provided", { userId: req.query.userId });
        return res.status(400).json({ success: false, message: "Invalid userId" });
      }

      const stats = await LeadStatsService.getVendorLeadStats(vendorId, userId);

      logger.info("Fetched lead stats successfully", { vendorId, userId });
      return res.status(200).json({ success: true, data: stats });

    } catch (error: any) {
      logger.error("[LeadStatsController] Error fetching stats", { error: error.message });
      console.error("[LeadStatsController] Error:", error);
      
      if (error.message === "User not found") {
        return res.status(404).json({ success: false, message: "User not found" });
      }

      if (error.message === "User does not belong to the specified vendor") {
        return res.status(403).json({
          success: false,
          message: "Access denied: User does not belong to the specified vendor",
        });
      }

      return res.status(500).json({
        success: false,
        message: "Failed to fetch stats",
        error: error.message,
      });
    }
  }
}