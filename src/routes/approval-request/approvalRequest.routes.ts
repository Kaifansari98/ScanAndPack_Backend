import { Router } from "express";
import { ApprovalRequestController } from "../../controllers/approval-request/approvalRequest.controller";
import { uploadApprovalRequest } from "../../middlewares/uploadWasabi";

const approvalRequestRouter = Router();
const approvalRequestController = new ApprovalRequestController();

approvalRequestRouter.get(
  "/vendor/:vendorId/lead/:leadId/assignable-users",
  approvalRequestController.getAssignableUsers,
);

approvalRequestRouter.post(
  "/leadId/:leadId",
  uploadApprovalRequest.fields([{ name: "files", maxCount: 20 }]),
  approvalRequestController.create,
);

approvalRequestRouter.patch(
  "/leadId/:leadId/taskId/:taskId/action",
  uploadApprovalRequest.fields([{ name: "files", maxCount: 20 }]),
  approvalRequestController.act,
);

export default approvalRequestRouter;
