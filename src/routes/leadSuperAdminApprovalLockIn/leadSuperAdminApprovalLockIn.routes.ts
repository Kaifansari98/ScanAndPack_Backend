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

export default leadSuperAdminApprovalLockInRouter;
