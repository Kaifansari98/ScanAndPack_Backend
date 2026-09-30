import { Router } from "express";
import { TechCheckController } from "../../../controllers/leadModuleControllers/production/tech-check/tech-check.controller";

const techCheckRouter = Router();

// ✅ Get all Tech-Check Leads
techCheckRouter.get(
  "/vendorId/:vendorId/userId/:userId",
  TechCheckController.getAllTechCheckLeads,
);

// ✅ Get Tech-Check status for a specific instance
techCheckRouter.get(
  "/vendorId/:vendorId/leadId/:leadId/instanceId/:instanceId/status",
  TechCheckController.getTechCheckInstanceStatus,
);

// ✅ Approve Tech Check
techCheckRouter.post(
  "/leadId/:leadId/vendorId/:vendorId/userId/:userId/approve",
  TechCheckController.approveTechCheck,
);

// ✅ Reject Tech Check
techCheckRouter.post(
  "/leadId/:leadId/vendorId/:vendorId/userId/:userId/instanceId/:instanceId/reject",
  TechCheckController.rejectTechCheck,
);

// ✅ Approve Multiple Documents
techCheckRouter.post(
  "/leadId/:leadId/vendorId/:vendorId/userId/:userId/instanceId/:instanceId/documents/approve",
  TechCheckController.approveMultipleDocuments,
);

export { techCheckRouter };
