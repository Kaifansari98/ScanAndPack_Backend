import { Router } from "express";
import { getVendorLeadsController, applyConfigurationController, getVendorLeadsControllerPost } from "../../../src/controllers/trackTraceController/configure.controller";

const router = Router();

/**
 * GET Vendor Leads via token + project
 */
router.get(
  "/project/:token/:projectId",
  getVendorLeadsController
);

router.post(
  "/project/:token/:projectId/leads",
  getVendorLeadsControllerPost
);



router.post(
  "/apply",
  applyConfigurationController
);
export default router;