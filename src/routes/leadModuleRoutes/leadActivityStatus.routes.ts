import { Router } from "express";
import { LeadActivityStatusController } from "../../controllers/leadModuleControllers/leadsGeneration/leadActivityStatus.controller";

const leadActivityStatusRouter = Router();

// Update to onHold / lost
/*
Update Lead to lost
Request Body
{
    "vendorId": 1,
    "accountId": 10,
    "userId": 25,
    "status": "lost",
    "remark": "Competitor closed deal",
    "createdBy": 25
} 
*/
leadActivityStatusRouter.post(
  "/leadId/:leadId/activity-status",
  LeadActivityStatusController.updateStatus
);

// Revert to onGoing
/*
{
    "vendorId": 1,
    "accountId": 10,
    "userId": 25,
    "remark": "Client restarted discussions",
    "createdBy": 25
}
*/
leadActivityStatusRouter.post(
  "/leadId/:leadId/activity-status/revert",
  LeadActivityStatusController.revertToOnGoing
);

// Fetch onHold leads
/*
GET /vendor/:vendorId/leads/onHold
*/
leadActivityStatusRouter.get(
  "/vendor/:vendorId/leads/onHold",
  LeadActivityStatusController.getOnHoldLeads
);

// Fetch lost leads
/*
  GET /vendor/:vendorId/leads/lost
  */
leadActivityStatusRouter.get(
  "/vendor/:vendorId/leads/lost",
  LeadActivityStatusController.getLostLeads
);

// Fetch lostApproval leads
/*
  GET /vendor/:vendorId/leads/lostApproval
*/
leadActivityStatusRouter.get(
  "/vendor/:vendorId/leads/lostApproval",
  LeadActivityStatusController.getLostApprovalLeads
);

export default leadActivityStatusRouter;