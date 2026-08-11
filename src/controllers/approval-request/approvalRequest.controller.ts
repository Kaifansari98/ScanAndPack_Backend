import { Request, Response } from "express";
import { ApiResponse } from "../../utils/apiResponse";
import logger from "../../utils/logger";
import {
  ApprovalRequestService,
  CreateApprovalRequestInput,
} from "../../services/approval-request/approvalRequest.service";

const approvalRequestService = new ApprovalRequestService();

const getSingleValue = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

export class ApprovalRequestController {
  public async getDetails(req: Request, res: Response) {
    try {
      const leadId = Number(req.params.leadId);
      const taskId = Number(req.params.taskId);

      if (!leadId || !taskId) {
        return res
          .status(400)
          .json(ApiResponse.error("leadId and taskId are required", 400));
      }

      const result = await approvalRequestService.getApprovalRequestDetails(
        leadId,
        taskId,
      );

      return res
        .status(200)
        .json(ApiResponse.success(result, "Approval request details fetched", 200));
    } catch (error: any) {
      logger.error("[ApprovalRequestController] getDetails:", error);
      return res
        .status(500)
        .json(
          ApiResponse.error(
            error.message || "Failed to fetch approval request details",
            500,
          ),
        );
    }
  }

  public async getAssignableUsers(req: Request, res: Response) {
    try {
      const vendorId = Number(req.params.vendorId);
      const leadId = Number(req.params.leadId);

      if (!vendorId || !leadId) {
        return res
          .status(400)
          .json(ApiResponse.error("vendorId and leadId are required", 400));
      }

      const result = await approvalRequestService.getAssignableUsers(
        vendorId,
        leadId,
      );

      return res
        .status(200)
        .json(ApiResponse.success(result, "Assignable users fetched", 200));
    } catch (error: any) {
      logger.error("[ApprovalRequestController] getAssignableUsers:", error);
      return res
        .status(500)
        .json(
          ApiResponse.error(
            error.message || "Failed to fetch assignable users",
            500,
          ),
        );
    }
  }

  public async create(req: Request, res: Response) {
    try {
      const leadId = Number(req.params.leadId);
      const dueDate = getSingleValue(req.body.due_date);
      const remark = getSingleValue(req.body.remark);
      const userId = getSingleValue(req.body.user_id);
      const createdBy = getSingleValue(req.body.created_by);
      const files = ((req.files as Record<string, Express.Multer.File[]>)?.files ??
        []) as Express.Multer.File[];

      if (!leadId || !dueDate || !remark || !userId) {
        return res.status(400).json({
          success: false,
          error: "Validation failed",
          details: [
            !leadId && { field: "leadId", message: "leadId is required" },
            !userId && { field: "user_id", message: "user_id is required" },
            !remark && { field: "remark", message: "remark is required" },
            !dueDate && { field: "due_date", message: "due_date is required" },
          ].filter(Boolean),
        });
      }

      const payload: CreateApprovalRequestInput = {
        lead_id: leadId,
        due_date: dueDate,
        remark,
        assignee_user_id: Number(userId),
        created_by: Number(createdBy ?? (req as any).user?.id),
        baseUrl:
          typeof req.headers.origin === "string"
            ? req.headers.origin.replace(/\/$/, "")
            : undefined,
        files,
      };

      const result = await approvalRequestService.createApprovalRequest(payload);

      return res
        .status(201)
        .json(
          ApiResponse.success(result, "Approval request created successfully", 201),
        );
    } catch (error: any) {
      logger.error("[ApprovalRequestController] create:", error);
      return res
        .status(500)
        .json(
          ApiResponse.error(
            error.message || "Failed to create approval request",
            500,
          ),
        );
    }
  }

  public async act(req: Request, res: Response) {
    try {
      const leadId = Number(req.params.leadId);
      const taskId = Number(req.params.taskId);
      const action = getSingleValue(req.body.action);
      const remark = getSingleValue(req.body.remark);
      const actedBy = getSingleValue(req.body.acted_by);
      const files = ((req.files as Record<string, Express.Multer.File[]>)?.files ??
        []) as Express.Multer.File[];

      if (!leadId || !taskId || !action || !actedBy) {
        return res.status(400).json({
          success: false,
          error: "Validation failed",
          details: [
            !leadId && { field: "leadId", message: "leadId is required" },
            !taskId && { field: "taskId", message: "taskId is required" },
            !action && { field: "action", message: "action is required" },
            !actedBy && { field: "acted_by", message: "acted_by is required" },
          ].filter(Boolean),
        });
      }

      const result = await approvalRequestService.actOnApprovalRequest({
        lead_id: leadId,
        task_id: taskId,
        action: action as "approve" | "reject",
        acted_by: Number(actedBy),
        remark,
        files,
      });

      return res
        .status(200)
        .json(ApiResponse.success(result, "Approval request updated successfully", 200));
    } catch (error: any) {
      logger.error("[ApprovalRequestController] act:", error);
      return res
        .status(500)
        .json(
          ApiResponse.error(
            error.message || "Failed to update approval request",
            500,
          ),
        );
    }
  }
}
