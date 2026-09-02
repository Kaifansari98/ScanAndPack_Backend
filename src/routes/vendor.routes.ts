import { Router } from "express";
import {
  createVendor,
  getAllVendors,
  getVendorByIdController,
  getErdReportController,
  getLeadTrackingReportController,
  getLeadsOverviewReportController,
  getFastProductionReportController,
  getPaymentsBetweenClientAndStoreReportController,
  getSelfAssignTaskTypesController,
  getTechCheckStageReportController,
  getVendorStatusTypesController,
  getVendorUsersController,
  onboardVendorController,
  seedVendorMastersController,
  updateVendorController,
  getVendorBySubdomainController,
  getStatesController,
  getLeadServicingReportController
} from "../controllers/vendor.controller";
import { verifyToken } from "../middlewares/auth.middleware";
import { handleMulterUpload } from "../middlewares/handleMulterUpload";
import { uploadVendorAssets } from "../middlewares/uploadWasabi";

const router = Router();

const vendorUploadFields = uploadVendorAssets.fields([
  { name: "logo", maxCount: 1 },
  { name: "icon", maxCount: 1 },
  { name: "login_image", maxCount: 1 },
]);

router.post("/", handleMulterUpload(vendorUploadFields), createVendor);
router.post("/onboard", handleMulterUpload(vendorUploadFields), onboardVendorController);
router.patch("/:vendor_id", verifyToken, handleMulterUpload(vendorUploadFields), updateVendorController);
router.post("/seed-masters", seedVendorMastersController);
router.get("/", verifyToken, getAllVendors);
router.get("/vendor-users", getVendorUsersController);
router.get("/status-types", getVendorStatusTypesController);
router.get("/self-assign-task-types", getSelfAssignTaskTypesController);
router.get("/reports/leads-overview", getLeadsOverviewReportController);
router.get("/reports/fast-production", getFastProductionReportController);
router.get("/reports/lead-tracking", getLeadTrackingReportController);
router.get("/reports/techcheck-stage", getTechCheckStageReportController);
router.get(
  "/reports/payments-between-client-and-store",
  getPaymentsBetweenClientAndStoreReportController,
);
router.get("/reports/erd", getErdReportController);
router.get("/reports/lead-servicing", getLeadServicingReportController);
router.get("/public/by-subdomain", getVendorBySubdomainController);
router.get("/states", verifyToken, getStatesController);
router.get("/:vendor_id", verifyToken, getVendorByIdController);

export default router;
