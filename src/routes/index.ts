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
import clientTypeRoutes from "./clientTypeRoutes/clientType.routes";
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
import miscRoutes from "./miscellaneousMaster.routes";
import issueLogRoutes from "./issueLogRoutes";
import finalHandoverStageRoutes from "./installation/final-handover/FinalHandoverStage.routes";
import servicingRoutes from "./installation/servicing/Servicing.routes";
import DashboardRouter from "./dashboard/dashboard.route";
import chatRoutes from "./chat/chat.routes";
import notificationRoutes from "./notification/notification.routes";
import emailNotificationMasterRoutes from "./notification/emailNotificationMaster.routes";
import contactUsRoutes from "./generic/contactUs.routes";
import franchiseRoutes from "./franchise/franchise.routes";
import geographyMasterRoutes from "./generic/geographyMaster.routes";
import leadSuperAdminApprovalLockInRouter from "./leadSuperAdminApprovalLockIn/leadSuperAdminApprovalLockIn.routes";
import approvalRequestRouter from "./approval-request/approvalRequest.routes";
import clientVisitRouter from "./client-visit/clientVisit.routes";

import trackTraceRoutes from "./trackTraceRoutes/track-trace.routes";
import trackTraceMasterRoutes from "./trackTraceRoutes/trackTraceMaster.routes";
import configureRoutes from "./trackTraceRoutes/configure.routes";
import tracktraceProjectRoutes from "./trackTraceRoutes/track-trace-project.routes";
import themeRoutes from "./theme/theme.routes";
import cadbidIntegrationWithFurnixcrmRoutes from "./cadbid-integration-with-furnixcrm/CadbidIntegrationWithFurnixcrm.routes";

import inventoryRoutes from "./inventoryRoutes/inventory.routes";
import purchaseOrderRoutes from "./purchaseOrderRoutes/purchaseOrder.routes";
import grnRoutes from "./grnRoutes/grn.routes";
import architectureMasterRoutes from "./architectureMasterRoutes/architectureMaster.route";
import paymentRequisitionRoutes from "./inventoryRoutes/payment-requisitions.routes";
const router = Router();

router.use("/dashboard", DashboardRouter);

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
router.use("/client-types", clientTypeRoutes);
router.use("/leads", leadModuleRoutes);
router.use("/leads/initial-site-measurement", paymentUploadRoutes);
router.use("/leads/designing-stage", DesigningStageRouter);
router.use("/leads/stats", Statsrouter);
router.use("/vendor/company-vendors", companyVendorsRoutes);
router.use("/leads/bookingStage", bookingStageRouter);
router.use("/leads/final-measurement", finalMeasurementRouter);
router.use("/leads/client-documentation", ClientDocumentationRouter);
router.use("/leads/tasks", taskRouter);
router.use(
  "/leads/super-admin-approval-lockins",
  leadSuperAdminApprovalLockInRouter,
);
router.use("/leads/approval-requests", approvalRequestRouter);
router.use("/leads/client-visits", clientVisitRouter);
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
router.use(
  "/leads/installation/under-installation",
  underInstallationStageRoutes,
);

router.use("/installer-users", installerUserRoutes);
router.use("/miscellaneous-master", miscRoutes);
router.use("/issue-logs", issueLogRoutes);

router.use("/leads/installation/final-handover", finalHandoverStageRoutes);
router.use("/leads/installation/servicing", servicingRoutes);
router.use("/leads/chats", chatRoutes);
router.use("/notifications", notificationRoutes);
router.use("/email-notification-master", emailNotificationMasterRoutes);
router.use("/public", contactUsRoutes);
router.use("/franchises", franchiseRoutes);
router.use("/geography-masters", geographyMasterRoutes);

router.use("/track-trace", trackTraceRoutes);
router.use("/track-trace-master", trackTraceMasterRoutes);
router.use("/track-trace-configure", configureRoutes);
router.use("/track-trace-project", tracktraceProjectRoutes);
router.use("/themes", themeRoutes);
router.use("/inventory", inventoryRoutes);
router.use("/purchase-orders", purchaseOrderRoutes);
router.use("/grn", grnRoutes);
router.use("/architecture-masters", architectureMasterRoutes);

router.use(
  "/cadbid-integration-with-furnixcrm",
  cadbidIntegrationWithFurnixcrmRoutes,
);

router.use("/inventory/payment-requisitions", paymentRequisitionRoutes);

export { router };
