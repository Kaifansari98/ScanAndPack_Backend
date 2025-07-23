import { Router } from 'express';
import {
  createBox,
  getAllBoxes,
  getBoxesByVendorAndProject,
} from '../../controllers/boxControllers/box.controller';

const router = Router();

router.post('/', createBox);
router.get('/', getAllBoxes); // Get all boxes
router.get('/vendor/:vendorId/project/:projectId', getBoxesByVendorAndProject); // Filtered

export default router;