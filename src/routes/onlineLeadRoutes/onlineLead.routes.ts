import { Router } from "express";
import { onlineLeadController } from "../../controllers/leadModuleControllers/onlineLead.controller";
import { facebookWebhookController } from "../../controllers/leadModuleControllers/facebookWebhook.controller";

const router = Router();

// Facebook / Instagram Webhook endpoints
router.get("/webhook/facebook", facebookWebhookController.verifyWebhook);
router.post("/webhook/facebook", facebookWebhookController.handleWebhook);

// Lead pool, My leads, Overall leads, and detailed views
router.get("/", onlineLeadController.fetchLeads);
router.post("/", onlineLeadController.createOnlineLead);
router.post("/walk-in", onlineLeadController.createWalkInLead);
router.get("/statuses", onlineLeadController.fetchStatuses);
router.post("/statuses", onlineLeadController.createStatus);
router.put("/statuses/:id", onlineLeadController.updateStatus);
router.delete("/statuses/:id", onlineLeadController.deleteStatus);
router.get("/store/:storeId/callers", onlineLeadController.fetchStoreCallers);
router.get("/telecallers", onlineLeadController.fetchTelecallers);
router.get("/:id", onlineLeadController.fetchLeadById);
router.patch("/:id", onlineLeadController.updateLead);
router.put("/:id/assign", onlineLeadController.assignLead);
router.post("/:id/call", onlineLeadController.logCallAndOutcome);
router.post("/:id/assign-store", onlineLeadController.assignStore);

export default router;
