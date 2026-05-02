import { Router } from "express";
import { FinalMeasurementController } from "../../controllers/leadModuleControllers/finalMeasurement/finalMeasurement.controller";
import { uploadFinalMeasurement } from "../../middlewares/uploadWasabi"; // assuming you already have multer setup

const finalMeasurementRouter = Router();
const finalMeasurementController = new FinalMeasurementController();

finalMeasurementRouter.post(
    "/onboard",
    uploadFinalMeasurement.fields([
        { name: "final_measurement_doc", maxCount: 20 },
        { name: "site_photos", maxCount: 20 },
        { name: "site_photos[]", maxCount: 20 },
    ]),
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

finalMeasurementRouter.put(
    "/vendorId/:vendorId/leadId/:leadId/notes",
    finalMeasurementController.updateCriticalDiscussionNotes
);

finalMeasurementRouter.post(
    "/add-files",
    uploadFinalMeasurement.fields([
        { name: "site_photos", maxCount: 20 },
        { name: "site_photos[]", maxCount: 20 },
    ]),
    finalMeasurementController.addMoreFinalMeasurementFiles
);


finalMeasurementRouter.post(
    "/add-site-photos",
    uploadFinalMeasurement.fields([
        { name: "site_photos", maxCount: 20 },
        { name: "site_photos[]", maxCount: 20 },
    ]),
    finalMeasurementController.addMoreFinalMeasurementSitePhotos
);

finalMeasurementRouter.post(
    "/add-final-measurement-docs",
    uploadFinalMeasurement.fields([{ name: "final_measurement_doc", maxCount: 20 }]),
    finalMeasurementController.addMoreFinalMeasurementDocs
);

finalMeasurementRouter.get(
    "/allLeads/vendorId/:vendorId/userId/:userId",
    finalMeasurementController.getFinalMeasurementLeads
);

finalMeasurementRouter.post("/leadId/:leadId/tasks/assign-fm", finalMeasurementController.assignTaskFM);


  
export { finalMeasurementRouter };
