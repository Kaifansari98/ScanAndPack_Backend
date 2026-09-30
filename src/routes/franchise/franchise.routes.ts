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

const franchiseRoutes = Router();

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
