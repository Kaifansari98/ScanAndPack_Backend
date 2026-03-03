import { Request, Response } from "express";
import { ClientApprovalService } from "../../../services/leadModuleServices/clientApprovalStage/clientApproval.service";
import { ApiResponse } from "../../../utils/apiResponse";
import { uploadToWasabClientApprovalDocumentationFile } from "../../../utils/wasabiClient";
import fs from "node:fs/promises";
import { prisma } from "../../../prisma/client";
import { NotificationService } from "../../../services/notification/notification.service";
import { NotificationType } from "../../../prisma/generated";
import {
  sendLeadAssignedEmail,
  sendMajorMilestoneEmail,
} from "../../../services/email/brevoEmail.service";
import logger from "../../../utils/logger";
import { sendTechCheckAssignedEmail } from "../../../../src/services/email/brevoEmail2.service";

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

const getParam = (param: string | string[] | undefined): string | undefined =>
  Array.isArray(param) ? param[0] : param;

const clientApprovalService = new ClientApprovalService();

export class ClientApprovalController {
  public static async addApprovalDocuments(
    req: Request,
    res: Response,
  ): Promise<void> {
    try {
      const { lead_id, vendor_id, account_id, created_by } = req.body;

      if (!lead_id || !vendor_id || !account_id || !created_by) {
        res
          .status(400)
          .json({ success: false, message: "Missing required fields" });
        return;
      }

      const documents = (req.files as any)?.documents || [];

      if (!documents || documents.length === 0) {
        res.status(400).json({
          success: false,
          message: "At least one screenshot is required",
        });
        return;
      }

      const uploadedDocs: { originalName: string; sysName: string }[] = [];

      for (const doc of documents) {
        const sysName = await uploadToWasabClientApprovalDocumentationFile(
          doc.path,
          Number(vendor_id),
          Number(lead_id),
          doc.originalname,
          doc.mimetype,
        );

        await fs.unlink(doc.path);

        uploadedDocs.push({
          originalName: doc.originalname,
          sysName,
        });
      }

      const result = await clientApprovalService.addApprovalDocuments({
        lead_id: Number(lead_id),
        vendor_id: Number(vendor_id),
        account_id: Number(account_id),
        created_by: Number(created_by),
        documents: uploadedDocs,
      });

      res.status(201).json({
        success: true,
        message: "Client approval screenshots uploaded successfully",
        data: result,
      });
    } catch (error: any) {
      console.error(
        "[ClientApprovalController] addApprovalDocuments Error:",
        error,
      );
      res.status(500).json({
        success: false,
        message: error.message || "Internal server error",
      });
    }
  }

  public static async submitApproval(
    req: Request,
    res: Response,
  ): Promise<void> {
    try {
      const { leadId, vendorId } = req.params;
      const {
        account_id,
        client_id,
        created_by,
        advance_payment_date,
        amount_paid,
        payment_text,
      } = req.body;

      const approvalScreenshots = (req.files as any)?.approvalScreenshots || [];
      const payment_files = (req.files as any)?.payment_files || [];

      if (!leadId || !vendorId || !account_id || !client_id || !created_by) {
        res
          .status(400)
          .json({ success: false, message: "Missing required fields" });
        return;
      }

      if (!approvalScreenshots || approvalScreenshots.length === 0) {
        res.status(400).json({
          success: false,
          message: "Client approval screenshot is mandatory",
        });
        return;
      }

      const uploadedApprovalScreenshots: {
        originalName: string;
        sysName: string;
      }[] = [];

      for (const doc of approvalScreenshots) {
        const sysName = await uploadToWasabClientApprovalDocumentationFile(
          doc.path,
          Number(vendorId),
          Number(leadId),
          doc.originalname,
          doc.mimetype,
        );

        await fs.unlink(doc.path);

        uploadedApprovalScreenshots.push({
          originalName: doc.originalname,
          sysName,
        });
      }

      const uploadedPaymentFiles: {
        originalName: string;
        sysName: string;
      }[] = [];

      if (payment_files && payment_files.length > 0) {
        for (const doc of payment_files) {
          const sysName = await uploadToWasabClientApprovalDocumentationFile(
            doc.path,
            Number(vendorId),
            Number(leadId),
            doc.originalname,
            doc.mimetype,
          );

          await fs.unlink(doc.path);

          uploadedPaymentFiles.push({
            originalName: doc.originalname,
            sysName,
          });
        }
      }

      const dto = {
        lead_id: Number(leadId),
        vendor_id: Number(vendorId),
        account_id: parseInt(account_id),
        client_id: parseInt(client_id),
        created_by: parseInt(created_by),
        approvalScreenshots: uploadedApprovalScreenshots,
        advance_payment_date,
        amount_paid: parseFloat(amount_paid),
        payment_text,
        payment_files: uploadedPaymentFiles,
      };

      const result = await clientApprovalService.submitClientApproval(dto);

      res.status(201).json({
        success: true,
        message: "Client approval stage submitted successfully",
        data: result,
      });
    } catch (error: any) {
      console.error("[ClientApprovalController] Error:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Internal server error",
      });
    }
  }

  /**
   * Fetch all Backend Users for a specific vendor
   */
  public static async fetchBackendUsersByVendor(
    req: Request,
    res: Response,
  ): Promise<Response> {
    try {
      const vendorId = Number(getParam(req.params.vendorId));

      // Validate vendorId
      if (isNaN(vendorId) || vendorId <= 0) {
        return res
          .status(400)
          .json(ApiResponse.error("Invalid vendor ID provided", 400));
      }

      console.log(
        `[CONTROLLER] Fetching Backend Users for vendor ID: ${vendorId}`,
      );

      const backendUsers =
        await clientApprovalService.getBackendUsersByVendor(vendorId);

      // Check if any backend users were found
      if (backendUsers.length === 0) {
        return res
          .status(200)
          .json(
            ApiResponse.success(
              [],
              "No Backend Users found for this vendor",
              200,
            ),
          );
      }

      console.log(`[CONTROLLER] Found ${backendUsers.length} Backend Users`);

      return res.status(200).json(
        ApiResponse.success(
          {
            backend_users: backendUsers,
            count: backendUsers.length,
          },
          "backend users fetched successfully",
          200,
        ),
      );
    } catch (error: any) {
      console.error("[CONTROLLER] fetchBackendUsersByVendor error:", error);

      return res
        .status(500)
        .json(
          ApiResponse.error(
            "Failed to fetch Backend Users",
            500,
            process.env.NODE_ENV === "development" ? error.message : undefined,
          ),
        );
    }
  }

  public static getAllClientApprovals = async (req: Request, res: Response) => {
    try {
      const vendorId = Number(getParam(req.params.vendorId));
      const userId = Number(getParam(req.params.userId));

      if (!vendorId || !userId) {
        return res.status(400).json({
          success: false,
          message: "Vendor ID and User ID are required",
        });
      }

      const leads =
        await clientApprovalService.getLeadsWithStatusClientApproval(
          vendorId,
          userId,
        );

      const count = leads.length;

      return res.status(200).json({
        success: true,
        message: "Client Approval leads fetched successfully",
        count,
        data: leads,
      });
    } catch (error: any) {
      console.error(
        "[ClientApprovalController] getAllClientApprovals Error:",
        error,
      );
      return res.status(500).json({
        success: false,
        message: error.message || "Something went wrong",
      });
    }
  };

  public static async getApprovalDetails(
    req: Request,
    res: Response,
  ): Promise<void> {
    try {
      const { leadId, vendorId } = req.params;

      if (!leadId || !vendorId) {
        res.status(400).json({
          success: false,
          message: "LeadId and VendorId are required",
        });
        return;
      }

      const details = await clientApprovalService.getClientApprovalDetails(
        Number(vendorId),
        Number(leadId)
      );

      res.status(200).json({
        success: true,
        message: "Client approval details fetched successfully",
        data: details,
      });
    } catch (error: any) {
      console.error(
        "[ClientApprovalController] getApprovalDetails Error:",
        error,
      );
      res.status(500).json({
        success: false,
        message: error.message || "Internal server error",
      });
    }
  }

  public static async requestToTechCheck(
    req: Request,
    res: Response,
  ): Promise<void> {
    try {
      const { leadId, vendorId } = req.params;
      const {
        account_id,
        assign_to_user_id,
        created_by,
        client_required_order_login_complition_date,
      } = req.body;

      if (
        !leadId ||
        !vendorId ||
        !account_id ||
        !assign_to_user_id ||
        !created_by ||
        !client_required_order_login_complition_date
      ) {
        res.status(400).json({
          success: false,
          message:
            "Missing required fields: leadId, vendorId, account_id, assign_to_user_id, created_by, client_required_order_login_complition_date",
        });
        return;
      }

      const dto = {
        lead_id: Number(leadId),
        vendor_id: Number(vendorId),
        account_id: parseInt(account_id),
        assign_to_user_id: parseInt(assign_to_user_id),
        created_by: parseInt(created_by),
        required_date: new Date(client_required_order_login_complition_date),
      };

      const result = await clientApprovalService.requestToTechCheck(dto);

      // ─── 1. In-app notification to assignee ───────────────────────────────
      try {
        const assignee = await prisma.userMaster.findUnique({
          where: { id: dto.assign_to_user_id },
          select: {
            user_name: true,
            user_email: true,
            user_type: { select: { user_type: true } },
          },
        });
        const assigneeRole = assignee?.user_type?.user_type?.toLowerCase();
        if (assigneeRole !== "admin" && assigneeRole !== "super-admin") {
          const lead = await prisma.leadMaster.findUnique({
            where: { id: dto.lead_id },
            select: { firstname: true, lastname: true, lead_code: true, franchise_id: true },
          });
          const leadName =
            `${lead?.firstname ?? ""} ${lead?.lastname ?? ""}`.trim();
          const leadCode =
            lead?.lead_code ?? `LEAD-${String(dto.lead_id).padStart(4, "0")}`;
          const franchiseId = lead?.franchise_id ?? null;

          // ✅ Spec: "You have been assigned {{Lead Code - Lead Name}} for Tech Check Review.
          //          Please review the documents uploaded by the Sales Executive."
          const notificationMessage =
            leadName.length > 0
              ? `You have been assigned ${leadCode} - ${leadName} for Tech Check Review. Please review the documents uploaded by the Sales Executive.`
              : `You have been assigned ${leadCode} for Tech Check Review. Please review the documents uploaded by the Sales Executive.`;

          await NotificationService.createAndSend({
            vendor_id: dto.vendor_id,
            user_id: dto.assign_to_user_id,
            sender_id: dto.created_by,
            type: NotificationType.LEAD_ASSIGNED,
            title: "Tech Check Review Required", // ✅ Spec title
            message: notificationMessage, // ✅ Spec message
            entity_type: "lead",
            entity_id: dto.lead_id,
            redirect_url: `/dashboard/production/tech-check/details/${dto.lead_id}?accountId=${dto.account_id}`, // ✅ Spec action URL
          });
        }
      } catch (notificationError: any) {
        console.error("⚠️ Failed to send tech-check assignment notification", {
          error: notificationError?.message,
          lead_id: dto.lead_id,
          assignee_user_id: dto.assign_to_user_id,
        });
      }

      // ─── 2. Email to assignee (Tech Check) ────────────────────────────────
      try {
        if (dto.assign_to_user_id !== dto.created_by) {
          const [assignee, assignedBy, lead] = await Promise.all([
            prisma.userMaster.findUnique({
              where: { id: dto.assign_to_user_id },
              select: { user_name: true, user_email: true },
            }),
            prisma.userMaster.findUnique({
              where: { id: dto.created_by },
              select: { user_name: true },
            }),
            prisma.leadMaster.findUnique({
              where: { id: dto.lead_id },
              select: {
                id: true,
                lead_code: true,
                firstname: true,
                lastname: true,
              },
            }),
          ]);

          const assigneeEmail = assignee?.user_email?.trim();
          if (!assigneeEmail) {
            logger.warn("Tech-check email skipped: missing assignee email", {
              lead_id: dto.lead_id,
              assignee_user_id: dto.assign_to_user_id,
            });
          } else if (lead) {
            const leadName =
              `${lead.firstname ?? ""} ${lead.lastname ?? ""}`.trim();
            const leadCode =
              lead.lead_code ?? `LEAD-${String(lead.id).padStart(4, "0")}`;
            const assignedByName = assignedBy?.user_name ?? "Admin";
            const assignedDate = new Date().toLocaleDateString("en-IN", {
              day: "2-digit",
              month: "short",
              year: "numeric",
            });
            const clientBaseUrl = resolveClientBaseUrl(req);
            const leadUrl = `${clientBaseUrl}/dashboard/leads/details/${dto.lead_id}?accountId=${dto.account_id}`;

            // ✅ Spec email: subject, body, lead details, CTA
            await sendTechCheckAssignedEmail({
              vendor_id: dto.vendor_id,
              toEmail: assigneeEmail,
              toName: assignee?.user_name ?? undefined,
              leadCode,
              leadName: leadName || "—",
              assignedBy: assignedByName,
              assignedDate,
              leadUrl,
            });
          }
        }
      } catch (emailError: any) {
        logger.warn("⚠️ Failed to send tech-check assignment email", {
          error: emailError?.message,
          lead_id: dto.lead_id,
          assignee_user_id: dto.assign_to_user_id,
        });
      }

      // ─── 3. Milestone notification + email (admins + mapped users) ────────
      try {
        const [admins, mappings, lead] = await Promise.all([
          prisma.userMaster.findMany({
            where: {
              vendor_id: dto.vendor_id,
              user_type: { user_type: { in: ["admin", "super-admin"] } },
            },
            select: { id: true },
          }),
          prisma.leadUserMapping.findMany({
            where: {
              vendor_id: dto.vendor_id,
              lead_id: dto.lead_id,
              status: "active",
            },
            select: { user_id: true },
          }),
          prisma.leadMaster.findUnique({
            where: { id: dto.lead_id },
            select: { firstname: true, lastname: true, lead_code: true, franchise_id: true },
          }),
        ]);

        const leadName =
          `${lead?.firstname ?? ""} ${lead?.lastname ?? ""}`.trim();
        const leadCode =
          lead?.lead_code ?? `LEAD-${String(dto.lead_id).padStart(4, "0")}`;
        const recipientIds = new Set<number>();
        admins.forEach((admin) => recipientIds.add(admin.id));
        mappings.forEach((mapping) => recipientIds.add(mapping.user_id));
        const franchiseId = lead?.franchise_id ?? null;

        if (recipientIds.size > 0) {
          const redirectUrl = dto.account_id
            ? `/dashboard/production/details/${dto.lead_id}?accountId=${dto.account_id}`
            : `/dashboard/production/details/${dto.lead_id}`;

          await Promise.all(
            Array.from(recipientIds).map((recipientId) =>
              NotificationService.createAndSend({
                vendor_id: dto.vendor_id,
                user_id: recipientId,
                sender_id: dto.created_by,
                type: NotificationType.LEAD_MILESTONE,
                title: "Lead moved to Production",
                message:
                  leadName.length > 0
                    ? `Lead ${leadName} moved to Production stage.`
                    : "Lead moved to Production stage.",
                entity_type: "lead",
                entity_id: dto.lead_id,
                redirect_url: redirectUrl,
              }),
            ),
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
                  vendor_id: dto.vendor_id,
                  toEmail: user.user_email!,
                  toName: user.user_name ?? undefined,
                  leadCode,
                  leadName: leadName || "Lead",
                  milestoneName: "Project to Production",
                  completedOn,
                  detailsUrl,
                }),
              ),
          );
        }
      } catch (milestoneError: any) {
        console.error("⚠️ Failed to send project-to-production notification", {
          error: milestoneError?.message,
          lead_id: dto.lead_id,
        });
      }

      res.status(200).json({
        success: true,
        message: "Lead moved to Tech Check stage successfully",
        data: result,
      });
    } catch (error: any) {
      console.error(
        "[ClientApprovalController] Error in requestToTechCheck:",
        error,
      );
      res.status(500).json({
        success: false,
        message: error.message || "Internal server error",
      });
    }
  }

  public static async fetchTechCheckUsersByVendor(
    req: Request,
    res: Response,
  ): Promise<Response> {
    try {
      const vendorId = Number(getParam(req.params.vendorId));

      if (isNaN(vendorId) || vendorId <= 0) {
        return res
          .status(400)
          .json(ApiResponse.error("Invalid vendor ID provided", 400));
      }

      console.log(
        `[CONTROLLER] Fetching Tech-Check Users for vendor ID: ${vendorId}`,
      );

      const techCheckUsers =
        await clientApprovalService.getTechCheckUsersByVendor(vendorId);

      if (techCheckUsers.length === 0) {
        return res
          .status(200)
          .json(
            ApiResponse.success(
              [],
              "No Tech-Check Users found for this vendor",
              200,
            ),
          );
      }

      console.log(
        `[CONTROLLER] Found ${techCheckUsers.length} Tech-Check Users`,
      );

      return res.status(200).json(
        ApiResponse.success(
          {
            tech_check_users: techCheckUsers,
            count: techCheckUsers.length,
          },
          "Tech-Check users fetched successfully",
          200,
        ),
      );
    } catch (error: any) {
      console.error("[CONTROLLER] fetchTechCheckUsersByVendor error:", error);

      return res
        .status(500)
        .json(
          ApiResponse.error(
            "Failed to fetch Tech-Check Users",
            500,
            process.env.NODE_ENV === "development" ? error.message : undefined,
          ),
        );
    }
  }
}
