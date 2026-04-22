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
DashboardRouter.get(
  "/lead-status-wise-counts", 
  dashboardController.getLeadStatusWiseCounts);
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
DashboardRouter.get(
  "/sales-executive/post-booking-stage-leads",
  dashboardController.getSalesExecutivePostBookingStageLeads
);
DashboardRouter.get(
  "/sales-executive/all-stage-leads",
  dashboardController.getSalesExecutiveAllStageLeads
);
DashboardRouter.get(
  "/sales-executive/activity-status-counts",
  dashboardController.getSalesExecutiveActivityStatusCounts
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
DashboardRouter.get(
  "/admin/stage-counts",
  dashboardController.getAdminStageCounts
);
DashboardRouter.get(
  "/admin/all-stage-leads",
  dashboardController.getAdminAllStageLeads
);
DashboardRouter.get(
  "/admin/active-franchisee-count",
  dashboardController.getActiveFranchiseeCount
);
DashboardRouter.get(
  "/admin/leads-this-month",
  dashboardController.getLeadsThisMonth
);
DashboardRouter.get(
  "/admin/leads-by-franchise",
  dashboardController.getLeadsByFranchise
);
DashboardRouter.get(
  "/admin/overdue-projects-count",
  dashboardController.getOverdueProjectsCount
);
DashboardRouter.get(
  "/admin/overdue-installations",
  dashboardController.getOverdueInstallations
);
DashboardRouter.get(
  "/admin/franchise-performance",
  dashboardController.getFranchisePerformance
);
DashboardRouter.get(
  "/admin/avg-days-per-stage",
  dashboardController.getAvgDaysPerStage
);
DashboardRouter.get(
  "/admin/stage-wise-counts",
  dashboardController.getStageWiseCounts
);
DashboardRouter.get(
  "/admin/stage-leads",
  dashboardController.getStageLeads
);
DashboardRouter.get(
  "/admin/franchise-leads",
  dashboardController.getFranchiseLeads
);

export default DashboardRouter;
