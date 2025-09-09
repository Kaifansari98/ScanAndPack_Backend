import { Router } from "express";
import { DesigingStageController } from "../../../controllers/leadModuleControllers/desigingStage/designing-stage.controller";
import { createDesignSelectionValidation, updateLeadStatusValidation } from "../../../validations/designing-stage.validation";
import { upload, uploadDesigns } from "../../../middlewares/uploadWasabi";

const DesigningStageRouter = Router();

// POST /api/leads/update-status
// Payload → { lead_id, user_id, vendor_id }
DesigningStageRouter.post(
  "/update-status",
  updateLeadStatusValidation,
  DesigingStageController.addToDesigingStage
);

// GET /api/leads/vendor/:vendorId/status/:statusId?page=1&limit=10
DesigningStageRouter.get(
  "/vendor/:vendorId/status/:statusId",
  DesigingStageController.getLeadsByStatus
);

DesigningStageRouter.post(
    "/upload-quoation",
    upload.single("file"), // file field in form-data
    (req, res) => DesigingStageController.upload(req, res)
);

// POST /api/leads/design-meeting
// Form-data: leadId, vendorId, userId, accountId, date, desc, files[]
DesigningStageRouter.post(
    "/design-meeting",
    upload.array("files"), // multiple files
    DesigingStageController.addDesignMeeting
);

// GET /api/leads/:vendorId/:leadId/design-meetings
DesigningStageRouter.get(
    "/:vendorId/:leadId/design-meetings",
    DesigingStageController.getDesignMeetings
);

// POST /api/leads/designing-stage/upload-designs
// Form-data: vendorId, leadId, userId, accountId, files[]
DesigningStageRouter.post(
    "/upload-designs",
    uploadDesigns.array("files"), // multiple files
    (req, res) => DesigingStageController.uploadDesigns(req, res)
  );


// PUT /api/leads/design-meeting/:meetingId
// Form-data: vendorId, userId, date?, desc?, files[]?
DesigningStageRouter.put(
    "/design-meeting/:meetingId",
    upload.array("files"), // optional multiple files
    DesigingStageController.editDesignMeeting
);

// GET /api/leads/designing-stage/vendor/:vendorId/lead/:leadId
DesigningStageRouter.get(
  "/vendor/:vendorId/lead/:leadId",
  DesigingStageController.getLeadById
);

// ✅ NEW: Design Selection Routes
// POST /api/leads/designing-stage/design-selection
// Form-data: lead_id, account_id, vendor_id, type, desc, created_by
DesigningStageRouter.post(
  "/design-selection",
  upload.none(), // Handle form-data without files
  createDesignSelectionValidation,
  DesigingStageController.createDesignSelection
);

// GET /api/leads/designing-stage/:vendorId/:leadId/design-selections?page=1&limit=10
DesigningStageRouter.get(
  "/:vendorId/:leadId/design-selections",
  DesigingStageController.getDesignSelections
);

// ✅ NEW: Get Design Quotation Documents
// GET /api/leads/designing-stage/:vendorId/:leadId/design-quotation-documents
DesigningStageRouter.get(
  "/:vendorId/:leadId/design-quotation-documents",
  DesigingStageController.getDesignQuotationDocuments
);

export default DesigningStageRouter;