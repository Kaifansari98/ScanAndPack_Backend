import { Router } from "express";
import { onlineLeadController } from "../../controllers/leadModuleControllers/onlineLead.controller";
import { facebookWebhookController } from "../../controllers/leadModuleControllers/facebookWebhook.controller";
import multer from "multer";
import { verifyToken } from "../../middlewares/auth.middleware";

const router = Router();
const upload = multer();

// Facebook / Instagram Webhook endpoints
router.get("/webhook/facebook", facebookWebhookController.verifyWebhook);
router.post("/webhook/facebook", facebookWebhookController.handleWebhook);

// Lead pool, My leads, Overall leads, and detailed views
router.get("/", onlineLeadController.fetchLeads);
router.post("/", onlineLeadController.createOnlineLead);
router.post("/walk-in", onlineLeadController.createWalkInLead);
router.post("/bulk-upload", upload.single("file"), onlineLeadController.bulkUploadLeads);
router.get("/statuses", onlineLeadController.fetchStatuses);
router.post("/statuses", onlineLeadController.createStatus);
router.put("/statuses/:id", onlineLeadController.updateStatus);
router.delete("/statuses/:id", onlineLeadController.deleteStatus);
router.get("/store/:storeId/callers", onlineLeadController.fetchStoreCallers);
router.get("/store/:storeId/sales-executives", onlineLeadController.fetchStoreSalesExecutives);
router.get("/sales-executives", onlineLeadController.fetchStoreSalesExecutives);
router.get("/telecallers", onlineLeadController.fetchTelecallers);
router.post("/delete-bulk", onlineLeadController.deleteBulkLeads);
router.get("/:id", onlineLeadController.fetchLeadById);
router.patch("/:id", onlineLeadController.updateLead);
router.put("/:id/assign", onlineLeadController.assignLead);
router.post("/:id/call", verifyToken, onlineLeadController.logCallAndOutcome);
router.post("/:id/assign-store", onlineLeadController.assignStore);
router.post("/:id/move-to-draft", onlineLeadController.moveToDraft);
router.post("/:id/approve", verifyToken, onlineLeadController.approveLead);
router.post("/:id/reject", verifyToken, onlineLeadController.rejectLead);
router.patch("/call-log/:logId", onlineLeadController.updateCallLogRemark);
router.patch("/history/:historyId", onlineLeadController.updateHistoryRemark);
router.delete("/:id", onlineLeadController.deleteLead);

export default router;
