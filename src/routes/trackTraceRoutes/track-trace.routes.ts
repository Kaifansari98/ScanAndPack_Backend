import { Router } from "express";
import multer from "multer";
import os from "os";


import { getAllProjectsTrackTrace } from "../../controllers/trackTraceController/project.controller";

import {
  getAllMachines,
  getKPIS,
  getRealTimeItemTracking,
  getMachineStatus,
  getHourlyProduction,
  getMachineUtilization,
  getTopPerformer,
  getProjectProgress,
  getBottleNeck,
  get_filter_track_trace,
  getCutListMachine,
  assignMachine,
  createQR,
  downloadCutListExcel,
  downloadCutListExcelFile,
  downloadQrLabelsFile,
  getVendorLead,
  linkLeadToProject,
  getReworkMachines,
  getUserModules,
  getQualityCheckProjects,
} from "../../controllers/trackTraceController/trackTrace.controller";

import { 
    scan_item,
    check_item,
    get_defect,
    mark_Defect,
    check_defect,
    getScanStatsDashboard
} from '../../controllers/trackTraceController/trackTrace.controller';

import { uploadMachineExcel } from "../../../src/controllers/trackTraceController/upload-cutlist.controller";


const router = Router();
const uploadDisk = multer({ dest: os.tmpdir() });

router.get("/project/:vendor_id", getAllProjectsTrackTrace);
router.get("/get-filter-track-trace/:vendor_id", get_filter_track_trace);


router.post('/scan/item', uploadDisk.array("photos[]", 10), scan_item);
// router.post('/scan/item', scan_item);
router.post('/scan/check-item', check_item);


router.get("/machines/:vendor_id/:user_id", getAllMachines);

router.get("/kpis/:vendor_id", getKPIS);

router.get("/items/:vendor_id", getRealTimeItemTracking);
router.get("/machine-status/:vendor_id", getMachineStatus);
router.get("/hourly-production/:vendor_id", getHourlyProduction);
router.get("/machine-utilization/:vendor_id", getMachineUtilization);
router.get("/top-performer/:vendor_id", getTopPerformer);
router.get("/project-progress/:vendor_id", getProjectProgress);
router.get("/bottle-neck/:vendor_id", getBottleNeck);

router.get("/cut-list-machine/:vendor_id/:project_id", getCutListMachine);

router.post("/assign-machine", assignMachine);

router.post("/create-qr-code", createQR);
router.get("/qr-labels/:filename", downloadQrLabelsFile);

router.post("/download-cut-list-excel", downloadCutListExcel);
router.get("/cutlist-excel/:filename", downloadCutListExcelFile);

router.get("/leads/search/:vendor_id/:search", getVendorLead);

router.post("/link-lead/:project_id/lead", linkLeadToProject);

const storage = multer.memoryStorage();

router.get('/defect-master/:vendor_id',get_defect);

router.post('/mark-defect', uploadDisk.array("photos[]", 10), mark_Defect);
// router.post('/mark-defect',mark_Defect);
router.post('/scan/check-defect', check_defect);
router.get('/get-scan-status-dashboard/:vendor_id/:user_id',getScanStatsDashboard);
router.get('/rework-machines/:vendor_id/:machine_id', getReworkMachines);

router.get('/user-modules/:vendor_id/:user_id', getUserModules);
router.get('/quality-check-projects/:vendor_id', getQualityCheckProjects);




// const upload = multer({
//   storage,
// });

const upload = multer({ storage: multer.memoryStorage() });
router.post(
  "/upload-machine-excel/:vendor_id/:project_token",
  upload.single("file"),
  uploadMachineExcel,
);


// router.post(
//   "/upload-machine-excel/:vendor_id/:project_token",
//   upload.single("file"),
//   uploadMachineExcel,
// );

export default router;
