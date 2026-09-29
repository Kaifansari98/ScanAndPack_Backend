import { Router } from "express";

import { verifyToken } from "../../middlewares/auth.middleware";
import {
  verifyTokenController,
  connectCadbidController,
  getCadbidStatusController,
  disconnectCadbidController,
  getStudioSsoUrlController,
} from "../../controllers/cadbid/cadbid.controller";

const router = Router();

router.post("/verify", verifyToken, verifyTokenController);
router.post("/connect", verifyToken, connectCadbidController);
router.get("/status", verifyToken, getCadbidStatusController);
router.post("/disconnect", verifyToken, disconnectCadbidController);
router.post("/studio-sso", verifyToken, getStudioSsoUrlController);

export default router;
