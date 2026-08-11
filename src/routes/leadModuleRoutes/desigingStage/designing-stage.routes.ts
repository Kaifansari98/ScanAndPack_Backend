import { Router } from "express";
import { DesigingStageController } from "../../../controllers/leadModuleControllers/desigingStage/designing-stage.controller";
import { CHSSelectionTypeMappingController } from "../../../controllers/leadModuleControllers/desigingStage/chs-selection-type-mapping.controller";
import {
  createDesignSelectionValidation,
  updateLeadStatusValidation,
  updateDesignSelectionValidation,
} from "../../../validations/designing-stage.validation";
import {
  upload,
  uploadDesignMeetingFiles,
  uploadDesigns,
  uploadMeetingDocs,
} from "../../../middlewares/uploadWasabi";
import {
  uploadDesignQuotationFiles,
  uploadCostingFiles,
  uploadElectricalPlumbingFiles,
  uploadFinalIsmFiles,
} from "../../../utils/wasabiClient";
import { handleMulterUpload } from "../../../middlewares/handleMulterUpload";

const DesigningStageRouter = Router();

// POST /api/leads/update-status
// Payload → { lead_id, user_id, vendor_id }
DesigningStageRouter.post(
  "/update-status",
  updateLeadStatusValidation,
  DesigingStageController.addToDesigingStage,
);

// GET /api/leads/designing-stage/get-all-leads/vendor/:vendorId/page=1&limit=10
DesigningStageRouter.get(
  "/get-all-leads/vendor/:vendorId",
  DesigingStageController.getLeadsByStatus,
);

DesigningStageRouter.post(
  "/upload-quotation",
  handleMulterUpload(uploadDesignQuotationFiles.array("files")), // file field in form-data
  (req, res) => DesigingStageController.upload(req, res),
);

// POST /api/leads/design-meeting
// Form-data: leadId, vendorId, userId, accountId, date, desc, files[]
DesigningStageRouter.post(
  "/design-meeting",
  handleMulterUpload(uploadDesignMeetingFiles.array("files")), // multiple files
  DesigingStageController.addDesignMeeting,
);

// POST /api/leads/designing-stage/add-meeting-docs
DesigningStageRouter.post(
  "/add-meeting-docs",
  handleMulterUpload(uploadMeetingDocs.array("files")), // same multer setup
  (req, res) => DesigingStageController.addMeetingDocs(req, res),
);

DesigningStageRouter.get(
  "/vendor/:vendorId/meeting-types",
  DesigingStageController.getMeetingTypes,
);

// GET /api/leads/:vendorId/:leadId/design-meetings
DesigningStageRouter.get(
  "/:vendorId/:leadId/design-meetings",
  DesigingStageController.getDesignMeetings,
);

// POST /api/leads/designing-stage/upload-designs
// Form-data: vendorId, leadId, userId, accountId, files[]
DesigningStageRouter.post(
  "/upload-designs",
  handleMulterUpload(uploadDesigns.array("files")), // multiple files
  (req, res) => DesigingStageController.uploadDesigns(req, res),
);

// POST /api/leads/designing-stage/upload-costing-file
// Form-data: vendorId, leadId, userId, files[]
DesigningStageRouter.post(
  "/upload-costing-file",
  handleMulterUpload(uploadCostingFiles.array("files")), // multiple files
  (req, res) => DesigingStageController.uploadCostingFile(req, res),
);

// GET /api/leads/designing-stage/:vendorId/:leadId/costing-file-documents
DesigningStageRouter.get(
  "/:vendorId/:leadId/costing-file-documents",
  (req, res) => DesigingStageController.getCostingFileDocuments(req, res),
);

// POST /api/leads/designing-stage/upload-electrical-plumbing
// Form-data: vendorId, leadId, userId, files[]
DesigningStageRouter.post(
  "/upload-electrical-plumbing",
  handleMulterUpload(uploadElectricalPlumbingFiles.array("files")), // multiple files
  (req, res) => DesigingStageController.uploadElectricalPlumbing(req, res),
);

// GET /api/leads/designing-stage/:vendorId/:leadId/electrical-plumbing-documents
DesigningStageRouter.get(
  "/:vendorId/:leadId/electrical-plumbing-documents",
  (req, res) => DesigingStageController.getElectricalPlumbingDocuments(req, res),
);

// POST /api/leads/designing-stage/upload-final-ism
// Form-data: vendorId, leadId, userId, files[]
DesigningStageRouter.post(
  "/upload-final-ism",
  handleMulterUpload(uploadFinalIsmFiles.array("files")), // multiple files
  (req, res) => DesigingStageController.uploadFinalIsmUpload(req, res),
);

// GET /api/leads/designing-stage/:vendorId/:leadId/final-ism-upload-documents
DesigningStageRouter.get(
  "/:vendorId/:leadId/final-ism-upload-documents",
  (req, res) => DesigingStageController.getFinalIsmUploadDocuments(req, res),
);

// PUT /api/leads/design-meeting/:meetingId
// Form-data: vendorId, userId, date?, desc?, files[]?
DesigningStageRouter.put(
  "/design-meeting/:meetingId",
  handleMulterUpload(upload.array("files")), // optional multiple files
  DesigingStageController.editDesignMeeting,
);

// GET /api/leads/designing-stage/vendor/:vendorId/lead/:leadId
DesigningStageRouter.get(
  "/vendor/:vendorId/lead/:leadId",
  DesigingStageController.getLeadById,
);

// ✅ NEW: Design Selection Routes
// POST /api/leads/designing-stage/design-selection
// Form-data: lead_id, account_id, vendor_id, type, desc, created_by
DesigningStageRouter.post(
  "/design-selection",
  handleMulterUpload(upload.none()), // Handle form-data without files
  createDesignSelectionValidation,
  DesigingStageController.createDesignSelection,
);

// GET /api/leads/designing-stage/:vendorId/:leadId/design-selections?page=1&limit=10
DesigningStageRouter.get(
  "/:vendorId/:leadId/design-selections",
  DesigingStageController.getDesignSelections,
);

// ✅ NEW: Get Design Quotation Documents
// GET /api/leads/designing-stage/:vendorId/:leadId/design-quotation-documents
DesigningStageRouter.get(
  "/:vendorId/:leadId/design-quotation-documents",
  DesigingStageController.getDesignQuotationDocuments,
);

// ✅ NEW: Get Design Documents
// GET /api/leads/designing-stage/:vendorId/:leadId/design-stage1-documents
DesigningStageRouter.get(
  "/:vendorId/:leadId/design-stage1-documents",
  DesigingStageController.getDesignStageDocuments,
);

// PUT /api/leads/designing-stage/design-selection/:id
// Form-data: type, desc, updated_by
DesigningStageRouter.put(
  "/design-selection/:id",
  handleMulterUpload(upload.none()), // Handle form-data without files
  updateDesignSelectionValidation,
  DesigingStageController.updateDesignSelection,
);

DesigningStageRouter.get(
  "/:vendorId/:leadId/design-stage-counts",
  DesigingStageController.getDesignStageCounts,
);

DesigningStageRouter.get(
  "/status/leadId/:lead_id/vendorId/:vendor_id",
  DesigingStageController.getLeadStatus,
);


DesigningStageRouter.get(
  "/statusfornotification/leadId/:lead_id/vendorId/:vendor_id",
  DesigingStageController.getLeadStatusForNotification
);

DesigningStageRouter.get(
  "/vendor/:vendorId/lead/:leadId/instance/:instanceId/stage",
  DesigingStageController.getInstanceStageController,
);

// GET /api/leads/designing-stage/vendor/:vendorId/lead/:leadId/specifications
DesigningStageRouter.get(
  "/vendor/:vendorId/lead/:leadId/specifications",
  (req, res) => DesigingStageController.getLeadSpecifications(req, res),
);

// POST /api/leads/designing-stage/vendor/:vendorId/lead/:leadId/specifications
DesigningStageRouter.post(
  "/vendor/:vendorId/lead/:leadId/specifications",
  (req, res) => DesigingStageController.createLeadSpecification(req, res),
);

// PUT /api/leads/designing-stage/specifications/:specsId/lights-remark
DesigningStageRouter.put(
  "/specifications/:specsId/lights-remark",
  (req, res) => DesigingStageController.updateLeadSpecificationLightsRemark(req, res),
);

DesigningStageRouter.put(
  "/specifications/:specsId/section-remark",
  (req, res) => DesigingStageController.updateLeadSpecificationSectionRemark(req, res),
);

DesigningStageRouter.put(
  "/specifications/:specsId/mark-completed",
  (req, res) => DesigingStageController.markLeadSpecificationCompleted(req, res),
);

DesigningStageRouter.get(
  "/vendor/:vendorId/lead/:leadId/specs/:specsId/carcass-material-mappings",
  (req, res) => DesigingStageController.getLeadCarcassMaterialMappings(req, res),
);

DesigningStageRouter.post(
  "/carcass-material-mappings",
  (req, res) => DesigingStageController.upsertLeadCarcassMaterialMapping(req, res),
);

DesigningStageRouter.get(
  "/vendor/:vendorId/lead/:leadId/specs/:specsId/shutter-material-mappings",
  (req, res) => DesigingStageController.getLeadShutterMaterialMappings(req, res),
);

DesigningStageRouter.post(
  "/shutter-material-mappings",
  (req, res) => DesigingStageController.upsertLeadShutterMaterialMapping(req, res),
);

DesigningStageRouter.get(
  "/vendor/:vendorId/lead/:leadId/specs/:specsId/hardware-mappings",
  (req, res) => DesigingStageController.getLeadHardwareMappings(req, res),
);

DesigningStageRouter.post(
  "/hardware-mappings",
  (req, res) => DesigingStageController.upsertLeadHardwareMapping(req, res),
);

DesigningStageRouter.get(
  "/vendor/:vendorId/lead/:leadId/specs/:specsId/light-carcas-unit-mappings",
  (req, res) => DesigingStageController.getLeadLightCarcasUnitMappings(req, res),
);

DesigningStageRouter.post(
  "/light-carcas-unit-mappings",
  (req, res) => DesigingStageController.upsertLeadLightCarcasUnitMapping(req, res),
);

DesigningStageRouter.get(
  "/vendor/:vendorId/lead/:leadId/specs/:specsId/other-appliances-mappings",
  (req, res) => DesigingStageController.getLeadOtherAppliancesMappings(req, res),
);

DesigningStageRouter.post(
  "/other-appliances-mappings",
  (req, res) => DesigingStageController.upsertLeadOtherAppliancesMapping(req, res),
);

// ─── CHS Selection Type Mapping ───────────────────────────────────────────────
// POST   /api/leads/designing-stage/chs-selection-type-mapping
DesigningStageRouter.post(
  "/chs-selection-type-mapping",
  CHSSelectionTypeMappingController.upsert,
);

// GET    /api/leads/designing-stage/vendor/:vendorId/lead/:leadId/chs-selection-type-mapping
DesigningStageRouter.get(
  "/vendor/:vendorId/lead/:leadId/chs-selection-type-mapping",
  CHSSelectionTypeMappingController.getByLead,
);

// GET    /api/leads/designing-stage/vendor/:vendorId/lead/:leadId/chs-manufacturing-days-by-instance
DesigningStageRouter.get(
  "/vendor/:vendorId/lead/:leadId/chs-manufacturing-days-by-instance",
  CHSSelectionTypeMappingController.getManufacturingDaysByInstance,
);

// PUT    /api/leads/designing-stage/chs-selection-type-mapping/:id
DesigningStageRouter.put(
  "/chs-selection-type-mapping/:id",
  CHSSelectionTypeMappingController.updateById,
);

export default DesigningStageRouter;
