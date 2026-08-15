import { Router } from 'express';
import {
  createBox,
  getAllBoxes,
  getBoxesByVendorAndProject,
  // getBoxDetailsWithItems,
  getAllBoxesWithItemCount,
  updateBoxName,
  markBoxAsPacked,
  markBoxAsUnpacked,
  // deleteBoxAndItsScanItems,
  // getGroupedItemInfo,
  generateBoxPdf,
  generateProjectBoxPdf,
  generateAllBoxesPdf,
  generateProjectFullReport,
  markItemSiteIn,
  getBoxSiteInStatus,
  getBoxDetailsWithItems,
  getProjectBoxInfoFields,
  getBoxInfoValues,
  getManualBoxSiteInItems,
  verifyManualBoxSiteInItem

} from '../../controllers/boxControllers/box.controller';


const router = Router();

router.post('/', createBox);
router.get('/', getAllBoxes); // Get all boxes
router.get('/vendor/:vendorId/project/:projectId', getBoxesByVendorAndProject); // Filtered

// 🔥 NEW API: Get full box + vendor + item details
router.get(
  '/details/vendor/:vendorId/project/:projectId/box/:boxId',
  getBoxDetailsWithItems
);

router.get(
  '/details/vendor/:vendorId/project/:projectId/client/:clientId/boxes',
  getAllBoxesWithItemCount
);

router.put('/update-name', updateBoxName);

router.put('/status/packed/:boxId', markBoxAsPacked);
router.put('/status/unpacked/:boxId', markBoxAsUnpacked);

// router.delete('/delete/:boxId', deleteBoxAndItsScanItems);

// router.get('/grouped-info/:boxId', getGroupedItemInfo);

router.get('/boxes/pdf/:boxId/:project_id/:vendor_id', generateBoxPdf);
router.get('/boxes/pdf/:boxId/:project_id/:vendor_id/web', generateBoxPdf);

router.get('/boxes/projects/:project_id/:vendor_id', generateProjectBoxPdf);
router.get("/all-boxes-pdf/:project_id/:vendor_id", generateAllBoxesPdf);

router.get("/project-full-report/:project_id/:vendor_id", generateProjectFullReport);
router.get("/project-full-report/:project_id/:vendor_id/web", generateProjectFullReport);

router.patch("/boxes/:box_id/items/site-in", markItemSiteIn);
router.get("/boxes/:box_id/site-in-status", getBoxSiteInStatus);

router.get(
  "/project/:projectId/vendor/:vendorId/box-info-fields",
  getProjectBoxInfoFields
);

router.get(
  "/:boxId/info-values",
  getBoxInfoValues
);

router.get(
  "/boxes/:box_id/items/manual-site-in",
  getManualBoxSiteInItems
);

// NEW - verify/update one manually packed mapping row
router.patch(
  "/boxes/:box_id/items/manual-site-in/:mapping_id",
  verifyManualBoxSiteInItem
);


export default router;