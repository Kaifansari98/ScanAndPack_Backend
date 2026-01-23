import { Router } from "express";
import {
  createVendor,
  getAllVendors,
  getVendorStatusTypesController,
  getVendorUsersController,
} from "../controllers/vendor.controller";

const router = Router();

router.post("/", createVendor);
router.get("/", getAllVendors);
router.get("/vendor-users", getVendorUsersController);
router.get("/status-types", getVendorStatusTypesController);

export default router;
