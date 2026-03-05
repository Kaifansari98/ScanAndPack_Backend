import { Router } from "express";
import {
  createFranchiseController,
  getFranchisesByVendorIdController,
} from "../../controllers/franchise/franchise.controller";

const franchiseRoutes = Router();

franchiseRoutes.post("/create", createFranchiseController);
franchiseRoutes.get("/vendor/:vendorId", getFranchisesByVendorIdController);

export default franchiseRoutes;
