import { Router } from "express";
import {
  createFranchiseController,
  getFranchisesByVendorIdController,
  createHeadSiteSupervisorFranchiseMappingController,
  updateHeadSiteSupervisorFranchiseMappingStatusController,
  getHeadSiteSupervisorFranchiseMappingController,
  getSiteSupervisorFranchiseMappingController,
} from "../../controllers/franchise/franchise.controller";
import { verifyToken } from "../../middlewares/auth.middleware";

import { franchiseShiftController } from "../../controllers/attendance/attendance-workspace.controller";

const franchiseRoutes = Router();
franchiseRoutes.patch("/:id/shift", verifyToken, franchiseShiftController);

franchiseRoutes.post("/create", createFranchiseController);
franchiseRoutes.get("/vendor/:vendorId", verifyToken, getFranchisesByVendorIdController);
franchiseRoutes.post(
  "/head-site-supervisor-mapping",
  createHeadSiteSupervisorFranchiseMappingController
);
franchiseRoutes.put(
  "/head-site-supervisor-mapping/:id/status",
  updateHeadSiteSupervisorFranchiseMappingStatusController
);
franchiseRoutes.get(
  "/head-site-supervisor-mapping",
  getHeadSiteSupervisorFranchiseMappingController
);
franchiseRoutes.get(
  "/site-supervisor-mapping",
  getSiteSupervisorFranchiseMappingController
);

export default franchiseRoutes;
