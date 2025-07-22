import { Router } from 'express';
import { createVendor, getAllVendors } from '../controllers/vendor.controller';

const router = Router();

router.post('/', createVendor);
router.get('/', getAllVendors);

export default router;