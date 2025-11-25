import { Router } from "express";
import { ReadyToDispatchController } from "../../../controllers/leadModuleControllers/production/ready-to-dispatch/ReadyToDispatch.controller";
import { upload } from "../../../middlewares/uploadWasabi";

const readyToDispatchRoutes = Router();
const controller = new ReadyToDispatchController();

// ✅ GET → Fetch all Ready-To-Dispatch leads (paginated)
readyToDispatchRoutes.get(
  "/vendorId/:vendorId/userId/:userId",
  controller.getAllReadyToDispatchLeads
);

// ✅ POST → Upload Current Site Photos at Ready-To-Dispatch
readyToDispatchRoutes.post(
  "/vendorId/:vendorId/leadId/:leadId/upload-current-site-photos",
  upload.array("files", 10), // accept up to 10 images
  controller.uploadCurrentSitePhotosAtReadyToDispatch
);

// ✅ Fetch Current Site Photos (Ready-To-Dispatch)
readyToDispatchRoutes.get(
  "/vendorId/:vendorId/leadId/:leadId/current-site-photos",
  controller.getCurrentSitePhotosAtReadyToDispatch
);

readyToDispatchRoutes.get(
  "/vendorId/:vendorId/leadId/:leadId/current-site-photos/count",
  controller.getCurrentSitePhotosCountAtReadyToDispatch
);

// ✅ Assign Site Readiness Task
readyToDispatchRoutes.post(
  "/leadId/:leadId/tasks/assign-site-readiness",
  controller.assignTaskSiteReadiness
);

export default readyToDispatchRoutes;
