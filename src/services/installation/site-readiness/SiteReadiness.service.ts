import { UserLeadTask } from "./../../../../generated/prisma_client/browser";
import { NotificationType, Prisma } from "../../../prisma/generated";
import { prisma } from "../../../prisma/client";
import { generateSignedUrl } from "../../../utils/wasabiClient";
import logger from "../../../utils/logger";
import { NotificationService } from "../../../../src/services/notification/notification.service";
import { getFranchiseAdminRecipients } from "../../../../src/services/notification/adminRecipients.service";
import { sendLeadMovedToDispatchPlanningEmail } from "../../../../src/services/email/brevoEmail.service";
import { STAGE_PATH_BY_TAG } from "../../../../src/services/leadModuleServices/leadsGeneration/leadActivityStatus.service";
import { ensureLeadStatusLog } from "../../../utils/leadStatusLog";
import { LeadSuperAdminApprovalLockInService } from "../../leadSuperAdminApprovalLockIn/leadSuperAdminApprovalLockIn.service";
import { createTaskHistoryLog } from "../../task/taskHistory.service";

interface SiteReadinessPayload {
  account_id: number;
  type: string;
  remark?: string;
  value?: boolean;
  created_by: number;
}

export class SiteReadinessService {
  private static leadSuperAdminApprovalLockInService =
    new LeadSuperAdminApprovalLockInService();

  /** ✅ Fetch all leads with status = Type 12 (Site Readiness) */
  async getLeadsWithStatusSiteReadiness(
    vendorId: number,
    userId: number,
    limit = 10,
    page = 1,
  ) {
    const skip = (page - 1) * limit;

    // 🔹 Fetch Site Readiness Status (Type 12)
    const siteReadinessStatus = await prisma.statusTypeMaster.findFirst({
      where: { vendor_id: vendorId, tag: "Type 12" },
      select: { id: true },
    });

    if (!siteReadinessStatus) {
      throw new Error(
        `Site Readiness status (Type 12) not found for vendor ${vendorId}`,
      );
    }

    // 🔹 Identify user role
    const creator = await prisma.userMaster.findUnique({
      where: { id: userId },
      include: { user_type: true },
    });

    const isAdmin =
      creator?.user_type?.user_type?.toLowerCase() === "admin" ||
      creator?.user_type?.user_type?.toLowerCase() === "super-admin";

    const baseWhere: any = {
      vendor_id: vendorId,
      is_deleted: false,
      status_id: siteReadinessStatus.id,
      activity_status: { in: ["onGoing", "lostApproval"] },
    };

    // 🔹 Admin → all leads
    if (isAdmin) {
      const [total, leads] = await Promise.all([
        prisma.leadMaster.count({ where: baseWhere }),
        prisma.leadMaster.findMany({
          where: baseWhere,
          include: this.defaultIncludes(),
          orderBy: { created_at: "desc" },
          skip,
          take: limit,
        }),
      ]);
      return { total, leads };
    }

    // 🔹 Non-admin: mapped + task leads
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

    const leadIds = [
      ...new Set([
        ...mappedLeads.map((m) => m.lead_id),
        ...taskLeads.map((t) => t.lead_id),
      ]),
    ];

    if (!leadIds.length) return { total: 0, leads: [] };

    const where = { ...baseWhere, id: { in: leadIds } };

    const [total, leads] = await Promise.all([
      prisma.leadMaster.count({ where }),
      prisma.leadMaster.findMany({
        where,
        include: this.defaultIncludes(),
        orderBy: { created_at: "desc" },
        skip,
        take: limit,
      }),
    ]);

    return { total, leads };
  }

  /** 🔹 Common include for Site Readiness */
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
    };
  }

  /**
   * ✅ Create one or multiple Site Readiness entries
   */
  static async createSiteReadiness(
    vendorId: number,
    leadId: number,
    payload: any,
  ) {
    const entries = Array.isArray(payload) ? payload : [payload];

    const dataToInsert = entries.map((item) => ({
      vendor_id: vendorId,
      lead_id: leadId,
      account_id: item.account_id,
      type: item.type,
      remark: item.remark || null,
      value: item.value ?? null,
      created_by: item.created_by,
    }));

    const result = await prisma.siteReadiness.createMany({
      data: dataToInsert,
      skipDuplicates: true,
    });

    return {
      insertedCount: result.count,
      records: dataToInsert,
    };
  }

  /**
   * ✅ Fetch all Site Readiness records (optionally filter by lead/account)
   */
  static async getSiteReadinessRecords(
    vendorId: number,
    leadId?: number,
    accountId?: number,
  ) {
    const where: any = { vendor_id: vendorId };

    if (leadId) where.lead_id = leadId;
    if (accountId) where.account_id = accountId;

    const records = await prisma.siteReadiness.findMany({
      where,
      include: {
        lead: {
          select: {
            id: true,
            lead_code: true,
            firstname: true,
            lastname: true,
            contact_no: true,
          },
        },
        account: {
          select: { id: true, name: true, contact_no: true, email: true },
        },
        createdBy: {
          select: { id: true, user_name: true },
        },
      },
      orderBy: { created_at: "desc" },
    });

    return {
      count: records.length,
      records,
    };
  }

  /**
   * ✅ Update one or multiple Site Readiness entries
   */
  static async updateSiteReadiness(
    vendorId: number,
    leadId: number,
    payload: any,
  ) {
    const entries = Array.isArray(payload) ? payload : [payload];
    const updatedRecords: any[] = [];

    for (const item of entries) {
      if (!item.id) {
        throw new Error(
          "Each SiteReadiness record must include an 'id' field to update.",
        );
      }

      const updated = await prisma.siteReadiness.update({
        where: { id: item.id },
        data: {
          remark: item.remark ?? undefined,
          value: item.value ?? undefined,
          type: item.type ?? undefined,
          updated_by: item.updated_by ?? null,
          updated_at: new Date(),
        },
      });

      updatedRecords.push(updated);
    }

    return {
      updatedCount: updatedRecords.length,
      records: updatedRecords,
    };
  }

  // ✅ Upload Current Site Photos at Site Readiness
  async uploadCurrentSitePhotosAtSiteReadiness(
    vendorId: number,
    leadId: number,
    accountId: number | null,
    userId: number,
    files: { originalName: string; sysName: string }[],
  ) {
    if (!vendorId || !leadId || !userId)
      throw Object.assign(
        new Error("vendorId, leadId and userId are required"),
        { statusCode: 400 },
      );

    // 🔹 Get DocType for Current Site Photos (Type 19)
    const sitePhotoDocType = await prisma.documentTypeMaster.findFirst({
      where: { vendor_id: vendorId, tag: "Type 19" },
    });

    if (!sitePhotoDocType)
      throw Object.assign(
        new Error("Document type (Type 19) not found for this vendor"),
        { statusCode: 404 },
      );

    const uploadedDocs = [];

    // 🔹 Iterate through each uploaded file
    for (const file of files) {
      // 🔹 Save in DB
      const doc = await prisma.leadDocuments.create({
        data: {
          doc_og_name: file.originalName,
          doc_sys_name: file.sysName,
          vendor_id: vendorId,
          lead_id: leadId,
          account_id: accountId,
          created_by: userId,
          doc_type_id: sitePhotoDocType.id, // Type 19 → Current Site Photos (Site Readiness)
        },
      });

      uploadedDocs.push(doc);
    }

    return uploadedDocs;
  }

  // ✅ Get Current Site Photos at Site Readiness
  async getCurrentSitePhotosAtSiteReadiness(vendorId: number, leadId: number) {
    if (!vendorId || !leadId)
      throw Object.assign(new Error("vendorId and leadId are required"), {
        statusCode: 400,
      });

    // 🔹 Get DocType for Current Site Photos (Type 19)
    const sitePhotoDocType = await prisma.documentTypeMaster.findFirst({
      where: { vendor_id: vendorId, tag: "Type 19" },
    });

    if (!sitePhotoDocType)
      throw Object.assign(
        new Error("Document type (Type 19) not found for this vendor"),
        { statusCode: 404 },
      );

    // 🔹 Fetch all uploaded Current Site Photos for this lead
    const documents = await prisma.leadDocuments.findMany({
      where: {
        vendor_id: vendorId,
        lead_id: leadId,
        doc_type_id: sitePhotoDocType.id,
        is_deleted: false,
      },
      orderBy: { created_at: "desc" },
    });

    // 🔹 Attach signed URLs from Wasabi
    const docsWithUrls = await Promise.all(
      documents.map(async (doc) => {
        const signed_url = await generateSignedUrl(doc.doc_sys_name);
        return { ...doc, signed_url };
      }),
    );

    return docsWithUrls;
  }

  /**
   * ✅ Check if Site Readiness is completed for a given lead
   * Conditions:
   *  1. At least one Current Site Photo exists (doc_type = "Type 19")
   *  2. All 6 site readiness items are present in SiteReadiness table
   */
  async checkSiteReadinessCompletion(vendorId: number, leadId: number) {
    if (!vendorId || !leadId) {
      throw Object.assign(new Error("vendorId and leadId are required"), {
        statusCode: 400,
      });
    }

    // 🔹 1. Get DocumentTypeMaster for Current Site Photos (Type 19)
    const sitePhotoDocType = await prisma.documentTypeMaster.findFirst({
      where: { vendor_id: vendorId, tag: "Type 19" },
      select: { id: true },
    });

    if (!sitePhotoDocType) {
      throw Object.assign(
        new Error("Document type (Type 19) not found for this vendor"),
        { statusCode: 404 },
      );
    }

    // 🔹 2. Check for at least one Current Site Photo
    const sitePhotos = await prisma.leadDocuments.count({
      where: {
        vendor_id: vendorId,
        lead_id: leadId,
        doc_type_id: sitePhotoDocType.id,
        is_deleted: false,
      },
    });

    const hasPhoto = sitePhotos > 0;

    // 🔹 3. Fetch all 6 site readiness rows
    const readinessRows = await prisma.siteReadiness.findMany({
      where: {
        vendor_id: vendorId,
        lead_id: leadId,
      },
      select: {
        id: true,
        type: true,
        value: true, // <--- we need this
      },
    });

    const totalItems = readinessRows.length;

    // 🔹 All 6 items must exist
    const hasSixRows = totalItems === 6;

    // 🔹 All 6 items must have value === true
    const allValuesPresent =
      hasSixRows &&
      readinessRows.every(
        (item) => item.value !== null && item.value !== undefined,
      );

    // 🔹 Final flag (photo + 6 items + all true)
    const isCompleted = hasPhoto && allValuesPresent;

    return {
      vendor_id: vendorId,
      lead_id: leadId,
      has_photo: hasPhoto,
      has_all_items: allValuesPresent,
      is_site_readiness_completed: isCompleted,
      readiness_items: readinessRows, // optional: helpful for UI
    };
  }

  /**
   * ✅ Fetch assigned Site Supervisor for a lead
   */
  async getAssignedSiteSupervisor(vendorId: number, leadId: number) {
    if (!vendorId || !leadId) {
      throw Object.assign(new Error("vendorId and leadId are required"), {
        statusCode: 400,
      });
    }

    const mapping = await prisma.leadSiteSupervisorMapping.findFirst({
      where: {
        vendor_id: vendorId,
        lead_id: leadId,
        status: "active",
      },
      include: {
        supervisor: {
          select: {
            id: true,
            user_name: true,
            user_contact: true,
            user_email: true,
            user_timezone: true,
            status: true,
          },
        },
      },
    });

    return mapping;
  }

  /**
   * ✅ Move Lead to Dispatch Planning Stage (Type 13)
   */
  static async moveLeadToDispatchPlanning(
    vendorId: number,
    leadId: number,
    updatedBy: number,
    baseUrl: string,
  ) {
    console.log("[SiteReadiness] moveLeadToDispatchPlanning:start", {
      vendorId,
      leadId,
      updatedBy,
    });
    const result = prisma.$transaction(async (tx) => {
      // 1️⃣ Validate lead
      const lead = await tx.leadMaster.findUnique({
        where: { id: leadId },
        select: { id: true, vendor_id: true, account_id: true },
      });

      if (!lead) throw new Error(`Lead ${leadId} not found`);
      if (lead.vendor_id !== vendorId)
        throw new Error(`Lead does not belong to vendor ${vendorId}`);
      console.log("[SiteReadiness] lead validated", {
        lead_id: lead.id,
        vendor_id: lead.vendor_id,
      });

      // 2️⃣ Fetch Dispatch Planning StatusType (Type 13)
      const toStatus = await tx.statusTypeMaster.findFirst({
        where: { vendor_id: vendorId, tag: "Type 13" },
        select: { id: true, type: true },
      });

      if (!toStatus)
        throw new Error(
          `Status 'Type 13' (Dispatch Planning Stage) not found for vendor ${vendorId}`,
        );
      console.log("[SiteReadiness] dispatch planning status fetched", {
        status_id: toStatus.id,
        status_type: toStatus.type,
      });

      const vendor = await tx.vendorMaster.findUnique({
        where: { id: vendorId },
        select: { IsAccountLocInEnabled: true },
      });
      const isAccountLocInEnabled = vendor?.IsAccountLocInEnabled === true;

      // 3️⃣ Complete "Site Readiness" Task (if exists)
      const siteReadinessTask = await tx.userLeadTask.findFirst({
        where: {
          vendor_id: vendorId,
          lead_id: leadId,
          task_type: "Site Readiness",
          status: { not: "completed" }, // avoid re-updating
        },
        select: { id: true },
      });

      if (siteReadinessTask) {
        const updatedTask = await tx.userLeadTask.update({
          where: { id: siteReadinessTask.id },
          data: {
            status: "completed",
            closed_by: updatedBy,
            closed_at: new Date(),
            updated_by: updatedBy,
          },
        });

        await createTaskHistoryLog({
          db: tx,
          task: {
            ...updatedTask,
            vendor_id: vendorId,
            lead_id: leadId,
            account_id: lead.account_id!,
            task_type: "Site Readiness",
          },
          createdBy: updatedBy,
          actionType: "UPDATE",
        });

        logger.info("[SERVICE] Site Readiness task marked completed", {
          task_id: siteReadinessTask.id,
          lead_id: leadId,
        });
        console.log("[SiteReadiness] site readiness task completed", {
          task_id: siteReadinessTask.id,
          lead_id: leadId,
        });
      } else {
        console.log("[SiteReadiness] no site readiness task to complete", {
          lead_id: leadId,
        });
      }

      // 4️⃣ Add Detailed Log Entry
      const actionMessage = `Site readiness task is been completed and lead moved to Dispatch Planning.`;

      await tx.leadDetailedLogs.create({
        data: {
          vendor_id: vendorId,
          lead_id: lead.id,
          account_id: lead.account_id!,
          action: actionMessage,
          action_type: "UPDATE",
          created_by: updatedBy,
          created_at: new Date(),
        },
      });

      // 4️⃣ Actually move lead to Dispatch Planning (UPDATE STATUS)
      await tx.leadMaster.update({
        where: { id: leadId },
        data: {
          status_id: toStatus.id, // 🔥 THIS IS THE REAL STAGE CHANGE
          updated_by: updatedBy,
          updated_at: new Date(),
        },
      });

      await ensureLeadStatusLog(tx, {
        vendorId,
        leadId: lead.id,
        accountId: lead.account_id,
        statusId: toStatus.id,
        createdBy: updatedBy,
      });

      if (isAccountLocInEnabled) {
        await SiteReadinessService.leadSuperAdminApprovalLockInService.createDispatchPlanningLockIn(
          {
            vendor_id: vendorId,
            lead_id: lead.id,
            created_by: updatedBy,
            clientBaseUrl: baseUrl,
          },
          tx,
        );
      }

      logger.info("[SERVICE] Lead moved to Dispatch Planning", {
        lead_id: lead.id,
        vendor_id: vendorId,
        updated_by: updatedBy,
      });
      console.log("[SiteReadiness] lead status updated to dispatch planning", {
        lead_id: lead.id,
        vendor_id: vendorId,
        status_id: toStatus.id,
      });

      return {
        lead_id: lead.id,
        vendor_id: vendorId,
        new_status: toStatus.type,
      };
    });

    // ===============================
    // DISPATCH PLANNING STAGE → NOTIFICATION + EMAIL
    // ===============================

    try {
      const actorId = updatedBy;

      const [lead, actor, firstInstance] = await Promise.all([
        prisma.leadMaster.findUnique({
          where: { id: leadId },
          select: {
            firstname: true,
            lastname: true,
            lead_code: true,
            vendor_id: true,
            account_id: true,
            franchise_id: true,
          },
        }),
        prisma.userMaster.findUnique({
          where: { id: actorId },
          select: { user_name: true },
        }),
        prisma.leadProductStructureInstance.findFirst({
          where: { lead_id: leadId, vendor_id: vendorId },
          select: { id: true },
          orderBy: [{ product_structure_id: "asc" }, { quantity_index: "asc" }],
        }),
      ]);

      if (!lead) return result;

      const leadName = `${lead.firstname ?? ""} ${lead.lastname ?? ""}`.trim();
      const leadCode = lead.lead_code ?? `LEAD-${String(leadId).padStart(4, "0")}`;
      const movedBy = actor?.user_name ?? "System";
      const movedAt = new Date().toLocaleString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
      const franchiseId = lead.franchise_id ?? null;

      // Build redirect URL using STAGE_PATH_BY_TAG["Type 13"] + instance_id
      const dpBase = `${STAGE_PATH_BY_TAG["Type 13"]}/${leadId}`;
      const dpParams = new URLSearchParams();
      if (lead.account_id) dpParams.set("accountId", String(lead.account_id));
      if (firstInstance?.id) dpParams.set("instance_id", String(firstInstance.id));
      const dpQs = dpParams.toString();
      const redirectPath = dpQs ? `${dpBase}?${dpQs}` : dpBase;
      const projectUrl = `${baseUrl}${redirectPath}`;

      // Fetch admins (franchise-filtered, no super-admin)
      const admins = await getFranchiseAdminRecipients({
        vendorId: lead.vendor_id,
        franchiseId,
        excludeUserId: actorId,
      });

      // Fetch sales executives from lead user mapping
      const leadMappings = await prisma.leadUserMapping.findMany({
        where: { vendor_id: vendorId, lead_id: leadId, status: "active" },
        select: { user_id: true },
      });

      const salesExecRole = await prisma.userTypeMaster.findFirst({
        where: { user_type: { equals: "sales-executive", mode: "insensitive" } },
        select: { id: true },
      });

      const salesExecs = salesExecRole
        ? await prisma.userMaster.findMany({
            where: {
              id: { in: leadMappings.map((m) => m.user_id) },
              vendor_id: lead.vendor_id,
              status: "active",
              user_type_id: salesExecRole.id,
            },
            select: { id: true, user_name: true, user_email: true },
          })
        : [];

      // Deduplicate recipients
      const recipientMap = new Map<number, { id: number; user_name: string | null; user_email: string | null }>();
      for (const u of [...admins, ...salesExecs]) {
        if (u.id !== actorId) recipientMap.set(u.id, u);
      }
      const recipients = Array.from(recipientMap.values());

      // Send in-app + email to all recipients
      await Promise.allSettled(
        recipients.map(async (user) => {
          await NotificationService.createAndSend({
            vendor_id: lead.vendor_id,
            user_id: user.id,
            sender_id: actorId,
            type: NotificationType.LEAD_MILESTONE,
            title: "Dispatch Planning Started",
            message: `${leadCode} - ${leadName} moved to Dispatch Planning stage.`,
            entity_type: "lead",
            entity_id: leadId,
            redirect_url: redirectPath,
          });

          if (!user.user_email) return;

          await sendLeadMovedToDispatchPlanningEmail({
            vendor_id: lead.vendor_id,
            toEmail: user.user_email,
            toName: user.user_name ?? undefined,
            leadCode,
            leadName,
            movedBy,
            movedAt,
            projectUrl,
          });
        }),
      );

      logger.info("✅ Dispatch Planning notifications sent", {
        vendor_id: lead.vendor_id,
        lead_id: leadId,
        recipients: recipients.length,
      });
    } catch (dispatchNotifyErr: any) {
      logger.warn("⚠️ Dispatch Planning notification failed", {
        lead_id: leadId,
        error: dispatchNotifyErr?.message,
      });
    }

    return result;
  }
}
