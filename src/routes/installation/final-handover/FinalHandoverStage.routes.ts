import { Router } from "express";
import { FinalHandoverStageController } from "../../../controllers/installation/final-handover/FinalHandoverStage.controller";
import { uploadFinalHandoverFiles } from "../../../middlewares/uploadWasabi";
import { handleMulterUpload } from "../../../middlewares/handleMulterUpload";

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
  handleMulterUpload(uploadFinalHandoverFiles.fields([
    { name: "final_site_photos" },
    { name: "warranty_card_photo" },
    { name: "handover_booklet_photo" },
    { name: "final_handover_form_photo" },
    { name: "qc_document" },
  ])),
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

/** ✅ GET → Check if total project amount is fully paid */
finalHandoverStageRoutes.get(
  "/vendorId/:vendorId/leadId/:leadId/is-total-project-amount-paid",
  controller.isTotalProjectAmountPaid
);

finalHandoverStageRoutes.put(
  "/vendorId/:vendorId/leadId/:leadId/amc-opted",
  controller.updateAmcOptedStatus,
);

/** ✅ PUT → Move Lead to Project Completed Stage (Type 17) */
finalHandoverStageRoutes.put(
  "/vendorId/:vendorId/leadId/:leadId/move-to-project-completed",
  controller.moveLeadToProjectCompleted
);

export default finalHandoverStageRoutes;
