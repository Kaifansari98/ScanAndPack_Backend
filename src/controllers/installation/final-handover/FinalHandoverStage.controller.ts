import { Request, Response } from "express";
import { FinalHandoverStageService } from "../../../services/installation/final-handover/FinalHandoverStage.service";
import {
  uploadToWasabiFinalHandoverBookletPhotoFile,
  uploadToWasabiFinalHandoverFinalSitePhotosFile,
  uploadToWasabiFinalHandoverFormPhotoFile,
  uploadToWasabiFinalHandoverQCDocumentFile,
  uploadToWasabiFinalHandoverWarrantyCardPhotosFile,
} from "../../../utils/wasabiClient";
import { ApiResponse } from "../../../utils/apiResponse";
import logger from "../../../utils/logger";
import fs from "node:fs/promises";
import { prisma } from "../../../prisma/client";
import {
  sendMajorMilestoneEmail,
  sendFinalHandoverCompletedEmail,
} from "../../../services/email/brevoEmail.service";
import { NotificationService } from "../../../services/notification/notification.service";
import { NotificationType } from "../../../prisma/generated";

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

const service = new FinalHandoverStageService();

export class FinalHandoverStageController {
  /**
   * ✅ Get all leads under Final Handover Stage (Type 16)
   */
  async getAllFinalHandoverStageLeads(req: Request, res: Response) {
    try {
      const vendorIdParam = Array.isArray(req.params.vendorId)
        ? req.params.vendorId[0]
        : req.params.vendorId;
      const userIdParam = Array.isArray(req.params.userId)
        ? req.params.userId[0]
        : req.params.userId;
      const vendorId = Number(vendorIdParam);
      const userId = Number(userIdParam);

      if (!vendorId || !userId) {
        return res
          .status(400)
          .json(ApiResponse.error("Vendor ID and User ID are required", 400));
      }

      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;

      const leads = await service.getLeadsWithStatusFinalHandoverStage(
        vendorId,
        userId,
        limit,
        page
      );

      return res
        .status(200)
        .json(
          ApiResponse.success(
            leads,
            "Final Handover Stage leads fetched successfully"
          )
        );
    } catch (error: any) {
      logger.error(
        "[FinalHandoverStageController] getAllFinalHandoverStageLeads Error:",
        error
      );
      return res
        .status(500)
        .json(ApiResponse.error(error.message || "Internal server error", 500));
    }
  }

  async uploadFinalHandoverDocuments(req: Request, res: Response) {
    try {
      const vendorId = Number(req.body.vendorId);
      const leadId = Number(req.body.leadId);
      const accountId = Number(req.body.accountId);
      const userId = Number(req.body.userId);

      if (!vendorId || !leadId || !accountId || !userId) {
        return res.status(400).json({
          success: false,
          message: "vendorId, leadId, accountId, userId are required",
        });
      }

      const files = req.files as {
        [fieldname: string]: Express.Multer.File[];
      };

      const uploadFiles = async (
        docs: Express.Multer.File[] | undefined,
        uploader: (
          filePath: string,
          vendorId: number,
          leadId: number,
          originalName: string,
          contentType: string
        ) => Promise<string>
      ) => {
        if (!docs || docs.length === 0) return [];
        const uploaded: { originalName: string; sysName: string }[] = [];

        for (const doc of docs) {
          const sysName = await uploader(
            doc.path,
            vendorId,
            leadId,
            doc.originalname,
            doc.mimetype
          );

          await fs.unlink(doc.path);

          uploaded.push({
            originalName: doc.originalname,
            sysName,
          });
        }

        return uploaded;
      };

      const uploadedFiles = {
        final_site_photos: await uploadFiles(
          files?.final_site_photos,
          uploadToWasabiFinalHandoverFinalSitePhotosFile
        ),
        warranty_card_photo: await uploadFiles(
          files?.warranty_card_photo,
          uploadToWasabiFinalHandoverWarrantyCardPhotosFile
        ),
        handover_booklet_photo: await uploadFiles(
          files?.handover_booklet_photo,
          uploadToWasabiFinalHandoverBookletPhotoFile
        ),
        final_handover_form_photo: await uploadFiles(
          files?.final_handover_form_photo,
          uploadToWasabiFinalHandoverFormPhotoFile
        ),
        qc_document: await uploadFiles(
          files?.qc_document,
          uploadToWasabiFinalHandoverQCDocumentFile
        ),
      };

      const result = await service.uploadFinalHandoverDocuments(
        vendorId,
        leadId,
        accountId,
        userId,
        uploadedFiles
      );

      return res.status(200).json({
        success: true,
        message: "Final Handover documents uploaded successfully",
        data: result,
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        message: error.message || "Upload failed",
      });
    }
  }

  async getFinalHandoverDocuments(req: Request, res: Response) {
    try {
      const vendorId = Number(req.params.vendorId);
      const leadId = Number(req.params.leadId);

      if (!vendorId || !leadId) {
        return res.status(400).json({
          success: false,
          message: "vendorId and leadId are required",
        });
      }

      const docs = await service.getFinalHandoverDocuments(vendorId, leadId);

      return res.status(200).json({
        success: true,
        message: "Final Handover documents fetched successfully",
        count: docs.length,
        data: docs,
      });
    } catch (error: any) {
      return res.status(error.statusCode || 500).json({
        success: false,
        message:
          error.message ||
          "Internal server error while fetching Final Handover documents",
      });
    }
  }

  async getFinalHandoverReadyStatus(req: Request, res: Response) {
    try {
      const vendorId = Number(req.params.vendorId);
      const leadId = Number(req.params.leadId);

      if (!vendorId || !leadId) {
        return res.status(400).json({
          success: false,
          message: "vendorId and leadId are required",
        });
      }

      const result = await service.getFinalHandoverReadyStatus(
        vendorId,
        leadId
      );

      return res.status(200).json({
        success: true,
        message: "Final handover readiness verified",
        data: result,
      });
    } catch (error: any) {
      return res.status(error.statusCode || 500).json({
        success: false,
        message:
          error.message ||
          "Internal server error while checking final-handover readiness",
      });
    }
  }

  async isTotalProjectAmountPaid(req: Request, res: Response) {
    try {
      const vendorId = Number(req.params.vendorId);
      const leadId = Number(req.params.leadId);

      if (!vendorId || !leadId) {
        return res
          .status(400)
          .json(ApiResponse.error("vendorId and leadId are required", 400));
      }

      const result = await service.isTotalProjectAmountPaid(vendorId, leadId);

      return res
        .status(200)
        .json(
          ApiResponse.success(
            result,
            result.is_paid
              ? "Total project amount is fully paid"
              : "Pending amount remaining"
          )
        );
    } catch (error: any) {
      return res
        .status(error.statusCode || 500)
        .json(
          ApiResponse.error(
            error.message || "Internal server error",
            error.statusCode || 500
          )
        );
    }
  }

  /**
   * ✅ Move Lead to Project Completed Stage (Type 17)
   * @route PUT /leads/installation/final-handover/vendorId/:vendorId/leadId/:leadId/move-to-project-completed
   */
  async moveLeadToProjectCompleted(req: Request, res: Response) {
    try {
      const vendorId = Number(req.params.vendorId);
      const leadId = Number(req.params.leadId);
      const { updated_by } = req.body;

      if (!vendorId || !leadId || !updated_by) {
        return res
          .status(400)
          .json(
            ApiResponse.error(
              "vendorId, leadId, and updated_by are required",
              400
            )
          );
      }

      const baseUrl = resolveClientBaseUrl(req);
      const result = await FinalHandoverStageService.moveLeadToProjectCompleted(
        vendorId,
        leadId,
        updated_by,
        baseUrl
      );

      // Fire-and-forget: notify Head Site Supervisor that Final Handover is completed
      void (async () => {
        try {
          const [hssMapping, lead, updater] = await Promise.all([
            prisma.leadUserMapping.findFirst({
              where: {
                vendor_id: vendorId,
                lead_id: leadId,
                type: "head-site-supervisor",
                status: "active",
              },
              select: { user_id: true },
            }),
            prisma.leadMaster.findUnique({
              where: { id: leadId },
              select: {
                firstname: true,
                lastname: true,
                account_id: true,
                lead_code: true,
              },
            }),
            prisma.userMaster.findUnique({
              where: { id: Number(updated_by) },
              select: { user_name: true, user_email: true },
            }),
          ]);

          if (!hssMapping) return;

          const hss = await prisma.userMaster.findUnique({
            where: { id: hssMapping.user_id },
            select: { id: true, user_name: true, user_email: true },
          });
          if (!hss) return;

          const leadName =
            `${lead?.firstname ?? ""} ${lead?.lastname ?? ""}`.trim();
          const leadCode =
            lead?.lead_code ?? `LEAD-${String(leadId).padStart(4, "0")}`;
          const clientBaseUrl = resolveClientBaseUrl(req);
          const projectUrl = lead?.account_id
            ? `${clientBaseUrl}/dashboard/installation/final-handover/details/${leadId}?accountId=${lead.account_id}`
            : `${clientBaseUrl}/dashboard/installation/final-handover/details/${leadId}`;
          const completedOn = new Date().toLocaleDateString("en-IN", {
            day: "2-digit",
            month: "short",
            year: "numeric",
          });
          const title = "Final Handover Completed";
          const message = `Final Handover completed for ${leadCode} – ${leadName}`;

          await NotificationService.createAndSend({
            vendor_id: vendorId,
            user_id: hss.id,
            sender_id: Number(updated_by),
            title,
            message,
            type: NotificationType.LEAD_MILESTONE,
            redirect_url: projectUrl,
          });

          if (hss.user_email) {
            await sendFinalHandoverCompletedEmail({
              vendor_id: vendorId,
              toEmail: hss.user_email,
              toName: hss.user_name ?? undefined,
              leadCode,
              leadName: leadName || "Lead",
              updatedBy: updater?.user_name ?? "Team",
              updatedOn: completedOn,
              projectUrl,
            });
          }
        } catch (err: any) {
          logger.warn(
            "⚠️ Failed to send Final Handover Completed notification to Head Site Supervisor",
            { error: err?.message, lead_id: leadId }
          );
        }
      })();

      try {
        const [admins, mappings, lead] = await Promise.all([
          prisma.userMaster.findMany({
            where: {
              vendor_id: vendorId,
              status: "active",
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
            select: { firstname: true, lastname: true, account_id: true, lead_code: true },
          }),
        ]);

        const leadName = `${lead?.firstname ?? ""} ${lead?.lastname ?? ""}`.trim();
        const leadCode =
          lead?.lead_code ?? `LEAD-${String(leadId).padStart(4, "0")}`;
        const recipientIds = new Set<number>();
        admins.forEach((admin) => recipientIds.add(admin.id));
        mappings.forEach((mapping) => recipientIds.add(mapping.user_id));

        if (recipientIds.size > 0) {
          const users = await prisma.userMaster.findMany({
            where: {
              id: { in: Array.from(recipientIds) },
              status: "active",
              user_type: { user_type: { equals: "admin", mode: "insensitive" } },
            },
            select: { id: true, user_name: true, user_email: true },
          });
          const clientBaseUrl = resolveClientBaseUrl(req);
          const detailsUrl = lead?.account_id
            ? `${clientBaseUrl}/dashboard/leads/details/${leadId}?accountId=${lead.account_id}`
            : `${clientBaseUrl}/dashboard/leads/details/${leadId}`;
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
                  milestoneName: "Completion of project",
                  completedOn,
                  detailsUrl,
                })
              )
          );
        }
      } catch (emailError: any) {
        logger.warn("⚠️ Failed to send completion milestone email", {
          error: emailError?.message,
          lead_id: leadId,
        });
      }

      return res
        .status(200)
        .json(
          ApiResponse.success(
            result,
            "Lead successfully moved to Project Completed stage"
          )
        );
    } catch (error: any) {
      logger.error(
        "[FinalHandoverStageController] moveLeadToProjectCompleted Error:",
        error
      );

      return res
        .status(500)
        .json(ApiResponse.error(error.message || "Internal server error"));
    }
  }
}
