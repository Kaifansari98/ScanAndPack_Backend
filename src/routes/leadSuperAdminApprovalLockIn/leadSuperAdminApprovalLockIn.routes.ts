import { Router } from "express";
import { LeadSuperAdminApprovalLockInController } from "../../controllers/leadSuperAdminApprovalLockIn/leadSuperAdminApprovalLockIn.controller";

const leadSuperAdminApprovalLockInRouter = Router();
const leadSuperAdminApprovalLockInController =
  new LeadSuperAdminApprovalLockInController();

leadSuperAdminApprovalLockInRouter.get(
  "/vendor/:vendorId/lead/:leadId",
  leadSuperAdminApprovalLockInController.getLeadLockIns,
);

leadSuperAdminApprovalLockInRouter.patch(
  "/:id/approve",
  leadSuperAdminApprovalLockInController.approveLockIn,
);

leadSuperAdminApprovalLockInRouter.patch(
  "/booking-done/lead/:leadId/task/:taskId/approve",
  leadSuperAdminApprovalLockInController.approveBookingDoneTask,
);

export default leadSuperAdminApprovalLockInRouter;
