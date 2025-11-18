import { Router } from "express";
import { UnderInstallationStageController } from "../../../controllers/installation/under-installation/underInstallationStageController";
import { upload } from "../../../middlewares/uploadWasabi";

const underInstallationStageRoutes = Router();
const controller = new UnderInstallationStageController();

/** ✅ PUT → Move Lead to Under Installation Stage (Type 15) */
underInstallationStageRoutes.put(
  "/vendorId/:vendorId/leadId/:leadId/move-to-under-installation",
  controller.moveLeadToUnderInstallation
);

/** ✅ GET → Fetch all Post-Dispatch Stage leads (Type 15) */
underInstallationStageRoutes.get(
  "/vendorId/:vendorId/userId/:userId",
  controller.getAllUnderInstallationStageLeads
);

/** ✅ PUT → Set actual installation start date for a lead */
underInstallationStageRoutes.put(
  "/vendorId/:vendorId/leadId/:leadId/set-actual-installation-start-date",
  controller.setActualInstallationStartDate
);

/** ✅ GET → Fetch Under Installation details (date & info) */
underInstallationStageRoutes.get(
  "/vendorId/:vendorId/leadId/:leadId/some_under_installation_details",
  controller.getUnderInstallationDetails
);

/** ✅ POST → Set expected installation end date & assign installers */
underInstallationStageRoutes.post(
  "/vendorId/:vendorId/leadId/:leadId/add-installers",
  controller.addInstallersAndSetEndDate
);

/** ✅ GET → Fetch all installers mapped to a lead */
underInstallationStageRoutes.get(
  "/vendorId/:vendorId/leadId/:leadId/installers",
  controller.getMappedInstallers
);

/** ✅ PUT → Update expected installation end date and/or installers */
underInstallationStageRoutes.put(
  "/vendorId/:vendorId/leadId/:leadId/update-installation-details",
  controller.updateInstallationDetails
);

/** ✅ POST → Set carcass/shutter installation completion status */
underInstallationStageRoutes.post(
  "/vendorId/:vendorId/leadId/:leadId/set-installation-completion",
  controller.setInstallationCompletionStatus
);

/** ✅ PUT → Update carcass/shutter installation completion status */
underInstallationStageRoutes.put(
  "/vendorId/:vendorId/leadId/:leadId/update-installation-completion",
  controller.updateInstallationCompletionStatus
);

/** ✅ POST → Upload Installation Updates (Day Wise) */
underInstallationStageRoutes.post(
  "/vendorId/:vendorId/leadId/:leadId/upload-installation-updates-day-wise",
  upload.array("files", 10),
  controller.uploadInstallationUpdatesDayWise
);

/** ✅ GET → Fetch Installation Updates – Day Wise */
underInstallationStageRoutes.get(
  "/vendorId/:vendorId/leadId/:leadId/installation-updates-day-wise",
  controller.getInstallationUpdatesDayWise
);

/**
 * POST → Create Miscellaneous Issue with documents
 */
underInstallationStageRoutes.post(
  "/vendorId/:vendorId/leadId/:leadId/create",
  upload.array("files", 10), // max 10 docs
  controller.createMiscellaneousEntry
);

underInstallationStageRoutes.get(
  "/vendorId/:vendorId/leadId/:leadId/get-all",
  controller.getAllMiscellaneousEntries
);

/**
 * ✅ PUT → Update Expected Ready Date
 * @route PUT /miscellaneous/vendorId/:vendorId/miscId/:miscId/update-erd
 */
underInstallationStageRoutes.put(
  "/vendorId/:vendorId/miscId/:miscId/update-erd",
  controller.updateMiscExpectedReadyDate
);

underInstallationStageRoutes.post(
  "/issue-log/create",
  controller.createInstallationIssueLog
);

underInstallationStageRoutes.get(
  "/issue-log/vendor/:vendor_id/lead/:lead_id",
  controller.getInstallationIssueLogs
);

underInstallationStageRoutes.get(
  "/issue-log/:id",
  controller.getInstallationIssueLogById
);

underInstallationStageRoutes.put(
  "/issue-log/:id/update",
  controller.updateInstallationIssueLog
);

underInstallationStageRoutes.post(
  "/usable-handover/update",
  upload.array("files"), // multer — multiple files allowed
  controller.updateUsableHandover
);

// GET usable handover
underInstallationStageRoutes.get(
  "/:vendor_id/:lead_id",
  controller.getUsableHandover
);

// PUT update remarks
underInstallationStageRoutes.put("/update-remarks", controller.updateRemarks);

/** ✅ PUT → Move Lead to Final Handover Stage (Type 27) */
underInstallationStageRoutes.put(
  "/vendorId/:vendorId/leadId/:leadId/move-to-final-handover",
  controller.moveLeadToFinalHandover
);

/** ✅ GET → Check Installation Completion Flag */
underInstallationStageRoutes.get(
  "/vendorId/:vendorId/leadId/:leadId/check-ready-flag",
  controller.checkUsableHandoverReadyFlag
);

/** 🔥 Final Handover Readiness Check */
underInstallationStageRoutes.get(
  "/vendorId/:vendorId/leadId/:leadId/check-final-handover-ready",
  controller.checkLeadReadyForFinalHandover
);

export default underInstallationStageRoutes;
