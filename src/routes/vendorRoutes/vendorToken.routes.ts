import express from 'express';
import { createVendorToken } from '../../controllers/vendorControllers/vendorToken.controller';

const router = express.Router();

router.post('/generate', createVendorToken);

export default router;