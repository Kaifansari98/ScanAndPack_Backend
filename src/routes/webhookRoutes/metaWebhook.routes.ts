import { Router } from "express";
import { metaWebhookController } from "../../controllers/metaWebhook.controller";

const router = Router();

// Ek hi API route: GET aur POST dono ke liye
router.route("/metawebhook")
  .get(metaWebhookController.handleGet)
  .post(metaWebhookController.handleWebhook);

export default router;
