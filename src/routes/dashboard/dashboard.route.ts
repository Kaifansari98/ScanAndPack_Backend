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

export default DashboardRouter;
