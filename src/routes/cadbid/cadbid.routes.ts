import { Router } from "express";

import { verifyToken } from "../../middlewares/auth.middleware";
import {
  verifyTokenController,
  connectCadbidController,
  getCadbidStatusController,
  disconnectCadbidController,
  getStudioSsoUrlController,
  createCadbidCustomerFromLeadController,
  updateCadbidCustomerFromLeadController,
} from "../../controllers/cadbid/cadbid.controller";

const router = Router();

router.post("/verify", verifyToken, verifyTokenController);
router.post("/connect", verifyToken, connectCadbidController);
router.get("/status", verifyToken, getCadbidStatusController);
router.post("/disconnect", verifyToken, disconnectCadbidController);
router.post("/studio-sso", verifyToken, getStudioSsoUrlController);
router.post(
  "/leads/:leadId/create-customer",
  verifyToken,
  createCadbidCustomerFromLeadController,
);
router.put(
  "/leads/:leadId/update-customer",
  verifyToken,
  updateCadbidCustomerFromLeadController,
);

export default router;
