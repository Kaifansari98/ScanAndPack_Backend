import { Router } from "express";
import { metaLeadsDashboardController } from "../controllers/leadModuleControllers/metaLeadsDashboard.controller";

const router = Router();

// Dashboard list and export (put export before details route to avoid parameter conflicts)
router.get("/", metaLeadsDashboardController.fetchLeads);
router.get("/export", metaLeadsDashboardController.exportLeadsCsv);

// Lead details, status update, and deletion
router.get("/:id", metaLeadsDashboardController.fetchLeadById);
router.patch("/:id/status", metaLeadsDashboardController.updateLeadStatus);
router.delete("/:id", metaLeadsDashboardController.deleteLead);

export default router;
