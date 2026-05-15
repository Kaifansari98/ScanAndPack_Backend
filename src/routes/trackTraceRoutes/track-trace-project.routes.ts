import { Router } from "express";
import {
  createProjectController,
  searchTrackTraceLeadsController,
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

export default router;