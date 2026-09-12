import { Router } from "express";
import {
  createProjectController,
  searchTrackTraceLeadsController,
  getTrackTraceVendorConfigController,
  getTrackTraceProjectController,
  updateTrackTraceProjectController,
  getActiveMachinesByVendorController,
  getPackagingProjectContextController,
  downloadMultiLocationTemplateController,
} from "../../../src/controllers/trackTraceController/track-trace-project.controller";
import {
  uploadLocationExcel,
  uploadProjectExcel,
} from "../../middlewares/uploadWasabi";
import {
  getProjectLocationsController,
  importProjectLocationsExcelController,
  saveProjectLocationsController,
} from "../../controllers/trackTraceController/project-location.controller";

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
  "/onboard/:vendor_id/machines",
  getActiveMachinesByVendorController
);

router.get(
  "/onboard/:vendor_id/packaging-project/:project_id",
  getPackagingProjectContextController,
);

router.get(
  "/onboard/project/:unique_project_id/multi-location-template",
  downloadMultiLocationTemplateController
);

router.get(
  "/onboard/project/:unique_project_id/locations",
  getProjectLocationsController
);

router.put(
  "/onboard/project/:unique_project_id/locations",
  saveProjectLocationsController
);

router.post(
  "/onboard/project/:unique_project_id/locations/import",
  uploadLocationExcel.single("file"),
  importProjectLocationsExcelController
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
