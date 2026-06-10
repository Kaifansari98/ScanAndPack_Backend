import { prisma } from "../../prisma/client";
import { NotificationService } from "../notification/notification.service";
import { getFranchiseAdminRecipients } from "../notification/adminRecipients.service";
import {
  LeadUserStatus,
  NotificationType,
  Prisma,
  ServiceVisitStatus,
  SupervisorStatus,
} from "../../prisma/generated";
import {
  AddPaymentDto,
  CreateBookingStageDto,
} from "../../types/booking-stage.dto";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import wasabi, { generateSignedUrl } from "../../utils/wasabiClient";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import logger from "../../utils/logger";
import { isLeadComplete } from "../../validations/leadValidation";
import { cache } from "../../utils/cache";
import {
  sendLeadMovedToBookingEmail,
  sendPaymentAddedEmail,
} from "../email/brevoEmail.service";
import { AssignTaskBookingInput } from "../../types/leadModule.types";
import Joi from "joi";
import { createTaskHistoryLog } from "../task/taskHistory.service";
import { LeadSuperAdminApprovalLockInService } from "../leadSuperAdminApprovalLockIn/leadSuperAdminApprovalLockIn.service";
import { createLeadLog } from "../../utils/leadDetailedLog";

const assignTaskBookingSchema = Joi.object({
  lead_id: Joi.number().integer().positive().required(),
  task_type: Joi.string().trim().required(),
  due_date: Joi.alternatives()
    .try(Joi.string().isoDate(), Joi.date())
    .required(),
  remark: Joi.string().allow("", null),
  assignee_user_id: Joi.number().integer().positive().required(),
  created_by: Joi.number().integer().positive().required(),
});

export class BookingStageService {
  private leadSuperAdminApprovalLockInService =
    new LeadSuperAdminApprovalLockInService();
  private static readonly statusLogSortedStageTags = new Set([
    "Type 2",
    "Type 3",
    "Type 4",
    "Type 5",
    "Type 6",
    "Type 7",
    "Type 8",
    "Type 11",
    "Type 12",
    "Type 13",
    "Type 14",
    "Type 15",
    "Type 16",
    "Type 17",
  ]);

  // Helper to avoid repeating include structure
  private static leadIncludes(stageTag?: string) {
    const normalizedStageTag = String(stageTag ?? "").trim();
    const productStructureInstancesOrderBy =
      normalizedStageTag === "Type 9"
        ? [
          { tech_check_completed_at: Prisma.SortOrder.desc },
          { product_structure_id: Prisma.SortOrder.asc },
          { quantity_index: Prisma.SortOrder.asc },
        ]
        : normalizedStageTag === "Type 10"
          ? [
            { order_login_completed_at: Prisma.SortOrder.desc },
            { product_structure_id: Prisma.SortOrder.asc },
            { quantity_index: Prisma.SortOrder.asc },
          ]
          : [
            { product_structure_id: Prisma.SortOrder.asc },
            { quantity_index: Prisma.SortOrder.asc },
          ];

    return {
      account: { select: { id: true, name: true } },
      siteType: true,
      source: true,
      statusType: true,
      createdBy: { select: { id: true, user_name: true } },
      updatedBy: true,
      assignedTo: { select: { id: true, user_name: true } },
      assignedBy: { select: { id: true, user_name: true } },
      userMappings: {
        where: {
          status: LeadUserStatus.active,
          type: "designer",
        },
        select: {
          id: true,
          user_id: true,
          type: true,
          status: true,
          created_at: true,
          user: {
            select: {
              id: true,
              user_name: true,
            },
          },
        },
        orderBy: {
          created_at: Prisma.SortOrder.asc,
        },
      },
      productMappings: {
        select: {
          productType: { select: { id: true, type: true, tag: true } },
        },
      },
      leadProductStructureMapping: {
        select: { productStructure: { select: { id: true, type: true } } },
      },
      productStructureInstances: {
        select: {
          id: true,
          title: true,
          description: true,
          quantity_index: true,
          product_structure_id: true,
          is_tech_check_completed: true,
          tech_check_completed_at: true,
          is_order_login_completed: true,
          order_login_completed_at: true,
          is_pre_prod_done: true,
          pre_prod_done_at: true,
          is_under_production: true,
          under_production_at: true,
          is_post_production: true,
          is_production_completed: true,
          productStructure: {
            select: {
              id: true,
              type: true,
            },
          },
        },
        orderBy: productStructureInstancesOrderBy,
      },
      ...(BookingStageService.statusLogSortedStageTags.has(normalizedStageTag)
        ? {
          leadStatusLogs: {
            where: {
              statusType: {
                tag: normalizedStageTag,
              },
            },
            select: {
              created_at: true,
              statusType: {
                select: {
                  tag: true,
                },
              },
            },
            orderBy: {
              created_at: Prisma.SortOrder.desc,
            },
          },
        }
        : {}),
      payments: {
        where: { paymentType: { tag: "Type 2" } },
        select: {
          id: true,
          amount: true,
          payment_date: true,
          payment_text: true,
          payment_file_id: true,
          payment_type_id: true,
          paymentType: { select: { id: true, type: true, tag: true } },
        },
      },
      siteSupervisors: {
        where: { status: SupervisorStatus.active },
        select: { supervisor: { select: { id: true, user_name: true } } },
      },
      documents: {
        where: { is_deleted: false, documentType: { tag: "Type 8" } },
        include: {
          documentType: { select: { id: true, type: true, tag: true } },
          createdBy: { select: { id: true, user_name: true } },
        },
      },
      tasks: {
        select: {
          id: true,
          task_type: true,
          due_date: true,
          remark: true,
          status: true,
          created_at: true,
        },
        orderBy: { created_at: Prisma.SortOrder.desc }, // ✅ fixed
      },
      serviceSchedules: {
        where: { status: ServiceVisitStatus.open },
        select: {
          service_no: true,
          service_type: true,
          scheduled_for: true,
        },
        orderBy: [
          { scheduled_for: Prisma.SortOrder.asc },
          { service_no: Prisma.SortOrder.asc },
        ],
      },
    };
  }

  private static getStageSortTimestamp(lead: any, stageTag: string): number {
    if (BookingStageService.statusLogSortedStageTags.has(stageTag)) {
      const latestType8Log = Array.isArray(lead?.leadStatusLogs)
        ? lead.leadStatusLogs[0]
        : null;
      return latestType8Log?.created_at
        ? new Date(latestType8Log.created_at).getTime()
        : Number.NEGATIVE_INFINITY;
    }

    if (stageTag === "Type 9") {
      const latestInstance = Array.isArray(lead?.productStructureInstances)
        ? lead.productStructureInstances.find((instance: any) => instance?.tech_check_completed_at)
        : null;
      return latestInstance?.tech_check_completed_at
        ? new Date(latestInstance.tech_check_completed_at).getTime()
        : Number.NEGATIVE_INFINITY;
    }

    if (stageTag === "Type 10") {
      const latestInstance = Array.isArray(lead?.productStructureInstances)
        ? lead.productStructureInstances.find((instance: any) => instance?.order_login_completed_at)
        : null;
      return latestInstance?.order_login_completed_at
        ? new Date(latestInstance.order_login_completed_at).getTime()
        : Number.NEGATIVE_INFINITY;
    }

    return Number.NEGATIVE_INFINITY;
  }

  // Generate signed URL for file access
  public async generateSignedUrl(
    s3Key: string,
    vendorId: number,
    expiresIn: number = 3600,
  ): Promise<string> {
    try {
      // Validate that the file belongs to the vendor (security check)
      const document = await prisma.leadDocuments.findFirst({
        where: {
          doc_sys_name: s3Key,
          vendor_id: vendorId,
          deleted_at: null,
        },
      });

      if (!document) {
        throw new Error("Document not found or access denied");
      }

      // Generate signed URL
      const command = new GetObjectCommand({
        Bucket: process.env.WASABI_BUCKET_NAME || "your-bucket-name",
        Key: s3Key,
      });

      const signedUrl = await getSignedUrl(wasabi, command, {
        expiresIn: expiresIn, // URL expires in 1 hour by default
      });

      return signedUrl;
    } catch (error: any) {
      console.error(
        "[PaymentUploadService] Error generating signed URL:",
        error,
      );
      throw new Error(`Failed to generate signed URL: ${error.message}`);
    }
  }

  public async createBookingStage(data: CreateBookingStageDto) {
    const response = await prisma.$transaction(
      async (tx: any) => {
        const response: any = {
          documentsUploaded: [],
          paymentInfo: null,
          supervisorAssigned: null,
          message: "Booking stage completed successfully",
        };

        // 1. Upload Final Documents (mandatory)
        if (!data.finalDocuments || data.finalDocuments.length === 0) {
          throw new Error("At least one final document must be uploaded");
        }

        const finalDocType = await tx.documentTypeMaster.findFirst({
          where: { vendor_id: data.vendor_id, tag: "Type 8" },
        });
        if (!finalDocType) {
          throw new Error(
            "Document type (Final Documents) not found for this vendor",
          );
        }

        for (const file of data.finalDocuments) {
          const document = await tx.leadDocuments.create({
            data: {
              doc_og_name: file.originalName,
              doc_sys_name: file.sysName,
              created_by: data.created_by,
              doc_type_id: finalDocType.id,
              account_id: data.account_id,
              lead_id: data.lead_id,
              vendor_id: data.vendor_id,
            },
          });

          response.documentsUploaded.push({
            id: document.id,
            type: "final_document",
            originalName: file.originalName,
            s3Key: file.sysName,
          });
        }

        // 2. Booking Amount (PaymentInfo)
        const bookingPaymentType = await tx.paymentTypeMaster.findFirst({
          where: { vendor_id: data.vendor_id, tag: "Type 2" },
        });
        if (!bookingPaymentType) {
          throw new Error(
            "Payment type (Booking Amount) not found for this vendor",
          );
        }

        // ➕ NEW: Ledger Entry
        await tx.ledger.create({
          data: {
            lead_id: data.lead_id,
            account_id: data.account_id,
            client_id: data.client_id,
            vendor_id: data.vendor_id,
            created_by: data.created_by,
            amount: data.bookingAmount,
            payment_date: new Date(),
            type: "credit",
          },
        });

        // 3. Booking Amount Payment Details
        let paymentFileId: number | null = null;
        if (data.bookingAmountPaymentDetailsFile) {
          const document = await tx.leadDocuments.create({
            data: {
              doc_og_name: data.bookingAmountPaymentDetailsFile.originalName,
              doc_sys_name: data.bookingAmountPaymentDetailsFile.sysName,
              created_by: data.created_by,
              doc_type_id: finalDocType.id,
              account_id: data.account_id,
              lead_id: data.lead_id,
              vendor_id: data.vendor_id,
            },
          });

          paymentFileId = document.id;
        }

        const bookingPayment = await tx.paymentInfo.create({
          data: {
            lead_id: data.lead_id,
            account_id: data.account_id,
            vendor_id: data.vendor_id,
            created_by: data.created_by,
            amount: data.bookingAmount,
            payment_text: data.bookingAmountPaymentDetailsText || null,
            payment_file_id: paymentFileId, // may be null if no file
            payment_date: new Date(),
            payment_type_id: bookingPaymentType.id,
          },
        });
        response.paymentInfo = bookingPayment;

        // 1. Resolve the vendor's Booking status ID dynamically using vendor_id from req.body (data.vendor_id)
        const bookingStatus = await prisma.statusTypeMaster.findFirst({
          where: {
            vendor_id: data.vendor_id,
            tag: "Type 4", // ✅ Booking status
          },
          select: { id: true },
        });

        if (!bookingStatus) {
          throw new Error(
            `Booking status (Type 4) not found for vendor ${data.vendor_id}`,
          );
        }

        const bookingStatusId = bookingStatus.id;

        if (data.mrpValue < data.finalBookingAmount) {
          throw new Error("MRP value cannot be less than Total Booking Value");
        }

        // 4. Update LeadMaster total_project_amount
        await tx.leadMaster.update({
          where: { id: data.lead_id },
          data: {
            total_project_amount: data.finalBookingAmount,
            booking_amount: data.bookingAmount, // ➕ new field
            pending_amount: data.finalBookingAmount - data.bookingAmount, // ➕ new field
            mrp_value: data.mrpValue,
            status_id: Number(bookingStatusId),
          },
        });

        if (data.siteSupervisorId) {
          // 5. Assign Site Supervisor
          const supervisor = await tx.leadSiteSupervisorMapping.create({
            data: {
              lead_id: data.lead_id,
              user_id: data.siteSupervisorId,
              vendor_id: data.vendor_id,
              account_id: data.account_id,
              created_by: data.created_by,
            },
          });

          response.supervisorAssigned = supervisor;

          // -----------------------------
          // ⭐ 6️⃣ LeadUserMapping ENTRY (NEW)
          // -----------------------------
          await tx.leadUserMapping.create({
            data: {
              vendor_id: data.vendor_id,
              account_id: data.account_id,
              lead_id: data.lead_id,
              user_id: data.siteSupervisorId,
              type: "site-supervisor",
              status: "active",
              created_by: data.created_by,
            },
          });

          // ✅ Ensure site supervisor is in lead chat members
          let chatRoom = await tx.leadChatRoom.findFirst({
            where: {
              lead_id: data.lead_id,
              vendor_id: data.vendor_id,
            },
            select: { id: true },
          });

          if (!chatRoom) {
            chatRoom = await tx.leadChatRoom.create({
              data: {
                lead_id: data.lead_id,
                vendor_id: data.vendor_id,
                created_by: data.created_by,
              },
              select: { id: true },
            });
          }

          const existingMember = await tx.leadChatMember.findFirst({
            where: {
              chat_room_id: chatRoom.id,
              user_id: data.siteSupervisorId,
            },
            select: { id: true },
          });

          if (existingMember) {
            logger.info(
              "[SERVICE] LeadChatMember already exists, skipping insert",
              {
                lead_id: data.lead_id,
                chat_room_id: chatRoom.id,
                user_id: data.siteSupervisorId,
              },
            );
          } else {
            await tx.leadChatMember.create({
              data: {
                chat_room_id: chatRoom.id,
                user_id: data.siteSupervisorId,
                added_by: data.created_by,
              },
            });
          }
        }

        // -----------------------------
        // ⭐ 7️⃣ LeadStatusLogs (NEW)
        // -----------------------------
        await tx.leadStatusLogs.create({
          data: {
            lead_id: data.lead_id,
            account_id: data.account_id,
            vendor_id: data.vendor_id,
            status_id: bookingStatusId,
            created_by: data.created_by,
            created_at: new Date(),
          },
        });

        await cache.del(
          `performance:snapshot:${data.vendor_id}:${data.created_by}`,
        );
        if (data.siteSupervisorId) {
          await cache.del(
            `dashboard:tasks:${data.vendor_id}:${data.siteSupervisorId}`,
          );
        }
        await cache.del(
          `lead-status-counts:${data.vendor_id}:${data.created_by}`,
        );
        await cache.del(`lead-status-counts:${data.vendor_id}:overall`);

        // 6️⃣ Create audit trail (LeadDetailedLogs + LeadDocumentLogs)
        const docCount = response.documentsUploaded.length;
        const hasDocs = docCount > 0;

        let actionMessage = `Booking has been done successfully`;

        if (hasDocs) {
          actionMessage += ` — Remark: ${docCount} document${docCount > 1 ? "s have" : " has"
            } been uploaded successfully with it.`;
        } else {
          actionMessage += ` — Remark: No documents were uploaded.`;
        }

        // Create LeadDetailedLogs entry
        const detailedLog = await tx.leadDetailedLogs.create({
          data: {
            vendor_id: data.vendor_id,
            lead_id: data.lead_id,
            account_id: data.account_id,
            action: actionMessage,
            action_type: "CREATE",
            created_by: data.created_by,
            created_at: new Date(),
          },
        });

        // Map uploaded documents to LeadDocumentLogs if any
        if (hasDocs) {
          const docLogsData = response.documentsUploaded.map((doc: any) => ({
            vendor_id: data.vendor_id,
            lead_id: data.lead_id,
            account_id: data.account_id,
            doc_id: doc.id,
            lead_logs_id: detailedLog.id,
            created_by: data.created_by,
            created_at: new Date(),
          }));

          await tx.leadDocumentLogs.createMany({ data: docLogsData });
        }

        logger.info("✅ Booking stage logs created successfully", {
          leadId: data.lead_id,
          vendorId: data.vendor_id,
          actionMessage,
        });

        return response;
      },
      {
        timeout: 15000, // 15 seconds instead of 5
      },
    );

    // ===============================
    // BOOKING STAGE → ADMIN NOTIFICATION
    // ===============================

    try {
      const actorId = data.created_by;

      const [lead, actor] = await Promise.all([
        prisma.leadMaster.findUnique({
          where: { id: data.lead_id },
          select: {
            firstname: true,
            lastname: true,
            lead_code: true,
            vendor_id: true,
            account_id: true,
          },
        }),

        prisma.userMaster.findUnique({
          where: { id: actorId },
          select: { user_name: true },
        }),
      ]);

      if (!lead) return response;

      const leadName = `${lead.firstname ?? ""} ${lead.lastname ?? ""}`.trim();

      const leadCode =
        lead.lead_code ?? `LEAD-${String(data.lead_id).padStart(4, "0")}`;

      const updatedAt = new Date().toLocaleString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });

      const baseUrl =
        process.env.CLIENT_BASE_URL ||
        process.env.FRONTEND_URL ||
        "http://localhost:3000";

      const projectUrl = lead.account_id
        ? `${baseUrl}/dashboard/leads/details/${data.lead_id}?accountId=${lead.account_id}`
        : `${baseUrl}/dashboard/leads/details/${data.lead_id}`;

      // Fetch Active Admins
      const admins = await prisma.userMaster.findMany({
        where: {
          vendor_id: lead.vendor_id,
          status: "active",
          user_type: {
            user_type: { in: ["admin"] },
          },
        },
        select: {
          id: true,
          user_name: true,
          user_email: true,
        },
      });

      for (const admin of admins) {
        // ❌ Prevent self-trigger notification
        if (admin.id === actorId) continue;

        // 🔔 In-App Notification
        await NotificationService.createAndSend({
          vendor_id: lead.vendor_id,
          user_id: admin.id,
          sender_id: actorId,
          type: NotificationType.LEAD_MILESTONE,
          title: "Lead Entered Booking Stage",
          message: `${leadCode} - ${leadName} moved to Booking stage.`,
          entity_type: "lead",
          entity_id: data.lead_id,
          redirect_url: lead.account_id
            ? `/dashboard/leads/details/${data.lead_id}?accountId=${lead.account_id}`
            : `/dashboard/leads/details/${data.lead_id}`,
        });

        // 📧 Email Notification
        if (!admin.user_email) continue;

        await sendLeadMovedToBookingEmail({
          vendor_id: lead.vendor_id,
          toEmail: admin.user_email,
          toName: admin.user_name,
          leadCode,
          leadName,
          updatedBy: actor?.user_name ?? "System",
          updatedAt,
          projectUrl,
        });
      }
    } catch (err: any) {
      logger.warn("⚠️ Booking stage admin notification failed", {
        lead_id: data.lead_id,
        error: err?.message,
      });
    }

    return response;
  }



  public async addBookingStageFiles(data: {
    lead_id: number;
    account_id: number;
    vendor_id: number;
    created_by: number;
    baseUrl: string;
    finalDocuments?: { originalName: string; sysName: string }[];
  }) {
    return await prisma.$transaction(async (tx: any) => {
      const response: any = {
        documentsUploaded: [],
      };

      // 1️⃣ Save Final Documents
      if (data.finalDocuments && data.finalDocuments.length > 0) {
        const finalDocType = await tx.documentTypeMaster.findFirst({
          where: { vendor_id: data.vendor_id, tag: "Type 8" }, // Final Documents
        });

        if (!finalDocType)
          throw new Error("Final Document type not found for this vendor");

        for (const file of data.finalDocuments) {
          // Create LeadDocuments entry
          const document = await tx.leadDocuments.create({
            data: {
              doc_og_name: file.originalName,
              doc_sys_name: file.sysName,
              created_by: data.created_by,
              doc_type_id: finalDocType.id,
              account_id: data.account_id,
              lead_id: data.lead_id,
              vendor_id: data.vendor_id,
            },
          });

          response.documentsUploaded.push({
            id: document.id,
            type: "final_document",
            originalName: file.originalName,
            s3Key: file.sysName,
          });
        }
      }

      // 2️⃣ Log action if files were uploaded
      const uploadedCount = response.documentsUploaded.length;
      const plural = uploadedCount > 1 ? "documents have" : "document has";

      let actionMessage = "";

      if (uploadedCount > 0) {
        actionMessage = `${uploadedCount} ${plural} been added successfully in Booking Stage.`;
      } else {
        actionMessage = `No new Documents were uploaded.`;
      }

      // Create LeadDetailedLogs entry
      const detailedLog = await createLeadLog(tx, {
        vendor_id: data.vendor_id,
        lead_id: data.lead_id,
        account_id: data.account_id,
        action: actionMessage,
        action_type: "CREATE",
        created_by: data.created_by,
        created_at: new Date(),
      });

      // Create LeadDocumentLogs if applicable
      if (uploadedCount > 0) {
        const docLogsData = response.documentsUploaded.map((doc: any) => ({
          vendor_id: data.vendor_id,
          lead_id: data.lead_id,
          account_id: data.account_id,
          doc_id: doc.id,
          lead_logs_id: detailedLog.id,
          created_by: data.created_by,
          created_at: new Date(),
        }));

        await tx.leadDocumentLogs.createMany({ data: docLogsData });
      }

      logger.info("✅ Booking stage documents added", {
        lead_id: data.lead_id,
        vendor_id: data.vendor_id,
        uploadedCount,
        actionMessage,
      });

      // ===============================
      // BOOKING STAGE → ADMIN NOTIFICATION
      // ===============================

      try {
        const actorId = data.created_by;

        const lead = await prisma.leadMaster.findUnique({
          where: { id: data.lead_id },
          select: {
            firstname: true,
            lastname: true,
            lead_code: true,
            vendor_id: true,
            account_id: true,
            franchise_id: true,
          },
        });

        if (!lead) return response;

        const leadName =
          `${lead.firstname ?? ""} ${lead.lastname ?? ""}`.trim();

        const leadCode =
          lead.lead_code ?? `LEAD-${String(data.lead_id).padStart(4, "0")}`;

        const franchiseId = lead?.franchise_id ?? null;

        // Fetch Active Admins
        const admins = await getFranchiseAdminRecipients({
          vendorId: lead.vendor_id,
          franchiseId,
          excludeUserId: actorId,
        });

        for (const admin of admins) {
          // 🔔 In-App Notification
          await NotificationService.createAndSend({
            vendor_id: lead.vendor_id,
            user_id: admin.id,
            sender_id: actorId,
            type: NotificationType.LEAD_MILESTONE,
            title: "Lead Entered Booking Stage",
            message: `${leadCode} - ${leadName} moved to Booking stage.`,
            entity_type: "lead",
            entity_id: data.lead_id,
            redirect_url: lead.account_id
              ? `/dashboard/leads/details/${data.lead_id}?accountId=${lead.account_id}`
              : `/dashboard/leads/details/${data.lead_id}`,
          });

        }
      } catch (err: any) {
        logger.warn("⚠️ Booking stage admin notification failed", {
          lead_id: data.lead_id,
          error: err?.message,
        });
      }
      return response;
    });
  }

  public async getBookingStage(leadId: number, vendorId: number) {
    const [lead, siteSupervisorMappings] = await Promise.all([
      prisma.leadMaster.findUnique({
        where: { id: leadId },
        include: {
          documents: {
            where: {
              is_deleted: false,
              documentType: {
                tag: "Type 8",
                vendor_id: vendorId,
              },
            },
            include: { documentType: true },
          },
          payments: {
            where: {
              paymentType: {
                type: "booking_amount",
              },
            },
            include: {
              paymentType: true,
              document: true,
            },
          },
          siteSupervisors: {
            where: { status: "active" },
            include: { supervisor: true },
          },
        },
      }),
      prisma.leadUserMapping.findMany({
        where: {
          lead_id: leadId,
          vendor_id: vendorId,
          type: "site-supervisor",
          status: "active",
        },
        include: {
          user: { select: { id: true, user_name: true } },
        },
      }),
    ]);

    if (!lead) {
      throw new Error("Lead not found");
    }

    // 🔹 Generate signed URLs for each document
    const documentsWithUrls = await Promise.all(
      lead.documents.map(async (doc: any) => {
        const signedUrl = await generateSignedUrl(
          doc.doc_sys_name,
          3600,
          "inline",
        );
        return {
          id: doc.id,
          originalName: doc.doc_og_name,
          s3Key: doc.doc_sys_name,
          type: doc.documentType?.tag,
          created_at: doc.created_at,
          signedUrl,
        };
      }),
    );

    return {
      leadId: lead.id,
      name: `${lead.firstname} ${lead.lastname}`,
      finalBookingAmount: lead.total_project_amount,
      bookingAmount: lead.booking_amount,
      mrpValue: lead.mrp_value,
      vendorId: lead.vendor_id,
      documents: documentsWithUrls,
      payments: await Promise.all(
        lead.payments.map(async (p: any) => {
          let file: any = null;
          if (p.document) {
            const signedUrl = await generateSignedUrl(
              p.document.doc_sys_name,
              3600,
              "inline",
            );
            file = {
              id: p.document.id,
              originalName: p.document.doc_og_name,
              signedUrl,
            };
          }

          return {
            id: p.id,
            amount: p.amount,
            date: p.payment_date,
            text: p.payment_text,
            type: p.paymentType?.tag,
            file,
          };
        }),
      ),
      supervisors: siteSupervisorMappings.map((m: any) => ({
        userId: m.user_id,
        userName: m.user.user_name,
        status: m.status,
      })),
    };
  }

  public static async getLeadsWithStatusBooking(
    vendorId: number,
    userId: number,
  ) {
    // 1️⃣ Get Booking status (Type 4)
    const bookingStatus = await prisma.statusTypeMaster.findFirst({
      where: { vendor_id: vendorId, tag: "Type 4" },
      select: { id: true },
    });

    if (!bookingStatus) {
      throw new Error(
        `Booking status (Type 4) not found for vendor ${vendorId}`,
      );
    }

    // 2️⃣ Check if user is admin
    const creator = await prisma.userMaster.findUnique({
      where: { id: userId },
      include: { user_type: true },
    });

    const isAdmin = creator?.user_type?.user_type?.toLowerCase() === "admin";

    let leadIds: number[] = [];

    if (!isAdmin) {
      // Leads via LeadUserMapping
      const mappedLeads = await prisma.leadUserMapping.findMany({
        where: { vendor_id: vendorId, user_id: userId, status: "active" },
        select: { lead_id: true },
      });

      // Leads via UserLeadTask
      const taskLeads = await prisma.userLeadTask.findMany({
        where: {
          vendor_id: vendorId,
          OR: [{ created_by: userId }, { user_id: userId }],
        },
        select: { lead_id: true },
      });

      // Union of both sets
      leadIds = [
        ...new Set([
          ...mappedLeads.map((m) => m.lead_id),
          ...taskLeads.map((t) => t.lead_id),
        ]),
      ];

      if (!leadIds.length) return [];
    }

    // 3️⃣ Fetch leads
    const leads = await prisma.leadMaster.findMany({
      where: {
        ...(isAdmin ? {} : { id: { in: leadIds } }),
        status_id: bookingStatus.id,
        is_deleted: false,
        vendor_id: vendorId,
        activity_status: {
          in: ["onGoing", "lostApproval"], // ✅ allow both
        },
      },
      include: {
        account: { select: { id: true, name: true } },
        siteType: true,
        source: true,
        statusType: true,
        createdBy: { select: { id: true, user_name: true } },
        updatedBy: true,
        assignedTo: { select: { id: true, user_name: true } },
        assignedBy: { select: { id: true, user_name: true } },
        productMappings: {
          select: {
            productType: { select: { id: true, type: true, tag: true } },
          },
        },
        leadProductStructureMapping: {
          select: { productStructure: { select: { id: true, type: true } } },
        },
        payments: {
          where: {
            paymentType: { tag: "Type 2", vendor_id: vendorId }, // only booking payments
          },
          select: {
            id: true,
            amount: true,
            payment_date: true,
            payment_text: true,
            payment_file_id: true,
            payment_type_id: true,
            paymentType: { select: { id: true, type: true, tag: true } },
          },
        },
        siteSupervisors: {
          where: { status: "active" },
          select: { supervisor: { select: { id: true, user_name: true } } },
        },
        documents: {
          where: {
            is_deleted: false,
            documentType: { tag: "Type 8", vendor_id: vendorId },
          },
          include: {
            documentType: { select: { id: true, type: true, tag: true } },
            createdBy: { select: { id: true, user_name: true } },
          },
        },
        tasks: {
          select: {
            id: true,
            task_type: true,
            due_date: true,
            remark: true,
            status: true,
            created_at: true,
          },
          orderBy: { created_at: Prisma.SortOrder.desc },
        },
      },
      orderBy: { created_at: Prisma.SortOrder.desc },
    });

    // 4️⃣ Attach signed URLs
    const data = await Promise.all(
      leads.map(async (lead: any) => {
        const docsWithUrls = await Promise.all(
          lead.documents.map(async (doc: any) => {
            const signed_url = await generateSignedUrl(doc.doc_sys_name);
            return {
              ...doc,
              signed_url,
              file_type: BookingStageService.getFileType(doc.doc_og_name),
              is_image: BookingStageService.isImageFile(doc.doc_og_name),
            };
          }),
        );

        return {
          ...lead,
          documents: docsWithUrls,
          siteSupervisors: lead.siteSupervisors.map((s: any) => s.supervisor),
        };
      }),
    );

    return data;
  }

  /**
   * Fetch all leads for a vendor filtered by tag (Type 1, 2, 3, etc.)
   */
  public static async getVendorLeadsByTag(
    vendorId: number,
    tag: string,
    userId: number,
    page: number = 1,
    limit: number = 10,
  ) {
    logger.info("[BookingStageService] getVendorLeadsByTag called", {
      vendorId,
      tag,
      userId,
      page,
      limit,
    });

    const skip = (page - 1) * limit;

    // 0️⃣ Exclude user-linked leads if userId provided
    let excludedLeadIds: number[] = [];
    if (userId) {
      const mappedLeads = await prisma.leadUserMapping.findMany({
        where: { vendor_id: vendorId, user_id: userId, status: "active" },
        select: { lead_id: true },
      });

      const taskLeads = await prisma.userLeadTask.findMany({
        where: {
          vendor_id: vendorId,
          OR: [{ created_by: userId }, { user_id: userId }],
        },
        select: { lead_id: true },
      });

      excludedLeadIds = [
        ...new Set([
          ...mappedLeads.map((m) => m.lead_id),
          ...taskLeads.map((t) => t.lead_id),
        ]),
      ];
    }

    // 1️⃣ Find status type for this vendor & tag
    const statusType = await prisma.statusTypeMaster.findFirst({
      where: { vendor_id: vendorId, tag },
      select: { id: true },
    });
    if (!statusType)
      throw new Error(
        `Status type with tag "${tag}" not found for vendor ${vendorId}`,
      );

    const whereClause: Prisma.LeadMasterWhereInput = {
      vendor_id: vendorId,
      is_deleted: false,
      statusType: { tag, vendor_id: vendorId },
      activity_status: "onGoing",
      ...(excludedLeadIds.length > 0 && { id: { notIn: excludedLeadIds } }),
    };

    // 2️⃣ Fetch leads that match (excluding user-linked) with pagination
    const [leads, total] = await Promise.all([
      prisma.leadMaster.findMany({
        where: whereClause,
        include: BookingStageService.leadIncludes(),
        orderBy: { created_at: "desc" },
        skip,
        take: limit,
      }),
      prisma.leadMaster.count({ where: whereClause }),
    ]);

    // 3️⃣ Process and attach signed URLs
    const processedLeads = await Promise.all(
      leads.map(async (lead: any) => {
        if (lead.is_draft && isLeadComplete(lead)) {
          await prisma.leadMaster.update({
            where: { id: lead.id },
            data: { is_draft: false },
          });
          lead.is_draft = false;
        }

        const docsWithUrls = await Promise.all(
          lead.documents.map(async (doc: any) => {
            const signed_url = await generateSignedUrl(doc.doc_sys_name);
            return {
              ...doc,
              signed_url,
              file_type: BookingStageService.getFileType(doc.doc_og_name),
              is_image: BookingStageService.isImageFile(doc.doc_og_name),
            };
          }),
        );

        return { ...lead, documents: docsWithUrls };
      }),
    );

    return { count: total, leads: processedLeads };
  }

  public static async getLeadsWithStatusOpen(vendorId: number, userId: number) {
    logger.info("[BookingStageService] getLeadsWithStatusOpen called", {
      vendorId,
      userId,
    });

    // 1. Get Open status
    const openStatus = await prisma.statusTypeMaster.findFirst({
      where: { vendor_id: vendorId, tag: "Type 1" },
      select: { id: true },
    });

    if (!openStatus) {
      throw new Error(`Open status (Type 1) not found for vendor ${vendorId}`);
    }

    // 2. Check if user is admin
    const creator = await prisma.userMaster.findUnique({
      where: { id: userId },
      include: { user_type: true },
    });

    const isAdmin = creator?.user_type?.user_type?.toLowerCase() === "admin";

    // ============= Admin Flow =============
    if (isAdmin) {
      const leads = await prisma.leadMaster.findMany({
        where: {
          vendor_id: vendorId,
          is_deleted: false,
          statusType: { tag: "Type 1", vendor_id: vendorId },
          activity_status: { in: ["onGoing", "lostApproval"] },
        },
        include: BookingStageService.leadIncludes(),
        orderBy: { created_at: "desc" },
      });

      // ✅ Auto-convert drafts to complete leads if all fields are filled
      return Promise.all(
        leads.map(async (lead: any) => {
          if (lead.is_draft && isLeadComplete(lead)) {
            await prisma.leadMaster.update({
              where: { id: lead.id },
              data: { is_draft: false },
            });
            lead.is_draft = false; // Update in-memory object
          }

          const docsWithUrls = await Promise.all(
            lead.documents.map(async (doc: any) => {
              const signed_url = await generateSignedUrl(doc.doc_sys_name);
              return {
                ...doc,
                signed_url,
                file_type: BookingStageService.getFileType(doc.doc_og_name),
                is_image: BookingStageService.isImageFile(doc.doc_og_name),
              };
            }),
          );
          return { ...lead, documents: docsWithUrls };
        }),
      );
    }

    // ============= Non-Admin Flow =============

    // Leads mapped via LeadUserMapping
    const mappedLeads = await prisma.leadUserMapping.findMany({
      where: {
        vendor_id: vendorId,
        user_id: userId,
        status: "active",
      },
      select: { lead_id: true },
    });

    // Leads assigned/created via UserLeadTask
    const taskLeads = await prisma.userLeadTask.findMany({
      where: {
        vendor_id: vendorId,
        OR: [{ created_by: userId }, { user_id: userId }],
      },
      select: { lead_id: true },
    });

    const assignedLeads = await prisma.leadMaster.findMany({
      where: {
        vendor_id: vendorId,
        assign_to: userId,
        is_deleted: false,
      },
      select: { id: true },
    });

    const leadIds = [
      ...new Set([
        ...mappedLeads.map((m) => m.lead_id),
        ...taskLeads.map((t) => t.lead_id),
        ...assignedLeads.map((lead) => lead.id),
      ]),
    ];

    if (!leadIds.length) {
      logger.info("No leads found for user (union empty)", {
        userId,
        vendorId,
      });
      return [];
    }

    const leads = await prisma.leadMaster.findMany({
      where: {
        id: { in: leadIds },
        is_deleted: false,
        vendor_id: vendorId,
        statusType: { tag: "Type 1", vendor_id: vendorId },
        activity_status: { in: ["onGoing", "lostApproval"] },
      },
      include: BookingStageService.leadIncludes(),
      orderBy: { created_at: Prisma.SortOrder.desc },
    });

    // ✅ Auto-convert drafts and attach signed URLs
    return Promise.all(
      leads.map(async (lead: any) => {
        if (lead.is_draft && isLeadComplete(lead)) {
          await prisma.leadMaster.update({
            where: { id: lead.id },
            data: { is_draft: false },
          });
          lead.is_draft = false;
        }

        const docsWithUrls = await Promise.all(
          lead.documents.map(async (doc: any) => {
            const signed_url = await generateSignedUrl(doc.doc_sys_name);
            return {
              ...doc,
              signed_url,
              file_type: BookingStageService.getFileType(doc.doc_og_name),
              is_image: BookingStageService.isImageFile(doc.doc_og_name),
            };
          }),
        );
        return { ...lead, documents: docsWithUrls };
      }),
    );
  }

  // post filter service
  public static async getVendorLeadsByTag2(
    vendorId: number,
    franchiseId: number,
    tag: string,
    userId: number | null,
    page: number = 1,
    limit: number = 10,
    filters: {
      global_search?: string;
      filter_lead_code?: string;
      filter_name?: string;
      contact?: string;
      stagetag?: string;
      furniture_type?: Array<number | string>;
      furniture_structure?: Array<number | string>;
      site_map_link?: boolean;
      site_type?: Array<number | string>;
      assign_to?: Array<number | string>;
      priority?: Array<string>;
      site_address?: string;
      archetech_name?: string;
      source?: Array<number | string>;
      created_at?: "asc" | "desc";
      alt_contact_no?: string;
      email?: string;
      designer_remark?: string;
      date_range?: { from: string; to: string };
      production_status?: string;
      pending_services?: boolean;
    },
  ): Promise<{ leads: any[]; count: number }> {
    logger.info("[BookingStageService] getVendorLeadsByTag2 called", {
      vendorId,
      franchiseId,
      tag,
      userId,
      page,
      limit,
    });
    console.log("[Service] getVendorLeadsByTag2 ids", {
      vendorId,
      franchiseId,
      tag,
      userId,
      page,
      limit,
    });

    const skip = (page - 1) * limit;

    const orderBy = {
      created_at:
        filters.created_at === "asc"
          ? Prisma.SortOrder.asc
          : Prisma.SortOrder.desc,
    };

    // ============================
    // STATUS RESOLUTION
    // ============================

    const normalizedTag = String(tag || "")
      .trim()
      .toLowerCase();
    const excludedProductionStageTags = ["Type 15", "Type 16", "Type 17"];
    const shouldExcludeLaterStageTags =
      normalizedTag === "type 8" ||
      normalizedTag === "type 9" ||
      normalizedTag === "type 10";

    let statusIds: number[] | null = null; // null means "all statuses"

    if (normalizedTag !== "all") {
      const statusTags =
        normalizedTag === "type 8"
          ? ["Type 8", "Type 9"]
          : normalizedTag === "type 9"
            ? ["Type 8", "Type 9"]
            : normalizedTag === "type 10"
              ? ["Type 8", "Type 9", "Type 10"]
              : [tag];

      const statusTypes = await prisma.statusTypeMaster.findMany({
        where: { vendor_id: vendorId, tag: { in: statusTags } },
        select: { id: true, tag: true },
      });

      if (!statusTypes.length) {
        throw new Error(`Status ${tag} not found for vendor ${vendorId}`);
      }

      statusIds = statusTypes.map((status) => status.id);
    }

    // ============================
    // EXCLUDE USER LINKED LEADS
    // ============================

    let excludedLeadIds: number[] = [];

    if (userId) {
      const mappedLeads = await prisma.leadUserMapping.findMany({
        where: {
          vendor_id: vendorId,
          user_id: userId,
          status: "active",
        },
        select: { lead_id: true },
      });

      const taskLeads = await prisma.userLeadTask.findMany({
        where: {
          vendor_id: vendorId,
          franchise_id: franchiseId,
          OR: [{ created_by: userId }, { user_id: userId }],
        },
        select: { lead_id: true },
      });

      excludedLeadIds = [
        ...new Set([
          ...mappedLeads.map((m) => m.lead_id),
          ...taskLeads.map((t) => t.lead_id),
        ]),
      ];
    }

    // ============================
    // FILTER ENGINE (UNIVERSAL STYLE)
    // ============================

    const addFilterConditions = (
      whereClause: Prisma.LeadMasterWhereInput,
    ): Prisma.LeadMasterWhereInput => {
      const addAnd = (condition: Prisma.LeadMasterWhereInput) => {
        if (!whereClause.AND) whereClause.AND = [];
        if (Array.isArray(whereClause.AND)) {
          whereClause.AND.push(condition);
        } else {
          whereClause.AND = [whereClause.AND, condition];
        }
      };

      const toString = (val: unknown) =>
        typeof val === "string" ? val.trim() : "";

      const toArray = (val: unknown): Array<number | string> => {
        if (Array.isArray(val)) return val;
        if (!val) return [];
        return [val as number | string];
      };

      const parseNumberList = (val: unknown) => {
        const raw = toArray(val);
        const numbers = raw.map(Number).filter((n) => !isNaN(n));
        const strings = raw.filter((v) => isNaN(Number(v))).map(String);
        return { numbers, strings };
      };

      // ---------- GLOBAL SEARCH ----------

      const globalSearch = toString(filters.global_search);

      if (globalSearch) {
        const parts = globalSearch.split(/\s+/).filter(Boolean);

        if (parts.length >= 2) {
          addAnd({
            OR: [
              {
                AND: [
                  { firstname: { contains: parts[0], mode: "insensitive" } },
                  {
                    lastname: {
                      contains: parts.slice(1).join(" "),
                      mode: "insensitive",
                    },
                  },
                ],
              },
              { lead_code: { contains: globalSearch, mode: "insensitive" } },
              { contact_no: { contains: globalSearch, mode: "insensitive" } },
            ],
          });
        } else {
          addAnd({
            OR: [
              { firstname: { contains: globalSearch, mode: "insensitive" } },
              { lastname: { contains: globalSearch, mode: "insensitive" } },
              { lead_code: { contains: globalSearch, mode: "insensitive" } },
              { contact_no: { contains: globalSearch, mode: "insensitive" } },
            ],
          });
        }
      }

      const leadCode = toString(filters.filter_lead_code);
      if (leadCode) {
        addAnd({ lead_code: { contains: leadCode, mode: "insensitive" } });
      }

      const nameFilter = toString(filters.filter_name);
      if (nameFilter) {
        addAnd({
          OR: [
            { firstname: { contains: nameFilter, mode: "insensitive" } },
            { lastname: { contains: nameFilter, mode: "insensitive" } },
          ],
        });
      }

      const contact = toString(filters.contact);
      if (contact) {
        addAnd({ contact_no: { contains: contact, mode: "insensitive" } });
      }

      const siteTypeList = parseNumberList(filters.site_type);
      if (siteTypeList.numbers.length) {
        addAnd({ site_type_id: { in: siteTypeList.numbers } });
      }

      const furnitureTypes = parseNumberList(filters.furniture_type);
      if (furnitureTypes.numbers.length) {
        addAnd({
          productMappings: {
            some: { product_type_id: { in: furnitureTypes.numbers } },
          },
        });
      }

      const sourceList = parseNumberList(filters.source);

      if (sourceList.numbers.length > 0) {
        addAnd({
          source_id: { in: sourceList.numbers },
        });
      } else if (sourceList.strings.length > 0) {
        addAnd({
          source: {
            type: { in: sourceList.strings },
          },
        });
      }

      // --------------------
      // CREATED DATE RANGE FILTER
      // --------------------

      const dateRange = filters.date_range;
      const shouldFilterPendingServicesBySchedule =
        filters.pending_services && (dateRange?.from || dateRange?.to);

      if (dateRange && (dateRange.from || dateRange.to) && !shouldFilterPendingServicesBySchedule) {
        let fromDate: Date | null = null;
        let toDate: Date | null = null;

        // Parse 'from' date - START of day (00:00:00.000)
        if (dateRange.from) {
          fromDate = new Date(dateRange.from);
          fromDate.setHours(0, 0, 0, 0);
        }

        // Parse 'to' date - END of day (23:59:59.999)
        if (dateRange.to) {
          toDate = new Date(dateRange.to);
          toDate.setHours(23, 59, 59, 999);
        }

        // ✅ Main case: Both dates exist (includes single date scenario)
        // Controller already normalizes single date to: { from: "2024-01-15", to: "2024-01-15" }
        if (fromDate && toDate) {
          addAnd({
            created_at: {
              gte: fromDate, // Start: 2024-01-15 00:00:00.000
              lte: toDate, // End:   2024-01-15 23:59:59.999
            },
          });
        }

        // ✅ Edge case: Only 'from' provided (shouldn't happen after controller normalization)
        else if (fromDate) {
          const endOfDay = new Date(fromDate);
          endOfDay.setHours(23, 59, 59, 999);

          addAnd({
            created_at: {
              gte: fromDate,
              lte: endOfDay,
            },
          });
        }

        // ✅ Edge case: Only 'to' provided
        else if (toDate) {
          addAnd({
            created_at: {
              lte: toDate,
            },
          });
        }
      }

      if (filters.pending_services) {
        const openScheduleFilter: Prisma.LeadServiceScheduleWhereInput = {
          status: "open",
        };

        if (dateRange && (dateRange.from || dateRange.to)) {
          let fromDate: Date | null = null;
          let toDate: Date | null = null;

          if (dateRange.from) {
            fromDate = new Date(dateRange.from);
            fromDate.setHours(0, 0, 0, 0);
          }

          if (dateRange.to) {
            toDate = new Date(dateRange.to);
            toDate.setHours(23, 59, 59, 999);
          }

          if (fromDate && toDate) {
            openScheduleFilter.scheduled_for = {
              gte: fromDate,
              lte: toDate,
            };
          } else if (fromDate) {
            const endOfDay = new Date(fromDate);
            endOfDay.setHours(23, 59, 59, 999);
            openScheduleFilter.scheduled_for = {
              gte: fromDate,
              lte: endOfDay,
            };
          } else if (toDate) {
            openScheduleFilter.scheduled_for = {
              lte: toDate,
            };
          }
        }

        addAnd({
          serviceSchedules: {
            some: openScheduleFilter,
          },
        });
      }

      // --------------------
      // ASSIGN TO (MULTI SELECT)
      // --------------------

      if (Array.isArray(filters.assign_to) && filters.assign_to.length > 0) {
        const assignIds = filters.assign_to
          .map(Number)
          .filter((id) => !Number.isNaN(id));

        if (assignIds.length > 0) {
          addAnd({
            assign_to: {
              in: assignIds,
            },
          });
        }
      }

      if (Array.isArray(filters.priority) && filters.priority.length > 0) {
        const priorities = filters.priority
          .map((item) => String(item).trim())
          .filter(Boolean);

        if (priorities.length > 0) {
          addAnd({
            OR: priorities.map((priority) => ({
              priority: {
                equals: priority,
                mode: "insensitive",
              },
            })),
          });
        }
      }

      const furnitureStructures = parseNumberList(filters.furniture_structure);
      if (furnitureStructures.numbers.length) {
        addAnd({
          leadProductStructureMapping: {
            some: { product_structure_id: { in: furnitureStructures.numbers } },
          },
        });
      }

      if (Array.isArray(filters.stagetag) && filters.stagetag.length > 0) {
        const normalizedTags = filters.stagetag
          .map((tag) => String(tag).trim())
          .filter(Boolean);

        if (normalizedTags.length > 0) {
          addAnd({
            statusType: {
              type: {
                in: normalizedTags,
              },
            },
          });
        }
      }

      if (typeof filters.site_map_link === "boolean") {
        if (filters.site_map_link) {
          addAnd({
            AND: [
              { site_map_link: { not: null } },
              { site_map_link: { not: "" } },
            ],
          });
        } else {
          addAnd({
            OR: [{ site_map_link: null }, { site_map_link: "" }],
          });
        }
      }

      // ---------- PRODUCTION STATUS FILTER (Type 10 only) ----------
      const productionStatus = filters.production_status;
      if (productionStatus && normalizedTag === "type 10") {
        const notTrue = (field: string) => ({
          OR: [{ [field]: false }, { [field]: null }],
        });

        const instanceAnd: any[] = [
          { is_tech_check_completed: true },
          { is_order_login_completed: true },
        ];

        if (productionStatus === "Completed") {
          instanceAnd.push({ is_production_completed: true });
        } else if (productionStatus === "Post Production") {
          instanceAnd.push({ is_post_production: true });
          instanceAnd.push(notTrue("is_production_completed"));
        } else if (productionStatus === "Under Production") {
          instanceAnd.push({ is_under_production: true });
          instanceAnd.push(notTrue("is_post_production"));
          instanceAnd.push(notTrue("is_production_completed"));
        } else if (productionStatus === "Pre Prod Done") {
          instanceAnd.push({ is_pre_prod_done: true });
          instanceAnd.push(notTrue("is_under_production"));
          instanceAnd.push(notTrue("is_post_production"));
          instanceAnd.push(notTrue("is_production_completed"));
        } else if (productionStatus === "Pending") {
          instanceAnd.push(notTrue("is_pre_prod_done"));
          instanceAnd.push(notTrue("is_under_production"));
          instanceAnd.push(notTrue("is_post_production"));
          instanceAnd.push(notTrue("is_production_completed"));
        }

        addAnd({ productStructureInstances: { some: { AND: instanceAnd } } });
      }

      return whereClause;
    };

    // ============================
    // FINAL QUERY
    // ============================

    const whereClause = addFilterConditions({
      vendor_id: vendorId,
      franchise_id: franchiseId,
      is_deleted: false,
      ...(statusIds !== null && { status_id: { in: statusIds } }),
      ...(shouldExcludeLaterStageTags && {
        statusType: {
          vendor_id: vendorId,
          tag: { notIn: excludedProductionStageTags },
        },
      }),
      activity_status: "onGoing",
      ...(excludedLeadIds.length && { id: { notIn: excludedLeadIds } }),
    });

    try {
      const includeConfig = BookingStageService.leadIncludes();
      const instanceSelectKeys = Object.keys(
        includeConfig?.productStructureInstances?.select || {},
      );
      logger.info("[BookingStageService] getVendorLeadsByTag2 debug", {
        vendorId,
        franchiseId,
        tag,
        userId,
        page,
        limit,
        excludedLeadIdsCount: excludedLeadIds.length,
        instanceSelectKeys,
      });
    } catch (err: any) {
      logger.warn(
        "[BookingStageService] getVendorLeadsByTag2 debug log failed",
        { error: err?.message },
      );
    }

    const normalizedStageTag = String(tag || "").trim();
    const includeConfig = BookingStageService.leadIncludes(normalizedStageTag);
    const shouldApplyStageSort =
      BookingStageService.statusLogSortedStageTags.has(normalizedStageTag) ||
      normalizedStageTag === "Type 9" ||
      normalizedStageTag === "Type 10";

    const [leads, total] = await Promise.all([
      prisma.leadMaster.findMany({
        where: whereClause,
        include: includeConfig,
        orderBy,
        ...(shouldApplyStageSort ? {} : { skip, take: limit }),
      }),

      prisma.leadMaster.count({
        where: whereClause,
      }),
    ]);

    const processed = await Promise.all(
      leads.map(async (lead: any) => {
        if (lead.is_draft && isLeadComplete(lead)) {
          await prisma.leadMaster.update({
            where: { id: lead.id },
            data: { is_draft: false },
          });
          lead.is_draft = false;
        }

        const docsWithUrls = await Promise.all(
          lead.documents.map(async (doc: any) => {
            const signed_url = await generateSignedUrl(doc.doc_sys_name);
            return {
              ...doc,
              signed_url,
              file_type: BookingStageService.getFileType(doc.doc_og_name),
              is_image: BookingStageService.isImageFile(doc.doc_og_name),
            };
          }),
        );

        return { ...lead, documents: docsWithUrls };
      }),
    );

    const sortedProcessed = shouldApplyStageSort
      ? [...processed].sort(
        (a, b) =>
          BookingStageService.getStageSortTimestamp(b, normalizedStageTag) -
          BookingStageService.getStageSortTimestamp(a, normalizedStageTag),
      )
      : processed;

    const paginatedLeads = shouldApplyStageSort
      ? sortedProcessed.slice(skip, skip + limit)
      : sortedProcessed;

    return { leads: paginatedLeads, count: total };
  }

  // post filter service
  // ✅ Helpers (you already have these in your other service)
  private static getFileType(filename: string): string {
    const ext = filename.split(".").pop()?.toLowerCase();
    if (!ext) return "unknown";
    if (["jpg", "jpeg", "png", "gif", "webp"].includes(ext)) return "image";
    if (["pdf"].includes(ext)) return "pdf";
    if (["doc", "docx"].includes(ext)) return "word";
    if (["xls", "xlsx"].includes(ext)) return "excel";
    return ext;
  }

  private static isImageFile(filename: string): boolean {
    const ext = filename.split(".").pop()?.toLowerCase();
    return ["jpg", "jpeg", "png", "gif", "webp"].includes(ext || "");
  }

  public async editBookingStage(data: Partial<CreateBookingStageDto>) {
    return await prisma.$transaction(async (tx: any) => {
      const response: any = {
        updatedFields: {},
        message: "Booking stage updated successfully",
      };

      // 1. Update LeadMaster fields if provided
      if (data.finalBookingAmount !== undefined) {
        const lead = await tx.leadMaster.update({
          where: { id: data.lead_id },
          data: { total_project_amount: data.finalBookingAmount },
        });
        response.updatedFields.leadMaster = lead;
      }

      // 2. Update Booking Amount (paymentInfo + ledger)
      if (data.bookingAmount !== undefined) {
        const bookingPaymentType = await tx.paymentTypeMaster.findFirst({
          where: { vendor_id: data.vendor_id, tag: "Type 2" },
        });
        if (!bookingPaymentType)
          throw new Error("Payment type not found for vendor");

        // 🔹 Find latest paymentInfo
        const existingPayment = await tx.paymentInfo.findFirst({
          where: {
            lead_id: data.lead_id!,
            payment_type_id: bookingPaymentType.id,
          },
          orderBy: { created_at: "desc" },
        });

        let payment;
        if (existingPayment) {
          payment = await tx.paymentInfo.update({
            where: { id: existingPayment.id },
            data: {
              amount: data.bookingAmount,
              payment_text:
                data.bookingAmountPaymentDetailsText ||
                existingPayment.payment_text, // ✅ added
            },
          });
        } else {
          const leadForPayment = await tx.leadMaster.findUnique({
            where: { id: data.lead_id! },
            select: { status_id: true },
          });

          payment = await tx.paymentInfo.create({
            data: {
              lead_id: data.lead_id!,
              account_id: data.account_id!,
              vendor_id: data.vendor_id!,
              created_by: data.created_by!,
              status_id: leadForPayment?.status_id ?? null,
              amount: data.bookingAmount,
              payment_date: new Date(),
              payment_type_id: bookingPaymentType.id,
              payment_text: data.bookingAmountPaymentDetailsText || null, // ✅ added
            },
          });
        }

        response.updatedFields.paymentInfo = payment;

        // Always add a new ledger entry
        await tx.ledger.create({
          data: {
            lead_id: data.lead_id!,
            account_id: data.account_id!,
            client_id: data.client_id!,
            vendor_id: data.vendor_id!,
            created_by: data.created_by!,
            amount: data.bookingAmount,
            payment_date: new Date(),
            type: "credit",
          },
        });
      }

      // 3. Update supervisor
      if (data.siteSupervisorId) {
        // Step 1: Mark all existing supervisors for this lead as inactive
        await tx.leadSiteSupervisorMapping.updateMany({
          where: {
            lead_id: data.lead_id!,
            vendor_id: data.vendor_id!,
            account_id: data.account_id!,
          },
          data: {
            status: "inactive",
          },
        });

        // Step 2: Check if this supervisor already exists for the lead
        const existingSupervisor = await tx.leadSiteSupervisorMapping.findFirst(
          {
            where: {
              lead_id: data.lead_id!,
              user_id: data.siteSupervisorId,
              vendor_id: data.vendor_id!,
              account_id: data.account_id!,
            },
          },
        );

        let supervisor;
        if (existingSupervisor) {
          // Update status to active
          supervisor = await tx.leadSiteSupervisorMapping.update({
            where: { id: existingSupervisor.id },
            data: { status: "active" },
          });
        } else {
          // Create new mapping with active status
          supervisor = await tx.leadSiteSupervisorMapping.create({
            data: {
              lead_id: data.lead_id!,
              user_id: data.siteSupervisorId,
              vendor_id: data.vendor_id!,
              account_id: data.account_id!,
              created_by: data.created_by!,
              status: "active",
            },
          });
        }

        response.updatedFields.supervisor = supervisor;
      }

      return response;
    });
  }

  public async addPayment(data: AddPaymentDto) {
    const result = await prisma.$transaction(async (tx) => {
      const response: any = {
        payment: null,
        ledger: null,
        documentsUploaded: [],
        message: "Payment recorded successfully",
        paymentTypeName: null,
      };

      // 1️⃣ Fetch Lead
      const lead = await tx.leadMaster.findUnique({
        where: { id: data.lead_id },
      });
      if (!lead) throw new Error("Lead not found");

      const pendingAmount = lead.pending_amount ?? 0;

      // 2️⃣ Validate Amount
      if (data.amount > pendingAmount) {
        throw new Error(
          `Payment exceeds pending amount. Pending: ${pendingAmount}`,
        );
      }

      // 3️⃣ Resolve Payment Type (Type 4 = Additional Payment)
      const paymentType = await tx.paymentTypeMaster.findFirst({
        where: { vendor_id: data.vendor_id, tag: "Type 4" },
      });
      if (!paymentType) {
        throw new Error(
          "Payment type (Additional Payment) not found for this vendor",
        );
      }
      response.paymentTypeName = paymentType.type;

      // 4️⃣ Save Payment Proof (Optional)
      let paymentFileId: number | null = null;
      if (data.payment_file) {
        const document = await tx.leadDocuments.create({
          data: {
            doc_og_name: data.payment_file.originalName,
            doc_sys_name: data.payment_file.sysName,
            created_by: data.created_by,
            doc_type_id: paymentType.id,
            account_id: data.account_id,
            lead_id: data.lead_id,
            vendor_id: data.vendor_id,
          },
        });

        paymentFileId = document.id;
        response.documentsUploaded.push(document);
      }

      // 5️⃣ Record Payment
      const leadForPayment = await tx.leadMaster.findUnique({
        where: { id: data.lead_id },
        select: { status_id: true },
      });

      const payment = await tx.paymentInfo.create({
        data: {
          lead_id: data.lead_id,
          account_id: data.account_id,
          vendor_id: data.vendor_id,
          created_by: data.created_by,
          status_id: leadForPayment?.status_id ?? null,
          amount: data.amount,
          payment_text: data.payment_text,
          payment_file_id: paymentFileId,
          payment_date: new Date(data.payment_date),
          payment_type_id: paymentType.id,
        },
      });
      response.payment = payment;

      // 6️⃣ Record Ledger Entry
      const ledger = await tx.ledger.create({
        data: {
          lead_id: data.lead_id,
          account_id: data.account_id,
          client_id: data.client_id,
          vendor_id: data.vendor_id,
          created_by: data.created_by,
          amount: data.amount,
          payment_date: new Date(data.payment_date),
          type: "credit",
        },
      });
      response.ledger = ledger;

      // 7️⃣ Update Lead Pending Amount
      await tx.leadMaster.update({
        where: { id: data.lead_id },
        data: {
          pending_amount: { decrement: data.amount },
        },
      });

      // 8️⃣ Create Action Log
      const formattedDate = new Date(data.payment_date).toLocaleDateString(
        "en-IN",
        {
          day: "2-digit",
          month: "short",
          year: "numeric",
        },
      );

      let actionMessage = `Additional payment of ₹${data.amount.toLocaleString()} received successfully on ${formattedDate}. — Payment Details: ${data.payment_text
        }`;

      if (response.documentsUploaded.length > 0) {
        const docCount = response.documentsUploaded.length;
        const plural = docCount > 1 ? "documents have" : "document has";
        actionMessage += ` — ${docCount} payment proof ${plural} been uploaded successfully.`;
      }

      const detailedLog = await createLeadLog(tx, {
        vendor_id: data.vendor_id,
        lead_id: data.lead_id,
        account_id: data.account_id,
        action: actionMessage,
        action_type: "CREATE",
        created_by: data.created_by,
        created_at: new Date(),
      });

      // 9️⃣ Map Uploaded Documents to LeadDocumentLogs
      if (response.documentsUploaded.length > 0) {
        const docLogs = response.documentsUploaded.map((doc: any) => ({
          vendor_id: data.vendor_id,
          lead_id: data.lead_id,
          account_id: data.account_id,
          doc_id: doc.id,
          lead_logs_id: detailedLog.id,
          created_by: data.created_by,
          created_at: new Date(),
        }));

        await tx.leadDocumentLogs.createMany({ data: docLogs });
      }

      logger.info("✅ Additional payment recorded", {
        lead_id: data.lead_id,
        vendor_id: data.vendor_id,
        amount: data.amount,
        payment_date: data.payment_date,
      });

      return response;
    });

    try {
      const [leadInfo, updatedByUser] = await Promise.all([
        prisma.leadMaster.findUnique({
          where: { id: data.lead_id },
          select: {
            lead_code: true,
            firstname: true,
            lastname: true,
            account_id: true,
            franchise_id: true,
          },
        }),
        prisma.userMaster.findUnique({
          where: { id: data.created_by },
          select: { user_name: true },
        }),
      ]);

      const admins = await getFranchiseAdminRecipients({
        vendorId: data.vendor_id,
        franchiseId: leadInfo?.franchise_id ?? null,
        excludeUserId: data.created_by,
      });

      const leadCode =
        leadInfo?.lead_code ?? `LEAD-${String(data.lead_id).padStart(4, "0")}`;
      const leadName = `${leadInfo?.firstname ?? ""} ${leadInfo?.lastname ?? ""
        }`.trim();
      const updatedByName = updatedByUser?.user_name ?? "User";
      const amountText = `₹${data.amount.toLocaleString("en-IN")}`;
      const paymentTypeName = result.paymentTypeName || "Payment";

      const baseUrl = data.baseUrl;
      const leadUrl = leadInfo?.account_id
        ? `${baseUrl}/dashboard/leads/details/${data.lead_id}?accountId=${leadInfo.account_id}`
        : `${baseUrl}/dashboard/leads/details/${data.lead_id}`;

      const franchiseId = leadInfo?.franchise_id ?? null;

      await Promise.allSettled(
        admins.map(async (admin) => {
          await NotificationService.createAndSend({
            vendor_id: data.vendor_id,
            user_id: admin.id,
            sender_id: data.created_by,
            type: NotificationType.LEAD_ACTION,
            title: "Payment added",
            message: `Payment added for ${leadCode} - ${leadName} by ${updatedByName}.`,
            entity_type: "lead",
            entity_id: data.lead_id,
            redirect_url: `/dashboard/leads/details/${data.lead_id}${leadInfo?.account_id ? `?accountId=${leadInfo.account_id}` : ""
              }`,
          });

          if (!admin.user_email) return;

          await sendPaymentAddedEmail({
            vendor_id: data.vendor_id,
            franchise_id: franchiseId,
            toEmail: admin.user_email,
            toName: admin.user_name ?? undefined,
            leadCode,
            leadName: leadName || "Lead",
            amount: amountText,
            paymentType: paymentTypeName,
            updatedBy: updatedByName,
            leadUrl,
          });
        }),
      );
    } catch (notifyError: any) {
      logger.warn("⚠️ Failed to send payment notifications", {
        error: notifyError?.message,
        lead_id: data.lead_id,
      });
    }

    return result;
  }

  public async getPaymentsByLead(leadId: number, vendorId: number) {
    try {
      // 1. Fetch finance info
      const lead = await prisma.leadMaster.findUnique({
        where: { id: leadId },
        select: {
          total_project_amount: true,
          pending_amount: true,
          booking_amount: true,
          mrp_value: true,
        },
      });

      if (!lead) {
        throw new Error(`Lead with id ${leadId} not found`);
      }

      // 2. Fetch payment logs
      const payments = await prisma.paymentInfo.findMany({
        where: { lead_id: leadId, vendor_id: vendorId },
        orderBy: { created_at: "desc" },
        include: {
          createdBy: {
            select: {
              id: true,
              user_name: true,
            },
          },
          statusType: {
            select: {
              type: true,
            },
          },
        },
      });

      // 3. Map response with signed URL if payment_file_id exists
      const paymentLogs = [];
      for (const p of payments) {
        let signedUrl: string | null = null;

        if (p.payment_file_id) {
          const doc = await prisma.leadDocuments.findUnique({
            where: { id: p.payment_file_id },
          });
          if (doc?.doc_sys_name) {
            signedUrl = await generateSignedUrl(
              doc.doc_sys_name,
              3600,
              "inline",
            );
          }
        }

        paymentLogs.push({
          id: p.id,
          amount: p.amount,
          status_id: p.status_id,
          status_type: p.statusType?.type ?? null,
          payment_text: p.payment_text,
          payment_date: p.payment_date,
          entry_date: p.created_at,
          entered_by_id: p.createdBy.id,
          entered_by: p.createdBy.user_name,
          payment_file_id: p.payment_file_id,
          payment_file: signedUrl,
        });
      }

      return {
        project_finance: {
          total_project_amount: lead.total_project_amount,
          pending_amount: lead.pending_amount,
          booking_amount: lead.booking_amount,
          mrp_value: lead.mrp_value,
        },
        payment_logs: paymentLogs,
      };
    } catch (error: any) {
      logger.error("[PaymentService] getPaymentsByLead error", {
        error: error.message,
      });
      throw error;
    }
  }

  public async uploadCSPBookingService(data: {
    lead_id: number;
    account_id: number;
    vendor_id: number;
    created_by: number;
    sitePhotos: { originalName: string; sysName: string }[];
  }) {
    return prisma.$transaction(async (tx) => {
      // 1️⃣ Validate document type
      const docType = await tx.documentTypeMaster.findFirst({
        where: {
          vendor_id: data.vendor_id,
          tag: "Type 32", // CSP at Booking Stage
        },
      });

      if (!docType) {
        throw new Error(
          "Current site photos at Booking Stage document type not found",
        );
      }

      const uploadedDocs: {
        id: number;
        originalName: string;
        s3Key: string;
      }[] = [];

      // 2️⃣ Create LeadDocuments
      for (const photo of data.sitePhotos) {
        const doc = await tx.leadDocuments.create({
          data: {
            doc_og_name: photo.originalName,
            doc_sys_name: photo.sysName,
            doc_type_id: docType.id,
            vendor_id: data.vendor_id,
            lead_id: data.lead_id,
            account_id: data.account_id,
            created_by: data.created_by,
          },
        });

        uploadedDocs.push({
          id: doc.id,
          originalName: photo.originalName,
          s3Key: photo.sysName,
        });
      }

      // 3️⃣ Create LeadDetailedLogs (parent log)
      const detailedLog = await createLeadLog(tx, {
        vendor_id: data.vendor_id,
        lead_id: data.lead_id,
        account_id: data.account_id,
        action:
          "Current site photos uploaded at Booking stage for Final Measurement.",
        action_type: "CREATE",
        created_by: data.created_by,
        created_at: new Date(),
      });

      // 4️⃣ Create LeadDocumentLogs (child logs for each document)
      if (uploadedDocs.length > 0) {
        const docLogsData = uploadedDocs.map((doc) => ({
          vendor_id: data.vendor_id,
          lead_id: data.lead_id,
          account_id: data.account_id,
          doc_id: doc.id,
          lead_logs_id: detailedLog.id,
          created_by: data.created_by,
          created_at: new Date(),
        }));

        await tx.leadDocumentLogs.createMany({
          data: docLogsData,
        });
      }

      return {
        uploadedPhotosCount: uploadedDocs.length,
        documents: uploadedDocs,
      };
    });
  }

  public async getCSPBookingService(data: {
    vendor_id: number;
    lead_id: number;
  }) {
    // 1️⃣ Get document type
    const docType = await prisma.documentTypeMaster.findFirst({
      where: {
        vendor_id: data.vendor_id,
        tag: "Type 32", // CSP at Booking Stage
      },
    });

    if (!docType) {
      throw new Error(
        "Current site photos at Booking Stage document type not found",
      );
    }

    // 2️⃣ Fetch documents
    const documents = await prisma.leadDocuments.findMany({
      where: {
        vendor_id: data.vendor_id,
        lead_id: data.lead_id,
        doc_type_id: docType.id,
        is_deleted: false,
      },
      orderBy: {
        created_at: "desc",
      },
    });

    // 3️⃣ Generate signed URLs
    const docsWithSignedUrls = await Promise.all(
      documents.map(async (doc) => {
        const signedUrl = await generateSignedUrl(
          doc.doc_sys_name,
          3600,
          "inline",
        );

        return {
          id: doc.id,
          originalName: doc.doc_og_name,
          s3Key: doc.doc_sys_name,
          signedUrl,
          createdAt: doc.created_at,
        };
      }),
    );

    return {
      count: docsWithSignedUrls.length,
      documents: docsWithSignedUrls,
    };
  }

  public async reassignSiteSupervisor(data: {
    lead_id: number;
    vendor_id: number;
    siteSupervisorId: number;
    created_by: number;
  }) {
    return await prisma.$transaction(async (tx) => {
      const lead = await tx.leadMaster.findFirst({
        where: {
          id: data.lead_id,
          vendor_id: data.vendor_id,
          is_deleted: false,
        },
        select: {
          id: true,
          account_id: true,
        },
      });

      if (!lead) {
        throw new Error(
          `Lead ${data.lead_id} not found for vendor ${data.vendor_id}`,
        );
      }

      const siteSupervisorType = await tx.userTypeMaster.findFirst({
        where: {
          user_type: {
            equals: "site-supervisor",
            mode: "insensitive",
          },
        },
        select: { id: true },
      });

      if (!siteSupervisorType) {
        throw new Error("Site supervisor user type not found");
      }

      const supervisor = await tx.userMaster.findFirst({
        where: {
          id: data.siteSupervisorId,
          vendor_id: data.vendor_id,
          user_type_id: siteSupervisorType.id,
          status: "active",
        },
        select: { id: true, user_name: true },
      });

      if (!supervisor) {
        throw new Error("Invalid or inactive site supervisor");
      }

      // Check if there's already an active supervisor before deactivating
      const hasExistingActiveSupervisor = await tx.leadSiteSupervisorMapping.findFirst({
        where: {
          lead_id: lead.id,
          vendor_id: data.vendor_id,
          account_id: lead.account_id!,
          status: "active",
        },
        select: { id: true },
      });

      await tx.leadSiteSupervisorMapping.updateMany({
        where: {
          lead_id: lead.id,
          vendor_id: data.vendor_id,
          account_id: lead.account_id!,
        },
        data: {
          status: "inactive",
        },
      });

      const existingSupervisor = await tx.leadSiteSupervisorMapping.findFirst({
        where: {
          lead_id: lead.id,
          user_id: data.siteSupervisorId,
          vendor_id: data.vendor_id,
          account_id: lead.account_id!,
        },
      });

      let updatedSupervisor;
      if (existingSupervisor) {
        updatedSupervisor = await tx.leadSiteSupervisorMapping.update({
          where: { id: existingSupervisor.id },
          data: { status: "active" },
        });
      } else {
        updatedSupervisor = await tx.leadSiteSupervisorMapping.create({
          data: {
            lead_id: lead.id,
            user_id: data.siteSupervisorId,
            vendor_id: data.vendor_id,
            account_id: lead.account_id!,
            created_by: data.created_by,
            status: "active",
          },
        });
      }

      await tx.leadUserMapping.updateMany({
        where: {
          lead_id: lead.id,
          vendor_id: data.vendor_id,
          account_id: lead.account_id!,
          type: "site-supervisor",
          status: "active",
        },
        data: {
          status: "inactive",
          updated_by: data.created_by,
          updated_at: new Date(),
        },
      });

      const existingLeadUserMapping = await tx.leadUserMapping.findFirst({
        where: {
          lead_id: lead.id,
          vendor_id: data.vendor_id,
          account_id: lead.account_id!,
          user_id: data.siteSupervisorId,
          type: "site-supervisor",
        },
      });

      if (existingLeadUserMapping) {
        await tx.leadUserMapping.update({
          where: { id: existingLeadUserMapping.id },
          data: {
            status: "active",
            updated_by: data.created_by,
            updated_at: new Date(),
          },
        });
      } else {
        await tx.leadUserMapping.create({
          data: {
            vendor_id: data.vendor_id,
            account_id: lead.account_id!,
            lead_id: lead.id,
            user_id: data.siteSupervisorId,
            type: "site-supervisor",
            status: "active",
            created_by: data.created_by,
          },
        });
      }

      const logAction = hasExistingActiveSupervisor
        ? `${supervisor.user_name} has been reassigned as the site supervisor for this lead.`
        : `${supervisor.user_name} has been assigned as the site supervisor for this lead.`;

      await createLeadLog(tx, {
        vendor_id: data.vendor_id,
        lead_id: lead.id,
        account_id: lead.account_id!,
        action: logAction,
        action_type: "UPDATE",
        created_by: data.created_by,
        created_at: new Date(),
      });

      // Complete any open/in_progress "Assign a Site Supervisor" tasks for this lead
      await tx.userLeadTask.updateMany({
        where: {
          lead_id: lead.id,
          vendor_id: data.vendor_id,
          task_type: "Assign a Site Supervisor",
          status: { in: ["open", "in_progress"] },
        },
        data: {
          status: "completed",
          closed_by: data.created_by,
          closed_at: new Date(),
          updated_by: data.created_by,
          updated_at: new Date(),
        },
      });

      return {
        supervisor: updatedSupervisor,
        supervisor_user: supervisor,
      };
    });
  }

  public async updateMrpValue(data: {
    lead_id: number;
    vendor_id: number;
    mrp_value: number;
    updated_by: number;
  }) {
    const lead = await prisma.leadMaster.findFirst({
      where: {
        id: data.lead_id,
        vendor_id: data.vendor_id,
        is_deleted: false,
      },
      select: {
        id: true,
        total_project_amount: true,
      },
    });

    if (!lead) {
      throw new Error(
        `Lead ${data.lead_id} not found for vendor ${data.vendor_id}`,
      );
    }

    if (
      lead.total_project_amount !== null &&
      data.mrp_value < Number(lead.total_project_amount)
    ) {
      throw new Error("MRP value cannot be less than total project value");
    }

    return await prisma.leadMaster.update({
      where: { id: lead.id },
      data: {
        mrp_value: data.mrp_value,
        updated_by: data.updated_by,
        updated_at: new Date(),
      },
      select: {
        id: true,
        mrp_value: true,
        total_project_amount: true,
        updated_at: true,
      },
    });
  }

  public async updateTotalProjectAmount(data: {
    lead_id: number;
    vendor_id: number;
    total_project_amount: number;
    updated_by: number;
  }) {
    const lead = await prisma.leadMaster.findFirst({
      where: {
        id: data.lead_id,
        vendor_id: data.vendor_id,
        is_deleted: false,
      },
      select: {
        id: true,
        total_project_amount: true,
        mrp_value: true,
        pending_amount: true,
      },
    });

    if (!lead) {
      throw Object.assign(
        new Error(
          `Lead ${data.lead_id} not found for vendor ${data.vendor_id}`,
        ),
        { statusCode: 404 },
      );
    }

    if (
      lead.mrp_value !== null &&
      Number(lead.mrp_value) > 0 &&
      data.total_project_amount > Number(lead.mrp_value)
    ) {
      throw Object.assign(
        new Error("Total project amount cannot be greater than MRP value"),
        { statusCode: 400 },
      );
    }

    const currentPending = Number(lead.pending_amount ?? 0);
    const currentTotal = Number(lead.total_project_amount ?? 0);
    const totalDelta = data.total_project_amount - currentTotal;
    const updatedPending = currentPending + totalDelta;

    if (updatedPending < 0) {
      throw Object.assign(new Error("Pending amount cannot be negative"), {
        statusCode: 400,
      });
    }

    if (updatedPending > data.total_project_amount) {
      throw Object.assign(
        new Error("Total project amount cannot be smaller than pending amount"),
        { statusCode: 400 },
      );
    }

    return await prisma.leadMaster.update({
      where: { id: lead.id },
      data: {
        total_project_amount: data.total_project_amount,
        pending_amount: updatedPending,
        updated_by: data.updated_by,
        updated_at: new Date(),
      },
      select: {
        id: true,
        total_project_amount: true,
        mrp_value: true,
        pending_amount: true,
        updated_at: true,
      },
    });
  }

  public async updateBookingAmount(data: {
    lead_id: number;
    vendor_id: number;
    booking_amount: number;
    updated_by: number;
  }) {
    const lead = await prisma.leadMaster.findFirst({
      where: {
        id: data.lead_id,
        vendor_id: data.vendor_id,
        is_deleted: false,
      },
      select: {
        id: true,
        booking_amount: true,
        pending_amount: true,
      },
    });

    if (!lead) {
      throw Object.assign(
        new Error(
          `Lead ${data.lead_id} not found for vendor ${data.vendor_id}`,
        ),
        { statusCode: 404 },
      );
    }

    const currentBooking = Number(lead.booking_amount ?? 0);
    const currentPending = Number(lead.pending_amount ?? 0);
    const bookingDelta = data.booking_amount - currentBooking;
    const updatedPending = currentPending - bookingDelta;

    if (updatedPending < 0) {
      throw Object.assign(new Error("Pending amount cannot be negative"), {
        statusCode: 400,
      });
    }

    if (data.booking_amount > updatedPending) {
      throw Object.assign(
        new Error("Booking amount cannot be greater than pending amount"),
        { statusCode: 400 },
      );
    }

    return await prisma.leadMaster.update({
      where: { id: lead.id },
      data: {
        booking_amount: data.booking_amount,
        pending_amount: updatedPending,
        updated_by: data.updated_by,
        updated_at: new Date(),
      },
      select: {
        id: true,
        booking_amount: true,
        pending_amount: true,
        updated_at: true,
      },
    });
  }

  // post api for lead fetching stage with user id
  public static async getUniversalTableData(
    vendorId: number,
    userId: number,
    franchiseId: number | undefined,
    tag?: string,
    page: number = 1,
    limit: number = 10,
    filters: {
      global_search?: string;
      filter_lead_code?: string;
      filter_name?: string;
      contact?: string;
      stagetag?: string[];
      furniture_type?: Array<number | string>;
      furniture_structure?: Array<number | string>;
      site_map_link?: boolean;
      site_type?: Array<number | string>;
      assign_to?: Array<number | string>;
      priority?: Array<string>;
      site_address?: string;
      archetech_name?: string;
      source?: Array<number | string>;
      created_at?: "asc" | "desc";
      alt_contact_no?: string;
      email?: string;
      designer_remark?: string;
      date_range?: { from: string; to: string };
      production_status?: string;
      pending_services?: boolean;
    } = {},
    options: {
      requireMiscellaneous?: boolean;
      requirePendingMiscellaneous?: boolean;
    } = {},
  ): Promise<{ leads: any[]; count: number }> {
    logger.info("[BookingStageService] getUniversalTableData called", {
      vendorId,
      userId,
      franchiseId,
      tag,
      page,
      limit,
    });
    console.log("[Service] getUniversalTableData ids", {
      vendorId,
      userId,
      franchiseId,
      tag,
      page,
      limit,
    });

    if (!tag) {
      throw new Error("Status tag is required to fetch universal table data");
    }

    const isAllStages = tag.toUpperCase() === "ALL";

    const normalizedTag = String(tag);
    const tagNumber = Number(normalizedTag.replace(/type/i, "").trim());
    const isType4To16 = Number.isFinite(tagNumber)
      ? tagNumber >= 4 && tagNumber <= 16
      : false;

    const isTechCheckStage = normalizedTag === "Type 8";
    const isOrderLoginStage = normalizedTag === "Type 9";
    const isProductionStage = normalizedTag === "Type 10";
    const isInstallationStage = normalizedTag === "Type 15";
    const excludedProductionStageTags = ["Type 15", "Type 16", "Type 17"];
    const shouldExcludeLaterStageTags =
      isTechCheckStage || isOrderLoginStage || isProductionStage;
    const isInstanceDrivenStage =
      isTechCheckStage ||
      isOrderLoginStage ||
      isProductionStage ||
      isInstallationStage;
    const ignoreFranchiseForStage =
      isTechCheckStage || isOrderLoginStage || isProductionStage;

    let statusIds: number[] = [];

    if (isAllStages) {
      const targetTags = [
        "Type 1",
        "Type 2",
        "Type 3",
        "Type 4",
        "Type 5",
        "Type 6",
        "Type 7",
        "Type 8",
        "Type 9",
        "Type 10",
        "Type 11",
        "Type 12",
        "Type 13",
        "Type 14",
        "Type 15",
        "Type 16",
        "Type 17",
      ];

      const statuses = await prisma.statusTypeMaster.findMany({
        where: { vendor_id: vendorId, tag: { in: targetTags } },
        select: { id: true },
      });
      statusIds = statuses.map((s) => s.id);
    } else {
      const statusTags =
        normalizedTag === "Type 8"
          ? ["Type 8", "Type 9"]
          : normalizedTag === "Type 9"
            ? ["Type 8", "Type 9"]
            : normalizedTag === "Type 10"
              ? ["Type 8", "Type 9", "Type 10"]
              : normalizedTag === "Type 15"
                ? ["Type 15"]
                : [tag];
      const statusTypes = await prisma.statusTypeMaster.findMany({
        where: { vendor_id: vendorId, tag: { in: statusTags } },
        select: { id: true },
      });

      if (!statusTypes.length) {
        throw new Error(`Status ${tag} not found for vendor ${vendorId}`);
      }
      statusIds = statusTypes.map((status) => status.id);
    }

    if (!statusIds.length) {
      return { leads: [], count: 0 };
    }

    const creator = await prisma.userMaster.findUnique({
      where: { id: userId },
      include: { user_type: true },
    });

    const normalizedUserType = creator?.user_type?.user_type?.toLowerCase();
    const isAdmin = normalizedUserType === "admin";
    const isSuperAdmin = normalizedUserType === "super-admin";
    const isAdminLikeForRange = isType4To16 && (isAdmin || isSuperAdmin);
    const shouldUseMappingForRange =
      isType4To16 &&
      [
        "sales-executive",
        "site-supervisor",
        "backend",
        "tech-check",
        "factory",
        "head-site-supervisor",
      ].includes(normalizedUserType || "");
    const shouldIncludeFranchiseByRole =
      isType4To16 &&
      [
        "sales-executive",
        "site-supervisor",
        "admin",
        "super-admin",
      ].includes(normalizedUserType || "");
    const shouldIncludeFranchise =
      normalizedUserType === "admin" ||
      normalizedUserType === "super-admin" ||
      normalizedUserType === "sales-executive";
    const skip = (page - 1) * limit;
    const orderBy = {
      created_at:
        filters.created_at === "asc"
          ? Prisma.SortOrder.asc
          : Prisma.SortOrder.desc,
    };
    const normalizedStageTag = String(tag || "").trim();
    const includeConfig = BookingStageService.leadIncludes(normalizedStageTag);
    const shouldApplyStageSort =
      BookingStageService.statusLogSortedStageTags.has(normalizedStageTag) ||
      normalizedStageTag === "Type 9" ||
      normalizedStageTag === "Type 10";

    const addFilterConditions = (
      whereClause: Prisma.LeadMasterWhereInput,
    ): Prisma.LeadMasterWhereInput => {
      const addAnd = (condition: Prisma.LeadMasterWhereInput) => {
        if (!whereClause.AND) whereClause.AND = [];
        if (Array.isArray(whereClause.AND)) {
          whereClause.AND.push(condition);
        } else {
          whereClause.AND = [whereClause.AND, condition];
        }
      };

      const toString = (value: unknown) =>
        typeof value === "string" ? value.trim() : "";

      const toArray = (value: unknown): Array<number | string> => {
        if (Array.isArray(value)) return value;
        if (value === undefined || value === null) return [];
        return [value as number | string];
      };

      const parseNumberList = (value: unknown) => {
        const raw = toArray(value);
        const numbers = raw
          .map((item) => Number(item))
          .filter((item) => !Number.isNaN(item));
        const strings = raw
          .filter((item) => Number.isNaN(Number(item)))
          .map((item) => String(item));
        return { numbers, strings };
      };

      const leadCode = toString(filters.filter_lead_code);
      if (leadCode) {
        addAnd({ lead_code: { contains: leadCode, mode: "insensitive" } });
      }

      const nameFilter = toString(filters.filter_name);
      if (nameFilter) {
        const nameParts = nameFilter.split(/\s+/).filter(Boolean);
        if (nameParts.length >= 2) {
          addAnd({
            AND: [
              {
                firstname: {
                  contains: nameParts[0],
                  mode: "insensitive",
                },
              },
              {
                lastname: {
                  contains: nameParts.slice(1).join(" "),
                  mode: "insensitive",
                },
              },
            ],
          });
        } else {
          addAnd({
            OR: [
              { firstname: { contains: nameFilter, mode: "insensitive" } },
              { lastname: { contains: nameFilter, mode: "insensitive" } },
            ],
          });
        }
      }

      const globalSearch = toString(filters.global_search);

      if (globalSearch) {
        const nameParts = globalSearch.split(/\s+/).filter(Boolean);

        // Full name search (Firstname + Lastname)
        if (nameParts.length >= 2) {
          addAnd({
            OR: [
              {
                AND: [
                  {
                    firstname: {
                      contains: nameParts[0],
                      mode: "insensitive",
                    },
                  },
                  {
                    lastname: {
                      contains: nameParts.slice(1).join(" "),
                      mode: "insensitive",
                    },
                  },
                ],
              },
              {
                lead_code: {
                  contains: globalSearch,
                  mode: "insensitive",
                },
              },
              {
                contact_no: {
                  contains: globalSearch,
                  mode: "insensitive",
                },
              },
            ],
          });
        }
        // Single word search
        else {
          addAnd({
            OR: [
              {
                firstname: {
                  contains: globalSearch,
                  mode: "insensitive",
                },
              },
              {
                lastname: {
                  contains: globalSearch,
                  mode: "insensitive",
                },
              },
              {
                lead_code: {
                  contains: globalSearch,
                  mode: "insensitive",
                },
              },
              {
                contact_no: {
                  contains: globalSearch,
                  mode: "insensitive",
                },
              },
            ],
          });
        }
      }

      const contactFilter = toString(filters.contact);
      if (contactFilter) {
        addAnd({
          contact_no: { contains: contactFilter, mode: "insensitive" },
        });
      }

      const altContactFilter = toString(filters.alt_contact_no);
      if (altContactFilter) {
        addAnd({
          alt_contact_no: { contains: altContactFilter, mode: "insensitive" },
        });
      }

      const emailFilter = toString(filters.email);
      if (emailFilter) {
        addAnd({ email: { contains: emailFilter, mode: "insensitive" } });
      }

      const siteAddressFilter = toString(filters.site_address);
      if (siteAddressFilter) {
        addAnd({
          site_address: { contains: siteAddressFilter, mode: "insensitive" },
        });
      }

      const archetechFilter = toString(filters.archetech_name);
      if (archetechFilter) {
        addAnd({
          archetech_name: { contains: archetechFilter, mode: "insensitive" },
        });
      }

      const designerRemarkFilter = toString(filters.designer_remark);
      if (designerRemarkFilter) {
        addAnd({
          designer_remark: {
            contains: designerRemarkFilter,
            mode: "insensitive",
          },
        });
      }

      // ========== DATE RANGE FILTER ==========

      const dateRange = filters.date_range;

      if (dateRange && (dateRange.from || dateRange.to)) {
        let fromDate: Date | null = null;
        let toDate: Date | null = null;

        // Parse 'from' date - START of day (00:00:00.000)
        if (dateRange.from) {
          fromDate = new Date(dateRange.from);
          fromDate.setHours(0, 0, 0, 0);
        }

        // Parse 'to' date - END of day (23:59:59.999)
        if (dateRange.to) {
          toDate = new Date(dateRange.to);
          toDate.setHours(23, 59, 59, 999);
        }

        // ✅ Main case: Both dates exist (includes single date scenario)
        // Controller already normalizes single date to: { from: "2024-01-15", to: "2024-01-15" }
        if (fromDate && toDate) {
          addAnd({
            created_at: {
              gte: fromDate, // Start: 2024-01-15 00:00:00.000
              lte: toDate, // End:   2024-01-15 23:59:59.999
            },
          });
        }

        // ✅ Edge case: Only 'from' provided (shouldn't happen after controller normalization)
        else if (fromDate) {
          const endOfDay = new Date(fromDate);
          endOfDay.setHours(23, 59, 59, 999);

          addAnd({
            created_at: {
              gte: fromDate,
              lte: endOfDay,
            },
          });
        }

        // ✅ Edge case: Only 'to' provided
        else if (toDate) {
          addAnd({
            created_at: {
              lte: toDate,
            },
          });
        }
      }

      if (Array.isArray(filters.assign_to) && filters.assign_to.length > 0) {
        const assignIds = filters.assign_to
          .map(Number)
          .filter((id) => !Number.isNaN(id));

        if (assignIds.length > 0) {
          addAnd({
            assign_to: {
              in: assignIds,
            },
          });
        }
      }

      if (Array.isArray(filters.priority) && filters.priority.length > 0) {
        const priorities = filters.priority
          .map((item) => String(item).trim())
          .filter(Boolean);

        if (priorities.length > 0) {
          addAnd({
            OR: priorities.map((priority) => ({
              priority: {
                equals: priority,
                mode: "insensitive",
              },
            })),
          });
        }
      }

      const siteTypeList = parseNumberList(filters.site_type);
      if (siteTypeList.numbers.length > 0) {
        addAnd({ site_type_id: { in: siteTypeList.numbers } });
      } else if (siteTypeList.strings.length > 0) {
        addAnd({ siteType: { type: { in: siteTypeList.strings } } });
      }

      const sourceList = parseNumberList(filters.source);
      if (sourceList.numbers.length > 0) {
        addAnd({ source_id: { in: sourceList.numbers } });
      } else if (sourceList.strings.length > 0) {
        addAnd({ source: { type: { in: sourceList.strings } } });
      }

      const furnitureTypes = parseNumberList(filters.furniture_type);
      if (furnitureTypes.numbers.length > 0) {
        addAnd({
          productMappings: {
            some: { product_type_id: { in: furnitureTypes.numbers } },
          },
        });
      } else if (furnitureTypes.strings.length > 0) {
        addAnd({
          productMappings: {
            some: { productType: { type: { in: furnitureTypes.strings } } },
          },
        });
      }

      if (Array.isArray(filters.stagetag) && filters.stagetag.length > 0) {
        const normalizedTags = filters.stagetag
          .map((tag) => String(tag).trim())
          .filter(Boolean);

        if (normalizedTags.length > 0) {
          addAnd({
            statusType: {
              type: {
                in: normalizedTags,
              },
            },
          });
        }
      }

      const furnitureStructures = parseNumberList(filters.furniture_structure);
      if (furnitureStructures.numbers.length > 0) {
        addAnd({
          leadProductStructureMapping: {
            some: {
              product_structure_id: { in: furnitureStructures.numbers },
            },
          },
        });
      } else if (furnitureStructures.strings.length > 0) {
        addAnd({
          leadProductStructureMapping: {
            some: {
              productStructure: { type: { in: furnitureStructures.strings } },
            },
          },
        });
      }

      if (typeof filters.site_map_link === "boolean") {
        if (filters.site_map_link) {
          addAnd({
            AND: [
              { site_map_link: { not: null } },
              { site_map_link: { not: "" } },
            ],
          });
        } else {
          addAnd({
            OR: [{ site_map_link: null }, { site_map_link: "" }],
          });
        }
      }

      if (options.requirePendingMiscellaneous) {
        addAnd({ miscellaneousMaster: { some: { is_resolved: false } } });
      } else if (options.requireMiscellaneous) {
        addAnd({ miscellaneousMaster: { some: {} } });
      }

      // ================= INSTANCE DRIVEN STAGE FILTER =================

      if (isInstanceDrivenStage) {
        // -------- TYPE 8 : TECH CHECK STAGE --------
        // Tech check not done yet
        if (isTechCheckStage) {
          addAnd({
            productStructureInstances: {
              some: {
                OR: [
                  { is_tech_check_completed: false },
                  { is_tech_check_completed: null },
                ],
              },
            },
          });
        }

        // -------- TYPE 9 : ORDER LOGIN STAGE --------
        // Tech check completed → now waiting for order login
        if (isOrderLoginStage) {
          addAnd({
            productStructureInstances: {
              some: {
                AND: [
                  { is_tech_check_completed: true },
                  {
                    OR: [
                      { is_order_login_completed: false },
                      { is_order_login_completed: null },
                    ],
                  },
                ],
              },
            },
          });
        }

        // -------- TYPE 10 : PRODUCTION STAGE --------
        // Order login completed → now waiting for production
        if (isProductionStage) {
          const notTrue = (field: string) => ({
            OR: [{ [field]: false }, { [field]: null }],
          });

          const instanceAnd: any[] = [
            { is_tech_check_completed: true },
            { is_order_login_completed: true },
          ];

          const productionStatus = filters.production_status;
          if (productionStatus === "Completed") {
            instanceAnd.push({ is_production_completed: true });
          } else if (productionStatus === "Post Production") {
            instanceAnd.push({ is_post_production: true });
            instanceAnd.push(notTrue("is_production_completed"));
          } else if (productionStatus === "Under Production") {
            instanceAnd.push({ is_under_production: true });
            instanceAnd.push(notTrue("is_post_production"));
            instanceAnd.push(notTrue("is_production_completed"));
          } else if (productionStatus === "Pre Prod Done") {
            instanceAnd.push({ is_pre_prod_done: true });
            instanceAnd.push(notTrue("is_under_production"));
            instanceAnd.push(notTrue("is_post_production"));
            instanceAnd.push(notTrue("is_production_completed"));
          } else if (productionStatus === "Pending") {
            instanceAnd.push(notTrue("is_pre_prod_done"));
            instanceAnd.push(notTrue("is_under_production"));
            instanceAnd.push(notTrue("is_post_production"));
            instanceAnd.push(notTrue("is_production_completed"));
          }

          addAnd({
            productStructureInstances: {
              some: { AND: instanceAnd },
            },
          });
        }
      }

      if (isInstallationStage) {
        addAnd({
          NOT: {
            AND: [
              { usable_handover_completed: true },
              {
                miscellaneousMaster: {
                  some: { is_resolved: false }, // pending misc exists
                },
              },
            ],
          },
        });
      }

      return whereClause;
    };

    // ============= Admin Flow =============
    if (isAdminLikeForRange || (!isType4To16 && isAdmin)) {
      const baseWhere: Prisma.LeadMasterWhereInput = {
        vendor_id: vendorId,
        is_deleted: false,
        status_id: { in: statusIds },
        statusType: shouldExcludeLaterStageTags
          ? {
            vendor_id: vendorId,
            tag: { notIn: excludedProductionStageTags },
          }
          : { vendor_id: vendorId },
        activity_status: isAllStages
          ? "onGoing"
          : { in: ["onGoing", "lostApproval"] },
      };
      const includeFranchise =
        (isType4To16 ? shouldIncludeFranchiseByRole : shouldIncludeFranchise) &&
        franchiseId &&
        !ignoreFranchiseForStage;
      if (includeFranchise) {
        baseWhere.franchise_id = franchiseId;
      }

      const whereClause = addFilterConditions(baseWhere);

      const [leads, total] = await Promise.all([
        prisma.leadMaster.findMany({
          where: whereClause,
          include: includeConfig,
          orderBy,
          ...(shouldApplyStageSort ? {} : { skip, take: limit }),
        }),
        prisma.leadMaster.count({ where: whereClause }),
      ]);

      const processed = await Promise.all(
        leads.map(async (lead: any) => {
          if (lead.is_draft && isLeadComplete(lead)) {
            await prisma.leadMaster.update({
              where: { id: lead.id },
              data: { is_draft: false },
            });
            lead.is_draft = false;
          }

          const docsWithUrls = await Promise.all(
            lead.documents.map(async (doc: any) => {
              const signed_url = await generateSignedUrl(doc.doc_sys_name);
              return {
                ...doc,
                signed_url,
                file_type: BookingStageService.getFileType(doc.doc_og_name),
                is_image: BookingStageService.isImageFile(doc.doc_og_name),
              };
            }),
          );
          return { ...lead, documents: docsWithUrls };
        }),
      );
      const sortedProcessed = shouldApplyStageSort
        ? [...processed].sort(
          (a, b) =>
            BookingStageService.getStageSortTimestamp(b, normalizedStageTag) -
            BookingStageService.getStageSortTimestamp(a, normalizedStageTag),
        )
        : processed;

      const paginatedLeads = shouldApplyStageSort
        ? sortedProcessed.slice(skip, skip + limit)
        : sortedProcessed;

      return { leads: paginatedLeads, count: total };
    }

    // ============= Non-Admin Flow =============

    const mappedLeads = await prisma.leadUserMapping.findMany({
      where: {
        vendor_id: vendorId,
        user_id: userId,
        status: "active",
      },
      select: { lead_id: true },
    });

    const taskLeads = await prisma.userLeadTask.findMany({
      where: {
        vendor_id: vendorId,
        OR: [{ created_by: userId }, { user_id: userId }],
      },
      select: { lead_id: true },
    });

    const leadIds = [
      ...new Set([
        ...mappedLeads.map((m) => m.lead_id),
        ...taskLeads.map((t) => t.lead_id),
      ]),
    ];

    if (!leadIds.length) {
      logger.info("No leads found for user (union empty)", {
        userId,
        vendorId,
        tag,
      });
      return { leads: [], count: 0 };
    }

    const baseWhere: Prisma.LeadMasterWhereInput = {
      id: { in: leadIds },
      is_deleted: false,
      vendor_id: vendorId,
      status_id: { in: statusIds },
      statusType: shouldExcludeLaterStageTags
        ? {
          vendor_id: vendorId,
          tag: { notIn: excludedProductionStageTags },
        }
        : { vendor_id: vendorId },
      activity_status: isAllStages
        ? "onGoing"
        : { in: ["onGoing", "lostApproval"] },
    };
    if (shouldIncludeFranchise && franchiseId && !ignoreFranchiseForStage) {
      baseWhere.franchise_id = franchiseId;
    }

    const includeFranchise =
      (isType4To16 ? shouldIncludeFranchiseByRole : shouldIncludeFranchise) &&
      franchiseId &&
      !ignoreFranchiseForStage;
    if (includeFranchise) {
      baseWhere.franchise_id = franchiseId;
    }

    const whereClause = addFilterConditions(baseWhere);

    const [leads, total] = await Promise.all([
      prisma.leadMaster.findMany({
        where: whereClause,
        include: includeConfig,
        orderBy,
        ...(shouldApplyStageSort ? {} : { skip, take: limit }),
      }),
      prisma.leadMaster.count({ where: whereClause }),
    ]);

    const processed = await Promise.all(
      leads.map(async (lead: any) => {
        if (lead.is_draft && isLeadComplete(lead)) {
          await prisma.leadMaster.update({
            where: { id: lead.id },
            data: { is_draft: false },
          });
          lead.is_draft = false;
        }

        const docsWithUrls = await Promise.all(
          lead.documents.map(async (doc: any) => {
            const signed_url = await generateSignedUrl(doc.doc_sys_name);
            return {
              ...doc,
              signed_url,
              file_type: BookingStageService.getFileType(doc.doc_og_name),
              is_image: BookingStageService.isImageFile(doc.doc_og_name),
            };
          }),
        );
        return { ...lead, documents: docsWithUrls };
      }),
    );

    const sortedProcessed = shouldApplyStageSort
      ? [...processed].sort(
        (a, b) =>
          BookingStageService.getStageSortTimestamp(b, normalizedStageTag) -
          BookingStageService.getStageSortTimestamp(a, normalizedStageTag),
      )
      : processed;

    const paginatedLeads = shouldApplyStageSort
      ? sortedProcessed.slice(skip, skip + limit)
      : sortedProcessed;

    return { leads: paginatedLeads, count: total };
  }

  public async assignTaskBookingService(payload: AssignTaskBookingInput) {
    const { error, value } = assignTaskBookingSchema.validate(payload);
    if (error) {
      throw new Error(
        `Validation failed: ${error.details.map((d) => d.message).join(", ")}`,
      );
    }

    const { lead_id, task_type, due_date, remark, assignee_user_id, created_by } = value;

    return prisma.$transaction(async (tx) => {
      const lead = await tx.leadMaster.findUnique({
        where: { id: lead_id },
        select: { id: true, vendor_id: true, account_id: true, status_id: true, franchise_id: true },
      });
      if (!lead) throw new Error(`Lead ${lead_id} not found`);

      const leadStage = lead.status_id
        ? ((await tx.statusTypeMaster.findUnique({
          where: { id: lead.status_id },
          select: { type: true },
        }))?.type ?? null)
        : null;

      const assignee = await tx.userMaster.findUnique({
        where: { id: assignee_user_id },
        select: { id: true, vendor_id: true },
      });
      if (!assignee) throw new Error(`Assignee user ${assignee_user_id} not found`);
      if (assignee.vendor_id !== lead.vendor_id) {
        throw new Error(`Assignee does not belong to vendor ${lead.vendor_id}`);
      }

      const task = await tx.userLeadTask.create({
        data: {
          lead_id: lead.id,
          account_id: lead.account_id!,
          vendor_id: lead.vendor_id,
          franchise_id: lead.franchise_id ?? null,
          user_id: assignee_user_id,
          task_type,
          lead_stage: leadStage,
          due_date: new Date(due_date),
          remark: remark || null,
          status: "open",
          created_by,
        },
      });

      await createTaskHistoryLog({
        db: tx,
        task,
        createdBy: created_by,
        actionType: "CREATE",
      });

      return task;
    });
  }
}
