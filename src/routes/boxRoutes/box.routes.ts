import { Router } from 'express';
import {
  createBox,
  getAllBoxes,
  getBoxesByVendorAndProject,
  getBoxDetailsWithItems,
  getAllBoxesWithItemCount,
  updateBoxName
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

export default router;