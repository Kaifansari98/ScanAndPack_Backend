import { Router } from "express";
import { metaWebhookController } from "../../controllers/metaWebhook.controller";

const router = Router();

// ==========================================
// 1. DATA INGESTION (POST) - Save to DB
// ==========================================
// Jo bhi incoming JSON data aayega, ushe database table mei save karega
router.post("/metawebhook", metaWebhookController.handleWebhook);
router.post("/metawebhook/save", metaWebhookController.handleWebhook);

// ==========================================
// 2. VERIFICATION (GET) - Handshake
// ==========================================
// Meta Webhook verification handshake ke liye alag dedicated route
router.get("/metawebhook/verify", metaWebhookController.verifyWebhook);
// Meta App Dashboard compatibility alias (Meta verification GET usi callback URL pe bhejta hai)
router.get("/metawebhook", metaWebhookController.verifyWebhook);

// ==========================================
// 3. READ / FETCH DATA (GET) - Get Saved JSON
// ==========================================
// Database me saved JSON records dekhne ke liye alag GET routes
router.get("/metawebhook/get", metaWebhookController.getWebhookPayloads);
router.get("/metawebhook/list", metaWebhookController.getWebhookPayloads);
router.get("/metawebhook/payloads", metaWebhookController.getWebhookPayloads);
router.get("/metawebhook/get/:id", metaWebhookController.getWebhookPayloadById);
router.delete("/metawebhook/delete/:id", metaWebhookController.deleteWebhookPayloadById);

export default router;
