import { Router } from "express";
import {
  createClientTypeController,
  getClientTypesListController,
} from "../../controllers/clientTypeControllers/clientType.controller";

const router = Router();

// POST /api/client-types/create-client-type
router.post("/create-client-type", createClientTypeController);
// GET /api/client-types/list-client-types/:vendorId
router.get("/list-client-types/:vendorId", getClientTypesListController);

export default router;
