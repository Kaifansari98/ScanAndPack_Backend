import { Router } from "express";
import {
  createVendor,
  getAllVendors,
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

export default router;
