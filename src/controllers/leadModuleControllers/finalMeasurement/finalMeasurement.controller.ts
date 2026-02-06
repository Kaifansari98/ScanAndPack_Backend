import { Request, Response } from "express";
import { FinalMeasurementService } from "../../../services/leadModuleServices/finalMeasurementStage/finalMeasurement.service";
import logger from "../../../utils/logger";
import { prisma } from "../../../prisma/client";
import { NotificationService } from "../../../services/notification/notification.service";
import { NotificationType } from "../../../prisma/generated";
import {
  sendMajorMilestoneEmail,
  sendTaskAssignedEmail,
} from "../../../services/email/brevoEmail.service";

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
import {
  uploadToWasabiFinalMeasurementDocFile,
  uploadToWasabiFinalMeasurementSitePhotoFile,
} from "../../../utils/wasabiClient";
import fs from "node:fs/promises";

const finalMeasurementService = new FinalMeasurementService();

export class FinalMeasurementController {
  public createFinalMeasurementStage = async (
    req: Request,
    res: Response
  ): Promise<void> => {
    try {
      const {
        lead_id,
        account_id,
        vendor_id,
        created_by,
        critical_discussion_notes,
      } = req.body;

      if (!lead_id || !account_id || !vendor_id || !created_by) {
        res
          .status(400)
          .json({ success: false, message: "Missing required fields" });
        return;
      }

      const files = req.files as { [fieldname: string]: Express.Multer.File[] };
      const finalMeasurementDocs = files?.final_measurement_doc || [];
      const sitePhotos = [
        ...(files?.site_photos || []),
        ...(files?.["site_photos[]"] || []),
      ];

      if (!finalMeasurementDocs || finalMeasurementDocs.length === 0) {
        res.status(400).json({
          success: false,
          message: "At least one Final Measurement document is required",
        });
        return;
      }
      if (!sitePhotos || sitePhotos.length === 0) {
        res.status(400).json({
          success: false,
          message: "At least one site photo is required",
        });
        return;
      }

      const uploadedFinalMeasurementDocs: {
        originalName: string;
        sysName: string;
      }[] = [];

      for (const doc of finalMeasurementDocs) {
        const sysName = await uploadToWasabiFinalMeasurementDocFile(
          doc.path,
          Number(vendor_id),
          Number(lead_id),
          doc.originalname,
          doc.mimetype
        );

        await fs.unlink(doc.path);

        uploadedFinalMeasurementDocs.push({
          originalName: doc.originalname,
          sysName,
        });
      }

      const uploadedSitePhotos: {
        originalName: string;
        sysName: string;
      }[] = [];

      for (const photo of sitePhotos) {
        const sysName = await uploadToWasabiFinalMeasurementSitePhotoFile(
          photo.path,
          Number(vendor_id),
          Number(lead_id),
          photo.originalname,
          photo.mimetype
        );

        await fs.unlink(photo.path);

        uploadedSitePhotos.push({
          originalName: photo.originalname,
          sysName,
        });
      }

      const dto = {
        lead_id: parseInt(lead_id),
        account_id: parseInt(account_id),
        vendor_id: parseInt(vendor_id),
        created_by: parseInt(created_by),
        critical_discussion_notes: critical_discussion_notes || null,
        finalMeasurementDocs: uploadedFinalMeasurementDocs,
        sitePhotos: uploadedSitePhotos,
      };

      const result = await finalMeasurementService.createFinalMeasurementStage(
        dto
      );
      res.status(201).json({
        success: true,
        message: "Final measurement stage completed",
        data: result,
      });
    } catch (error: any) {
      console.error("[FinalMeasurementController] Error:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Internal server error",
      });
    }
  };

  public getAllFinalMeasurementLeadsByVendorId = async (
    req: Request,
    res: Response
  ): Promise<void> => {
    try {
      const vendorId = parseInt(req.params.vendorId);
      const userId = Number(req.query.userId);

      if (!vendorId || !userId) {
        res.status(400).json({
          success: false,
          message: "vendorId and userId are required",
        });
        return;
      }

      const leads =
        await finalMeasurementService.getAllFinalMeasurementLeadsByVendorId(
          vendorId,
          userId
        );

      const count = leads.length;

      res.status(200).json({
        success: true,
        message: "Final Measurement leads fetched successfully",
        count,
        data: leads,
      });
    } catch (error: any) {
      console.error("[FinalMeasurementController] Error:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Internal server error",
      });
    }
  };

  public getFinalMeasurementLead = async (
    req: Request,
    res: Response
  ): Promise<void> => {
    try {
      const vendorId = parseInt(req.params.vendorId);
      const leadId = parseInt(req.params.leadId);

      if (!vendorId || !leadId) {
        res.status(400).json({
          success: false,
          message: "vendorId and leadId are required",
        });
        return;
      }

      const lead = await finalMeasurementService.getFinalMeasurementLead(
        vendorId,
        leadId
      );

      res.status(200).json({
        success: true,
        message: "Final Measurement lead fetched successfully",
        data: lead,
      });
    } catch (error: any) {
      console.error("[FinalMeasurementController] Error:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Internal server error",
      });
    }
  };

  public updateCriticalDiscussionNotes = async (
    req: Request,
    res: Response
  ): Promise<void> => {
    try {
      const vendorId = parseInt(req.params.vendorId);
      const leadId = parseInt(req.params.leadId);
      const { notes } = req.body;

      if (!notes) {
        res.status(400).json({ success: false, message: "Notes are required" });
        return;
      }

      const updatedLead =
        await finalMeasurementService.updateCriticalDiscussionNotes(
          vendorId,
          leadId,
          notes
        );

      res.status(200).json({
        success: true,
        message: "Critical discussion notes updated successfully",
        data: updatedLead,
      });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  };

  public addMoreFinalMeasurementFiles = async (
    req: Request,
    res: Response
  ): Promise<void> => {
    try {
      const { lead_id, vendor_id, created_by } = req.body;

      if (!lead_id || !vendor_id || !created_by) {
        res
          .status(400)
          .json({ success: false, message: "Missing required fields" });
        return;
      }

      const files = req.files as { [fieldname: string]: Express.Multer.File[] };
      const sitePhotos = [
        ...(files?.site_photos || []),
        ...(files?.["site_photos[]"] || []),
      ];

      if (!sitePhotos || sitePhotos.length === 0) {
        res.status(400).json({
          success: false,
          message:
            "At least one file (final measurement or final site photo) is required",
        });
        return;
      }

      const uploadedSitePhotos: {
        originalName: string;
        sysName: string;
      }[] = [];

      for (const photo of sitePhotos) {
        const sysName = await uploadToWasabiFinalMeasurementSitePhotoFile(
          photo.path,
          Number(vendor_id),
          Number(lead_id),
          photo.originalname,
          photo.mimetype
        );

        await fs.unlink(photo.path);

        uploadedSitePhotos.push({
          originalName: photo.originalname,
          sysName,
        });
      }

      const result = await finalMeasurementService.addMoreFinalMeasurementFiles(
        {
          lead_id: parseInt(lead_id),
          vendor_id: parseInt(vendor_id),
          created_by: parseInt(created_by),
          sitePhotos: uploadedSitePhotos,
        }
      );

      res.status(201).json({
        success: true,
        message: "Additional files uploaded successfully",
        data: result,
      });
    } catch (error: any) {
      console.error("[FinalMeasurementController] Error:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Internal server error",
      });
    }
  };

  public addMoreFinalMeasurementSitePhotos = async (
    req: Request,
    res: Response
  ): Promise<void> => {
    try {
      const { lead_id, vendor_id, created_by } = req.body;

      if (!lead_id || !vendor_id || !created_by) {
        res
          .status(400)
          .json({ success: false, message: "Missing required fields" });
        return;
      }

      const files = req.files as { [fieldname: string]: Express.Multer.File[] };
      const sitePhotos = [
        ...(files?.site_photos || []),
        ...(files?.["site_photos[]"] || []),
      ];

      if (!sitePhotos || sitePhotos.length === 0) {
        res.status(400).json({
          success: false,
          message: "At least one site photo is required",
        });
        return;
      }

      const uploadedSitePhotos: {
        originalName: string;
        sysName: string;
      }[] = [];

      for (const photo of sitePhotos) {
        const sysName = await uploadToWasabiFinalMeasurementSitePhotoFile(
          photo.path,
          Number(vendor_id),
          Number(lead_id),
          photo.originalname,
          photo.mimetype
        );

        await fs.unlink(photo.path);

        uploadedSitePhotos.push({
          originalName: photo.originalname,
          sysName,
        });
      }

      const result =
        await finalMeasurementService.addMoreFinalMeasurementSitePhotos({
          lead_id: parseInt(lead_id),
          vendor_id: parseInt(vendor_id),
          created_by: parseInt(created_by),
          sitePhotos: uploadedSitePhotos,
        });

      res.status(201).json({
        success: true,
        message: "Additional site photos uploaded successfully",
        data: result,
      });
    } catch (error: any) {
      console.error("[FinalMeasurementController] Error:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Internal server error",
      });
    }
  };

  public addMoreFinalMeasurementDocs = async (
    req: Request,
    res: Response
  ): Promise<void> => {
    try {
      const { lead_id, vendor_id, created_by } = req.body;

      if (!lead_id || !vendor_id || !created_by) {
        res
          .status(400)
          .json({ success: false, message: "Missing required fields" });
        return;
      }

      const files = req.files as { [fieldname: string]: Express.Multer.File[] };
      const finalMeasurementDocs = files?.final_measurement_doc || [];

      if (!finalMeasurementDocs || finalMeasurementDocs.length === 0) {
        res.status(400).json({
          success: false,
          message: "At least one final measurement document is required",
        });
        return;
      }

      const uploadedFinalMeasurementDocs: {
        originalName: string;
        sysName: string;
      }[] = [];

      for (const doc of finalMeasurementDocs) {
        const sysName = await uploadToWasabiFinalMeasurementDocFile(
          doc.path,
          Number(vendor_id),
          Number(lead_id),
          doc.originalname,
          doc.mimetype
        );

        await fs.unlink(doc.path);

        uploadedFinalMeasurementDocs.push({
          originalName: doc.originalname,
          sysName,
        });
      }

      const result =
        await finalMeasurementService.addMoreFinalMeasurementDocs({
          lead_id: parseInt(lead_id),
          vendor_id: parseInt(vendor_id),
          created_by: parseInt(created_by),
          finalMeasurementDocs: uploadedFinalMeasurementDocs,
        });

      res.status(201).json({
        success: true,
        message: "Additional final measurement documents uploaded successfully",
        data: result,
      });
    } catch (error: any) {
      console.error("[FinalMeasurementController] Error:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Internal server error",
      });
    }
  };

  public getFinalMeasurementLeads = async (req: Request, res: Response) => {
    try {
      const vendorId = parseInt(req.params.vendorId);
      const userId = parseInt(req.params.userId); // ✅ take userId also

      if (!vendorId || !userId) {
        return res.status(400).json({
          success: false,
          message: "Vendor ID and User ID are required",
        });
      }

      const leads =
        await finalMeasurementService.getLeadsWithStatusFinalMeasurement(
          vendorId,
          userId
        );

      return res.status(200).json({
        success: true,
        message: "Final Measurement leads fetched successfully",
        data: leads,
      });
    } catch (error: any) {
      console.error(
        "[FinalMeasurementController] getFinalMeasurementLeads Error:",
        error
      );
      return res.status(500).json({
        success: false,
        message: error.message || "Something went wrong",
      });
    }
  };

  public async assignTaskFM(req: Request, res: Response): Promise<Response> {
    logger.info("[CONTROLLER] assignTaskFM called");
    try {
      const leadId = Number(req.params.leadId);
      const {
        task_type,
        due_date,
        remark,
        user_id, // assignee
        created_by, // optional: if you carry user id from FE; otherwise derive from auth
      } = req.body;

      // Minimal validation here (service re-validates too)
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

      const actorId = created_by ?? (req as any).user?.id; // if you attach auth user to req
      const result = await finalMeasurementService.assignTaskFMService({
        lead_id: leadId,
        task_type,
        due_date,
        remark,
        assignee_user_id: Number(user_id),
        created_by: Number(actorId),
      });

      try {
        const [assignee, lead, assignedBy] = await Promise.all([
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
            select: { firstname: true, lastname: true, lead_code: true },
          }),
          actorId
            ? prisma.userMaster.findUnique({
                where: { id: Number(actorId) },
                select: { user_name: true },
              })
            : Promise.resolve(null),
        ]);

        const leadName = `${lead?.firstname ?? ""} ${lead?.lastname ?? ""}`.trim();
        const leadCode =
          lead?.lead_code ?? `LEAD-${String(leadId).padStart(4, "0")}`;
        const assigneeRole = assignee?.user_type?.user_type?.toLowerCase();
        const isSelfAssigned =
          Boolean(actorId) && Number(actorId) === Number(user_id);

        if (
          !isSelfAssigned &&
          assigneeRole !== "admin" &&
          assigneeRole !== "super-admin"
        ) {
          await NotificationService.createAndSend({
            vendor_id: result.lead.vendor_id,
            user_id: Number(user_id),
            sender_id: Number(actorId) || null,
            type: NotificationType.TASK_ASSIGNED,
            title: "New task assigned",
            message:
              leadName.length > 0
                ? `Task assigned for ${leadName}: ${task_type}.`
                : `Task assigned: ${task_type}.`,
            entity_type: "task",
            entity_id: result.task.id,
            redirect_url: `/dashboard/my-tasks?taskId=${result.task.id}`,
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
        logger.warn("⚠️ Failed to send FM task assignment notification", {
          error: notificationError?.message,
          lead_id: leadId,
          assignee_user_id: user_id,
        });
      }

      try {
        const vendorId = result.lead.vendor_id;
        const accountId = result.lead.account_id;
        const isFinalMeasurements =
          task_type.trim().toLowerCase() === "final measurements";
        if (isFinalMeasurements) {
          const [admins, mappings, lead] = await Promise.all([
            prisma.userMaster.findMany({
              where: {
                vendor_id: vendorId,
                user_type: { user_type: { in: ["admin"] } },
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
              select: { firstname: true, lastname: true, lead_code: true },
            }),
          ]);

          const leadName = `${lead?.firstname ?? ""} ${lead?.lastname ?? ""}`.trim();
          const leadCode =
            lead?.lead_code ?? `LEAD-${String(leadId).padStart(4, "0")}`;
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
                  title: "Lead moved to Project",
                  message:
                    leadName.length > 0
                      ? `Lead ${leadName} moved to Project stage.`
                      : "Lead moved to Project stage.",
                  entity_type: "lead",
                  entity_id: leadId,
                  redirect_url: redirectUrl,
                })
              )
            );

            const users = await prisma.userMaster.findMany({
              where: {
                id: { in: Array.from(recipientIds) },
                status: "active",
              },
              select: { id: true, user_name: true, user_email: true },
            });
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
                    vendor_id: vendorId,
                    toEmail: user.user_email!,
                    toName: user.user_name ?? undefined,
                    leadCode,
                    leadName: leadName || "Lead",
                    milestoneName: "Lead to Project",
                    completedOn,
                    detailsUrl,
                  })
                )
            );
          }
        }
      } catch (milestoneError: any) {
        logger.warn("⚠️ Failed to send lead milestone notification", {
          error: milestoneError?.message,
          lead_id: leadId,
        });
      }

      return res.status(201).json({
        success: true,
        message: "FM task assigned and lead status updated",
        data: result,
      });
    } catch (error: any) {
      logger.error("[ERROR] assignTaskISM:", { err: error });
      return res.status(500).json({
        success: false,
        error: "Internal server error",
        details:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  }
}
