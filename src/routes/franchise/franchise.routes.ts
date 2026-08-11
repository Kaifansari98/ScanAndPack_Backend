import { Router } from "express";
import {
  createFranchiseController,
  getFranchisesByVendorIdController,
  createHeadSiteSupervisorFranchiseMappingController,
  updateHeadSiteSupervisorFranchiseMappingStatusController,
  getHeadSiteSupervisorFranchiseMappingController,
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

export default franchiseRoutes;
