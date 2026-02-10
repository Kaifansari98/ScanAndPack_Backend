import { prisma } from "../../../prisma/client";
import { generateSignedUrl } from "../../../utils/wasabiClient";
import { NotificationType, Prisma } from "../../../prisma/generated";
import logger from "../../../utils/logger";
import { NotificationService } from "../../../../src/services/notification/notification.service";
import {
  sendLeadMovedToClientApprovalEmail,
  sendOrderLoginEnabledEmail,
  sendRevisedDocumentsUploadedEmail,
} from "../../../../src/services/email/brevoEmail.service";

export type DocTypeTag = "Type 11" | "Type 12";

export interface CustomMulterFile {
  originalName: string;
  sysName: string;
  docTypeTag: DocTypeTag;
}

export interface ClientDocumentationDto {
  lead_id: number;
  vendor_id: number;
  account_id: number;
  created_by: number;
  documents: CustomMulterFile[];
}

export class ClientDocumentationService {
  public async createClientDocumentationStage(data: ClientDocumentationDto) {
    // ✅ Step 1: Run DB operations inside a short transaction
    const result = await prisma.$transaction(async (tx) => {
      const response: any = {
        documents: [],
        message: "Client documentation stage completed successfully",
      };

      // Insert lead documents
      for (const doc of data.documents) {
        const docType = await tx.documentTypeMaster.findFirst({
          where: { vendor_id: data.vendor_id, tag: doc.docTypeTag },
        });

        if (!docType) {
          throw new Error(
            `Document type ${doc.docTypeTag} not found for vendor ${data.vendor_id}`,
          );
        }

        const docEntry = await tx.leadDocuments.create({
          data: {
            doc_og_name: doc.originalName,
            doc_sys_name: doc.sysName,
            created_by: data.created_by,
            doc_type_id: docType.id,
            account_id: data.account_id,
            lead_id: data.lead_id,
            vendor_id: data.vendor_id,
          },
        });

        response.documents.push(docEntry);
      }

      // Find Client Approval Status (Type 7)
      const clientApprovalStatus = await tx.statusTypeMaster.findFirst({
        where: {
          vendor_id: data.vendor_id,
          tag: "Type 7",
        },
        select: { id: true },
      });

      if (!clientApprovalStatus) {
        throw new Error(
          `Client Approval status (Type 7) not found for vendor ${data.vendor_id}`,
        );
      }

      // ✅ Calculate total number of documents initially submitted
      const totalSubmittedDocs = data.documents?.length || 0;

      // Update lead status
      await tx.leadMaster.update({
        where: { id: data.lead_id },
        data: {
          status_id: clientApprovalStatus.id,
          updated_at: new Date(),
          updated_by: data.created_by,
          no_of_client_documents_initially_submitted: totalSubmittedDocs,
        },
      });

      // Add logs
      const docCount = response.documents.length;
      const plural = docCount > 1 ? "documents have" : "document has";
      const actionMessage = `Client Documentation stage completed successfully — ${docCount} Client Documentation ${plural} been uploaded successfully.`;

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

      if (response.documents.length > 0) {
        const docLogsData = response.documents.map((doc: any) => ({
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

      await tx.leadDetailedLogs.create({
        data: {
          vendor_id: data.vendor_id,
          lead_id: data.lead_id,
          account_id: data.account_id,
          action: `Lead has been moved to Client Approval stage.`,
          action_type: "UPDATE",
          created_by: data.created_by,
          created_at: new Date(),
        },
      });

      logger.info("✅ Client Documentation Stage completed", {
        lead_id: data.lead_id,
        vendor_id: data.vendor_id,
        document_count: docCount,
        actionMessage,
      });

      return response;
    });

    // ===============================
    // CLIENT APPROVAL STAGE → ADMIN NOTIFICATION
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
      if (!lead) return result;

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

      // Account aware deep-link
      const projectUrl = lead.account_id
        ? `${baseUrl}/dashboard/leads/details/${data.lead_id}?accountId=${lead.account_id}`
        : `${baseUrl}/dashboard/leads/details/${data.lead_id}`;

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
        // ❌ Block self notification
        if (admin.id === actorId) continue;

        // 🔔 IN-APP Notification
        await NotificationService.createAndSend({
          vendor_id: lead.vendor_id,
          user_id: admin.id,
          sender_id: actorId,
          type: NotificationType.LEAD_MILESTONE,
          title: "Lead Entered Client Approval Stage",
          message: `${leadCode} - ${leadName} moved to Client Approval stage.`,
          entity_type: "lead",
          entity_id: data.lead_id,
          redirect_url: lead.account_id
            ? `/dashboard/leads/details/${data.lead_id}?accountId=${lead.account_id}`
            : `/dashboard/leads/details/${data.lead_id}`,
        });

        // 📧 EMAIL Notification (Client Approval Mail)
        if (!admin.user_email) continue;

        await sendLeadMovedToClientApprovalEmail({
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
      logger.warn("⚠️ Client approval admin notification failed", {
        lead_id: data.lead_id,
        error: err?.message,
      });
    }
    return result;
  }

  public async canMoveToOrderLoginButtonEnabled(
    vendorId: number,
    leadId: number,
  ) {
    if (!vendorId || !leadId) {
      throw new Error("vendorId and leadId are required");
    }

    // 1️⃣ Fetch lead with documents
    const lead = await prisma.leadMaster.findFirst({
      where: {
        id: leadId,
        vendor_id: vendorId,
        is_deleted: false,
      },
      include: {
        documents: {
          where: { is_deleted: false },
          include: {
            documentType: true, // Type 11 (PPT) / Type 12 (PYTHA)
          },
        },
      },
    });

    if (!lead) {
      throw new Error("Lead not found");
    }

    const docs = lead.documents ?? [];
    const requiredCount = lead.no_of_client_documents_initially_submitted ?? 0;

    // =====================================================
    // ✅ STATUS-BASED CLASSIFICATION (IMPORTANT FIX)
    // =====================================================

    const approvedDocs = docs.filter((d) => d.tech_check_status === "APPROVED");

    // 🔥 FIX: ONLY PENDING / REVISED ARE BLOCKERS
    // ❌ NULL / UNDEFINED / REJECTED are NOT pending
    const pendingDocs = docs.filter(
      (d) =>
        d.tech_check_status === "PENDING" || d.tech_check_status === "REVISED",
    );

    const approvedPPT = approvedDocs.filter(
      (d) => d.documentType?.tag === "Type 11", // PPT
    ).length;

    const approvedPytha = approvedDocs.filter(
      (d) => d.documentType?.tag === "Type 12", // PYTHA
    ).length;

    // =====================================================
    // ❌ RULE 1 — Initial submission must be fully approved
    // =====================================================
    if (requiredCount && approvedDocs.length < requiredCount) {
      return {
        allowed: false,
        reason: `You must approve all initially submitted client documents (${requiredCount}) before moving to Order Login.`,
      };
    }

    // =====================================================
    // ❌ RULE 2 — At least one PPT must be approved
    // =====================================================
    if (approvedPPT === 0) {
      return {
        allowed: false,
        reason:
          "At least one PPT file must be approved before moving to Order Login.",
      };
    }

    // =====================================================
    // ❌ RULE 3 — At least one PYTHA must be approved
    // =====================================================
    if (approvedPytha === 0) {
      return {
        allowed: false,
        reason:
          "At least one Pytha file must be approved before moving to Order Login.",
      };
    }

    // =====================================================
    // ❌ RULE 4 — Any pending / revised doc blocks movement
    // =====================================================
    if (pendingDocs.length > 0) {
      return {
        allowed: false,
        reason:
          "You still have pending documents. Please review all before proceeding.",
      };
    }

    // =====================================================
    // ✅ ALL CONDITIONS SATISFIED
    // =====================================================
    return {
      allowed: true,
      reason: null,
    };
  }

  public async triggerOrderLoginEnabledNotification(
    vendorId: number,
    leadId: number,
    triggeredByUserId: number,
  ) {
    // 1️⃣ Eligibility check
    const eligibility = await this.canMoveToOrderLoginButtonEnabled(
      vendorId,
      leadId,
    );

    if (!eligibility.allowed) return;

    // 2️⃣ Fetch Order Login stage (Type 8)
    const orderLoginStage = await prisma.statusTypeMaster.findFirst({
      where: {
        vendor_id: vendorId,
        tag: "Type 8",
      },
      select: { id: true },
    });

    if (!orderLoginStage) return;

    // 3️⃣ Fetch lead (WITH status)
    const lead = await prisma.leadMaster.findFirst({
      where: { id: leadId, vendor_id: vendorId },
      select: {
        lead_code: true,
        firstname: true,
        lastname: true,
        status_id: true,
      },
    });

    if (!lead) return;

    // 🔒 HARD GUARD — ONLY TYPE 8
    if (lead.status_id !== orderLoginStage.id) {
      return;
    }

    // 4️⃣ Duplicate protection
    const alreadySent = await prisma.notification.findFirst({
      where: {
        vendor_id: vendorId,
        entity_type: "lead",
        entity_id: leadId,
        type: NotificationType.LEAD_ACTION,
        title: "Order Login Enabled",
      },
    });

    if (alreadySent) return;

    const leadCode =
      lead.lead_code ?? `LEAD-${String(leadId).padStart(4, "0")}`;

    const leadName = `${lead.firstname ?? ""} ${lead.lastname ?? ""}`.trim();

    // 5️⃣ Triggered-by user name
    const triggeredByUser = await prisma.userMaster.findFirst({
      where: { id: triggeredByUserId },
      select: { user_name: true },
    });

    const approvedBy = triggeredByUser?.user_name ?? "System";

    // 6️⃣ Target user (sales-executive)
    const mapping = await prisma.leadUserMapping.findFirst({
      where: {
        vendor_id: vendorId,
        lead_id: leadId,
        status: "active",
        user: {
          user_type: {
            user_type: {
              equals: "sales-executive",
              mode: "insensitive",
            },
          },
        },
      },
      select: {
        user: {
          select: {
            id: true,
            user_name: true,
            user_email: true,
          },
        },
      },
    });

    if (!mapping?.user) return;

    const targetUser = mapping.user;

    // 7️⃣ In-app notification
    await NotificationService.createAndSend({
      vendor_id: vendorId,
      user_id: targetUser.id,
      sender_id: triggeredByUserId,
      type: NotificationType.LEAD_ACTION,
      title: "Order Login Enabled",
      message: `${leadCode} - Order Login is now enabled`,
      entity_type: "lead",
      entity_id: leadId,
      redirect_url: `/dashboard/leads/details/${leadId}`,
    });

    // 8️⃣ Email
    if (targetUser.user_email) {
      await sendOrderLoginEnabledEmail({
        vendor_id: vendorId,
        toEmail: targetUser.user_email,
        toName: targetUser.user_name,
        leadCode,
        leadName,
        approvedBy,
        approvedAt: new Date().toLocaleString("en-IN"),
        projectUrl: `${process.env.CLIENT_BASE_URL}/dashboard/leads/details/${leadId}`,
      });
    }

    logger.info("ORDER LOGIN ENABLED NOTIFICATION SENT", {
      vendorId,
      leadId,
      approvedBy,
    });
  }

  public async getClientDocumentation(
    vendorId: number,
    leadId: number,
    userId: number,
  ) {
    if (!vendorId || !leadId) {
      throw new Error("vendorId and leadId are required");
    }

    const lead = await prisma.leadMaster.findFirst({
      where: {
        id: leadId,
        vendor_id: vendorId,
      },
      include: {
        documents: {
          include: {
            documentType: true,
          },
          where: {
            is_deleted: false,
          },
        },
      },
    });

    if (!lead) {
      throw new Error("Lead not found");
    }

    // -------- existing PPT / PYTHA logic --------
    const [pptDocType, pythaDocType] = await Promise.all([
      prisma.documentTypeMaster.findFirst({
        where: { vendor_id: vendorId, tag: "Type 11" },
      }),
      prisma.documentTypeMaster.findFirst({
        where: { vendor_id: vendorId, tag: "Type 12" },
      }),
    ]);

    const pptDocs = lead.documents.filter(
      (d) => d.doc_type_id === pptDocType?.id,
    );

    const pythaDocs = lead.documents.filter(
      (d) => d.doc_type_id === pythaDocType?.id,
    );

    const [pptDocsWithUrls, pythaDocsWithUrls] = await Promise.all([
      Promise.all(
        pptDocs.map(async (doc: any) => ({
          ...doc,
          signed_url: await generateSignedUrl(doc.doc_sys_name, 3600, "inline"),
        })),
      ),
      Promise.all(
        pythaDocs.map(async (doc: any) => ({
          ...doc,
          signed_url: await generateSignedUrl(doc.doc_sys_name, 3600, "inline"),
        })),
      ),
    ]);

    // 🔔 SAFE TRIGGER (read-through side effect)
    await this.triggerOrderLoginEnabledNotification(vendorId, leadId, userId);

    return {
      id: lead.id,
      vendor_id: lead.vendor_id,
      status_id: lead.status_id,
      documents: {
        ppt: pptDocsWithUrls,
        pytha: pythaDocsWithUrls,
      },
    };
  }

  public async getLeadsWithStatusClientDocumentation(
    vendorId: number,
    userId: number,
  ) {
    // 1. Resolve status ID dynamically for Type 6
    const clientDocStatus = await prisma.statusTypeMaster.findFirst({
      where: { vendor_id: vendorId, tag: "Type 6" },
      select: { id: true },
    });

    if (!clientDocStatus) {
      throw new Error(
        `Client Documentation status (Type 6) not found for vendor ${vendorId}`,
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
          status_id: clientDocStatus.id,
          activity_status: { in: ["onGoing", "lostApproval"] }, // ✅ allow both
        },
        include: this.defaultIncludes(),
        orderBy: { created_at: Prisma.SortOrder.desc },
      });
    }

    // ============= Non-Admin Flow =============
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
        status_id: clientDocStatus.id,
        activity_status: { in: ["onGoing", "lostApproval"] }, // ✅ allow both
      },
      include: this.defaultIncludes(),
      orderBy: { created_at: Prisma.SortOrder.desc },
    });
  }

  // ✅ Common include
  private defaultIncludes() {
    return {
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
        orderBy: { created_at: Prisma.SortOrder.desc }, // ✅ fixed typing
      },
    };
  }

  public async addMoreClientDocumentation(data: ClientDocumentationDto) {
    // ==================================================
    // 1️⃣ CORE DB TRANSACTION (UPLOAD + LOGS)
    // ==================================================

    const result = await prisma.$transaction(async (tx) => {
      const response: any = {
        documents: [],
        message: "Additional client documentation uploaded successfully",
      };

      for (const doc of data.documents) {
        const docType = await tx.documentTypeMaster.findFirst({
          where: { vendor_id: data.vendor_id, tag: doc.docTypeTag },
          select: { id: true },
        });

        if (!docType) {
          throw new Error(`Document type ${doc.docTypeTag} not configured`);
        }

        const docEntry = await tx.leadDocuments.create({
          data: {
            doc_og_name: doc.originalName,
            doc_sys_name: doc.sysName,
            created_by: data.created_by,
            doc_type_id: docType.id,
            account_id: data.account_id,
            lead_id: data.lead_id,
            vendor_id: data.vendor_id,
            tech_check_status: "REVISED",
          },
        });

        response.documents.push(docEntry);
      }

      const docCount = response.documents.length;
      const actionMessage = `${docCount} additional Client Documentation ${
        docCount > 1 ? "documents have" : "document has"
      } been uploaded successfully.`;

      const detailedLog = await tx.leadDetailedLogs.create({
        data: {
          vendor_id: data.vendor_id,
          lead_id: data.lead_id,
          account_id: data.account_id,
          action: actionMessage,
          action_type: "UPLOAD",
          created_by: data.created_by,
        },
      });

      await tx.leadDocumentLogs.createMany({
        data: response.documents.map((doc: any) => ({
          vendor_id: data.vendor_id,
          lead_id: data.lead_id,
          account_id: data.account_id,
          doc_id: doc.id,
          lead_logs_id: detailedLog.id,
          created_by: data.created_by,
        })),
      });

      return { ...response, docCount };
    });

    // ==================================================
    // 2️⃣ LEAD STAGE CHECK → ONLY TECH CHECK (TYPE 8)
    // ==================================================

    const lead = await prisma.leadMaster.findUnique({
      where: { id: data.lead_id },
      select: {
        id: true,
        lead_code: true,
        firstname: true,
        lastname: true,
        account_id: true,
        status_id: true,
      },
    });

    if (!lead) return result;

    const leadStatus = await prisma.statusTypeMaster.findUnique({
      where: { id: lead.status_id ?? 0 },
      select: { tag: true },
    });

    if (leadStatus?.tag !== "Type 8") {
      logger.info("ℹ️ Lead not in Tech Check stage. Notification skipped.", {
        lead_id: data.lead_id,
        stage: leadStatus?.tag,
      });
      return result;
    }

    // ==================================================
    // 3️⃣ GET USERS MAPPED TO LEAD
    // ==================================================

    const leadUserMappings = await prisma.leadUserMapping.findMany({
      where: {
        vendor_id: data.vendor_id,
        lead_id: data.lead_id,
        status: "active",
      },
      select: {
        user: {
          select: {
            id: true,
            user_name: true,
            user_email: true,
            status: true,
            user_type: {
              select: {
                user_type: true, // 👈 FROM UserTypeMaster
              },
            },
          },
        },
      },
    });

    // ==================================================
    // 4️⃣ FILTER ONLY TECH-CHECK ROLE USERS
    // ==================================================

    const techCheckUsers = leadUserMappings
      .map((m) => m.user)
      .filter(
        (u) =>
          u.status === "active" &&
          u.user_type.user_type.toLowerCase() === "tech-check",
      );

    if (!techCheckUsers.length) {
      logger.warn("⚠️ No Tech Check user found for lead", {
        lead_id: data.lead_id,
      });
      return result;
    }

    // ==================================================
    // 5️⃣ COMMON DATA FOR NOTIFICATION / EMAIL
    // ==================================================

    const leadCode =
      lead.lead_code ?? `LEAD-${String(lead.id).padStart(4, "0")}`;

    const leadName = `${lead.firstname} ${lead.lastname}`.trim();

    const uploadedBy = await prisma.userMaster.findUnique({
      where: { id: data.created_by },
      select: { user_name: true },
    });

    const uploadedAt = new Date().toLocaleString("en-IN", {
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

    const redirectPath = `/dashboard/leads/tech-check/${lead.id}`;

    const projectUrl = lead.account_id
      ? `${baseUrl}${redirectPath}?accountId=${lead.account_id}`
      : `${baseUrl}${redirectPath}`;

    // ==================================================
    // 6️⃣ SEND 🔔 IN-APP (ONCE) + 📧 EMAIL
    // ==================================================

    await Promise.allSettled(
      techCheckUsers.map(async (user) => {
        // ---------- IN-APP (DUPLICATE SAFE) ----------
        const alreadyNotified = await prisma.notification.findFirst({
          where: {
            vendor_id: data.vendor_id,
            user_id: user.id,
            entity_type: "lead",
            entity_id: lead.id,
            title: "Revised Documents Uploaded",
          },
        });

        if (!alreadyNotified) {
          await NotificationService.createAndSend({
            vendor_id: data.vendor_id,
            user_id: user.id,
            sender_id: data.created_by,
            type: NotificationType.LEAD_ACTION,
            title: "Revised Documents Uploaded",
            message: `Revised documents have been uploaded for ${leadCode} - ${leadName}. Please review and update your Tech Check decision.`,
            entity_type: "lead",
            entity_id: lead.id,
            redirect_url: redirectPath,
          });
        }

        // ---------- EMAIL ----------
        if (!user.user_email) return;

        await sendRevisedDocumentsUploadedEmail({
          vendor_id: data.vendor_id,
          toEmail: user.user_email,
          toName: user.user_name,
          leadCode,
          leadName,
          uploadedBy: uploadedBy?.user_name ?? "Sales Executive",
          uploadedAt,
          projectUrl,
        });
      }),
    );

    logger.info("🔔 Revised documents notification sent to Tech Check users", {
      lead_id: lead.id,
      recipients: techCheckUsers.length,
    });

    return result;
  }
}
