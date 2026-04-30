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
DashboardRouter.get(
  "/site-supervisor/avg-days-to-installation",
  dashboardController.getSiteSupervisorAvgDaysToInstallation
);
DashboardRouter.get(
  "/site-supervisor/misc-items",
  dashboardController.getSiteSupervisorMiscItems
);
DashboardRouter.get(
  "/site-supervisor/upcoming-sites",
  dashboardController.getSiteSupervisorUpcomingSites
);
DashboardRouter.get(
  "/site-supervisor/supervisor-leads",
  dashboardController.getSupervisorLeads
);
DashboardRouter.get(
  "/site-supervisor/service-counts",
  dashboardController.getSiteSupervisorServiceCounts
);
DashboardRouter.get(
  "/site-supervisor/pending-services",
  dashboardController.getSiteSupervisorPendingServices
);

// Admin
DashboardRouter.get(
  "/admin/projects-overview",
  dashboardController.getProjectsOverview
);
DashboardRouter.get(
  "/admin/completed-overview",
  dashboardController.getCompletedOverview
);
DashboardRouter.get(
  "/admin/lost-approval-overview",
  dashboardController.getLostApprovalOverview
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
  "/admin/overdue-production-count",
  dashboardController.getOverdueProductionCount
);
DashboardRouter.get(
  "/admin/overdue-production",
  dashboardController.getOverdueProduction
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
DashboardRouter.get(
  "/admin/priority-leads",
  dashboardController.getPriorityLeadCounts
);
DashboardRouter.get(
  "/admin/lost-approval-leads",
  dashboardController.getAdminLostApprovalLeads
);
DashboardRouter.get(
  "/admin/task-overview",
  dashboardController.getAdminTaskOverview
);

// Backend User
DashboardRouter.get("/backend/new-order-login-leads", dashboardController.getBackendNewOrderLoginLeads);
DashboardRouter.get("/backend/avg-ol-to-production", dashboardController.getBackendAvgOLToProduction);

// Pre-Prod
DashboardRouter.get("/pre-prod/new-sites", dashboardController.getPreProdNewSites);
DashboardRouter.get("/pre-prod/avg-timeline", dashboardController.getPreProdAvgTimeline);

// Factory
DashboardRouter.get(
  "/factory/lead-bifurcation",
  dashboardController.getFactoryLeadBifurcation
);
DashboardRouter.get(
  "/factory/avg-production-to-rtd",
  dashboardController.getFactoryAvgProductionToRTD
);
DashboardRouter.get(
  "/factory/erd-calendar",
  dashboardController.getFactoryERDCalendar
);
DashboardRouter.get(
  "/factory/upcoming-dispatches",
  dashboardController.getFactoryUpcomingDispatches
);

export default DashboardRouter;
