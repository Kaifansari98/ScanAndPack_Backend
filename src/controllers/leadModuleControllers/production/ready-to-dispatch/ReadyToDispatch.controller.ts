import { Request, Response } from "express";
import { ReadyToDispatchService } from "../../../../services/production/ready-to-dispatch/ReadyToDispatch.service";
import logger from "../../../../utils/logger";

const service = new ReadyToDispatchService();

export class ReadyToDispatchController {
  async getAllReadyToDispatchLeads(req: Request, res: Response) {
    try {
      const vendorId = parseInt(req.params.vendorId);
      const userId = parseInt(req.params.userId);

      if (!vendorId || !userId) {
        return res.status(400).json({
          success: false,
          message: "Vendor ID and User ID are required",
        });
      }

      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;

      const leads = await service.getLeadsWithStatusReadyToDispatch(
        vendorId,
        userId,
        limit,
        page
      );

      return res.status(200).json({
        success: true,
        message: "Ready-To-Dispatch leads fetched successfully",
        count: leads.total,
        data: leads,
        ...leads,
      });
    } catch (error: any) {
      console.error(
        "[ReadyToDispatchController] getAllReadyToDispatchLeads Error:",
        error
      );
      return res.status(500).json({
        success: false,
        message: error.message || "Internal server error",
      });
    }
  }

  // ✅ Upload Current Site Photos at Ready-To-Dispatch
  async uploadCurrentSitePhotosAtReadyToDispatch(req: Request, res: Response) {
    try {
      const { vendorId, leadId } = req.params;
      const { account_id, created_by } = req.body;
      const files = req.files as Express.Multer.File[];

      if (!vendorId || !leadId || !created_by) {
        return res.status(400).json({
          success: false,
          message: "vendorId, leadId and created_by are required",
        });
      }

      if (!files || files.length === 0) {
        return res.status(400).json({
          success: false,
          message: "At least one file must be uploaded",
        });
      }

      const uploaded = await service.uploadCurrentSitePhotosAtReadyToDispatch(
        Number(vendorId),
        Number(leadId),
        account_id ? Number(account_id) : null,
        Number(created_by),
        files
      );

      return res.status(200).json({
        success: true,
        message:
          "Current Site Photos uploaded successfully (Ready-To-Dispatch)",
        count: uploaded.length,
        data: uploaded,
      });
    } catch (error: any) {
      console.error(
        "[ReadyToDispatchController] uploadCurrentSitePhotosAtReadyToDispatch Error:",
        error
      );
      return res.status(error.statusCode || 500).json({
        success: false,
        message:
          error.message ||
          "Internal server error while uploading current site photos",
      });
    }
  }

  // ✅ Get Current Site Photos at Ready-To-Dispatch
  async getCurrentSitePhotosAtReadyToDispatch(req: Request, res: Response) {
    try {
      const { vendorId, leadId } = req.params;

      if (!vendorId || !leadId) {
        return res.status(400).json({
          success: false,
          message: "vendorId and leadId are required",
        });
      }

      const photos = await service.getCurrentSitePhotosAtReadyToDispatch(
        Number(vendorId),
        Number(leadId)
      );

      return res.status(200).json({
        success: true,
        message: "Fetched Current Site Photos successfully (Ready-To-Dispatch)",
        count: photos.length,
        data: photos,
      });
    } catch (error: any) {
      console.error(
        "[ReadyToDispatchController] getCurrentSitePhotosAtReadyToDispatch Error:",
        error
      );
      return res.status(error.statusCode || 500).json({
        success: false,
        message:
          error.message ||
          "Internal server error while fetching current site photos",
      });
    }
  }

  async getCurrentSitePhotosCountAtReadyToDispatch(
    req: Request,
    res: Response
  ) {
    try {
      const { vendorId, leadId } = req.params;

      if (!vendorId || !leadId) {
        return res.status(400).json({
          success: false,
          message: "vendorId and leadId are required",
        });
      }

      const result = await service.getCurrentSitePhotosCountAtReadyToDispatch(
        Number(vendorId),
        Number(leadId)
      );

      return res.status(200).json({
        success: true,
        message:
          "Fetched Current Site Photos count successfully (Ready-To-Dispatch)",
        data: result,
      });
    } catch (error: any) {
      console.error(
        "[ReadyToDispatchController] getCurrentSitePhotosCountAtReadyToDispatch Error:",
        error
      );
      return res.status(error.statusCode || 500).json({
        success: false,
        message:
          error.message ||
          "Internal server error while fetching site photo count",
      });
    }
  }

  /** ✅ Assign Site Readiness Task */
  public async assignTaskSiteReadiness(
    req: Request,
    res: Response
  ): Promise<Response> {
    logger.info("[CONTROLLER] assignTaskSiteReadiness called");
    try {
      const leadId = Number(req.params.leadId);
      const { task_type, due_date, remark, user_id, created_by } = req.body;

      if (!leadId || !task_type || !due_date || !user_id) {
        return res.status(400).json({
          success: false,
          error: "Validation failed",
          details: [
            !leadId && {
              field: "leadId",
              message: "leadId (param) is required",
            },
            !task_type && {
              field: "task_type",
              message: "task_type is required",
            },
            !due_date && { field: "due_date", message: "due_date is required" },
            !user_id && { field: "user_id", message: "user_id is required" },
          ].filter(Boolean),
        });
      }

      const actorId = created_by ?? (req as any).user?.id;
      const result = await service.assignTaskSiteReadinessService({
        lead_id: leadId,
        task_type,
        due_date,
        remark,
        assignee_user_id: Number(user_id),
        created_by: Number(actorId),
      });

      return res.status(201).json({
        success: true,
        message: "Site Readiness task assigned and lead status updated",
        data: result,
      });
    } catch (error: any) {
      logger.error("[ERROR] assignTaskSiteReadiness:", { err: error });
      return res.status(500).json({
        success: false,
        error: "Internal server error",
        details:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  }
}
