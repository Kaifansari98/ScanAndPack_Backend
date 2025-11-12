import { Router } from "express";
import { DispatchStageController } from "../../../controllers/installation/dispatch/DispatchStage.controller";
import { upload } from "../../../middlewares/uploadWasabi";

const dispatchStageRoutes = Router();
const controller = new DispatchStageController();

/** ✅ GET → Fetch all Dispatch Stage leads (Type 14) */
dispatchStageRoutes.get(
  "/vendorId/:vendorId/userId/:userId",
  controller.getAllDispatchStageLeads
);

/** ✅ GET → Fetch required_date_for_dispatch by vendorId & leadId */
dispatchStageRoutes.get(
  "/vendor/:vendorId/lead/:leadId/required-date",
  controller.getRequiredDateForDispatch
);

/** ✅ POST → Add Dispatch Details */
dispatchStageRoutes.post(
  "/vendor/:vendorId/lead/:leadId/dispatch-details",
  controller.addDispatchDetails
);

/** ✅ GET → Fetch Dispatch details by Vendor ID & Lead ID */
dispatchStageRoutes.get(
  "/vendor/:vendorId/lead/:leadId/dispatch-details",
  controller.getDispatchDetails
);

// ✅ POST → Upload Dispatch Photos & Documents
dispatchStageRoutes.post(
  "/vendorId/:vendorId/leadId/:leadId/upload-dispatch-documents",
  upload.array("files", 10), // accept up to 10 images/docs
  controller.uploadDispatchDocuments
);

// ✅ GET → Fetch Dispatch Photos & Documents (with Signed URLs)
dispatchStageRoutes.get(
  "/vendorId/:vendorId/leadId/:leadId/dispatch-documents",
  controller.getDispatchDocuments
);

// ✅ GET → Check if Lead is Ready for Post-Dispatch
dispatchStageRoutes.get(
  "/vendorId/:vendorId/leadId/:leadId/check-ready-for-post-dispatch",
  controller.checkReadyForPostDispatch
);

// ✅ POST → Upload Post Dispatch Photos & Documents
dispatchStageRoutes.post(
  "/vendorId/:vendorId/leadId/:leadId/upload-post-dispatch-documents",
  upload.array("files", 10), // accept up to 10 images/docs
  controller.uploadPostDispatchDocuments
);

// ✅ GET → Fetch Post Dispatch Photos & Documents (with signed URLs)
dispatchStageRoutes.get(
  "/vendorId/:vendorId/leadId/:leadId/post-dispatch-documents",
  controller.getPostDispatchDocuments
);

// ✅ POST → Create Pending Material Task
dispatchStageRoutes.post(
  "/vendorId/:vendorId/leadId/:leadId/create-pending-material",
  controller.createPendingMaterialTask
);

// ✅ GET → Fetch all Pending Material Tasks
dispatchStageRoutes.get(
  "/vendorId/:vendorId/leadId/:leadId/pending-material-tasks",
  controller.getPendingMaterialTasks
);

export default dispatchStageRoutes;
