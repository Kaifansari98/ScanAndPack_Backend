import { Router } from "express";
import { SiteReadinessController } from "../../../controllers/installation/site-readiness/SiteReadiness.controller";
import { uploadSiteReadinessPhotos } from "../../../middlewares/uploadWasabi";
import { handleMulterUpload } from "../../../middlewares/handleMulterUpload";

const siteReadinessRoutes = Router();
const controller = new SiteReadinessController();

// ✅ GET → Fetch all Site Readiness leads (paginated)
siteReadinessRoutes.get(
  "/vendorId/:vendorId/userId/:userId",
  controller.getAllSiteReadinessLeads
);

// ✅ Create new Site Readiness record(s)
siteReadinessRoutes.post(
  "/vendorId/:vendorId/leadId/:leadId/create",
  controller.createSiteReadiness
);

// ✅ GET → Fetch all Site Readiness records (optional filters)
siteReadinessRoutes.get(
  "/vendorId/:vendorId/all",
  controller.getSiteReadinessRecords
);

// ✅ PUT → Update Site Readiness record(s)
siteReadinessRoutes.put(
  "/vendorId/:vendorId/leadId/:leadId/update",
  controller.updateSiteReadiness
);

// ✅ POST → Upload Current Site Photos at Site Readiness
siteReadinessRoutes.post(
  "/vendorId/:vendorId/leadId/:leadId/upload-current-site-photos",
  handleMulterUpload(uploadSiteReadinessPhotos.array("files")), // accept multiple images
  controller.uploadCurrentSitePhotosAtSiteReadiness
);

// ✅ GET → Fetch Current Site Photos at Site Readiness
siteReadinessRoutes.get(
  "/vendorId/:vendorId/leadId/:leadId/current-site-photos",
  controller.getCurrentSitePhotosAtSiteReadiness
);

// ✅ GET → Check if Site Readiness is completed
siteReadinessRoutes.get(
  "/vendorId/:vendorId/leadId/:leadId/is-site-readiness-completed",
  controller.checkSiteReadinessCompletion
);

// ✅ GET → Fetch assigned Site Supervisor for a lead
siteReadinessRoutes.get(
  "/vendorId/:vendorId/leadId/:leadId/site-supervisor",
  controller.getAssignedSiteSupervisor
);

// ✅ Move Lead to Dispatch Planning Stage
siteReadinessRoutes.put(
  "/vendorId/:vendorId/leadId/:leadId/move-to-dispatch-planning",
  controller.moveLeadToDispatchPlanning
);

export default siteReadinessRoutes;
