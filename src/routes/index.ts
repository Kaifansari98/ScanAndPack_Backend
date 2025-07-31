import { Router } from 'express';
import vendorRoutes from './vendor.routes';
import vendorAddressRoutes from './vendorAddress.routes';
import vendorTaxInfoRoutes from './vendorTaxInfo.routes';

import userRoutes from './userRoutes/user.routes';
import userTypeRoutes from "./userRoutes/userType.routes";
import userDocumentRoutes from "./userRoutes/userDocument.routes";
import projectRoutes from './projectRoutes/project.routes';

import boxRoutes from './boxRoutes/box.routes';
import scanItemRoutes from './sapRoutes/scanAndPack.routes';

import authRoutes from './auth/auth.routes';

import vendorTokenRoutes from './vendorRoutes/vendorToken.routes';

import clientRoutes from "./clientRoutes/client.routes";

const router = Router();

router.use('/vendors', vendorRoutes);
router.use('/vendor-address', vendorAddressRoutes);
router.use('/vendor-tax-info', vendorTaxInfoRoutes);
router.use('/vendor-tokens', vendorTokenRoutes);

router.use('/users', userRoutes);
router.use("/user-types", userTypeRoutes);
router.use("/user-documents", userDocumentRoutes);

router.use('/projects', projectRoutes);

router.use('/boxes', boxRoutes);
router.use('/scan-items', scanItemRoutes);

router.use('/auth', authRoutes);

router.use("/clients", clientRoutes);

export { router };