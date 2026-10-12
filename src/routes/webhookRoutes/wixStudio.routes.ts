import { Router } from "express";
import { wixStudioController } from "../../controllers/wixStudio.controller";

const router = Router();

// Flow A: New Wix API request → Lead Pool
router.post("/data", wixStudioController.captureData);

// Flow C: Auto-process newly added/unprocessed records in wix_studio_data_capture → Lead Pool
router.post("/data/process", wixStudioController.processUnprocessedRecords);
router.get("/data/process", wixStudioController.processUnprocessedRecords);

// Flow B: Existing DB row in wix_studio_data_capture → Lead Pool
router.post("/data/:id/process", wixStudioController.processCapturedRecord);

export default router;
