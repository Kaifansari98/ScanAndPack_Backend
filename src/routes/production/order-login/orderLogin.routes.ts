import { Router } from "express";
import { OrderLoginController } from "../../../controllers/leadModuleControllers/production/order-login/orderLogin.controller";
import multer from "multer";
import { uploadProductionFiles } from "../../../middlewares/uploadWasabi";

const upload = multer();
const orderLoginRoutes = Router();
const controller = new OrderLoginController();

// POST → Create Order Login entry
orderLoginRoutes.post(
  "/vendorId/:vendorId/upload-file-breakups",
  upload.none(),
  controller.uploadFileBreakups
);

orderLoginRoutes.post(
  "/vendorId/:vendorId/leadId/:leadId/accountId/:accountId/upload-multiple-file-breakups",
  upload.none(),
  controller.uploadMultipleFileBreakupsByLead
);

orderLoginRoutes.get(
  "/vendorId/:vendorId/get-order-login-details",
  controller.getOrderLoginByLead
);

orderLoginRoutes.put(
  "/vendorId/:vendorId/order-login-id/:orderLoginId/update",
  upload.none(),
  controller.updateOrderLogin
);

orderLoginRoutes.put(
  "/vendorId/:vendorId/leadId/:leadId/update-multiple",
  upload.none(),
  controller.updateMultipleOrderLogins
);

orderLoginRoutes.get(
  "/vendorId/:vendorId/userId/:userId",
  controller.getAllOrderLoginLeads
);

orderLoginRoutes.get(
  "/vendorId/:vendorId/leadId/:leadId/tech-check-approved",
  controller.getApprovedTechCheckDocuments
);

orderLoginRoutes.post(
  "/vendorId/:vendorId/leadId/:leadId/upload-production-files",
  uploadProductionFiles.array("files", 10), // ✅ accept up to 10 files
  controller.uploadProductionFiles
);

orderLoginRoutes.get(
  "/vendorId/:vendorId/leadId/:leadId/production-files",
  controller.getProductionFiles
);

orderLoginRoutes.put(
  "/vendorId/:vendorId/leadId/:leadId/move-to-production-stage",
  upload.none(),
  controller.updateLeadToProductionStage
);

orderLoginRoutes.get(
  "/vendorId/:vendorId/leadId/:leadId/move-to-production-readiness-check",
  controller.getLeadProductionReadiness
);

orderLoginRoutes.get(
  "/factory-users/vendorId/:vendorId",
  controller.fetchFactoryUsersByVendor
);

export default orderLoginRoutes;
