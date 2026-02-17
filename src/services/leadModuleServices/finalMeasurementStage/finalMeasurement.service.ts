import { prisma } from "../../../prisma/client";
import { generateSignedUrl } from "../../../utils/wasabiClient"; // your existing Wasabi config
import Joi = require("joi");
import logger from "../../../utils/logger";
import { AssignTaskFMInput } from "../../../types/leadModule.types";
import { NotificationType, Prisma } from "../../../prisma/generated";
import { cache } from "../../../utils/cache";
import { NotificationService } from "../../../../src/services/notification/notification.service";
import {
  sendLeadMovedToClientDocumentationEmail,
} from "../../../../src/services/email/brevoEmail.service";

interface FinalMeasurementDto {
  lead_id: number;
  account_id: number;
  vendor_id: number;
  created_by: number;
  baseUrl: string;
  critical_discussion_notes?: string | null;
  finalMeasurementDocs: { originalName: string; sysName: string }[];
  sitePhotos: { originalName: string; sysName: string }[];
}

const assignTaskISMSchema = Joi.object({
  lead_id: Joi.number().integer().positive().required(),
  task_type: Joi.string().trim().required(),
  due_date: Joi.alternatives()
    .try(Joi.string().isoDate(), Joi.date())
    .required(),
  remark: Joi.string().allow("", null),
  assignee_user_id: Joi.number().integer().positive().required(),
  created_by: Joi.number().integer().positive().required(),
});

export class FinalMeasurementService {
  public async createFinalMeasurementStage(data: FinalMeasurementDto) {
    const response = await prisma.$transaction(
      async (tx: any) => {
        const response: any = {
          measurementDocs: [],
          sitePhotos: [],
          message: "Final measurement stage completed successfully",
        };

        // 1️⃣ Upload Final Measurement Documents (Type 9)
        const measurementDocType = await tx.documentTypeMaster.findFirst({
          where: { vendor_id: data.vendor_id, tag: "Type 9" },
        });
        if (!measurementDocType) {
          throw new Error(
            "Document type (Final Measurement) not found for this vendor",
          );
        }

        for (const doc of data.finalMeasurementDocs) {
          const measurementDoc = await tx.leadDocuments.create({
            data: {
              doc_og_name: doc.originalName,
              doc_sys_name: doc.sysName,
              created_by: data.created_by,
              doc_type_id: measurementDocType.id,
              account_id: data.account_id,
              lead_id: data.lead_id,
              vendor_id: data.vendor_id,
            },
          });

          response.measurementDocs.push(measurementDoc);
        }

        // 2️⃣ Upload Site Photos (Type 10)
        const sitePhotoType = await tx.documentTypeMaster.findFirst({
          where: { vendor_id: data.vendor_id, tag: "Type 10" },
        });
        if (!sitePhotoType) {
          throw new Error(
            "Document type (Site Photos) not found for this vendor",
          );
        }

        for (const photo of data.sitePhotos) {
          const siteDoc = await tx.leadDocuments.create({
            data: {
              doc_og_name: photo.originalName,
              doc_sys_name: photo.sysName,
              created_by: data.created_by,
              doc_type_id: sitePhotoType.id,
              account_id: data.account_id,
              lead_id: data.lead_id,
              vendor_id: data.vendor_id,
            },
          });

          response.sitePhotos.push(siteDoc);
        }

        // 3️⃣ Resolve the vendor’s Client Documentation status (Type 6)
        const clientDocumentationStatus = await tx.statusTypeMaster.findFirst({
          where: { vendor_id: data.vendor_id, tag: "Type 6" },
          select: { id: true },
        });
        if (!clientDocumentationStatus) {
          throw new Error(
            `Client documentation status (Type 6) not found for vendor ${data.vendor_id}`,
          );
        }

        // 4️⃣ Update LeadMaster with notes and new status
        await tx.leadMaster.update({
          where: { id: data.lead_id },
          data: {
            final_desc_note: data.critical_discussion_notes,
            status_id: clientDocumentationStatus.id,
          },
        });

        // 5️⃣ Mark related Final Measurement task as completed
        await tx.userLeadTask.updateMany({
          where: {
            vendor_id: data.vendor_id,
            lead_id: data.lead_id,
            task_type: "Final Measurements",
            status: "open",
          },
          data: {
            status: "completed",
            closed_by: data.created_by,
            closed_at: new Date(),
            updated_by: data.created_by,
            updated_at: new Date(),
          },
        });

        // 🧹 Redis Cache Invalidation — Sales Executive Dashboard
        // Find all assignees of FM tasks for this lead
        const fmAssignees = await tx.userLeadTask.findMany({
          where: {
            vendor_id: data.vendor_id,
            lead_id: data.lead_id,
            task_type: "Final Measurements",
          },
          select: { user_id: true },
        });

        // Clear dashboard cache for each assignee
        for (const t of fmAssignees) {
          await cache.del(`dashboard:tasks:${data.vendor_id}:${t.user_id}`);
        }

        // 6️⃣ Create Action Log Entry
        const fmCount = response.measurementDocs.length;
        const spCount = response.sitePhotos.length;

        const pluralFM =
          fmCount > 1
            ? "Final Measurement documents have"
            : "Final Measurement document has";
        const pluralSP = spCount > 1 ? "Site Photos have" : "Site Photo has";

        let actionMessage = `Final Measurement stage completed successfully — ${fmCount} ${pluralFM} and ${spCount} ${pluralSP} been uploaded successfully.`;

        if (
          data.critical_discussion_notes &&
          data.critical_discussion_notes.trim()
        ) {
          actionMessage += ` — Remark: ${data.critical_discussion_notes.trim()}`;
        } else {
          actionMessage += ` — Remark: No remark provided.`;
        }

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

        // 7️⃣ Create LeadDocumentLogs
        const allDocs = [...response.measurementDocs, ...response.sitePhotos];
        if (allDocs.length > 0) {
          const docLogsData = allDocs.map((doc: any) => ({
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

        logger.info("✅ Final Measurement Stage completed", {
          lead_id: data.lead_id,
          vendor_id: data.vendor_id,
          fmCount,
          spCount,
          actionMessage,
        });

        return response;
      },
      {
        timeout: 20000,
      },
    );

    // ===============================
    // CLIENT DOCUMENTATION STAGE → ADMIN NOTIFICATION
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

      // Safety guard
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

      

      const baseUrl = data.baseUrl;
      // Account-aware deep link
      const projectUrl = lead.account_id
        ? `${baseUrl}/dashboard/project/details/${data.lead_id}?accountId=${lead.account_id}`
        : `${baseUrl}/dashboard/project/details/${data.lead_id}`;

      // Fetch Active Admin Users
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
        // ❌ Prevent self notification
        if (admin.id === actorId) continue;

        // 🔔 In-App Notification
        await NotificationService.createAndSend({
          vendor_id: lead.vendor_id,
          user_id: admin.id,
          sender_id: actorId,
          type: NotificationType.LEAD_MILESTONE,
          title: "Lead Entered Client Documentation Stage",
          message: `${leadCode} - ${leadName} moved to Client Documentation stage.`,
          entity_type: "lead",
          entity_id: data.lead_id,
          redirect_url: lead.account_id
            ? `/dashboard/leads/details/${data.lead_id}?accountId=${lead.account_id}`
            : `/dashboard/leads/details/${data.lead_id}`,
        });

        // 📧 EMAIL Notification (Client Documentation Mail)
        if (!admin.user_email) continue;

        await sendLeadMovedToClientDocumentationEmail({
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
      logger.warn("⚠️ Client documentation admin notification failed", {
        lead_id: data.lead_id,
        error: err?.message,
      });
    }
    return response;
  }

  public async getAllFinalMeasurementLeadsByVendorId(
    vendorId: number,
    userId: number,
  ) {
    // 1. Resolve status ID dynamically for Type 5
    const finalMeasurementStatus = await prisma.statusTypeMaster.findFirst({
      where: { vendor_id: vendorId, tag: "Type 5" },
      select: { id: true },
    });

    if (!finalMeasurementStatus) {
      throw new Error(
        `Final Measurement status (Type 5) not found for vendor ${vendorId}`,
      );
    }

    // 2. Check if user is admin
    const creator = await prisma.userMaster.findUnique({
      where: { id: userId },
      include: { user_type: true },
    });
    const isAdmin = creator?.user_type?.user_type?.toLowerCase() === "admin";

    // ============= Admin Flow =============
    if (isAdmin) {
      return prisma.leadMaster.findMany({
        where: {
          vendor_id: vendorId,
          is_deleted: false,
          status_id: finalMeasurementStatus.id,
          activity_status: { in: ["onGoing", "lostApproval"] }, // ✅ allow both
        },
        include: this.defaultIncludes(vendorId),
        orderBy: { created_at: "desc" },
      });
    }

    // ============= Non-Admin Flow =============
    // Leads mapped via LeadUserMapping
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

    // ✅ Union
    const leadIds = [
      ...new Set([
        ...mappedLeads.map((m) => m.lead_id),
        ...taskLeads.map((t) => t.lead_id),
      ]),
    ];
    if (!leadIds.length) return [];

    return prisma.leadMaster.findMany({
      where: {
        id: { in: leadIds },
        vendor_id: vendorId,
        is_deleted: false,
        status_id: finalMeasurementStatus.id,
        activity_status: { in: ["onGoing", "lostApproval"] }, // ✅ allow both
      },
      include: this.defaultIncludes(vendorId),
      orderBy: { created_at: "desc" },
    });
  }

  // ✅ Common include (reusable)
  private defaultIncludes(vendorId: number) {
    return {
      siteType: true,
      source: true,
      statusType: true,
      account: {
        select: { id: true, name: true, contact_no: true, email: true },
      },
      createdBy: { select: { id: true, user_name: true, user_email: true } },
      assignedTo: { select: { id: true, user_name: true, user_email: true } },
      documents: {
        where: { is_deleted: false },
        include: {
          documentType: { select: { id: true, type: true, tag: true } },
          createdBy: { select: { id: true, user_name: true } },
        },
      },
      tasks: {
        where: { task_type: "Follow Up" },
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
      // ✅ Added: product mappings
      productMappings: {
        include: {
          productType: {
            select: { id: true, type: true },
          },
        },
      },

      // ✅ Added: structure mappings
      leadProductStructureMapping: {
        include: {
          productStructure: {
            select: { id: true, type: true },
          },
        },
      },
    };
  }

  public async getFinalMeasurementLead(vendorId: number, leadId: number) {
    // Resolve the vendor's Open status ID dynamically
    const finalMeasurementStatus = await prisma.statusTypeMaster.findFirst({
      where: {
        vendor_id: vendorId,
        tag: "Type 6", // ✅ Open status
      },
      select: { id: true },
    });

    if (!finalMeasurementStatus) {
      throw new Error(`Open status (Type 1) not found for vendor ${vendorId}`);
    }

    // Find the lead in Final Measurement stage
    const lead = await prisma.leadMaster.findFirst({
      where: {
        id: leadId,
        vendor_id: vendorId,
     
      },
      include: {
        documents: {
          where: {
            is_deleted: false 
          }
        },
         // we'll filter after fetch
      },
    });

    if (!lead) {
      throw new Error("Lead not found or not in Final Measurement stage");
    }

    // Get doc type ids
    const docTypes = await prisma.documentTypeMaster.findMany({
      where: {
        vendor_id: vendorId,
        tag: { in: ["Type 9", "Type 10"] }, // Final Measurement + Site Photos
      },
    });

    const measurementDocType = docTypes.find((d: any) => d.tag === "Type 9");
    const sitePhotoType = docTypes.find((d: any) => d.tag === "Type 10");

    // Measurement docs (multiple)
    const measurementDocs = await Promise.all(
      lead.documents
        .filter((d: any) => d.doc_type_id === measurementDocType?.id)
        .map(async (doc: any) => ({
          ...doc,
          signedUrl: await generateSignedUrl(doc.doc_sys_name, 3600, "inline"),
        })),
    );

    // Site photos (multiple)
    const sitePhotos = await Promise.all(
      lead.documents
        .filter((d: any) => d.doc_type_id === sitePhotoType?.id)
        .map(async (doc: any) => ({
          ...doc,
          signedUrl: await generateSignedUrl(doc.doc_sys_name, 3600, "inline"),
        })),
    );

    return {
      id: lead.id,
      vendor_id: lead.vendor_id,
      final_desc_note: lead.final_desc_note,
      status_id: lead.status_id,
      measurementDocs,
      sitePhotos,
    };
  }

  public async updateCriticalDiscussionNotes(
    vendorId: number,
    leadId: number,
    notes: string,
  ) {
    // Resolve the vendor's Open status ID dynamically
    const finalMeasurementStatus = await prisma.statusTypeMaster.findFirst({
      where: {
        vendor_id: vendorId,
        tag: "Type 5", // ✅ Open status
      },
      select: { id: true },
    });

    if (!finalMeasurementStatus) {
      throw new Error(`Open status (Type 1) not found for vendor ${vendorId}`);
    }

    const lead = await prisma.leadMaster.findFirst({
      where: {
        id: leadId,
        vendor_id: vendorId,
        status_id: finalMeasurementStatus.id,
      },
    });

    if (!lead) {
      throw new Error("Lead not found or not in Final Measurement stage");
    }

    return await prisma.leadMaster.update({
      where: { id: lead.id },
      data: { final_desc_note: notes },
    });
  }

  public async addMoreFinalMeasurementFiles(data: {
    lead_id: number;
    vendor_id: number;
    created_by: number;
    sitePhotos?: { originalName: string; sysName: string }[];
  }) {
    return await prisma.$transaction(
      async (tx: any) => {
        const response: any = {
          sitePhotos: [],
        };

        const lead = await tx.leadMaster.findFirst({
          where: {
            id: data.lead_id,
            vendor_id: data.vendor_id,
            is_deleted: false,
          },
          select: { account_id: true },
        });

        if (!lead?.account_id) {
          throw new Error(
            "Lead not found or account_id missing for this vendor",
          );
        }

        // Upload Additional Site Photos (Type 10)
        if (data.sitePhotos && data.sitePhotos.length > 0) {
          const sitePhotoType = await tx.documentTypeMaster.findFirst({
            where: { vendor_id: data.vendor_id, tag: "Type 10" },
          });
          if (!sitePhotoType) {
            throw new Error(
              "Document type (Site Photos) not found for this vendor",
            );
          }

          for (const file of data.sitePhotos) {
            const doc = await tx.leadDocuments.create({
              data: {
                doc_og_name: file.originalName,
                doc_sys_name: file.sysName,
                created_by: data.created_by,
                doc_type_id: sitePhotoType.id,
                account_id: lead.account_id,
                lead_id: data.lead_id,
                vendor_id: data.vendor_id,
              },
            });

            response.sitePhotos.push(doc);
          }
        }

        return response;
      },
      { timeout: 15000 },
    );
  }

  public async addMoreFinalMeasurementSitePhotos(data: {
    lead_id: number;
    vendor_id: number;
    created_by: number;
    sitePhotos: { originalName: string; sysName: string }[];
  }) {
    return await prisma.$transaction(
      async (tx: any) => {
        const response: any = {
          sitePhotos: [],
        };

        const lead = await tx.leadMaster.findFirst({
          where: {
            id: data.lead_id,
            vendor_id: data.vendor_id,
            is_deleted: false,
          },
          select: { account_id: true },
        });

        if (!lead?.account_id) {
          throw new Error(
            "Lead not found or account_id missing for this vendor",
          );
        }

        const sitePhotoType = await tx.documentTypeMaster.findFirst({
          where: { vendor_id: data.vendor_id, tag: "Type 10" },
        });
        if (!sitePhotoType) {
          throw new Error(
            "Document type (Site Photos) not found for this vendor",
          );
        }

        for (const file of data.sitePhotos) {
          const doc = await tx.leadDocuments.create({
            data: {
              doc_og_name: file.originalName,
              doc_sys_name: file.sysName,
              created_by: data.created_by,
              doc_type_id: sitePhotoType.id,
              account_id: lead.account_id,
              lead_id: data.lead_id,
              vendor_id: data.vendor_id,
            },
          });

          response.sitePhotos.push(doc);
        }

        return response;
      },
      { timeout: 15000 },
    );
  }

  public async addMoreFinalMeasurementDocs(data: {
    lead_id: number;
    vendor_id: number;
    created_by: number;
    finalMeasurementDocs: { originalName: string; sysName: string }[];
  }) {
    return await prisma.$transaction(
      async (tx: any) => {
        const response: any = {
          measurementDocs: [],
        };

        const lead = await tx.leadMaster.findFirst({
          where: {
            id: data.lead_id,
            vendor_id: data.vendor_id,
            is_deleted: false,
          },
          select: { account_id: true },
        });

        if (!lead?.account_id) {
          throw new Error(
            "Lead not found or account_id missing for this vendor",
          );
        }

        const measurementDocType = await tx.documentTypeMaster.findFirst({
          where: { vendor_id: data.vendor_id, tag: "Type 9" },
        });
        if (!measurementDocType) {
          throw new Error(
            "Document type (Final Measurement) not found for this vendor",
          );
        }

        for (const file of data.finalMeasurementDocs) {
          const doc = await tx.leadDocuments.create({
            data: {
              doc_og_name: file.originalName,
              doc_sys_name: file.sysName,
              created_by: data.created_by,
              doc_type_id: measurementDocType.id,
              account_id: lead.account_id,
              lead_id: data.lead_id,
              vendor_id: data.vendor_id,
            },
          });

          response.measurementDocs.push(doc);
        }

        return response;
      },
      { timeout: 15000 },
    );
  }

  public async getLeadsWithStatusFinalMeasurement(
    vendorId: number,
    userId: number,
  ) {
    // ✅ Get user role
    const user = await prisma.userMaster.findUnique({
      where: { id: userId },
      include: { user_type: true },
    });

    if (!user) throw new Error("User not found");

    const role = user.user_type.user_type.toLowerCase();

    // Resolve the vendor's Open status ID dynamically
    const finalMeasurementStatus = await prisma.statusTypeMaster.findFirst({
      where: {
        vendor_id: vendorId,
        tag: "Type 5", // ✅ Open status
      },
      select: { id: true },
    });

    if (!finalMeasurementStatus) {
      throw new Error(`Open status (Type 1) not found for vendor ${vendorId}`);
    }

    // ✅ Base where clause
    const whereClause: any = {
      status_id: finalMeasurementStatus.id,
      is_deleted: false,
      vendor_id: vendorId,
    };

    // ✅ Restrict based on role
    if (role === "sales-executive") {
      whereClause.OR = [{ created_by: userId }, { assign_to: userId }];
    } else if (role === "site-supervisor") {
      // supervisor mapping table is LeadSiteSupervisorMapping
      whereClause.siteSupervisors = {
        some: { user_id: userId, status: "active" },
      };
    }
    // ✅ Admin can see all → no extra filter

    const leads = await prisma.leadMaster.findMany({
      where: whereClause,
      include: {
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
          select: {
            productStructure: { select: { id: true, type: true } },
          },
        },
        // ✅ Add tasks like in PaymentUploadService
        tasks: {
          where: {
            task_type: "Follow Up", // or remove this filter if you need all tasks
          },
          select: {
            id: true,
            task_type: true,
            due_date: true,
            remark: true,
            status: true,
            created_at: true,
          },
          orderBy: { created_at: "desc" },
        },
      },
      orderBy: { created_at: "desc" },
    });

    return leads;
  }

  public async assignTaskFMService(payload: AssignTaskFMInput) {
    const { error, value } = assignTaskISMSchema.validate(payload);
    if (error) {
      throw new Error(
        `Validation failed: ${error.details.map((d) => d.message).join(", ")}`,
      );
    }

    const {
      lead_id,
      task_type,
      due_date,
      remark,
      assignee_user_id,
      created_by,
    } = value;

    return prisma.$transaction(async (tx) => {
      // 1️⃣ Validate lead
      const lead = await tx.leadMaster.findUnique({
        where: { id: lead_id },
        select: {
          id: true,
          vendor_id: true,
          account_id: true,
          status_id: true,
        },
      });
      if (!lead) throw new Error(`Lead ${lead_id} not found`);

      const leadStage = lead.status_id
        ? ((
            await tx.statusTypeMaster.findUnique({
              where: { id: lead.status_id },
              select: { type: true },
            })
          )?.type ?? null)
        : null;

      // 2️⃣ Validate assignee
      const assignee = await tx.userMaster.findUnique({
        where: { id: assignee_user_id },
        select: { id: true, vendor_id: true, user_name: true },
      });
      if (!assignee)
        throw new Error(`Assignee user ${assignee_user_id} not found`);
      if (assignee.vendor_id !== lead.vendor_id) {
        throw new Error(
          `Assignee user ${assignee_user_id} does not belong to vendor ${lead.vendor_id}`,
        );
      }

      // 3️⃣ Create task
      const task = await tx.userLeadTask.create({
        data: {
          lead_id: lead.id,
          account_id: lead.account_id!,
          vendor_id: lead.vendor_id,
          user_id: assignee_user_id,
          task_type,
          lead_stage: leadStage,
          due_date: new Date(due_date),
          remark: remark || null,
          status: "open",
          created_by,
        },
      });

      // ✅ Ensure assignee is in lead chat members
      let chatRoom = await tx.leadChatRoom.findFirst({
        where: {
          lead_id: lead.id,
          vendor_id: lead.vendor_id,
        },
        select: { id: true },
      });

      if (!chatRoom) {
        chatRoom = await tx.leadChatRoom.create({
          data: {
            lead_id: lead.id,
            vendor_id: lead.vendor_id,
          },
          select: { id: true },
        });
      }

      const existingMember = await tx.leadChatMember.findFirst({
        where: {
          chat_room_id: chatRoom.id,
          user_id: assignee_user_id,
        },
        select: { id: true },
      });

      if (existingMember) {
        logger.info(
          "[SERVICE] LeadChatMember already exists, skipping insert",
          {
            lead_id: lead.id,
            chat_room_id: chatRoom.id,
            user_id: assignee_user_id,
          },
        );
      } else {
        await tx.leadChatMember.create({
          data: {
            chat_room_id: chatRoom.id,
            user_id: assignee_user_id,
            added_by: created_by,
          },
        });
      }

      // 🧹 Invalidate Dashboard Task Cache (Sales Executive Dashboard)
      await cache.del(`dashboard:tasks:${lead.vendor_id}:${assignee_user_id}`);

      // 4️⃣ Update lead status (if not Follow Up)
      let updatedLead: {
        id: number;
        account_id: number | null;
        vendor_id: number;
        status_id: number | null;
      } = { ...lead, status_id: null };

      // Treat both "BookingDone - ISM" and "follow up" as special cases (do not update status for them)
      if (
        task_type.toLowerCase() !== "follow up" &&
        task_type.toLowerCase() !== "bookingdone - ism"
      ) {
        const toStatus = await tx.statusTypeMaster.findFirst({
          where: { vendor_id: lead.vendor_id, tag: "Type 5" },
          select: { id: true },
        });
        if (!toStatus) {
          throw new Error(
            `Status 'Type 5' not found for vendor ${lead.vendor_id}`,
          );
        }

        updatedLead = await tx.leadMaster.update({
          where: { id: lead.id },
          data: { status_id: toStatus.id },
          select: {
            id: true,
            account_id: true,
            vendor_id: true,
            status_id: true,
          },
        });
      }

      // 5️⃣ Create action log
      let actionMessage = "";

      if (task_type.toLowerCase() === "follow up") {
        actionMessage = `Lead has been assigned to ${assignee.user_name} for Follow Up.`;
      } else {
        actionMessage = `Lead has been assigned to ${assignee.user_name} for Final Measurement.`;
      }

      // Add due date (formatted)
      const formattedDate = new Date(due_date).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
      actionMessage += ` Due Date: ${formattedDate}.`;

      // Add remark if present
      if (remark && remark.trim()) {
        actionMessage += ` — Remark: ${remark.trim()}`;
      } else {
        actionMessage += ` — Remark: No remark provided.`;
      }

      await tx.leadDetailedLogs.create({
        data: {
          vendor_id: lead.vendor_id,
          lead_id: lead.id,
          account_id: lead.account_id!,
          action: actionMessage,
          action_type: "CREATE",
          created_by,
          created_at: new Date(),
        },
      });

      logger.info("[SERVICE] Final Measurement task assigned successfully", {
        lead_id: lead.id,
        task_id: task.id,
        assignee: assignee.user_name,
        due_date: formattedDate,
        remark: remark || "No remark",
      });

      return { task, lead: updatedLead };
    });
  }
}
