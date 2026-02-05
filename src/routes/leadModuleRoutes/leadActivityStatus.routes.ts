import { Router } from "express";
import { LeadActivityStatusController } from "../../controllers/leadModuleControllers/leadsGeneration/leadActivityStatus.controller";

const leadActivityStatusRouter = Router();

leadActivityStatusRouter.post(
  "/leadId/:leadId/activity-status",
  LeadActivityStatusController.updateStatus,
);

leadActivityStatusRouter.post(
  "/leadId/:leadId/activity-status/revert",
  LeadActivityStatusController.revertToOnGoing,
);

leadActivityStatusRouter.post(
  "/vendor/:vendorId/leads/onHold/filter",
  LeadActivityStatusController.getOnHoldLeadsFilter,
);

leadActivityStatusRouter.post(
  "/vendor/:vendorId/leads/lost/filter",
  LeadActivityStatusController.getLostLeadsFilter,
);

leadActivityStatusRouter.post(
  "/vendor/:vendorId/leads/lostApproval/filter",
  LeadActivityStatusController.getLostApprovalLeadsFilter,
);

leadActivityStatusRouter.get(
  "/vendorId/:vendorId/activity-status-counts",
  LeadActivityStatusController.getActivityStatusCounts,
);

export default leadActivityStatusRouter;
