import { Router } from "express";
import {
  createVendor,
  getAllVendors,
  getVendorByIdController,
  getErdReportController,
  getLeadTrackingReportController,
  getLeadsOverviewReportController,
  getPaymentsBetweenClientAndStoreReportController,
  getSelfAssignTaskTypesController,
  getTechCheckStageReportController,
  getVendorStatusTypesController,
  getVendorUsersController,
  onboardVendorController,
  seedVendorMastersController,
} from "../controllers/vendor.controller";
import { verifyToken } from "../middlewares/auth.middleware";

const router = Router();

router.post("/", createVendor);
router.post("/onboard", onboardVendorController);
router.post("/seed-masters", seedVendorMastersController);
router.get("/", verifyToken, getAllVendors);
router.get("/vendor-users", getVendorUsersController);
router.get("/status-types", getVendorStatusTypesController);
router.get("/self-assign-task-types", getSelfAssignTaskTypesController);
router.get("/reports/leads-overview", getLeadsOverviewReportController);
router.get("/reports/lead-tracking", getLeadTrackingReportController);
router.get("/reports/techcheck-stage", getTechCheckStageReportController);
router.get(
  "/reports/payments-between-client-and-store",
  getPaymentsBetweenClientAndStoreReportController,
);
router.get("/reports/erd", getErdReportController);
router.get("/:vendor_id", verifyToken, getVendorByIdController);

export default router;
