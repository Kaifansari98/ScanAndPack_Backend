import { Router } from "express";
import { uploadServicingFiles } from "../../../middlewares/uploadWasabi";
import { ServicingController } from "../../../controllers/installation/servicing/Servicing.controller";

const servicingRoutes = Router();
const controller = new ServicingController();

servicingRoutes.post(
  "/upload",
  uploadServicingFiles.fields([{ name: "amc_contract_documents", maxCount: 10 }]),
  controller.uploadAmcContractDocuments,
);

servicingRoutes.put(
  "/vendorId/:vendorId/leadId/:leadId/serviceId/:serviceId/reschedule",
  controller.rescheduleService,
);

servicingRoutes.get(
  "/vendorId/:vendorId/leadId/:leadId/schedules",
  controller.getServiceSchedules,
);

servicingRoutes.get(
  "/vendorId/:vendorId/leadId/:leadId/documents",
  controller.getAmcContractDocuments,
);

export default servicingRoutes;
