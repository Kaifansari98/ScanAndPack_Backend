import { Router } from "express";
import { ClientDocumentationController } from "../../controllers/leadModuleControllers/clientDocumentationStage/clientDocumentation.controller";
import { uploadClientDocumentation } from "../../middlewares/uploadWasabi";
import { handleMulterUpload } from "../../middlewares/handleMulterUpload";

const ClientDocumentationRouter = Router();

ClientDocumentationRouter.post(
  "/submit-documents",
  handleMulterUpload(uploadClientDocumentation.fields([
    { name: "client_documentations_ppt" },
    { name: "client_documentations_pytha" },
  ])),
  ClientDocumentationController.create,
);

// GET documents with signed URLs
ClientDocumentationRouter.get(
  "/vendorId/:vendorId/leadId/:leadId",
  ClientDocumentationController.get,
);

ClientDocumentationRouter.post(
  "/add-documents",
  handleMulterUpload(uploadClientDocumentation.fields([
    { name: "client_documentations_ppt" },
    { name: "client_documentations_pytha" },
  ])),
  ClientDocumentationController.addMoreDocuments,
);

// GET /api/leads/client-documentation/allLeads/vendorId/:vendorId/userId/:userId
ClientDocumentationRouter.get(
  "/allLeads/vendorId/:vendorId/userId/:userId",
  ClientDocumentationController.getAllClientDocumentations,
);

ClientDocumentationRouter.post(
  "/move-to-client-approval",
  ClientDocumentationController.moveToClientApproval
);

ClientDocumentationRouter.get(
  "/order-login/eligibility/:vendorId/:leadId",
  ClientDocumentationController.canMoveToOrderLoginController,
);

export default ClientDocumentationRouter;
