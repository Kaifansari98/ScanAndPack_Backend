import { Router } from "express";
import { DashboardController } from "../../controllers/dashboard/dashboard.controller";

const DashboardRouter = Router();
const dashboardController = new DashboardController();

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

export default DashboardRouter;
