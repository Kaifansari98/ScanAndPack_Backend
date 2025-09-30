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

import Statsrouter from './generic/leadStats.routes';

// Leads Routes
import leadModuleRoutes from "./leadModuleRoutes/lead.routes"
import { paymentUploadRoutes } from './leadModuleRoutes/initial-site-measurement.routes';
import DesigningStageRouter from './leadModuleRoutes/desigingStage/designing-stage.routes';
import bookingStageRouter from './bookingStageRoutes/booking-stage.routes';

import { finalMeasurementRouter } from './finalMeasurementStage/finalMeasurement.routes';
import ClientDocumentationRouter from './clientDocumentationRoutes/clientDocumentation.routes';
import taskRouter from './task/task.routes';
import leadActivityStatusRouter from './leadModuleRoutes/leadActivityStatus.routes';

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

router.use("/leads", leadModuleRoutes);
router.use("/leads/initial-site-measurement", paymentUploadRoutes);

router.use("/leads/designing-stage", DesigningStageRouter);

router.use("/leads/stats", Statsrouter);
router.use("/leads/bookingStage", bookingStageRouter);

router.use("/leads/final-measurement", finalMeasurementRouter);
router.use("/leads/client-documentation", ClientDocumentationRouter);

router.use("/leads/tasks", taskRouter);

router.use("/leads/lead-activity-status", leadActivityStatusRouter);

export { router };