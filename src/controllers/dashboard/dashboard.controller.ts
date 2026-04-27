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
      const franchise_id = req.query.franchise_id ? Number(req.query.franchise_id) : undefined;

      if (!vendor_id || !user_id) {
        return res.status(400).json({
          success: false,
          message: "vendor_id and user_id are required",
        });
      }

      const redisKey = `performance:snapshot:${vendor_id}:${user_id}:${franchise_id ?? "all"}`;

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
        user_id,
        franchise_id
      );

      // Store in cache (10 minutes)
      await cache.set(redisKey, JSON.stringify(snapshot), 600);

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
      const franchise_id = req.query.franchise_id ? Number(req.query.franchise_id) : undefined;

      if (!vendor_id || !user_id) {
        return res.status(400).json({
          success: false,
          message: "vendor_id and user_id are required",
        });
      }

      const result = await dashboardService.calculateAvgDaysToBooking(
        vendor_id,
        user_id,
        false,
        franchise_id
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

  public getSiteSupervisorServiceCounts = async (req: Request, res: Response) => {
    try {
      const vendor_id = Number(req.query.vendor_id);
      const user_id = Number(req.query.user_id);
      if (!vendor_id || !user_id) {
        return res.status(400).json({ success: false, message: "vendor_id and user_id are required" });
      }
      const result = await dashboardService.getSiteSupervisorServiceCounts(vendor_id, user_id);
      return res.status(200).json({ success: true, data: result });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message || "Internal server error" });
    }
  };

  public getSiteSupervisorUpcomingSites = async (req: Request, res: Response) => {
    try {
      const vendor_id = Number(req.query.vendor_id);
      const user_id = Number(req.query.user_id);

      if (!vendor_id || !user_id) {
        return res.status(400).json({ success: false, message: "vendor_id and user_id are required" });
      }

      const result = await dashboardService.getSiteSupervisorUpcomingSites(vendor_id, user_id);
      return res.status(200).json({ success: true, data: result });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message || "Internal server error" });
    }
  };

  public getSiteSupervisorMiscItems = async (req: Request, res: Response) => {
    try {
      const vendor_id = Number(req.query.vendor_id);
      const user_id = Number(req.query.user_id);

      if (!vendor_id || !user_id) {
        return res.status(400).json({ success: false, message: "vendor_id and user_id are required" });
      }

      const result = await dashboardService.getSiteSupervisorMiscItems(vendor_id, user_id);
      return res.status(200).json({ success: true, data: result });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message || "Internal server error" });
    }
  };

  public getSiteSupervisorAvgDaysToInstallation = async (req: Request, res: Response) => {
    try {
      const vendor_id = Number(req.query.vendor_id);
      const user_id = Number(req.query.user_id);

      if (!vendor_id || !user_id) {
        return res.status(400).json({
          success: false,
          message: "vendor_id and user_id are required",
        });
      }

      const result = await dashboardService.getSiteSupervisorAvgDaysToInstallation(vendor_id, user_id);

      return res.status(200).json({ success: true, data: result });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message || "Internal server error" });
    }
  };

  public getProjectsOverview = async (req: Request, res: Response) => {
    try {
      const vendor_id = Number(req.query.vendor_id);
      const franchise_id = req.query.franchise_id ? Number(req.query.franchise_id) : undefined;

      if (!vendor_id) {
        return res.status(400).json({
          success: false,
          message: "vendor_id is required",
        });
      }

      const data = await dashboardService.getProjectsOverview(vendor_id, franchise_id);

      return res.status(200).json({
        success: true,
        data,
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        message: error.message || "Internal server error",
      });
    }
  };

  public getCompletedOverview = async (req: Request, res: Response) => {
    try {
      const vendor_id = Number(req.query.vendor_id);
      const franchise_id = req.query.franchise_id ? Number(req.query.franchise_id) : undefined;

      if (!vendor_id) {
        return res.status(400).json({
          success: false,
          message: "vendor_id is required",
        });
      }

      const data = await dashboardService.getCompletedOverview(vendor_id, franchise_id);

      return res.status(200).json({
        success: true,
        data,
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        message: error.message || "Internal server error",
      });
    }
  };

  public getLostApprovalOverview = async (req: Request, res: Response) => {
    try {
      const vendor_id = Number(req.query.vendor_id);
      const franchise_id = req.query.franchise_id ? Number(req.query.franchise_id) : undefined;

      if (!vendor_id) {
        return res.status(400).json({
          success: false,
          message: "vendor_id is required",
        });
      }

      const data = await dashboardService.getLostApprovalOverview(vendor_id, franchise_id);

      return res.status(200).json({
        success: true,
        data,
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        message: error.message || "Internal server error",
      });
    }
  };

  public getOrdersInPipeline = async (req: Request, res: Response) => {
    try {
      const vendor_id = Number(req.query.vendor_id);

      if (!vendor_id) {
        return res.status(400).json({
          success: false,
          message: "vendor_id is required",
        });
      }

      const data = await dashboardService.getOrdersInPipeline(vendor_id);

      return res.status(200).json({
        success: true,
        data,
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        message: error.message || "Internal server error",
      });
    }
  };

  public getTotalRevenue = async (req: Request, res: Response) => {
    try {
      const vendor_id = Number(req.query.vendor_id);
      const franchise_id = req.query.franchise_id ? Number(req.query.franchise_id) : undefined;

      if (!vendor_id) {
        return res.status(400).json({
          success: false,
          message: "vendor_id is required",
        });
      }

      const data = await dashboardService.getTotalRevenue(vendor_id, franchise_id);

      return res.status(200).json({
        success: true,
        data,
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        message: error.message || "Internal server error",
      });
    }
  };

  public getAdminStageCounts = async (req: Request, res: Response) => {
    try {
      const vendor_id = Number(req.query.vendor_id);
      const franchise_id = req.query.franchise_id ? Number(req.query.franchise_id) : undefined;

      if (!vendor_id) {
        return res.status(400).json({
          success: false,
          message: "vendor_id is required",
        });
      }

      const data = await dashboardService.getAdminStageCounts(vendor_id, franchise_id);

      return res.status(200).json({
        success: true,
        data,
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        message: error.message || "Internal server error",
      });
    }
  };

  public getPriorityLeadCounts = async (req: Request, res: Response) => {
    try {
      const vendor_id = Number(req.query.vendor_id);
      const franchise_id = req.query.franchise_id ? Number(req.query.franchise_id) : undefined;

      if (!vendor_id) {
        return res.status(400).json({ success: false, message: "vendor_id is required" });
      }

      const data = await dashboardService.getPriorityLeadCounts(vendor_id, franchise_id);
      return res.status(200).json({ success: true, data });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message || "Internal server error" });
    }
  };

  public getAdminLostApprovalLeads = async (req: Request, res: Response) => {
    try {
      const vendor_id = Number(req.query.vendor_id);
      const franchise_id = req.query.franchise_id ? Number(req.query.franchise_id) : undefined;

      if (!vendor_id) {
        return res.status(400).json({ success: false, message: "vendor_id is required" });
      }

      const data = await dashboardService.getAdminLostApprovalLeads(vendor_id, franchise_id);
      return res.status(200).json({ success: true, data });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message || "Internal server error" });
    }
  };

  public getAdminTaskOverview = async (req: Request, res: Response) => {
    try {
      const vendor_id = Number(req.query.vendor_id);
      const franchise_id = req.query.franchise_id ? Number(req.query.franchise_id) : undefined;
      const sales_executive_id = req.query.sales_executive_id
        ? Number(req.query.sales_executive_id)
        : undefined;
      const page = req.query.page ? Number(req.query.page) : 1;
      const limit = req.query.limit ? Number(req.query.limit) : 20;
      const search = req.query.search ? String(req.query.search) : "";
      const status = req.query.status ? String(req.query.status) : undefined;
      const overview = req.query.overview ? String(req.query.overview) : undefined;

      if (!vendor_id) {
        return res.status(400).json({ success: false, message: "vendor_id is required" });
      }

      const data = await dashboardService.getAdminTaskOverview(
        vendor_id,
        franchise_id,
        sales_executive_id,
        page,
        limit,
        search,
        status,
        overview
      );
      return res.status(200).json({ success: true, data });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message || "Internal server error" });
    }
  };

  public getSalesExecutiveStageCounts = async (
    req: Request,
    res: Response
  ) => {
    try {
      const vendor_id = Number(req.query.vendor_id);
      const user_id = Number(req.query.user_id);
      const franchise_id = req.query.franchise_id ? Number(req.query.franchise_id) : undefined;

      if (!vendor_id || !user_id) {
        return res.status(400).json({
          success: false,
          message: "vendor_id and user_id are required",
        });
      }

      const data = await dashboardService.getSalesExecutiveStageCounts(
        vendor_id,
        user_id,
        franchise_id
      );

      return res.status(200).json({
        success: true,
        data,
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        message: error.message || "Internal server error",
      });
    }
  };

  public getSalesExecutiveStageLeads = async (
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

      const data = await dashboardService.getSalesExecutiveStageLeads(
        vendor_id,
        user_id
      );

      return res.status(200).json({
        success: true,
        data,
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        message: error.message || "Internal server error",
      });
    }
  };

  public getSalesExecutivePostBookingStageLeads = async (
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

      const data = await dashboardService.getSalesExecutivePostBookingStageLeads(
        vendor_id,
        user_id
      );

      return res.status(200).json({
        success: true,
        data,
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        message: error.message || "Internal server error",
      });
    }
  };

  public getSalesExecutiveAllStageLeads = async (
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

      const data = await dashboardService.getSalesExecutiveAllStageLeads(
        vendor_id,
        user_id
      );

      return res.status(200).json({
        success: true,
        data,
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        message: error.message || "Internal server error",
      });
    }
  };

  public getSalesExecutiveActivityStatusCounts = async (
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

      const data = await dashboardService.getSalesExecutiveActivityStatusCounts(
        vendor_id,
        user_id
      );

      return res.status(200).json({
        success: true,
        data,
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        message: error.message || "Internal server error",
      });
    }
  };

  public getAvgDaysPerStage = async (req: Request, res: Response) => {
    try {
      const vendor_id = Number(req.query.vendor_id);
      const franchise_id = req.query.franchise_id ? Number(req.query.franchise_id) : undefined;

      if (!vendor_id) {
        return res.status(400).json({ success: false, message: "vendor_id is required" });
      }

      const data = await dashboardService.getAvgDaysPerStage(vendor_id, franchise_id);

      return res.status(200).json({ success: true, data });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message || "Internal server error" });
    }
  };

  public getFranchisePerformance = async (req: Request, res: Response) => {
    try {
      const vendor_id = Number(req.query.vendor_id);

      if (!vendor_id) {
        return res.status(400).json({ success: false, message: "vendor_id is required" });
      }

      const data = await dashboardService.getFranchisePerformance(vendor_id);

      return res.status(200).json({ success: true, data });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message || "Internal server error" });
    }
  };

  public getOverdueProjectsCount = async (req: Request, res: Response) => {
    try {
      const vendor_id = Number(req.query.vendor_id);

      if (!vendor_id) {
        return res.status(400).json({ success: false, message: "vendor_id is required" });
      }

      const data = await dashboardService.getOverdueProjectsCount(vendor_id);

      return res.status(200).json({ success: true, data });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message || "Internal server error" });
    }
  };

  public getLeadsByFranchise = async (req: Request, res: Response) => {
    try {
      const vendor_id = Number(req.query.vendor_id);

      if (!vendor_id) {
        return res.status(400).json({ success: false, message: "vendor_id is required" });
      }

      const data = await dashboardService.getLeadsByFranchise(vendor_id);

      return res.status(200).json({ success: true, data });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message || "Internal server error" });
    }
  };

  public getLeadsThisMonth = async (req: Request, res: Response) => {
    try {
      const vendor_id = Number(req.query.vendor_id);

      if (!vendor_id) {
        return res.status(400).json({ success: false, message: "vendor_id is required" });
      }

      const data = await dashboardService.getLeadsThisMonth(vendor_id);

      return res.status(200).json({ success: true, data });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message || "Internal server error" });
    }
  };

  public getOverdueInstallations = async (req: Request, res: Response) => {
    try {
      const vendor_id = Number(req.query.vendor_id);
      const franchise_id = req.query.franchise_id ? Number(req.query.franchise_id) : undefined;

      if (!vendor_id) {
        return res.status(400).json({ success: false, message: "vendor_id is required" });
      }

      const data = await dashboardService.getOverdueInstallations(vendor_id, franchise_id);
      return res.status(200).json({ success: true, data });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message || "Internal server error" });
    }
  };

  public getOverdueProductionCount = async (req: Request, res: Response) => {
    try {
      const vendor_id = Number(req.query.vendor_id);
      if (!vendor_id) {
        return res.status(400).json({ success: false, message: "vendor_id is required" });
      }
      const data = await dashboardService.getOverdueProductionCount(vendor_id);
      return res.status(200).json({ success: true, data });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message || "Internal server error" });
    }
  };

  public getOverdueProduction = async (req: Request, res: Response) => {
    try {
      const vendor_id = Number(req.query.vendor_id);
      const franchise_id = req.query.franchise_id ? Number(req.query.franchise_id) : undefined;
      if (!vendor_id) {
        return res.status(400).json({ success: false, message: "vendor_id is required" });
      }
      const data = await dashboardService.getOverdueProduction(vendor_id, franchise_id);
      return res.status(200).json({ success: true, data });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message || "Internal server error" });
    }
  };

  public getFranchiseLeads = async (req: Request, res: Response) => {
    try {
      const vendor_id = Number(req.query.vendor_id);
      const franchise_id = Number(req.query.franchise_id);

      if (!vendor_id || !franchise_id) {
        return res.status(400).json({ success: false, message: "vendor_id and franchise_id are required" });
      }

      const data = await dashboardService.getFranchiseLeads(vendor_id, franchise_id);
      return res.status(200).json({ success: true, data });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message || "Internal server error" });
    }
  };

  public getStageLeads = async (req: Request, res: Response) => {
    try {
      const vendor_id = Number(req.query.vendor_id);
      const tag = req.query.tag as string;
      const franchise_id = req.query.franchise_id ? Number(req.query.franchise_id) : undefined;

      if (!vendor_id || !tag) {
        return res.status(400).json({ success: false, message: "vendor_id and tag are required" });
      }

      const data = await dashboardService.getStageLeads(vendor_id, tag, franchise_id);
      return res.status(200).json({ success: true, data });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message || "Internal server error" });
    }
  };

  public getStageWiseCounts = async (req: Request, res: Response) => {
    try {
      const vendor_id = Number(req.query.vendor_id);
      const franchise_id = req.query.franchise_id ? Number(req.query.franchise_id) : undefined;

      if (!vendor_id) {
        return res.status(400).json({ success: false, message: "vendor_id is required" });
      }

      const data = await dashboardService.getStageWiseCounts(vendor_id, franchise_id);
      return res.status(200).json({ success: true, data });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message || "Internal server error" });
    }
  };

  public getActiveFranchiseeCount = async (req: Request, res: Response) => {
    try {
      const vendor_id = Number(req.query.vendor_id);

      if (!vendor_id) {
        return res.status(400).json({ success: false, message: "vendor_id is required" });
      }

      const data = await dashboardService.getActiveFranchiseeCount(vendor_id);

      return res.status(200).json({ success: true, data });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message || "Internal server error" });
    }
  };

  public getAdminAllStageLeads = async (req: Request, res: Response) => {
    try {
      const vendor_id = Number(req.query.vendor_id);
      const franchise_id = req.query.franchise_id ? Number(req.query.franchise_id) : undefined;

      if (!vendor_id) {
        return res.status(400).json({
          success: false,
          message: "vendor_id is required",
        });
      }

      const data = await dashboardService.getAdminAllStageLeads(vendor_id, franchise_id);

      return res.status(200).json({
        success: true,
        data,
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        message: error.message || "Internal server error",
      });
    }
  };
}
