import { Router } from "express";
import { createFranchiseController } from "../../controllers/franchise/franchise.controller";

const franchiseRoutes = Router();

franchiseRoutes.post("/create", createFranchiseController);

export default franchiseRoutes;
