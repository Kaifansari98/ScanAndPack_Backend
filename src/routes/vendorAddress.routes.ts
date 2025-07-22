import { Router } from 'express';
import { createVendorAddress } from '../controllers/vendorAddress.controller';

const router = Router();

router.post('/', createVendorAddress);

export default router;