import { Router } from "express";
import {
  identify,
  login,
  sendClientOtp,
  verifyClientOtp,
} from "../controllers/auth.controller";

const router = Router();

router.post("/identify", identify);
router.post("/login", login);
router.post("/client/send-otp", sendClientOtp);
router.post("/client/verify-otp", verifyClientOtp);

export default router;
