// src/routes/vendorTaxInfo.routes.ts
import express from 'express';
import { addVendorTaxInfo } from '../controllers/vendorTaxInfo.controller';

const router = express.Router();

router.post('/', addVendorTaxInfo);

export default router;