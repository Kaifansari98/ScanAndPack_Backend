import { Request, Response } from "express";
import { prisma } from "../../../../prisma/client";
import { NotificationService } from "../../../../services/notification/notification.service";
import { NotificationType } from "../../../../prisma/generated";
import {
  sendTaskAssignedEmail,
  sendMajorMilestoneEmail,
} from "../../../../services/email/brevoEmail.service";

const resolveClientBaseUrl = (req: Request): string => {
  const origin = req.headers.origin;
  if (typeof origin === "string" && origin.trim().length > 0) {
    return origin.replace(/\/$/, "");
  }

  const referer = req.headers.referer;
  if (typeof referer === "string" && referer.trim().length > 0) {
    try {
      return new URL(referer).origin;
    } catch {
      return "http://localhost:3000";
    }
  }

  return "http://localhost:3000";
};
import { ReadyToDispatchService } from "../../../../services/production/ready-to-dispatch/ReadyToDispatch.service";
import { uploadToWasabiCurrentSitePhotosReadyToDispatchFile } from "../../../../utils/wasabiClient";
import logger from "../../../../utils/logger";
import fs from "node:fs/promises";
import { STAGE_PATH_BY_TAG } from "../../../../services/leadModuleServices/leadsGeneration/leadActivityStatus.service";

const service = new ReadyToDispatchService();

const getParam = (param: string | string[] | undefined): string | undefined =>
  Array.isArray(param) ? param[0] : param;

export class ReadyToDispatchController {
  async getAllReadyToDispatchLeads(req: Request, res: Response) {
    try {
      const vendorId = Number(getParam(req.params.vendorId));
      const userId = Number(getParam(req.params.userId));

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

  public async getSiteReadinessTaskConflicts(
    req: Request,
    res: Response
  ): Promise<Response> {
    try {
      const leadId = Number(req.params.leadId);

      if (!leadId) {
        return res.status(400).json({
          success: false,
          message: "leadId is required",
        });
      }

      const conflicts = await service.getSiteReadinessTaskConflicts(leadId);

      return res.status(200).json({
        success: true,
        data: {
          conflicts,
        },
      });
    } catch (error: any) {
      logger.error("[ERROR] getSiteReadinessTaskConflicts:", { err: error });
      return res.status(500).json({
        success: false,
        message: error.message || "Failed to fetch task conflicts",
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
        const [assignee, lead, assignedBy, firstInstance] = await Promise.all([
          prisma.userMaster.findUnique({
            where: { id: Number(user_id) },
            select: {
              id: true,
              user_name: true,
              user_email: true,
              user_type: { select: { user_type: true } },
            },
          }),
          prisma.leadMaster.findUnique({
            where: { id: leadId },
            select: {
              firstname: true,
              lastname: true,
              lead_code: true,
              franchise_id: true,
              account_id: true,
              statusType: { select: { tag: true } },
            },
          }),
          actorId
            ? prisma.userMaster.findUnique({
                where: { id: Number(actorId) },
                select: { user_name: true },
              })
            : Promise.resolve(null),
          prisma.leadProductStructureInstance.findFirst({
            where: { lead_id: leadId, vendor_id: result.lead.vendor_id },
            select: { id: true },
            orderBy: [{ product_structure_id: "asc" }, { quantity_index: "asc" }],
          }),
        ]);

        const leadName = `${lead?.firstname ?? ""} ${lead?.lastname ?? ""}`.trim();
        const leadCode =
          lead?.lead_code ?? `LEAD-${String(leadId).padStart(4, "0")}`;
        const assigneeRole = assignee?.user_type?.user_type?.toLowerCase();
        const isSelfAssigned =
          Boolean(actorId) && Number(actorId) === Number(user_id);
        const franchiseId = lead?.franchise_id ?? null;

        if (
          !isSelfAssigned &&
          assigneeRole !== "admin" &&
          assigneeRole !== "super-admin"
        ) {
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
            redirect_url: (() => {
              const base = `/dashboard/leads/details/${result.lead.id}`;
              const qp = new URLSearchParams();
              if (lead?.account_id) qp.set("accountId", String(lead.account_id));
              if (firstInstance?.id) qp.set("instance_id", String(firstInstance.id));
              const qs = qp.toString();
              return qs ? `${base}?${qs}` : base;
            })(),
          });
        }

        let assigneeEmail = assignee?.user_email?.trim();
        if (!assigneeEmail && assignee?.id) {
          const fallbackAssignee = await prisma.userMaster.findUnique({
            where: { id: assignee.id },
            select: { user_email: true },
          });
          assigneeEmail = fallbackAssignee?.user_email?.trim();
        }

        if (assigneeEmail && !isSelfAssigned) {
          const clientBaseUrl = resolveClientBaseUrl(req);
          const taskUrl = `${clientBaseUrl}/dashboard/my-tasks`;
          const dueDate = due_date
            ? new Date(due_date).toLocaleDateString("en-IN", {
                day: "2-digit",
                month: "short",
                year: "numeric",
              })
            : "—";
          const assignedByName = assignedBy?.user_name ?? "Admin";

          await sendTaskAssignedEmail({
            vendor_id: result.lead.vendor_id,
            toEmail: assigneeEmail,
            toName: assignee?.user_name ?? undefined,
            leadCode,
            taskTitle: task_type,
            leadName: leadName || "—",
            assignedBy: assignedByName,
            dueDate,
            remark,
            taskUrl,
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
        const [lead, firstInstance] = await Promise.all([
          prisma.leadMaster.findUnique({
            where: { id: leadId },
            select: {
              firstname: true,
              lastname: true,
              lead_code: true,
              franchise_id: true,
              statusType: { select: { tag: true } },
            },
          }),
          prisma.leadProductStructureInstance.findFirst({
            where: { lead_id: leadId, vendor_id: vendorId },
            select: { id: true },
            orderBy: [{ product_structure_id: "asc" }, { quantity_index: "asc" }],
          }),
        ]);

        const leadName = `${lead?.firstname ?? ""} ${lead?.lastname ?? ""}`.trim();
        const leadCode =
          lead?.lead_code ?? `LEAD-${String(leadId).padStart(4, "0")}`;
        const franchiseId = lead?.franchise_id ?? null;
        const stageTag = lead?.statusType?.tag;
        const instanceId = firstInstance?.id;

        // Build redirect URL using STAGE_PATH_BY_TAG
        const stagePath =
          stageTag && STAGE_PATH_BY_TAG[stageTag]
            ? `${STAGE_PATH_BY_TAG[stageTag]}/${leadId}`
            : `/dashboard/installation/site-readiness/details/${leadId}`;

        const queryParams = new URLSearchParams();
        if (accountId) queryParams.set("accountId", String(accountId));
        if (instanceId) queryParams.set("instance_id", String(instanceId));
        const qs = queryParams.toString();
        const redirectUrl = qs ? `${stagePath}?${qs}` : stagePath;

        // Only admins matching vendor_id + franchise_id
        const users = await prisma.userMaster.findMany({
          where: {
            vendor_id: vendorId,
            status: "active",
            user_type: { user_type: { equals: "admin", mode: "insensitive" } },
            ...(franchiseId ? { franchise_id: franchiseId } : {}),
          },
          select: { id: true, user_name: true, user_email: true },
        });

        await Promise.all(
          users.map((user) =>
            NotificationService.createAndSend({
              vendor_id: vendorId,
              user_id: user.id,
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

        const clientBaseUrl = resolveClientBaseUrl(req);
        const detailsUrl = `${clientBaseUrl}${redirectUrl}`;
        const completedOn = new Date().toLocaleDateString("en-IN", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        });

        await Promise.allSettled(
          users
            .filter((user) => user.user_email)
            .map((user) =>
              sendMajorMilestoneEmail({
                vendor_id: result.lead.vendor_id,
                toEmail: user.user_email!,
                toName: user.user_name ?? undefined,
                leadCode,
                leadName: leadName || "Lead",
                milestoneName: "Production to Installation",
                completedOn,
                detailsUrl,
              })
            )
        );
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
      const errorMessage = error?.message || "Internal server error";
      const isConflict =
        typeof errorMessage === "string" &&
        (errorMessage
          .toLowerCase()
          .includes("already exists for this lead and is not completed") ||
          errorMessage.toLowerCase().includes("follow up task is already assigned"));

      logger.error("[ERROR] assignTaskSiteReadiness:", { err: error });
      return res.status(isConflict ? 409 : 500).json({
        success: false,
        message: errorMessage,
        error: isConflict ? "Conflict" : "Internal server error",
        details:
          process.env.NODE_ENV === "development" ? errorMessage : undefined,
      });
    }
  }
}
