import { Router } from "express";
import { TechCheckController } from "../../../controllers/leadModuleControllers/production/tech-check/tech-check.controller";

const techCheckRouter = Router();

// ✅ Get all Tech-Check Leads
techCheckRouter.get(
  "/vendorId/:vendorId/userId/:userId",
  TechCheckController.getAllTechCheckLeads
);

// ✅ Approve Tech Check
techCheckRouter.post(
  "/leadId/:leadId/vendorId/:vendorId/userId/:userId/approve",
  TechCheckController.approveTechCheck
);

// ✅ Reject Tech Check
techCheckRouter.post(
  "/leadId/:leadId/vendorId/:vendorId/userId/:userId/reject",
  TechCheckController.rejectTechCheck
);

// ✅ Approve Multiple Documents
techCheckRouter.post(
  "/leadId/:leadId/vendorId/:vendorId/userId/:userId/documents/approve",
  TechCheckController.approveMultipleDocuments
);

export { techCheckRouter };
