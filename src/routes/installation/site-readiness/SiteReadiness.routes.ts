import { Router } from "express";
import { SiteReadinessController } from "../../../controllers/installation/site-readiness/SiteReadiness.controller";

const siteReadinessRoutes = Router();
const controller = new SiteReadinessController();

// ✅ GET → Fetch all Site Readiness leads (paginated)
siteReadinessRoutes.get(
  "/vendorId/:vendorId/userId/:userId",
  controller.getAllSiteReadinessLeads
);

export default siteReadinessRoutes;