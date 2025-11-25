import { Router } from "express";
import { FinalHandoverStageController } from "../../../controllers/installation/final-handover/FinalHandoverStage.controller";
import { upload } from "../../../middlewares/uploadWasabi";

const finalHandoverStageRoutes = Router();
const controller = new FinalHandoverStageController();

/**
 * ✅ GET → Fetch all Final Handover Stage leads (Type 16)
 * @route GET /leads/installation/final-handover/vendorId/:vendorId/userId/:userId
 */
finalHandoverStageRoutes.get(
  "/vendorId/:vendorId/userId/:userId",
  controller.getAllFinalHandoverStageLeads
);

/**
 * ✅ POST → Upload Final Handover Documents
 * @route POST /leads/installation/final-handover/upload
 */
finalHandoverStageRoutes.post(
  "/upload",
  upload.fields([
    { name: "final_site_photos", maxCount: 20 },
    { name: "warranty_card_photo", maxCount: 5 },
    { name: "handover_booklet_photo", maxCount: 5 },
    { name: "final_handover_form_photo", maxCount: 5 },
    { name: "qc_document", maxCount: 5 },
  ]),
  controller.uploadFinalHandoverDocuments
);

/**
 * ✅ GET → Fetch Final Handover Photos & Documents (with signed URLs)
 * @route GET /leads/installation/final-handover/vendorId/:vendorId/leadId/:leadId/documents
 */
finalHandoverStageRoutes.get(
  "/vendorId/:vendorId/leadId/:leadId/documents",
  controller.getFinalHandoverDocuments
);

finalHandoverStageRoutes.get(
  "/vendorId/:vendorId/leadId/:leadId/ready-status",
  controller.getFinalHandoverReadyStatus
);

/** ✅ PUT → Move Lead to Project Completed Stage (Type 17) */
finalHandoverStageRoutes.put(
  "/vendorId/:vendorId/leadId/:leadId/move-to-project-completed",
  controller.moveLeadToProjectCompleted
);

export default finalHandoverStageRoutes;
