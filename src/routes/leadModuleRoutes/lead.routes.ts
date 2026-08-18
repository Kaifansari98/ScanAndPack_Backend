import { Router } from "express";
import multer from "multer";

import {
  createProductType,
  fetchAllProductTypes,
  removeProductType,
  toggleProductTypeStatus,
} from "../../controllers/leadModuleControllers/productType.controller";
import {
  createProcessBrief,
  fetchAllProcessBriefs,
  fetchLeadProcessBriefsHandler,
  saveLeadProcessBriefsHandler,
} from "../../controllers/leadModuleControllers/processBrief.controller";
import {
  createLeadRequirementMaterialHandler,
  getLeadRequirementMaterialsHandler,
  updateLeadRequirementMaterialHandler,
  deleteLeadRequirementMaterialHandler,
} from "../../controllers/leadModuleControllers/leadRequirementMaterial.controller";
import {
  getB2BRequirementTypesHandler,
  createB2BRequirementTypeHandler,
  updateB2BRequirementTypeHandler,
  deleteB2BRequirementTypeHandler,
  saveLeadB2BRequirementMappingsHandler,
  getLeadB2BRequirementMappingsHandler,
} from "../../controllers/leadModuleControllers/b2bRequirementType.controller";
import {
  getRequirementDocumentTypesHandler,
  uploadRequirementDocumentHandler,
  getRequirementDocumentsHandler,
  deleteRequirementDocumentHandler,
} from "../../controllers/leadModuleControllers/leadRequirementDocument.controller";
import {
  createSiteType,
  editSiteType,
  fetchAllSiteTypes,
  fetchAllSiteTypesForMaster,
  removeSiteType,
  toggleSiteTypeStatus,
} from "../../controllers/leadModuleControllers/siteType.controller";
import {
  createSourceType,
  editSourceType,
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
import {
  createProductSubStructure,
  fetchAllProductSubStructures,
} from "../../controllers/leadModuleControllers/productSubStructure.controller";
import {
  createProductItemCode,
  fetchAllProductItemCodes,
} from "../../controllers/leadModuleControllers/productItemCode.controller";
import { uploadLeadSitePhotos } from "../../utils/wasabiClient";
import { handleMulterUpload } from "../../middlewares/handleMulterUpload";
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
import {
  fetchAllCarcassTypes,
  addCarcassType,
  fetchAllCarcasMaterials,
  addCarcasMaterial,
  fetchCarcassMaterialFinishes,
  addCarcassMaterialFinish,
  fetchAllCarcassMaterialFinishesForVendor,
  uploadCarcassMaterialFinishes,
  fetchFastProductionTimelineRules,
  addTimelineRule,
  editTimelineRule,
  fetchAllHandleTypes,
  addHandleType,
  fetchAllShutterTypes,
  addShutterType,
  addShutterSubType,
  fetchAllShutterMaterials,
  addShutterMaterial,
  fetchShutterMaterialFinishes,
  addShutterMaterialFinish,
  fetchAllShutterMaterialFinishesForVendor,
  uploadShutterMaterialFinishes,
  fetchAllCarcassLegs,
  addCarcassLegs,
  fetchSkirtingCarcassLegs,
  addSkirtingCarcassLegs,
  fetchAllSkirtingCarcassLegsForVendor,
  fetchSkirtingCarcassLegsColors,
  addSkirtingCarcassLegsColor,
  fetchAllSkirtingCarcassLegsColorsForVendor,
  uploadSkirtingCarcassLegsColors,
  fetchAllLightCarcasTypes,
  addLightCarcasType,
  fetchLightCarcasUnits,
  addLightCarcasUnit,
  fetchAllLightCarcasUnitsForVendor,
  uploadLightCarcasUnits,
  fetchAllOtherAppliances,
  addOtherAppliances,
  uploadOtherAppliances,
  downloadOtherAppliancesReport,
} from "../../controllers/leadModuleControllers/selectionMaster.controller";
import { fetchAllSmallOrderRequestTypes } from "../../controllers/leadModuleControllers/smallOrderRequestType.controller";
import {
  createSmallOrderRequestController,
  getSmallOrderRequestsByLeadController,
  markSmallOrderRequestResolvedController,
} from "../../controllers/leadModuleControllers/smallOrderRequest.controller";
import {
  createFastProductionRequestController,
  finalizeFastProductionRequestBatchController,
  checkFastProductionLimitController,
  checkFastProductionStatusController,
  getFastProductionDetailsController,
  getFastProductionRequestDraftController,
  revokeFastProductionRequestController,
} from "../../controllers/leadModuleControllers/fastProductionRequest.controller";

const leadsRouter = Router();
const MAX_FILES = parseInt(process.env.UPLOAD_MAX_FILES || "40");
const excelUpload = multer();

leadsRouter.post("/create-document-type", createDocumentType);
leadsRouter.post("/create-payment-type", createPaymentType);
leadsRouter.post("/create-status-type", createStatusType);
leadsRouter.post("/create-product-type", createProductType);
leadsRouter.post("/create-process-brief", createProcessBrief);
leadsRouter.post("/create-site-type", createSiteType);
leadsRouter.post("/create-source-type", createSourceType);
leadsRouter.post("/create-product-structure", createProductStructureType);
leadsRouter.post("/create-product-sub-structure", createProductSubStructure);
leadsRouter.post("/create-product-item-code", createProductItemCode);
leadsRouter.get("/get-all-status-types/:vendor_id", fetchAllStatusTypes);
leadsRouter.get("/get-all-payment-types/:vendor_id", fetchAllPaymentTypes);
leadsRouter.get("/get-all-document-types/:vendor_id", fetchAllDocumentTypes);
leadsRouter.get("/get-all-product-types/:vendor_id", fetchAllProductTypes);
leadsRouter.get("/get-all-process-briefs/:vendor_id", fetchAllProcessBriefs);
leadsRouter.post("/save-lead-process-briefs", saveLeadProcessBriefsHandler);
leadsRouter.get("/get-lead-process-briefs/:lead_id", fetchLeadProcessBriefsHandler);
leadsRouter.post("/create-lead-requirement-material", createLeadRequirementMaterialHandler);
leadsRouter.get("/get-lead-requirement-materials/:lead_id", getLeadRequirementMaterialsHandler);
leadsRouter.put("/update-lead-requirement-material/:id", updateLeadRequirementMaterialHandler);
leadsRouter.delete("/delete-lead-requirement-material/:id", deleteLeadRequirementMaterialHandler);

leadsRouter.get("/get-all-b2b-requirement-types/:vendor_id", getB2BRequirementTypesHandler);
leadsRouter.post("/create-b2b-requirement-type", createB2BRequirementTypeHandler);
leadsRouter.put("/update-b2b-requirement-type/:id", updateB2BRequirementTypeHandler);
leadsRouter.delete("/delete-b2b-requirement-type/:id", deleteB2BRequirementTypeHandler);
leadsRouter.post("/save-lead-b2b-requirement-mappings", saveLeadB2BRequirementMappingsHandler);
leadsRouter.get("/get-lead-b2b-requirement-mappings/:lead_id", getLeadB2BRequirementMappingsHandler);
leadsRouter.get(
  "/get-all-small-order-request-types/:vendor_id",
  fetchAllSmallOrderRequestTypes,
);
leadsRouter.post(
  "/small-order-requests",
  handleMulterUpload(uploadLeadSitePhotos.array("documents", MAX_FILES)),
  createSmallOrderRequestController,
);
leadsRouter.post(
  "/fast-production-requests",
  handleMulterUpload(uploadLeadSitePhotos.array("documents", MAX_FILES)),
  createFastProductionRequestController,
);
leadsRouter.post(
  "/fast-production-requests/finalize",
  finalizeFastProductionRequestBatchController,
);
leadsRouter.post(
  "/fast-production-requests/revoke",
  revokeFastProductionRequestController,
);
leadsRouter.get(
  "/fast-production-requests/check-limit",
  checkFastProductionLimitController,
);
leadsRouter.get(
  "/fast-production-requests/vendor/:vendorId/lead/:leadId/status",
  checkFastProductionStatusController,
);
leadsRouter.get(
  "/fast-production-requests/vendor/:vendorId/lead/:leadId/details",
  getFastProductionDetailsController,
);
leadsRouter.get(
  "/fast-production-requests/draft/vendor/:vendorId/lead/:leadId",
  getFastProductionRequestDraftController,
);
leadsRouter.get(
  "/small-order-requests/vendor/:vendorId/lead/:leadId",
  getSmallOrderRequestsByLeadController,
);
leadsRouter.patch(
  "/small-order-requests/vendor/:vendorId/request/:requestId/resolve",
  markSmallOrderRequestResolvedController,
);
leadsRouter.get("/get-all-carcass-types/:vendor_id", fetchAllCarcassTypes);
leadsRouter.post("/create-carcass-type", addCarcassType);
leadsRouter.get(
  "/get-all-carcas-materials/:vendor_id",
  fetchAllCarcasMaterials,
);
leadsRouter.post("/create-carcas-material", addCarcasMaterial);
leadsRouter.get(
  "/get-carcass-material-finishes/:carcas_material_id",
  fetchCarcassMaterialFinishes,
);
leadsRouter.post("/create-carcass-material-finish", addCarcassMaterialFinish);
leadsRouter.get(
  "/get-all-carcass-material-finishes/:vendor_id",
  fetchAllCarcassMaterialFinishesForVendor,
);
leadsRouter.post(
  "/upload-carcass-material-finish",
  excelUpload.single("file"),
  uploadCarcassMaterialFinishes,
);
leadsRouter.get("/get-all-shutter-types/:vendor_id", fetchAllShutterTypes);
leadsRouter.post("/create-shutter-type", addShutterType);
leadsRouter.post("/create-shutter-sub-type", addShutterSubType);
leadsRouter.get(
  "/get-all-shutter-materials/:vendor_id",
  fetchAllShutterMaterials,
);
leadsRouter.post("/create-shutter-material", addShutterMaterial);
leadsRouter.get(
  "/get-shutter-material-finishes/:shutter_material_id",
  fetchShutterMaterialFinishes,
);
leadsRouter.get(
  "/get-all-shutter-material-finishes/:vendor_id",
  fetchAllShutterMaterialFinishesForVendor,
);
leadsRouter.post("/create-shutter-material-finish", addShutterMaterialFinish);
leadsRouter.post(
  "/upload-shutter-material-finish",
  excelUpload.single("file"),
  uploadShutterMaterialFinishes,
);
leadsRouter.get("/get-all-carcass-legs/:vendor_id", fetchAllCarcassLegs);
leadsRouter.post("/create-carcass-legs", addCarcassLegs);
leadsRouter.get(
  "/get-skirting-carcass-legs/:carcass_legs_id",
  fetchSkirtingCarcassLegs,
);
leadsRouter.get(
  "/get-all-skirting-carcass-legs/:vendor_id",
  fetchAllSkirtingCarcassLegsForVendor,
);
leadsRouter.post("/create-skirting-carcass-legs", addSkirtingCarcassLegs);
leadsRouter.get(
  "/get-skirting-carcass-legs-colors/:skirting_carcass_legs_id",
  fetchSkirtingCarcassLegsColors,
);
leadsRouter.get(
  "/get-all-skirting-carcass-legs-colors/:vendor_id",
  fetchAllSkirtingCarcassLegsColorsForVendor,
);
leadsRouter.post(
  "/create-skirting-carcass-legs-color",
  addSkirtingCarcassLegsColor,
);
leadsRouter.post(
  "/upload-skirting-carcass-legs-color",
  excelUpload.single("file"),
  uploadSkirtingCarcassLegsColors,
);
leadsRouter.get(
  "/get-all-light-carcas-types/:vendor_id",
  fetchAllLightCarcasTypes,
);
leadsRouter.post("/create-light-carcas-type", addLightCarcasType);
leadsRouter.get(
  "/get-light-carcas-units/:light_carcas_type_id",
  fetchLightCarcasUnits,
);
leadsRouter.get(
  "/get-all-light-carcas-units/:vendor_id",
  fetchAllLightCarcasUnitsForVendor,
);
leadsRouter.post("/create-light-carcas-unit", addLightCarcasUnit);
leadsRouter.post(
  "/upload-light-carcas-unit",
  excelUpload.single("file"),
  uploadLightCarcasUnits,
);
leadsRouter.get(
  "/get-all-other-appliances/:vendor_id",
  fetchAllOtherAppliances,
);
leadsRouter.post("/create-other-appliances", addOtherAppliances);
leadsRouter.post(
  "/upload-other-appliances",
  excelUpload.single("file"),
  uploadOtherAppliances,
);
leadsRouter.get(
  "/download-other-appliances/:vendor_id",
  downloadOtherAppliancesReport,
);
leadsRouter.get("/get-all-handle-types/:vendor_id", fetchAllHandleTypes);
leadsRouter.post("/create-handle-type", addHandleType);
leadsRouter.get(
  "/get-fast-production-timeline-rules/:vendor_id",
  fetchFastProductionTimelineRules,
);
leadsRouter.post("/create-timeline-rule", addTimelineRule);
leadsRouter.patch("/update-timeline-rule/:id", editTimelineRule);
leadsRouter.delete("/delete-product-type/:id", removeProductType);
leadsRouter.patch("/update-product-type-status/:id", toggleProductTypeStatus);
leadsRouter.get("/get-all-site-types/:vendor_id", fetchAllSiteTypes);
leadsRouter.get("/get-all-site-types-master/:vendor_id", fetchAllSiteTypesForMaster);
leadsRouter.delete("/delete-site-type/:id", removeSiteType);
leadsRouter.patch("/update-site-type/:id", editSiteType);
leadsRouter.patch("/update-site-type-status/:id", toggleSiteTypeStatus);
leadsRouter.get(
  "/get-all-productStructure-types/:vendor_id",
  fetchAllProductStructureTypes
)
leadsRouter.get(
  "/get-all-product-sub-structures/:vendor_id",
  fetchAllProductSubStructures
);
leadsRouter.get(
  "/get-all-product-item-codes/:vendor_id",
  fetchAllProductItemCodes
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
leadsRouter.patch("/update-source-type/:id", editSourceType);
leadsRouter.patch("/update-source-type-status/:id", toggleSourceTypeStatus);
leadsRouter.delete("/delete-document-type/:id", removeDocumentType);
leadsRouter.delete("/delete-status-type/:id", removeStatusType);
leadsRouter.delete("/delete-payment-type/:id", removePaymentType);

leadsRouter.post(
  "/create",
  handleMulterUpload(uploadLeadSitePhotos.array("documents", MAX_FILES)),
  leadController.createLead
);

leadsRouter.post(
  "/upload-more-site-photos",
  handleMulterUpload(uploadLeadSitePhotos.array("documents", MAX_FILES)),
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

leadsRouter.patch(
  "/:id/stage",
  leadController.updateLeadStage
);

leadsRouter.patch(
  "/vendorId/:vendorId/leadId/:leadId/block",
  leadController.blockLead
);
leadsRouter.patch(
  "/vendorId/:vendorId/leadId/:leadId/unblock",
  leadController.unblockLead
);
leadsRouter.get(
  "/vendorId/:vendorId/leadId/:leadId/block-status",
  leadController.getLeadBlockStatus
);
leadsRouter.put(
  "/update-product-type/:leadId/userId/:userId",
  leadController.updateLeadProductType
);
leadsRouter.post(
  "/update-requirement-meta",
  leadController.updateLeadRequirementMeta
);

// GET /api/sales-executives/vendor/:vendorId
// Fetch all sales executives for a specific vendor
leadsRouter.get(
  "/sales-executives/vendor/:vendorId",
  leadController.fetchSalesExecutivesByVendor
);

leadsRouter.post(
  "/vendorId/:vendorId/leadId/:leadId/assign-designer",
  leadController.assignDesigner
);

leadsRouter.post(
  "/vendorId/:vendorId/leadId/:leadId/unassign-designer",
  leadController.unassignDesigner
);

// GET /api/site-supervisor/vendor/:vendorId
// Fetch all site supervisor for a specific vendor
leadsRouter.get(
  "/site-supervisor/vendor/:vendorId",
  leadController.fetchSiteSupervisorsByVendor
);

// GET /api/head-site-supervisor/vendor/:vendorId
// Fetch all head site supervisors for a specific vendor
leadsRouter.get(
  "/head-site-supervisor/vendor/:vendorId",
  leadController.fetchHeadSiteSupervisorsByVendor
);

// GET /api/leads/follow-up-users/vendor/:vendorId/lead/:leadId?franchise_id=...
// Fetch users eligible for Follow Up task assignment
leadsRouter.get(
  "/follow-up-users/vendor/:vendorId/lead/:leadId",
  leadController.fetchFollowUpUsers
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
// GET unique product types for a lead and vendor
leadsRouter.get(
  "/lead/:leadId/vendor/:vendorId/unique-product-types",
  leadController.fetchLeadUniqueProductTypes
);
// DELETE product structure instance for a lead and vendor
leadsRouter.delete(
  "/lead/:leadId/vendor/:vendorId/product-structure-instances/:instanceId",
  leadController.deleteLeadProductStructureInstance
);
// DELETE all product structure instances and mappings for a lead and vendor
leadsRouter.delete(
  "/lead/:leadId/vendor/:vendorId/clear-structures",
  leadController.clearLeadProductStructures
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

leadsRouter.patch(
  "/leadId/:leadId/taskId/:taskId/reschedule-initial-site-measurement",
  leadController.rescheduleInitialSiteMeasurementTask,
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

leadsRouter.post(
  "/vendorId/:vendorId/check-similar-lead",
  leadController.checkSimilarLeadExists
);

leadsRouter.get(
  "/vendorId/:vendorId/leadId/:leadId/check-site-supervisor-assigned",
  leadController.checkSiteSupervisorAssigned
);

leadsRouter.get(
  "/vendorId/:vendorId/leadId/:leadId/all-documents",
  leadController.getAllLeadDocuments
);

leadsRouter.get(
  "/unshorten-url",
  async (req, res) => {
    const { url } = req.query;
    if (!url || typeof url !== "string") {
      return res.status(400).json({ success: false, message: "URL parameter is required" });
    }
    try {
      const axios = require("axios");
      const response = await axios.get(url, {
        maxRedirects: 10,
        headers: {
          'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Mobile/15E148 Safari/604.1'
        }
      });
      const resolvedUrl = response.request?.res?.responseUrl || response.config?.url || url;
      return res.json({ success: true, resolvedUrl });
    } catch (error: any) {
      if (error.response && error.response.status >= 300 && error.response.status < 400) {
        const location = error.response.headers?.location;
        if (location) {
          return res.json({ success: true, resolvedUrl: location });
        }
      }
      return res.status(500).json({ success: false, message: error.message || "Failed to resolve URL" });
    }
  }
);

leadsRouter.get(
  "/requirement-documents/types",
  getRequirementDocumentTypesHandler
);

leadsRouter.post(
  "/requirement-documents/upload",
  multer({ storage: multer.memoryStorage() }).single("file"),
  uploadRequirementDocumentHandler
);

leadsRouter.get(
  "/requirement-documents",
  getRequirementDocumentsHandler
);

leadsRouter.delete(
  "/requirement-documents/:id",
  deleteRequirementDocumentHandler
);

export default leadsRouter;
