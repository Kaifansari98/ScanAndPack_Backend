import { Request, Response } from "express";
import { LeadStatsService } from "../../services/generic/leadStats.service";

export class LeadStatsController {
  static async getStats(req: Request, res: Response) {
    try {
      const vendorId = Number(req.params.vendorId);

      if (isNaN(vendorId)) {
        return res.status(400).json({ success: false, message: "Invalid vendorId" });
      }

      const stats = await LeadStatsService.getVendorLeadStats(vendorId);

      return res.status(200).json({
        success: true,
        data: stats,
      });
    } catch (error: any) {
      console.error("[LeadStatsController] Error:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to fetch stats",
        error: error.message,
      });
    }
  }
}