import { Router } from "express";
import { ClientDocumentationController } from "../../controllers/leadModuleControllers/clientDocumentationStage/clientDocumentation.controller";
import { uploadClientDocumentation } from "../../middlewares/uploadWasabi";

const ClientDocumentationRouter = Router();

ClientDocumentationRouter.post(
  "/submit-documents",
  uploadClientDocumentation.fields([
    { name: "client_documentations_ppt", maxCount: 10 },
    { name: "client_documentations_pytha", maxCount: 10 },
  ]),
  ClientDocumentationController.create
);

// GET documents with signed URLs
ClientDocumentationRouter.get(
  "/vendorId/:vendorId/leadId/:leadId",
  ClientDocumentationController.get
);

ClientDocumentationRouter.post(
  "/add-documents",
  uploadClientDocumentation.fields([
    { name: "client_documentations_ppt", maxCount: 10 },
    { name: "client_documentations_pytha", maxCount: 10 },
  ]),
  ClientDocumentationController.addMoreDocuments
);

// GET /api/leads/client-documentation/allLeads/vendorId/:vendorId/userId/:userId
ClientDocumentationRouter.get(
  "/allLeads/vendorId/:vendorId/userId/:userId",
  ClientDocumentationController.getAllClientDocumentations
);

export default ClientDocumentationRouter;
