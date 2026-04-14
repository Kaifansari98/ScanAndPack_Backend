import { Request, Response } from "express";
import { SuperAdminApprovalType } from "../../prisma/generated";
import { LeadSuperAdminApprovalLockInService } from "../../services/leadSuperAdminApprovalLockIn/leadSuperAdminApprovalLockIn.service";

const isApprovalType = (
  value: string | undefined,
): value is SuperAdminApprovalType =>
  value !== undefined &&
  Object.values(SuperAdminApprovalType).includes(
    value as SuperAdminApprovalType,
  );

export class LeadSuperAdminApprovalLockInController {
  private lockInService = new LeadSuperAdminApprovalLockInService();

  public getLeadLockIns = async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    try {
      const vendorId = Number(req.params.vendorId);
      const leadId = Number(req.params.leadId);
      const approvalTypeParam =
        typeof req.query.approval_type === "string"
          ? req.query.approval_type
          : undefined;

      if (isNaN(vendorId) || isNaN(leadId)) {
        res.status(400).json({
          success: false,
          message: "Invalid vendorId or leadId",
        });
        return;
      }

      if (approvalTypeParam && !isApprovalType(approvalTypeParam)) {
        res.status(400).json({
          success: false,
          message: "Invalid approval_type",
        });
        return;
      }

      const approvalType = isApprovalType(approvalTypeParam)
        ? approvalTypeParam
        : undefined;

      const data = await this.lockInService.getLeadLockIns(
        vendorId,
        leadId,
        approvalType,
      );

      res.status(200).json({
        success: true,
        count: data.length,
        data,
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: "Failed to fetch super admin approval lock-ins",
        error: error.message,
      });
    }
  };

  public approveLockIn = async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    try {
      const id = Number(req.params.id);
      const approvedBy = Number(req.body.approved_by);
      const approvalRemark =
        req.body.approval_remark !== undefined
          ? String(req.body.approval_remark)
          : null;

      if (isNaN(id) || isNaN(approvedBy)) {
        res.status(400).json({
          success: false,
          message: "Invalid id or approved_by",
        });
        return;
      }

      const data = await this.lockInService.approveLockIn({
        id,
        approved_by: approvedBy,
        approval_remark: approvalRemark,
      });

      res.status(200).json({
        success: true,
        message: "Super admin approval lock-in approved successfully",
        data,
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: "Failed to approve super admin approval lock-in",
        error: error.message,
      });
    }
  };

  public approveBookingDoneTask = async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    try {
      const leadId = Number(req.params.leadId);
      const taskId = Number(req.params.taskId);
      const approvedBy = Number(req.body.approved_by);
      const approvalRemark =
        req.body.approval_remark !== undefined
          ? String(req.body.approval_remark)
          : null;

      if (isNaN(leadId) || isNaN(taskId) || isNaN(approvedBy)) {
        res.status(400).json({
          success: false,
          message: "Invalid leadId, taskId, or approved_by",
        });
        return;
      }

      const data = await this.lockInService.approveBookingDoneTask({
        lead_id: leadId,
        task_id: taskId,
        approved_by: approvedBy,
        approval_remark: approvalRemark,
      });

      res.status(200).json({
        success: true,
        message: "Booking Done approval completed successfully",
        data,
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: "Failed to approve Booking Done task",
        error: error.message,
      });
    }
  };

  public approveOrderLoginTask = async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    try {
      const leadId = Number(req.params.leadId);
      const taskId = Number(req.params.taskId);
      const approvedBy = Number(req.body.approved_by);
      const approvalRemark =
        req.body.approval_remark !== undefined
          ? String(req.body.approval_remark)
          : null;

      if (isNaN(leadId) || isNaN(taskId) || isNaN(approvedBy)) {
        res.status(400).json({
          success: false,
          message: "Invalid leadId, taskId, or approved_by",
        });
        return;
      }

      const data = await this.lockInService.approveOrderLoginTask({
        lead_id: leadId,
        task_id: taskId,
        approved_by: approvedBy,
        approval_remark: approvalRemark,
      });

      res.status(200).json({
        success: true,
        message: "Order Login approval completed successfully",
        data,
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: "Failed to approve Order Login task",
        error: error.message,
      });
    }
  };

  public approveDispatchPlanningTask = async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    try {
      const leadId = Number(req.params.leadId);
      const taskId = Number(req.params.taskId);
      const approvedBy = Number(req.body.approved_by);
      const approvalRemark =
        req.body.approval_remark !== undefined
          ? String(req.body.approval_remark)
          : null;

      if (isNaN(leadId) || isNaN(taskId) || isNaN(approvedBy)) {
        res.status(400).json({
          success: false,
          message: "Invalid leadId, taskId, or approved_by",
        });
        return;
      }

      const data = await this.lockInService.approveDispatchPlanningTask({
        lead_id: leadId,
        task_id: taskId,
        approved_by: approvedBy,
        approval_remark: approvalRemark,
      });

      res.status(200).json({
        success: true,
        message: "Dispatch Planning approval completed successfully",
        data,
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: "Failed to approve Dispatch Planning task",
        error: error.message,
      });
    }
  };
}
