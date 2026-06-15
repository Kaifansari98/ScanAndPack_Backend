import { Router } from "express";
import {
  createProjectController,
  searchTrackTraceLeadsController,
  getTrackTraceVendorConfigController,

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

export default router;