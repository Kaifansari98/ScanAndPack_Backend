import { Router } from "express";
import { metaWebhookController } from "../../controllers/metaWebhook.controller";

const router = Router();

// Ek hi API route: GET aur POST dono ke liye (/metawebhook aur /webhook dono support honge)
router.route("/metawebhook")
  .get(metaWebhookController.handleGet)
  .post(metaWebhookController.handleGet);
// Records dekhne ke liye optional endpoints
router.get("/metawebhook/list", metaWebhookController.getWebhookPayloads);
router.get("/metawebhook/payloads", metaWebhookController.getWebhookPayloads);

export default router;
