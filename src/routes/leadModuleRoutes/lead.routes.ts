import { Router } from "express";
import {
  createProductType,
  fetchAllProductTypes,
  removeProductType,
  toggleProductTypeStatus,
} from "../../controllers/leadModuleControllers/productType.controller";
import {
  createSiteType,
  fetchAllSiteTypes,
  removeSiteType,
  toggleSiteTypeStatus,
} from "../../controllers/leadModuleControllers/siteType.controller";
import {
  createSourceType,
  fetchAllSourceTypes,
  removeSourceType,
  toggleSourceTypeStatus,
} from "../../controllers/leadModuleControllers/sourceType.controller";
import {
  createProductStructureType,
  fetchAllProductStructureTypes,
  editProductStructureParent,
  removeProductStructureType,
} from "../../controllers/leadModuleControllers/productStructureType.controller";
import { upload } from "../../middlewares/uploadWasabi";
import { uploadLeadSitePhotos } from "../../utils/wasabiClient";
import { leadController } from "../../controllers/leadModuleControllers/leadsGeneration/leadGeneration.controller";
import {
  createDocumentType,
  fetchAllDocumentTypes,
  removeDocumentType,
} from "../../controllers/leadModuleControllers/documentType.controller";
import {
  createStatusType,
  fetchAllStatusTypes,
  removeStatusType,
} from "../../controllers/leadModuleControllers/statusType.controller";
import {
  createPaymentType,
  fetchAllPaymentTypes,
  removePaymentType,
} from "../../controllers/leadModuleControllers/paymentType.controller";

const leadsRouter = Router();

leadsRouter.post("/create-document-type", createDocumentType);
leadsRouter.post("/create-payment-type", createPaymentType);
leadsRouter.post("/create-status-type", createStatusType);
leadsRouter.post("/create-product-type", createProductType);
leadsRouter.post("/create-site-type", createSiteType);
leadsRouter.post("/create-source-type", createSourceType);
leadsRouter.post("/create-product-structure", createProductStructureType);
leadsRouter.get("/get-all-status-types/:vendor_id", fetchAllStatusTypes);
leadsRouter.get("/get-all-payment-types/:vendor_id", fetchAllPaymentTypes);
leadsRouter.get("/get-all-document-types/:vendor_id", fetchAllDocumentTypes);
leadsRouter.get("/get-all-product-types/:vendor_id", fetchAllProductTypes);
leadsRouter.delete("/delete-product-type/:id", removeProductType);
leadsRouter.patch("/update-product-type-status/:id", toggleProductTypeStatus);
leadsRouter.get("/get-all-site-types/:vendor_id", fetchAllSiteTypes);
leadsRouter.delete("/delete-site-type/:id", removeSiteType);
leadsRouter.patch("/update-site-type-status/:id", toggleSiteTypeStatus);
leadsRouter.get(
  "/get-all-productStructure-types/:vendor_id",
  fetchAllProductStructureTypes
);
leadsRouter.patch(
  "/update-productStructure-type/:id",
  editProductStructureParent
);
leadsRouter.delete(
  "/delete-productStructure-type/:id",
  removeProductStructureType
);
leadsRouter.get("/get-all-source-types/:vendor_id", fetchAllSourceTypes);
leadsRouter.delete("/delete-source-type/:id", removeSourceType);
leadsRouter.patch("/update-source-type-status/:id", toggleSourceTypeStatus);
leadsRouter.delete("/delete-document-type/:id", removeDocumentType);
leadsRouter.delete("/delete-status-type/:id", removeStatusType);
leadsRouter.delete("/delete-payment-type/:id", removePaymentType);

leadsRouter.post(
  "/create",
  uploadLeadSitePhotos.array("documents", 10),
  leadController.createLead
);

leadsRouter.post(
  "/upload-more-site-photos",
  uploadLeadSitePhotos.array("documents", 10),
  leadController.uploadMoreSitePhotos
);

// GET all leads by vendorId
leadsRouter.get(
  "/get-vendor-leads/vendor/:vendorId",
  leadController.fetchLeadsByVendor
);

// GET leads by vendorId and userId
leadsRouter.get(
  "/get-vendor-user-leads/vendor/:vendorId/user/:userId",
  leadController.fetchLeadsByVendorAndUser
);

leadsRouter.delete(
  "/delete-lead/:id/user-id/:deletedBy",
  leadController.deleteLead
);

leadsRouter.put("/update/:leadId/userId/:userId", leadController.updateLead);

// GET /api/sales-executives/vendor/:vendorId
// Fetch all sales executives for a specific vendor
leadsRouter.get(
  "/sales-executives/vendor/:vendorId",
  leadController.fetchSalesExecutivesByVendor
);

// GET /api/site-supervisor/vendor/:vendorId
// Fetch all site supervisor for a specific vendor
leadsRouter.get(
  "/site-supervisor/vendor/:vendorId",
  leadController.fetchSiteSupervisorsByVendor
);

/**
 * Lead Assignment Routes
 * Base path: /api/leads/assignment
 *
 * All routes require admin or super-admin authentication
 * These routes should be protected by authentication middleware
 */
// PUT /api/leads/assignment/vendor/:vendorId/lead/:leadId
// Assign a lead to a sales executive
// Only accessible to admin and super-admin users
leadsRouter.put(
  "/sales-executives/vendor/:vendorId/lead/:leadId",
  // Add authentication middleware here: authMiddleware,
  // Add role-based middleware here: requireRole(['admin', 'super-admin']),
  leadController.assignLead
);

// GET /api/leads/assignment/vendor/:vendorId/lead/:leadId/history
// Get lead assignment history (optional feature)
leadsRouter.get(
  "/sales-executives/vendor/:vendorId/lead/:leadId/history",
  // Add authentication middleware here: authMiddleware,
  // Add role-based middleware here: requireRole(['admin', 'super-admin']),
  leadController.getLeadAssignmentHistory
);

// GET single lead by leadId for specific user and vendor
leadsRouter.get(
  "/get-lead/:leadId/vendor/:vendorId/user/:userId",
  leadController.fetchLeadById
);
// GET product structure instances for a lead and vendor
leadsRouter.get(
  "/lead/:leadId/vendor/:vendorId/product-structure-instances",
  leadController.fetchLeadProductStructureInstances
);
// DELETE product structure instance for a lead and vendor
leadsRouter.delete(
  "/lead/:leadId/vendor/:vendorId/product-structure-instances/:instanceId",
  leadController.deleteLeadProductStructureInstance
);
// UPDATE product structure instance for a lead and vendor
leadsRouter.put(
  "/lead/:leadId/vendor/:vendorId/product-structure-instances/:instanceId",
  leadController.updateLeadProductStructureInstance
);
// CREATE product structure instance for a lead and vendor
leadsRouter.post(
  "/lead/:leadId/vendor/:vendorId/product-structure-instances",
  leadController.createLeadProductStructureInstance
);

// PATCH /leads/:leadId/tasks/:taskId/assign-ism
leadsRouter.patch(
  "/leadId/:leadId/taskId/:taskId/update-assign-ism",
  leadController.editTaskISM
);

leadsRouter.get(
  "/vendor-token/:token/verify",
  leadController.verifyUserTokenController
);

leadsRouter.get(
  "/vendorId/:vendor_id/leadId/:lead_id/logs",
  leadController.getLeadLogsWithDocuments
);

leadsRouter.delete(
  "/delete-doc/vendorId/:vendorId/documentId/:documentId",
  leadController.deleteDocument
);

leadsRouter.get(
  "/vendorId/:vendorId/leadId/:leadId/client-required-completion-date",
  leadController.getClientRequiredCompletionDate
);

leadsRouter.post(
  "/vendorId/:vendorId/check-contact-number",
  leadController.checkContactNumberExists
);

export default leadsRouter;
