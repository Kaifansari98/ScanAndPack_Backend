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

servicingRoutes.post(
  "/complete",
  uploadServicingFiles.fields([
    { name: "service_completion_documents", maxCount: 10 },
  ]),
  controller.completeService,
);

servicingRoutes.put(
  "/vendorId/:vendorId/leadId/:leadId/serviceId/:serviceId/reschedule",
  controller.rescheduleService,
);

servicingRoutes.put(
  "/vendorId/:vendorId/leadId/:leadId/serviceId/:serviceId/reject",
  controller.rejectService,
);

servicingRoutes.put(
  "/vendorId/:vendorId/leadId/:leadId/serviceId/:serviceId/reopen",
  controller.reopenRejectedService,
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
