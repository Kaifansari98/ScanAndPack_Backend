import { Router } from "express";
import { PostProductionController } from "../../../controllers/leadModuleControllers/production/post-production/postProduction.controller";
import { uploadPostProductionFiles, uploadPreProductionFiles } from "../../../middlewares/uploadWasabi";

const postProductionRoutes = Router();
const controller = new PostProductionController();

postProductionRoutes.post(
  "/vendorId/:vendorId/leadId/:leadId/upload-qc-photos",
  uploadPostProductionFiles.array("files", 10), // accept up to 10 images
  controller.uploadQcPhotos
);

postProductionRoutes.post(
  "/vendorId/:vendorId/leadId/:leadId/upload-hardware-packing-details",
  uploadPostProductionFiles.array("files", 10), // multiple docs
  controller.uploadHardwarePackingDetails
);

postProductionRoutes.post(
  "/vendorId/:vendorId/leadId/:leadId/upload-woodwork-packing-details",
  uploadPostProductionFiles.array("files", 10),
  controller.uploadWoodworkPackingDetails
);

// ✅ QC Photos
postProductionRoutes.get(
  "/vendorId/:vendorId/leadId/:leadId/get-qc-photos",
  controller.getQcPhotos
);

// ✅ Hardware Packing Details
postProductionRoutes.get(
  "/vendorId/:vendorId/leadId/:leadId/get-hardware-packing-details",
  controller.getHardwarePackingDetails
);

// ✅ Woodwork Packing Details
postProductionRoutes.get(
  "/vendorId/:vendorId/leadId/:leadId/get-woodwork-packing-details",
  controller.getWoodworkPackingDetails
);

postProductionRoutes.put(
  "/vendorId/:vendorId/leadId/:leadId/update-no-of-boxes",
  uploadPostProductionFiles.none(),
  controller.updateNoOfBoxes
);

// ✅ Get No. of Boxes by Lead ID
postProductionRoutes.get(
  "/vendorId/:vendorId/leadId/:leadId/get-no-of-boxes",
  controller.getNoOfBoxes
);

// ✅ Check Post-Production Completeness
postProductionRoutes.get(
  "/vendorId/:vendorId/leadId/:leadId/check-post-production-completeness",
  controller.checkPostProductionCompleteness
);

postProductionRoutes.put(
  "/vendorId/:vendorId/leadId/:leadId/mark-production-completed",
  controller.markProductionCompleted
);

// PUT → Move lead from Production (Type 10) → Ready To Dispatch (Type 11)
postProductionRoutes.put(
  "/vendorId/:vendorId/leadId/:leadId/move-to-ready-to-dispatch",
  controller.moveLeadToReadyToDispatch
);

// ✅ Pre-Production Files (Type 37)
postProductionRoutes.post(
  "/vendorId/:vendorId/leadId/:leadId/upload-pre-production-files",
  uploadPreProductionFiles.array("files", 10),
  controller.uploadPreProductionFiles
);

postProductionRoutes.get(
  "/vendorId/:vendorId/leadId/:leadId/get-pre-production-files",
  controller.getPreProductionFiles
);

postProductionRoutes.get(
  "/vendorId/:vendorId/leadId/:leadId/check-pre-production-files-ready",
  controller.checkPreProductionFilesReady
);

export default postProductionRoutes;
