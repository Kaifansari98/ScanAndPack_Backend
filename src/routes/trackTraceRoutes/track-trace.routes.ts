import { Router } from "express";
import multer from "multer";
import os from "os";

// Trigger dev server restart after service update
import { getAllProjectsTrackTrace } from "../../controllers/trackTraceController/project.controller";

import {
  getProjectBoxInfoFieldsController,
  saveBoxInfoValuesController,
  getBoxInfoValuesController,
} from "../../controllers/trackTraceController/boxInfo.controller";

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
  getTraceTraceDashboard,
  getProjectCategoryTypes,
  getProjectCategories,
  createProjectCategory,
  updateProjectCategory,
  toggleProjectCategoryStatus,
  getBrandMasters,
  createBrandMaster,
  updateBrandMaster,
  toggleBrandMasterStatus,
  deleteBrandMaster,
  getGradeMasters,
  createGradeMaster,
  updateGradeMaster,
  toggleGradeMasterStatus,
  deleteGradeMaster,
  getFinishMasters,
  createFinishMaster,
  updateFinishMaster,
  toggleFinishMasterStatus,
  deleteFinishMaster,
  getTypeMasters,
  createTypeMaster,
  updateTypeMaster,
  toggleTypeMasterStatus,
  deleteTypeMaster,
  getCoreProductMasters,
  createCoreProductMaster,
  updateCoreProductMaster,
  toggleCoreProductMasterStatus,
  deleteCoreProductMaster,
  unsetBoxFromMapping,
  markBoxFactoryOut,
  markBoxSiteIn,
  checkToken,
  syncCategories,
  getProjectDetail,
  getBoxItems,
  getDefectDashboard,
  getProjectDefects,
  getDefectSummary,
  getPendingDefects,
  getResolvedDefects,
  uploadBrandLogo,
  createUnitMaster,
  getManualPackingItemsController,
  addManualPackingItem,
  getProjectCutList,
  getProjectItemTracking
} from "../../controllers/trackTraceController/trackTrace.controller";

import {
  scan_item,
  check_item,
  get_defect,
  mark_Defect,
  check_defect,
  getScanStatsDashboard,
} from "../../controllers/trackTraceController/trackTrace.controller";

import { uploadMachineExcel } from "../../../src/controllers/trackTraceController/upload-cutlist.controller";

const router = Router();
const uploadDisk = multer({ dest: os.tmpdir() });
const uploadMemory = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } });

router.get("/project/:vendor_id", getAllProjectsTrackTrace);
router.get("/get-filter-track-trace/:vendor_id", get_filter_track_trace);

router.post("/scan/item", uploadDisk.array("photos[]", 10), scan_item);
// router.post('/scan/item', scan_item);
router.post("/scan/check-item", check_item);

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

router.get("/defect-master/:vendor_id", get_defect);

router.post("/mark-defect", uploadDisk.array("photos[]", 10), mark_Defect);
// router.post('/mark-defect',mark_Defect);
router.post("/scan/check-defect", check_defect);
router.get(
  "/get-scan-status-dashboard/:vendor_id/:user_id",
  getScanStatsDashboard,
);
router.get("/rework-machines/:vendor_id/:machine_id", getReworkMachines);

router.get("/user-modules/:vendor_id/:user_id", getUserModules);
router.get("/quality-check-projects/:vendor_id", getQualityCheckProjects);

router.get("/dashboard/:vendor_id", getTraceTraceDashboard);

router.patch(
  "/mapping/:id/:project_id/:vendor_id/unset-box",
  unsetBoxFromMapping,
);

// const upload = multer({
//   storage,
// });

const upload = multer({ storage: multer.memoryStorage() });
router.post(
  "/upload-machine-excel/:vendor_id/:project_token",
  upload.single("file"),
  uploadMachineExcel,
);

router.get("/project-categories/types", getProjectCategoryTypes);
router.get("/project-categories/:vendor_id", getProjectCategories);
router.post("/project-categories", createProjectCategory);
router.put("/project-categories/:id", updateProjectCategory);
router.patch("/project-categories/:id/status", toggleProjectCategoryStatus);

// Brand Master
router.get("/brands/:vendor_id", getBrandMasters);
router.post("/brands/upload-logo", uploadMemory.single("logo"), uploadBrandLogo);
router.post("/brands", createBrandMaster);
router.put("/brands/:id", updateBrandMaster);
router.patch("/brands/:id/status", toggleBrandMasterStatus);
router.delete("/brands/:id", deleteBrandMaster);

// Grade Master
router.get("/grades/:vendor_id", getGradeMasters);
router.post("/grades", createGradeMaster);
router.put("/grades/:id", updateGradeMaster);
router.patch("/grades/:id/status", toggleGradeMasterStatus);
router.delete("/grades/:id", deleteGradeMaster);

// Finish Master
router.get("/finishes/:vendor_id", getFinishMasters);
router.post("/finishes", createFinishMaster);
router.put("/finishes/:id", updateFinishMaster);
router.patch("/finishes/:id/status", toggleFinishMasterStatus);
router.delete("/finishes/:id", deleteFinishMaster);

// Type Master
router.get("/types/:vendor_id", getTypeMasters);
router.post("/types", createTypeMaster);
router.put("/types/:id", updateTypeMaster);
router.patch("/types/:id/status", toggleTypeMasterStatus);
router.delete("/types/:id", deleteTypeMaster);

// Core Product Master
router.get("/core-products/:vendor_id", getCoreProductMasters);
router.post("/core-products", createCoreProductMaster);
router.put("/core-products/:id", updateCoreProductMaster);
router.patch("/core-products/:id/status", toggleCoreProductMasterStatus);
router.delete("/core-products/:id", deleteCoreProductMaster);

// Units Master
router.post("/units", createUnitMaster);


router.patch("/boxes/:box_id/factory-out", markBoxFactoryOut);
router.patch("/boxes/:box_id/site-in", markBoxSiteIn);

router.get("/category/project-categories/check-token", checkToken);
router.post("/category/project-categories/sync", syncCategories);

router.get("/project-detail/:vendor_id/:project_id", getProjectDetail);
router.get("/project-detail/:vendor_id/:project_id/cut-list",getProjectCutList);
router.get("/project-detail/:vendor_id/:project_id/box/:box_id", getBoxItems);

router.get("/defect-dashboard/:vendor_id", getDefectDashboard);
router.get(
  "/defect-dashboard/:vendor_id/project/:unique_project_id",
  getProjectDefects,
);

router.get("/defect-dashboard/:vendor_id/summary", getDefectSummary);
router.get("/defect-dashboard/:vendor_id/pending", getPendingDefects);
router.get("/defect-dashboard/:vendor_id/resolved", getResolvedDefects);


router.get(
  "/projects/:project_id/box-info-fields",
  getProjectBoxInfoFieldsController
);

router.get(
  "/boxes/:box_id/info-values",
  getBoxInfoValuesController
);

router.post(
  "/boxes/:box_id/info-values",
  saveBoxInfoValuesController
);

router.get(
  "/boxes/packing/manual-items",
  getManualPackingItemsController
);

router.post(
  "/boxes/packing/manual-items",
  addManualPackingItem
);

router.get(
  "/vendor/:vendorId/project/:projectId/items",
  getProjectItemTracking,
);


// router.post(
//   "/upload-machine-excel/:vendor_id/:project_token",
//   upload.single("file"),
//   uploadMachineExcel,
// );

export default router;
