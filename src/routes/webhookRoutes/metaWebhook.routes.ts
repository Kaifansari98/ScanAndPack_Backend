import { Router } from "express";
import { metaWebhookController } from "../../controllers/metaWebhook.controller";

const router = Router();

// Ek hi API route: GET aur POST dono ke liye
router.route("/metawebhook")
  .get(metaWebhookController.handleGet)
  .post(metaWebhookController.handleWebhook);

// Records dekhne ke liye optional endpoints
router.get("/metawebhook/list", metaWebhookController.getWebhookPayloads);
router.get("/metawebhook/payloads", metaWebhookController.getWebhookPayloads);

export default router;
