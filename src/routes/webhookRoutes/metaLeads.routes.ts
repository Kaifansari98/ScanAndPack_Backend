import { Router } from "express";
import { metaLeadsWebhookController } from "../../controllers/leadModuleControllers/metaLeadsWebhook.controller";

const router = Router();

// Meta webhook handshake verification (GET) and lead notification intake (POST)
router.get("/meta/leads", metaLeadsWebhookController.verifyWebhook);
router.post("/meta/leads", metaLeadsWebhookController.handleWebhook);

// Aliases to support /api/meta/webhook
router.get("/meta/webhook", metaLeadsWebhookController.verifyWebhook);
router.post("/meta/webhook", metaLeadsWebhookController.handleWebhook);

// Debug endpoint to manually test lead ingestion
router.post("/meta/leads/debug", metaLeadsWebhookController.debugIngest);

export default router;
