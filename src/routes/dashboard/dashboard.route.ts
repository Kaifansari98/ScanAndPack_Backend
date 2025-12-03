import { Router } from "express";
import { DashboardController } from "../../controllers/dashboard/dashboard.controller";

const DashboardRouter = Router();
const dashboardController = new DashboardController();

// Sales Executive
DashboardRouter.get(
  "/sales-executive/tasks",
  dashboardController.getSalesExecutiveTaskStats
);
DashboardRouter.get(
  "/sales-executive/performance-snapshot",
  dashboardController.getPerformanceSnapshot
);
DashboardRouter.get("/lead-status-wise-counts", dashboardController.getLeadStatusWiseCounts);
DashboardRouter.get(
  "/avg-days-to-convert-lead-to-booking",
  dashboardController.getAvgDaysToConvertLeadToBooking
);
DashboardRouter.get(
  "/sales-executive/stage-counts",
  dashboardController.getSalesExecutiveStageCounts
);
DashboardRouter.get(
  "/sales-executive/stage-leads",
  dashboardController.getSalesExecutiveStageLeads
);

// Admin
DashboardRouter.get(
  "/admin/projects-overview",
  dashboardController.getProjectsOverview
);
DashboardRouter.get(
  "/admin/orders-in-pipeline",
  dashboardController.getOrdersInPipeline
);
DashboardRouter.get(
  "/admin/total-revenue",
  dashboardController.getTotalRevenue
);


export default DashboardRouter;
