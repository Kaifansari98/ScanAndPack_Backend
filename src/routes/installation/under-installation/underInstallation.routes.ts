import { Router } from "express";
import { UnderInstallationStageController } from "../../../controllers/installation/under-installation/underInstallationStageController";
import { uploadUnderInstallationFiles } from "../../../middlewares/uploadWasabi";

const underInstallationStageRoutes = Router();
const controller = new UnderInstallationStageController();

/** ✅ PUT → Move Lead to Under Installation Stage (Type 15) */
underInstallationStageRoutes.put(
  "/vendorId/:vendorId/leadId/:leadId/move-to-under-installation",
  controller.moveLeadToUnderInstallation,
);

/** ✅ GET → Fetch all Post-Dispatch Stage leads (Type 15) */
underInstallationStageRoutes.get(
  "/vendorId/:vendorId/userId/:userId",
  controller.getAllUnderInstallationStageLeads,
);

/** ✅ POST → Fetch Under Installation leads that have any Miscellaneous items */
underInstallationStageRoutes.post(
  "/vendorId/:vendorId/get-all-leads-which-includes-any-miscellaneous-item",
  controller.getAllLeadsWhichIncludesAnyMiscellaneousItem,
);

/** ✅ PUT → Set actual installation start date for a lead */
underInstallationStageRoutes.put(
  "/vendorId/:vendorId/leadId/:leadId/set-actual-installation-start-date",
  controller.setActualInstallationStartDate,
);

/** ✅ GET → Fetch Under Installation details (date & info) */
underInstallationStageRoutes.get(
  "/vendorId/:vendorId/leadId/:leadId/some_under_installation_details",
  controller.getUnderInstallationDetails,
);

/** ✅ POST → Set expected installation end date & assign installers */
underInstallationStageRoutes.post(
  "/vendorId/:vendorId/leadId/:leadId/add-installers",
  controller.addInstallersAndSetEndDate,
);

/** ✅ GET → Fetch all installers mapped to a lead */
underInstallationStageRoutes.get(
  "/vendorId/:vendorId/leadId/:leadId/installers",
  controller.getMappedInstallers,
);

/** ✅ PUT → Update expected installation end date and/or installers */
underInstallationStageRoutes.put(
  "/vendorId/:vendorId/leadId/:leadId/update-installation-details",
  controller.updateInstallationDetails,
);

/** ✅ POST → Set carcass/shutter installation completion status */
underInstallationStageRoutes.post(
  "/vendorId/:vendorId/leadId/:leadId/set-installation-completion",
  controller.setInstallationCompletionStatus,
);

/** ✅ PUT → Update carcass/shutter installation completion status */
underInstallationStageRoutes.put(
  "/vendorId/:vendorId/leadId/:leadId/update-installation-completion",
  controller.updateInstallationCompletionStatus,
);

/** ✅ POST → Upload Installation Updates (Day Wise) */
underInstallationStageRoutes.post(
  "/vendorId/:vendorId/leadId/:leadId/upload-installation-updates-day-wise",
  uploadUnderInstallationFiles.array("files", 10),
  controller.uploadInstallationUpdatesDayWise,
);

/** ✅ GET → Fetch Installation Updates – Day Wise */
underInstallationStageRoutes.get(
  "/vendorId/:vendorId/leadId/:leadId/installation-updates-day-wise",
  controller.getInstallationUpdatesDayWise,
);

/**
 * POST → Create Miscellaneous Issue with documents
 */
underInstallationStageRoutes.post(
  "/vendorId/:vendorId/leadId/:leadId/create",
  uploadUnderInstallationFiles.array("files", 10), // max 10 docs
  controller.createMiscellaneousEntry,
);

underInstallationStageRoutes.post(
  "/miscellaneous/:miscId/documents",
  uploadUnderInstallationFiles.array("files"),
  controller.addMiscDocumentsController
);

underInstallationStageRoutes.get(
  "/vendorId/:vendorId/leadId/:leadId/get-all",
  controller.getAllMiscellaneousEntries,
);

/**
 * ✅ PUT → Update Expected Ready Date
 * @route PUT /miscellaneous/vendorId/:vendorId/miscId/:miscId/update-erd
 */
underInstallationStageRoutes.put(
  "/vendorId/:vendorId/miscId/:miscId/update-erd",
  controller.updateMiscExpectedReadyDate,
);

/**
 * ✅ PUT → Approve/Reject Miscellaneous
 * @route PUT /miscellaneous/vendorId/:vendorId/miscId/:miscId/update-approval
 */
underInstallationStageRoutes.put(
  "/vendorId/:vendorId/miscId/:miscId/update-approval",
  controller.updateMiscApproval,
);

/**
 * ✅ PUT → Update Required Delivery Date
 * @route PUT /miscellaneous/vendorId/:vendorId/miscId/:miscId/update-required-delivery-date
 */
underInstallationStageRoutes.put(
  "/vendorId/:vendorId/miscId/:miscId/update-required-delivery-date",
  controller.updateMiscRequiredDeliveryDate,
);

/**
 * ✅ PUT → Update Required Delivery Date (by taskId)
 * @route PUT /miscellaneous/vendorId/:vendorId/taskId/:taskId/update-required-delivery-date
 */
underInstallationStageRoutes.put(
  "/vendorId/:vendorId/taskId/:taskId/update-required-delivery-date",
  controller.updateMiscRequiredDeliveryDateByTaskId,
);

/**
 * ✅ POST → Upload Misc Completion Documents (by taskId)
 * @route POST /miscellaneous/vendorId/:vendorId/taskId/:taskId/upload-completion-docs
 */
underInstallationStageRoutes.post(
  "/vendorId/:vendorId/taskId/:taskId/upload-completion-docs",
  uploadUnderInstallationFiles.array("files", 10),
  controller.uploadMiscCompletionDocumentsByTaskId,
);

underInstallationStageRoutes.post(
  "/issue-log/create",
  controller.createInstallationIssueLog,
);

underInstallationStageRoutes.get(
  "/issue-log/vendor/:vendor_id/lead/:lead_id",
  controller.getInstallationIssueLogs,
);

underInstallationStageRoutes.get(
  "/issue-log/:id",
  controller.getInstallationIssueLogById,
);

underInstallationStageRoutes.put(
  "/issue-log/:id/update",
  controller.updateInstallationIssueLog,
);

underInstallationStageRoutes.post(
  "/usable-handover/update",
  uploadUnderInstallationFiles.array("files"), // multer — multiple files allowed
  controller.updateUsableHandover,
);

// GET usable handover
underInstallationStageRoutes.get(
  "/:vendor_id/:lead_id",
  controller.getUsableHandover,
);

// PUT update remarks
underInstallationStageRoutes.put("/update-remarks", controller.updateRemarks);

/** ✅ PUT → Mark Usable Handover as Completed */
underInstallationStageRoutes.put(
  "/vendorId/:vendorId/leadId/:leadId/mark-usable-handover-completed",
  controller.markUsableHandoverCompleted,
);

/** ✅ PUT → Move Lead to Final Handover Stage (Type 16) */
underInstallationStageRoutes.put(
  "/vendorId/:vendorId/leadId/:leadId/move-to-final-handover",
  controller.moveLeadToFinalHandover,
);

/** ✅ GET → Check Installation Completion Flag */
underInstallationStageRoutes.get(
  "/vendorId/:vendorId/leadId/:leadId/check-ready-flag",
  controller.checkUsableHandoverReadyFlag,
);

/** 🔥 Final Handover Readiness Check */
underInstallationStageRoutes.get(
  "/vendorId/:vendorId/leadId/:leadId/check-final-handover-ready",
  controller.checkLeadReadyForFinalHandover,
);

underInstallationStageRoutes.put(
  "/vendorId/:vendorId/leadId/:leadId/misc/:miscId/resolve",
  controller.resolveMiscellaneousEntry,
);

underInstallationStageRoutes.put(
  "/vendorId/:vendorId/leadId/:leadId/misc/:miscId/mark-ready",
  controller.markMiscellaneousTaskReady,
);

underInstallationStageRoutes.get(
  "/vendor/:vendorId/lead/:leadId/resolution-status",
  controller.getMiscellaneousResolutionStatus,
);

/** ✅ GET → Installation Report Data (all installation-stage leads with misc + issue counts) */
underInstallationStageRoutes.get(
  "/vendorId/:vendorId/report/installation-data",
  controller.getInstallationReportData,
);

export default underInstallationStageRoutes;
