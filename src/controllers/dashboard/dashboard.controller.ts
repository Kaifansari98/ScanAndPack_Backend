import { Request, Response } from "express";
import { DashboardService } from "../../services/dashboard/dashboard.service";
import { cache } from "../../utils/cache";
import logger from "../../utils/logger";

const dashboardService = new DashboardService();

export class DashboardController {
  async getSalesExecutiveTaskStats(req: Request, res: Response) {
    try {
      const vendor_id = Number(req.query.vendor_id);
      const user_id = Number(req.query.user_id);

      if (!vendor_id || !user_id) {
        return res.status(400).json({
          message: "vendor_id and user_id are required",
        });
      }

      const result = await dashboardService.getSalesExecutiveTaskStats(
        vendor_id,
        user_id
      );

      return res.json(result);
    } catch (error) {
      console.error("Dashboard Error:", error);
      return res.status(500).json({ message: "Server error" });
    }
  }

  public getPerformanceSnapshot = async (req: Request, res: Response) => {
    try {
      const vendor_id = Number(req.query.vendor_id);
      const user_id = Number(req.query.user_id);

      if (!vendor_id || !user_id) {
        return res.status(400).json({
          success: false,
          message: "vendor_id and user_id are required",
        });
      }

      const redisKey = `performance:snapshot:${vendor_id}:${user_id}`;

      // ⭐ Check cache
      const cached = await cache.get(redisKey);

      if (cached) {
        logger.info("🔥 Performance Snapshot served from Redis Cache");
        return res.status(200).json({
          success: true,
          fromCache: true, // <--- 👈 ADD THIS
          data: JSON.parse(cached as string),
        });
      }

      // Fetch fresh data
      const snapshot = await dashboardService.getPerformanceSnapshot(
        vendor_id,
        user_id
      );

      // Store in cache (10 minutes)
      await cache.set(redisKey, JSON.stringify(snapshot), 1);

      return res.status(200).json({
        success: true,
        fromCache: false, // <--- 👈 ADD THIS
        data: snapshot,
      });
    } catch (error: any) {
      logger.error("❌ Performance Snapshot Error:", error);
      return res.status(500).json({
        success: false,
        message:
          error.message || "Internal server error while fetching snapshot",
      });
    }
  };

  public getLeadStatusWiseCounts = async (req: Request, res: Response) => {
    try {
      const vendor_id = Number(req.query.vendor_id);
      const user_id = req.query.user_id ? Number(req.query.user_id) : undefined;

      if (!vendor_id) {
        return res.status(400).json({
          success: false,
          message: "vendor_id is required",
        });
      }

      const result = await dashboardService.getLeadStatusWiseCounts(
        vendor_id,
        user_id
      );

      return res.status(200).json({
        success: true,
        fromCache: result.fromCache,
        mode: user_id ? "my_leads" : "overall_leads",
        data: result.data,
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  };

  public getAvgDaysToConvertLeadToBooking = async (
    req: Request,
    res: Response
  ) => {
    try {
      const vendor_id = Number(req.query.vendor_id);
      const user_id = Number(req.query.user_id);

      if (!vendor_id || !user_id) {
        return res.status(400).json({
          success: false,
          message: "vendor_id and user_id are required",
        });
      }

      const result = await dashboardService.calculateAvgDaysToBooking(
        vendor_id,
        user_id,
        false
      );

      return res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        message: error.message || "Internal server error",
      });
    }
  };
}
