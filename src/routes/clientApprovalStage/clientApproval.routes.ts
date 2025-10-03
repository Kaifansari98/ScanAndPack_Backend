import { Router } from "express";
import multer from "multer";
import { ClientApprovalController } from "../../controllers/leadModuleControllers/clientApprovalStage/clientApproval.controller";
import { uploadClientApproval } from "../../middlewares/uploadWasabi";

// Initialize Router
const clientApprovalRouter = Router();

// ✅ Route: Submit Client Approval
// Endpoint: POST /client-approval/vendor/:vendorId/lead/:leadId
clientApprovalRouter.post(
  "/vendorId/:vendorId/leadId/:leadId",
  uploadClientApproval.fields([
    { name: "approvalScreenshots", maxCount: 10 }, // multiple screenshots allowed
    { name: "payment_files", maxCount: 5 }, // multiple payment proof files allowed
  ]),
  ClientApprovalController.submitApproval
);

// GET /api/backend-users/vendorId/:vendorId
// Fetch all backend users for a specific vendor
clientApprovalRouter.get(
  "/backend-users/vendorId/:vendorId",
  ClientApprovalController.fetchBackendUsersByVendor
);

// GET /api/leads/client-approval/allLeads/vendorId/:vendorId/userId/:userId
clientApprovalRouter.get(
  "/allLeads/vendorId/:vendorId/userId/:userId",
  ClientApprovalController.getAllClientApprovals
);

// GET /client-approval/details/vendorId/:vendorId/leadId/:leadId
clientApprovalRouter.get(
  "/details/vendorId/:vendorId/leadId/:leadId",
  ClientApprovalController.getApprovalDetails
);

export { clientApprovalRouter };
