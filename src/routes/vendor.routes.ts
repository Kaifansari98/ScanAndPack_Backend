import { Router } from "express";
import {
  createVendor,
  getAllVendors,
  getErdReportController,
  getLeadsOverviewReportController,
  getTechCheckStageReportController,
  getVendorStatusTypesController,
  getVendorUsersController,
  onboardVendorController,
  seedVendorMastersController,
} from "../controllers/vendor.controller";

const router = Router();

router.post("/", createVendor);
router.post("/onboard", onboardVendorController);
router.post("/seed-masters", seedVendorMastersController);
router.get("/", getAllVendors);
router.get("/vendor-users", getVendorUsersController);
router.get("/status-types", getVendorStatusTypesController);
router.get("/reports/leads-overview", getLeadsOverviewReportController);
router.get("/reports/techcheck-stage", getTechCheckStageReportController);
router.get("/reports/erd", getErdReportController);

export default router;
