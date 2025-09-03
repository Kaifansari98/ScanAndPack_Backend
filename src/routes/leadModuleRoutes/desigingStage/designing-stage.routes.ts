import { Router } from "express";
import { DesigingStageController } from "../../../controllers/leadModuleControllers/desigingStage/designing-stage.controller";
import { updateLeadStatusValidation } from "../../../validations/designing-stage.validation";

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

export default DesigningStageRouter;