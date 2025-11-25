import { Router } from "express";
import { PreProductionController } from "../../../controllers/leadModuleControllers/production/pre-production/PreProduction.controller";
import { upload } from "../../../middlewares/uploadWasabi";

const preProductionRoutes = Router();
const controller = new PreProductionController();

preProductionRoutes.get(
  "/vendorId/:vendorId/userId/:userId",
  controller.getAllPreProductionLeads
);

// PUT → Update completion details for multiple order login records
preProductionRoutes.put(
  "/vendorId/:vendorId/leadId/:leadId/handle-order-login-completion",
  upload.none(),
  controller.handleOrderLoginCompletion
);

// PUT → Update or remove company vendor selection with remark
preProductionRoutes.put(
  "/vendorId/:vendorId/leadId/:leadId/handle-factory-vendor-selection",
  upload.none(),
  controller.handleFactoryVendorSelection
);

preProductionRoutes.put(
  "/vendorId/:vendorId/leadId/:leadId/update-expected-order-login-date",
  PreProductionController.updateExpectedOrderLoginReadyDate
);

preProductionRoutes.get(
  "/vendorId/:vendorId/leadId/:leadId/check-post-production-ready",
  PreProductionController.checkPostProductionReady
);

preProductionRoutes.get(
  "/vendorId/:vendorId/get-latest-order-login",
  PreProductionController.getLatestOrderLoginByLead
);

export default preProductionRoutes;
