import { Router } from "express";
import { DispatchPlanningController } from "../../../controllers/installation/dispatch-planning/DispatchPlanning.controller";
import { upload } from "../../../middlewares/uploadWasabi";

const dispatchPlanningRoutes = Router();
const controller = new DispatchPlanningController();

/** ✅ GET → Fetch all Dispatch Planning leads (Type 13) */
dispatchPlanningRoutes.get(
  "/vendorId/:vendorId/userId/:userId",
  controller.getAllDispatchPlanningLeads
);

// 1️⃣ Dispatch Planning Info
dispatchPlanningRoutes.post(
  "/info/vendorId/:vendorId/leadId/:leadId",
  controller.saveDispatchPlanningInfo
);

// 2️⃣ Dispatch Planning Payment (multipart/form-data)
dispatchPlanningRoutes.post(
  "/payment/vendorId/:vendorId/leadId/:leadId",
  upload.single("payment_proof_file"),
  controller.saveDispatchPlanningPayment
);

// ✅ NEW: GET APIs
dispatchPlanningRoutes.get(
  "/info/vendorId/:vendorId/leadId/:leadId",
  controller.getDispatchPlanningInfo
);

dispatchPlanningRoutes.get(
  "/payment/vendorId/:vendorId/leadId/:leadId",
  controller.getDispatchPlanningPayment
);

dispatchPlanningRoutes.get(
  "/pending-project-amount/vendorId/:vendorId/leadId/:leadId",
  controller.getPendingProjectAmount
);

export default dispatchPlanningRoutes;
