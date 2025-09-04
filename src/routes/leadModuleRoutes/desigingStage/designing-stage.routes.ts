import { Router } from "express";
import { DesigingStageController } from "../../../controllers/leadModuleControllers/desigingStage/designing-stage.controller";
import { updateLeadStatusValidation } from "../../../validations/designing-stage.validation";
import { upload } from "../../../middlewares/uploadWasabi";

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

// POST /api/leads/upload-designs
// Form-data: vendorId, leadId, userId, accountId, files[]
DesigningStageRouter.post(
    "/upload-designs",
    upload.array("files"), // multiple files
    (req, res) => DesigingStageController.uploadDesigns(req, res)
  );


// PUT /api/leads/design-meeting/:meetingId
// Form-data: vendorId, userId, date?, desc?, files[]?
DesigningStageRouter.put(
    "/design-meeting/:meetingId",
    upload.array("files"), // optional multiple files
    DesigingStageController.editDesignMeeting
);

// GET /api/leads/vendor/:vendorId/lead/:leadId
DesigningStageRouter.get(
  "/vendor/:vendorId/lead/:leadId",
  DesigingStageController.getLeadById
);


export default DesigningStageRouter;