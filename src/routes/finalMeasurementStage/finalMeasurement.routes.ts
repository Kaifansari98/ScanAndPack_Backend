import { Router } from "express";
import { FinalMeasurementController } from "../../controllers/leadModuleControllers/finalMeasurement/finalMeasurement.controller";
import { uploadFinalMeasurement } from "../../middlewares/uploadWasabi"; // assuming you already have multer setup
import { handleMulterUpload } from "../../middlewares/handleMulterUpload";
const finalMeasurementRouter = Router();
const finalMeasurementController = new FinalMeasurementController();

finalMeasurementRouter.post(
    "/onboard",
    handleMulterUpload(uploadFinalMeasurement.fields([
        { name: "final_measurement_doc" },
        { name: "site_photos" },
        { name: "site_photos[]" },
    ])),
    finalMeasurementController.createFinalMeasurementStage
);

// GET /api/leads/final-measurement/all/:vendorId?userId=123&page=1&limit=10
finalMeasurementRouter.get(
    "/all/:vendorId",
    finalMeasurementController.getAllFinalMeasurementLeadsByVendorId
);    

finalMeasurementRouter.get(
    "/vendorId/:vendorId/leadId/:leadId",
    finalMeasurementController.getFinalMeasurementLead
);  

finalMeasurementRouter.get(
    "/leadId/:leadId/task-conflicts",
    finalMeasurementController.getRestrictedTaskConflicts
);

finalMeasurementRouter.patch(
    "/leadId/:leadId/taskId/:taskId/reschedule",
    finalMeasurementController.rescheduleFinalMeasurementTask
);

finalMeasurementRouter.put(
    "/vendorId/:vendorId/leadId/:leadId/notes",
    finalMeasurementController.updateCriticalDiscussionNotes
);

finalMeasurementRouter.post(
    "/add-files",
    handleMulterUpload(uploadFinalMeasurement.fields([
        { name: "site_photos" },
        { name: "site_photos[]" },
    ])),
    finalMeasurementController.addMoreFinalMeasurementFiles
);


finalMeasurementRouter.post(
    "/add-site-photos",
    handleMulterUpload(uploadFinalMeasurement.fields([
        { name: "site_photos" },
        { name: "site_photos[]" },
    ])),
    finalMeasurementController.addMoreFinalMeasurementSitePhotos
);

finalMeasurementRouter.post(
    "/add-final-measurement-docs",
    handleMulterUpload(uploadFinalMeasurement.fields([{ name: "final_measurement_doc" }])),
    finalMeasurementController.addMoreFinalMeasurementDocs
);

finalMeasurementRouter.get(
    "/allLeads/vendorId/:vendorId/userId/:userId",
    finalMeasurementController.getFinalMeasurementLeads
);

finalMeasurementRouter.post("/leadId/:leadId/tasks/assign-fm", finalMeasurementController.assignTaskFM);


  
export { finalMeasurementRouter };
