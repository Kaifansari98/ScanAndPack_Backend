import { Request, Response } from "express";
import { prisma } from "../../../../prisma/client";
import { NotificationService } from "../../../../services/notification/notification.service";
import { NotificationType } from "@prisma/client";
import { ReadyToDispatchService } from "../../../../services/production/ready-to-dispatch/ReadyToDispatch.service";
import { uploadToWasabiCurrentSitePhotosReadyToDispatchFile } from "../../../../utils/wasabiClient";
import logger from "../../../../utils/logger";
import fs from "node:fs/promises";

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

      const uploadedFiles: { originalName: string; sysName: string }[] = [];

      for (const file of files) {
        const sysName = await uploadToWasabiCurrentSitePhotosReadyToDispatchFile(
          file.path,
          Number(vendorId),
          Number(leadId),
          file.originalname,
          file.mimetype
        );

        await fs.unlink(file.path);

        uploadedFiles.push({
          originalName: file.originalname,
          sysName,
        });
      }

      const uploaded = await service.uploadCurrentSitePhotosAtReadyToDispatch(
        Number(vendorId),
        Number(leadId),
        account_id ? Number(account_id) : null,
        Number(created_by),
        uploadedFiles
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

      try {
        const assignee = await prisma.userMaster.findUnique({
          where: { id: Number(user_id) },
          select: {
            user_type: { select: { user_type: true } },
          },
        });
        const assigneeRole = assignee?.user_type?.user_type?.toLowerCase();
        if (assigneeRole !== "admin" && assigneeRole !== "super-admin") {
          const lead = await prisma.leadMaster.findUnique({
            where: { id: leadId },
            select: { firstname: true, lastname: true },
          });
          const leadName = `${lead?.firstname ?? ""} ${lead?.lastname ?? ""}`.trim();

          await NotificationService.createAndSend({
            vendor_id: result.lead.vendor_id,
            user_id: Number(user_id),
            sender_id: Number(actorId) || null,
            type: NotificationType.LEAD_ASSIGNED,
            title: "Lead assigned",
            message:
              leadName.length > 0
                ? `Lead ${leadName} has been assigned to you.`
                : "A lead has been assigned to you.",
            entity_type: "lead",
            entity_id: result.lead.id,
            redirect_url: `/dashboard/leads/details/${result.lead.id}?accountId=${result.lead.account_id}`,
          });
        }
      } catch (notificationError: any) {
        logger.warn("⚠️ Failed to send site readiness assignment notification", {
          error: notificationError?.message,
          lead_id: leadId,
          assignee_user_id: user_id,
        });
      }

      try {
        const vendorId = result.lead.vendor_id;
        const accountId = result.lead.account_id;
        const [admins, mappings, lead] = await Promise.all([
          prisma.userMaster.findMany({
            where: {
              vendor_id: vendorId,
              user_type: { user_type: { in: ["admin", "super-admin"] } },
            },
            select: { id: true },
          }),
          prisma.leadUserMapping.findMany({
            where: {
              vendor_id: vendorId,
              lead_id: leadId,
              status: "active",
            },
            select: { user_id: true },
          }),
          prisma.leadMaster.findUnique({
            where: { id: leadId },
            select: { firstname: true, lastname: true },
          }),
        ]);

        const leadName = `${lead?.firstname ?? ""} ${lead?.lastname ?? ""}`.trim();
        const recipientIds = new Set<number>();
        admins.forEach((admin) => recipientIds.add(admin.id));
        mappings.forEach((mapping) => recipientIds.add(mapping.user_id));

        if (recipientIds.size > 0) {
          const redirectUrl = accountId
            ? `/dashboard/leads/details/${leadId}?accountId=${accountId}`
            : `/dashboard/leads/details/${leadId}`;

          await Promise.all(
            Array.from(recipientIds).map((recipientId) =>
              NotificationService.createAndSend({
                vendor_id: vendorId,
                user_id: recipientId,
                sender_id: Number(actorId) || null,
                type: NotificationType.LEAD_MILESTONE,
                title: "Lead moved to Installation",
                message:
                  leadName.length > 0
                    ? `Lead ${leadName} moved to Installation stage.`
                    : "Lead moved to Installation stage.",
                entity_type: "lead",
                entity_id: leadId,
                redirect_url: redirectUrl,
              })
            )
          );
        }
      } catch (milestoneError: any) {
        logger.warn("⚠️ Failed to send production-to-installation notification", {
          error: milestoneError?.message,
          lead_id: leadId,
        });
      }

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
