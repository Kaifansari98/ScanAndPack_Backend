import { Router } from "express";
import vendorRoutes from "./vendor.routes";
import vendorAddressRoutes from "./vendorAddress.routes";
import vendorTaxInfoRoutes from "./vendorTaxInfo.routes";
import userRoutes from "./userRoutes/user.routes";
import userTypeRoutes from "./userRoutes/userType.routes";
import userDocumentRoutes from "./userRoutes/userDocument.routes";
import projectRoutes from "./projectRoutes/project.routes";
import boxRoutes from "./boxRoutes/box.routes";
import scanItemRoutes from "./sapRoutes/scanAndPack.routes";
import authRoutes from "./auth/auth.routes";
import vendorTokenRoutes from "./vendorRoutes/vendorToken.routes";
import clientRoutes from "./clientRoutes/client.routes";
import Statsrouter from "./generic/leadStats.routes";

// Leads Routes
import leadModuleRoutes from "./leadModuleRoutes/lead.routes";
import { paymentUploadRoutes } from "./leadModuleRoutes/initial-site-measurement.routes";
import DesigningStageRouter from "./leadModuleRoutes/desigingStage/designing-stage.routes";
import bookingStageRouter from "./bookingStageRoutes/booking-stage.routes";
import { finalMeasurementRouter } from "./finalMeasurementStage/finalMeasurement.routes";
import ClientDocumentationRouter from "./clientDocumentationRoutes/clientDocumentation.routes";
import taskRouter from "./task/task.routes";
import leadActivityStatusRouter from "./leadModuleRoutes/leadActivityStatus.routes";
import { clientApprovalRouter } from "./clientApprovalStage/clientApproval.routes";
import { techCheckRouter } from "./production/tech-check/tech-check.routes";
import companyVendorsRoutes from "./generic/companyVendors.routes";
import orderLoginRoutes from "./production/order-login/orderLogin.routes";
import preProductionRoutes from "./production/pre-production/preProduction.routes";
import postProductionRoutes from "./production/post-production/postProductionRoutes";
import readyToDispatchRoutes from "./production/ready-to-dispatch/ReadyToDispatch.routes";
import siteReadinessRoutes from "./installation/site-readiness/SiteReadiness.routes";
import dispatchPlanningRoutes from "./installation/dispatch-planning/dispatchPlanning.routes";
import dispatchStageRoutes from "./installation/dispatch/DispatchStage.routes";
import installerUserRoutes from "./installerUser.routes";
import underInstallationStageRoutes from "./installation/under-installation/underInstallation.routes";

const router = Router();

router.use("/vendors", vendorRoutes);
router.use("/vendor-address", vendorAddressRoutes);
router.use("/vendor-tax-info", vendorTaxInfoRoutes);
router.use("/vendor-tokens", vendorTokenRoutes);

router.use("/users", userRoutes);
router.use("/user-types", userTypeRoutes);
router.use("/user-documents", userDocumentRoutes);

router.use("/projects", projectRoutes);
router.use("/boxes", boxRoutes);
router.use("/scan-items", scanItemRoutes);
router.use("/auth", authRoutes);
router.use("/clients", clientRoutes);
router.use("/leads", leadModuleRoutes);
router.use("/leads/initial-site-measurement", paymentUploadRoutes);
router.use("/leads/designing-stage", DesigningStageRouter);
router.use("/leads/stats", Statsrouter);
router.use("/vendor/company-vendors", companyVendorsRoutes);
router.use("/leads/bookingStage", bookingStageRouter);
router.use("/leads/final-measurement", finalMeasurementRouter);
router.use("/leads/client-documentation", ClientDocumentationRouter);
router.use("/leads/tasks", taskRouter);
router.use("/leads/lead-activity-status", leadActivityStatusRouter);
router.use("/leads/client-approval", clientApprovalRouter);

router.use("/leads/production/tech-check", techCheckRouter);
router.use("/leads/production/order-login", orderLoginRoutes);
router.use("/leads/production/pre-production", preProductionRoutes);
router.use("/leads/production/post-production", postProductionRoutes);
router.use("/leads/production/ready-to-dispatch", readyToDispatchRoutes);

router.use("/leads/installation/site-readiness", siteReadinessRoutes);
router.use("/leads/installation/dispatch-planning", dispatchPlanningRoutes);
router.use("/leads/installation/dispatch", dispatchStageRoutes);
router.use("/leads/installation/under-installation", underInstallationStageRoutes);

router.use("/installer-users", installerUserRoutes);

export { router };
