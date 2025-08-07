import { Router } from 'express';
import {
  createBox,
  getAllBoxes,
  getBoxesByVendorAndProject,
  getBoxDetailsWithItems,
  getAllBoxesWithItemCount,
  updateBoxName,
  markBoxAsPacked,
  markBoxAsUnpacked,
  deleteBoxAndItsScanItems,
  getGroupedItemInfo
} from '../../controllers/boxControllers/box.controller';

const router = Router();

router.post('/', createBox);
router.get('/', getAllBoxes); // Get all boxes
router.get('/vendor/:vendorId/project/:projectId', getBoxesByVendorAndProject); // Filtered

// 🔥 NEW API: Get full box + vendor + item details
router.get(
  '/details/vendor/:vendorId/project/:projectId/client/:clientId/box/:boxId',
  getBoxDetailsWithItems
);

router.get(
  '/details/vendor/:vendorId/project/:projectId/client/:clientId/boxes',
  getAllBoxesWithItemCount
);

router.put('/update-name', updateBoxName);

router.put('/status/packed/:boxId', markBoxAsPacked);
router.put('/status/unpacked/:boxId', markBoxAsUnpacked);

router.delete('/delete/:boxId', deleteBoxAndItsScanItems);

router.get('/grouped-info/:boxId', getGroupedItemInfo);

export default router;