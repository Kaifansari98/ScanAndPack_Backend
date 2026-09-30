import { Router } from "express";
import { wixStudioController } from "../../controllers/wixStudio.controller";

const router = Router();

router.post("/data", wixStudioController.captureData);

export default router;
