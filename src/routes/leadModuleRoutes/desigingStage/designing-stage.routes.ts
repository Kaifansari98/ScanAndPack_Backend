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

export default DesigningStageRouter;