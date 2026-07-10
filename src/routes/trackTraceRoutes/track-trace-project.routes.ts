import { Router } from "express";
import {
  createProjectController,
  searchTrackTraceLeadsController,
  getTrackTraceVendorConfigController,
  getTrackTraceProjectController,
  updateTrackTraceProjectController

} from "../../../src/controllers/trackTraceController/track-trace-project.controller";
import { uploadProjectExcel } from "../../middlewares/uploadWasabi";

const router = Router();

router.get(
  "/onboard/:vendor_id/leads",
  searchTrackTraceLeadsController
);

router.post(
  "/onboard/create-project",
  uploadProjectExcel.single("file"),
  createProjectController
);

router.get(
  "/onboard/:vendor_id/config",
  getTrackTraceVendorConfigController
);

router.get(
  "/onboard/project/:unique_project_id",
  getTrackTraceProjectController
);

router.put(
  "/onboard/project/:unique_project_id",
  uploadProjectExcel.single("file"),
  updateTrackTraceProjectController
);

export default router;