import { prisma } from "../../../prisma/client";
import { NotificationType, Prisma } from "../../../prisma/generated";
import { generateSignedUrl } from "../../../utils/wasabiClient";
import logger from "../../../utils/logger";
import { sendProjectCompletedEmail } from "../../../../src/services/email/brevoEmail.service";
import { NotificationService } from "../../../../src/services/notification/notification.service";
import { STAGE_PATH_BY_TAG } from "../../../../src/services/leadModuleServices/leadsGeneration/leadActivityStatus.service";
import { ensureLeadStatusLog } from "../../../utils/leadStatusLog";

export class FinalHandoverStageService {
  private formatDateTimeInIndia(date: Date) {
    return new Intl.DateTimeFormat("en-IN", {
      timeZone: "Asia/Kolkata",
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  }

  /**
   * ✅ Fetch all leads with status = Type 16 (Final Handover Stage)
   */
  async getLeadsWithStatusFinalHandoverStage(
    vendorId: number,
    userId: number,
    limit = 10,
    page = 1,
  ) {
    const skip = (page - 1) * limit;

    // 🔹 Fetch Final Handover Stage Status (Type 16)
    const finalHandoverStatus = await prisma.statusTypeMaster.findFirst({
      where: { vendor_id: vendorId, tag: "Type 16" },
      select: { id: true },
    });

    if (!finalHandoverStatus) {
      throw new Error(
        `Final Handover Stage status (Type 16) not found for vendor ${vendorId}`,
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
      status_id: finalHandoverStatus.id,
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

    // 🔹 Non-admin → mapped + task leads
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

  /** Default relations */
  /** 🔹 Common include for Post-Dispatch Stage */
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

  async uploadFinalHandoverDocuments(
    vendorId: number,
    leadId: number,
    accountId: number,
    userId: number,
    files: {
      final_site_photos?: { originalName: string; sysName: string }[];
      warranty_card_photo?: { originalName: string; sysName: string }[];
      handover_booklet_photo?: { originalName: string; sysName: string }[];
      final_handover_form_photo?: { originalName: string; sysName: string }[];
      qc_document?: { originalName: string; sysName: string }[];
    },
  ) {
    const uploadedDocs: any[] = [];

    // Get doc types
    const docTypes = await prisma.documentTypeMaster.findMany({
      where: {
        vendor_id: vendorId,
        tag: { in: ["Type 27", "Type 28", "Type 29", "Type 30", "Type 31"] },
      },
    });

    const getDocTypeId = (tag: string) => {
      const type = docTypes.find((d) => d.tag === tag);
      if (!type) {
        throw new Error(
          `Document Type ${tag} not found for vendor ${vendorId}`,
        );
      }
      return type.id;
    };

    /** ------------------------------------------------------
     * 1. Final Site Photos (multiple)
     * ------------------------------------------------------ */
    if (files.final_site_photos) {
      for (const file of files.final_site_photos) {
        const saved = await prisma.leadDocuments.create({
          data: {
            vendor_id: vendorId,
            account_id: accountId,
            lead_id: leadId,
            created_by: userId,
            doc_og_name: file.originalName,
            doc_sys_name: file.sysName,
            doc_type_id: getDocTypeId("Type 27"),
          },
        });

        uploadedDocs.push(saved);
      }
    }

    /** ------------------------------------------------------
     * 2. Warranty Card
     * ------------------------------------------------------ */
    if (files.warranty_card_photo) {
      for (const file of files.warranty_card_photo) {
        const saved = await prisma.leadDocuments.create({
          data: {
            vendor_id: vendorId,
            account_id: accountId,
            lead_id: leadId,
            created_by: userId,
            doc_og_name: file.originalName,
            doc_sys_name: file.sysName,
            doc_type_id: getDocTypeId("Type 28"),
          },
        });

        uploadedDocs.push(saved);
      }
    }

    /** ------------------------------------------------------
     * 3. Handover Booklet Photo
     * ------------------------------------------------------ */
    if (files.handover_booklet_photo) {
      for (const file of files.handover_booklet_photo) {
        const saved = await prisma.leadDocuments.create({
          data: {
            vendor_id: vendorId,
            account_id: accountId,
            lead_id: leadId,
            created_by: userId,
            doc_og_name: file.originalName,
            doc_sys_name: file.sysName,
            doc_type_id: getDocTypeId("Type 29"),
          },
        });

        uploadedDocs.push(saved);
      }
    }

    /** ------------------------------------------------------
     * 4. Final Handover Form Photo
     * ------------------------------------------------------ */
    if (files.final_handover_form_photo) {
      for (const file of files.final_handover_form_photo) {
        const saved = await prisma.leadDocuments.create({
          data: {
            vendor_id: vendorId,
            account_id: accountId,
            lead_id: leadId,
            created_by: userId,
            doc_og_name: file.originalName,
            doc_sys_name: file.sysName,
            doc_type_id: getDocTypeId("Type 30"),
          },
        });

        uploadedDocs.push(saved);
      }
    }

    /** ------------------------------------------------------
     * 5. QC Documents
     * ------------------------------------------------------ */
    if (files.qc_document) {
      for (const file of files.qc_document) {
        const saved = await prisma.leadDocuments.create({
          data: {
            vendor_id: vendorId,
            account_id: accountId,
            lead_id: leadId,
            created_by: userId,
            doc_og_name: file.originalName,
            doc_sys_name: file.sysName,
            doc_type_id: getDocTypeId("Type 31"),
          },
        });

        uploadedDocs.push(saved);
      }
    }

    return uploadedDocs;
  }

  async getFinalHandoverDocuments(vendorId: number, leadId: number) {
    if (!vendorId || !leadId)
      throw Object.assign(new Error("vendorId and leadId are required"), {
        statusCode: 400,
      });

    // 🔹 Fetch all relevant final-handover document types
    const docTypes = await prisma.documentTypeMaster.findMany({
      where: {
        vendor_id: vendorId,
        tag: { in: ["Type 27", "Type 28", "Type 29", "Type 30", "Type 31"] },
      },
    });

    if (!docTypes.length)
      throw Object.assign(
        new Error("Final Handover document types not found for vendor"),
        { statusCode: 404 },
      );

    const docTypeIds = docTypes.map((d) => d.id);

    // 🔹 Fetch matching documents
    const docs = await prisma.leadDocuments.findMany({
      where: {
        vendor_id: vendorId,
        lead_id: leadId,
        doc_type_id: { in: docTypeIds },
        is_deleted: false,
      },
      orderBy: { created_at: "desc" },
    });

    // 🔹 Generate signed url for each document
    const documentsWithUrls = await Promise.all(
      docs.map(async (doc) => {
        const signed_url = await generateSignedUrl(
          doc.doc_sys_name,
          3600,
          "inline",
        );

        return {
          ...doc,
          signed_url,
          doc_type_tag: docTypes.find((d) => d.id === doc.doc_type_id)?.tag,
        };
      }),
    );

    return documentsWithUrls;
  }

  async getFinalHandoverReadyStatus(vendorId: number, leadId: number) {
    if (!vendorId || !leadId)
      throw Object.assign(new Error("vendorId and leadId are required"), {
        statusCode: 400,
      });

    const lead = await prisma.leadMaster.findFirst({
      where: {
        id: leadId,
        vendor_id: vendorId,
        is_deleted: false,
      },
      select: {
        is_amc_opted: true,
      },
    });

    if (!lead) {
      throw Object.assign(new Error("Lead not found"), { statusCode: 404 });
    }

    // 🔹 Required final handover document types
    const requiredTags = [
      "Type 27",
      "Type 28",
      "Type 29",
      "Type 30",
      "Type 31",
    ];

    if (lead.is_amc_opted) {
      requiredTags.push("Type 39");
    }

    // 1️⃣ Fetch document type ids
    const docTypes = await prisma.documentTypeMaster.findMany({
      where: { vendor_id: vendorId, tag: { in: requiredTags } },
      select: { id: true, tag: true },
    });

    if (docTypes.length !== requiredTags.length) {
      return {
        docs_complete: false,
        pending_tasks_clear: false,
        can_move_to_final_handover: false,
        requires_amc_documents: lead.is_amc_opted,
      };
    }

    const docTypeIds = docTypes.map((d) => d.id);

    // 2️⃣ Fetch all documents for this lead
    const docs = await prisma.leadDocuments.findMany({
      where: {
        vendor_id: vendorId,
        lead_id: leadId,
        doc_type_id: { in: docTypeIds },
        is_deleted: false,
      },
    });

    // Group documents by doc_type_id
    const docCountByType: Record<number, number> = {};
    docs.forEach((doc) => {
      docCountByType[doc.doc_type_id] =
        (docCountByType[doc.doc_type_id] || 0) + 1;
    });

    // 3️⃣ Check if each required doc type has at least one file
    const docs_complete = docTypes.every((dt) => docCountByType[dt.id] > 0);

    // 4️⃣ Check pending work tasks status
    const pendingTasks = await prisma.userLeadTask.findMany({
      where: {
        vendor_id: vendorId,
        lead_id: leadId,
        task_type: "Pending Work",
      },
      select: { status: true },
    });

    const pending_tasks_clear = pendingTasks.every((t) =>
      ["completed", "cancelled"].includes(t.status),
    );

    return {
      docs_complete,
      pending_tasks_clear,
      can_move_to_final_handover: docs_complete && pending_tasks_clear,
      requires_amc_documents: lead.is_amc_opted,
    };
  }

  async isTotalProjectAmountPaid(vendorId: number, leadId: number) {
    if (!vendorId || !leadId) {
      throw Object.assign(new Error("vendorId and leadId are required"), {
        statusCode: 400,
      });
    }

    const lead = await prisma.leadMaster.findFirst({
      where: { id: leadId, vendor_id: vendorId, is_deleted: false },
      select: { pending_amount: true, total_project_amount: true },
    });

    if (!lead) {
      throw Object.assign(new Error("Lead not found"), { statusCode: 404 });
    }

    const totalProjectAmount = lead.total_project_amount;
    if (totalProjectAmount === null || totalProjectAmount === undefined) {
      throw Object.assign(new Error("total_project_amount must be provided"), {
        statusCode: 400,
      });
    }

    if (totalProjectAmount <= 0) {
      throw Object.assign(
        new Error("total_project_amount must be a positive number"),
        { statusCode: 400 },
      );
    }

    const pendingAmount = lead.pending_amount;
    const isPaid =
      pendingAmount !== null && pendingAmount !== undefined
        ? pendingAmount === 0
        : false;

    return {
      is_paid: isPaid,
      pending_amount: pendingAmount ?? 0,
      total_project_amount: totalProjectAmount,
    };
  }

  async updateAmcOptedStatus(
    vendorId: number,
    leadId: number,
    updatedBy: number,
    isAmcOpted: boolean,
  ) {
    if (!vendorId || !leadId || !updatedBy) {
      throw Object.assign(
        new Error("vendorId, leadId, updatedBy, and isAmcOpted are required"),
        { statusCode: 400 },
      );
    }

    const [lead, user] = await Promise.all([
      prisma.leadMaster.findFirst({
        where: {
          id: leadId,
          vendor_id: vendorId,
          is_deleted: false,
        },
        select: {
          id: true,
          account_id: true,
          is_amc_opted: true,
          amc_opted_at: true,
        },
      }),
      prisma.userMaster.findFirst({
        where: {
          id: updatedBy,
          vendor_id: vendorId,
          status: "active",
        },
        select: {
          id: true,
          user_name: true,
          user_type: {
            select: {
              user_type: true,
            },
          },
        },
      }),
    ]);

    if (!lead) {
      throw Object.assign(new Error("Lead not found"), { statusCode: 404 });
    }

    if (!user) {
      throw Object.assign(new Error("User not found"), { statusCode: 404 });
    }

    const role = user.user_type?.user_type?.toLowerCase() ?? "";
    const canSetTrue = ["site-supervisor", "admin", "super-admin"].includes(
      role,
    );
    const canSetFalse = ["admin", "super-admin"].includes(role);

    if (isAmcOpted && !canSetTrue) {
      throw Object.assign(
        new Error(
          "Only site-supervisor, admin, or super-admin can mark AMC as opted",
        ),
        { statusCode: 403 },
      );
    }

    if (!isAmcOpted && !canSetFalse) {
      throw Object.assign(
        new Error("Only admin or super-admin can unmark AMC opted status"),
        { statusCode: 403 },
      );
    }

    if (lead.is_amc_opted === isAmcOpted) {
      return {
        id: lead.id,
        is_amc_opted: lead.is_amc_opted,
        amc_opted_at: lead.amc_opted_at,
      };
    }

    const amcOptedAt = isAmcOpted ? new Date() : null;

    const updatedLead = await prisma.leadMaster.update({
      where: { id: leadId },
      data: {
        is_amc_opted: isAmcOpted,
        amc_opted_at: amcOptedAt,
        updated_by: updatedBy,
        updated_at: new Date(),
      },
      select: {
        id: true,
        is_amc_opted: true,
        amc_opted_at: true,
      },
    });

    await prisma.leadDetailedLogs.create({
      data: {
        vendor_id: vendorId,
        lead_id: leadId,
        account_id: lead.account_id!,
        action: isAmcOpted
          ? `AMC opted in marked as Yes on ${this.formatDateTimeInIndia(amcOptedAt!)}.`
          : "AMC opted in marked as No and AMC date/time cleared.",
        action_type: "UPDATE",
        created_by: updatedBy,
        created_at: new Date(),
      },
    });

    return updatedLead;
  }

  /**
   * ✅ Move Lead to Project Completed Stage (Type 17)
   */
  static async moveLeadToProjectCompleted(
    vendorId: number,
    leadId: number,
    updatedBy: number,
    baseUrl: string
  ) {
    // ==================================================
    // 1️⃣ CORE TRANSACTION LAYER (ONLY DB OPERATIONS)
    // ==================================================

    const result = await prisma.$transaction(async (tx) => {
      // 1. Validate Lead
      const lead = await tx.leadMaster.findUnique({
        where: { id: leadId },
        select: {
          id: true,
          vendor_id: true,
          account_id: true,
          franchise_id: true,
          lead_code: true,
          firstname: true,
          lastname: true,
        },
      });

      if (!lead) throw new Error("Lead not found");
      if (lead.vendor_id !== vendorId) throw new Error("Vendor mismatch");

      // 2. Fetch Project Completed Status (Type 17)
      const status = await tx.statusTypeMaster.findFirst({
        where: {
          vendor_id: vendorId,
          tag: "Type 17",
        },
        select: { id: true, type: true },
      });

      if (!status) {
        throw new Error("Project Completed status not configured");
      }

      const siteSupervisorMapping = await tx.leadUserMapping.findFirst({
        where: {
          vendor_id: vendorId,
          lead_id: leadId,
          type: "site-supervisor",
          status: "active",
        },
        select: {
          user_id: true,
        },
      });

      if (!siteSupervisorMapping) {
        throw new Error("Active site supervisor is not assigned to this lead");
      }

      const freeServiceSchedules = await tx.leadServiceSchedule.findMany({
        where: {
          vendor_id: vendorId,
          lead_id: leadId,
          service_type: "free",
          service_no: { in: [1, 2, 3] },
        },
        select: {
          service_no: true,
          scheduled_for: true,
        },
        orderBy: {
          service_no: "asc",
        },
      });

      if (freeServiceSchedules.length < 3) {
        throw new Error(
          "Free service schedule is not ready. Complete usable handover first.",
        );
      }

      // 3. Update Lead Status
      await tx.leadMaster.update({
        where: { id: leadId },
        data: {
          status_id: status.id,
          final_handover_marked_at: new Date(),
          updated_by: updatedBy,
          updated_at: new Date(),
        },
      });

      await ensureLeadStatusLog(tx, {
        vendorId,
        leadId,
        accountId: lead.account_id,
        statusId: status.id,
        createdBy: updatedBy,
      });

      const taskTypeByServiceNo: Record<number, string> = {
        1: "1st Servicing",
        2: "2nd Servicing",
        3: "3rd Servicing",
      };

      for (const service of freeServiceSchedules) {
        const taskType = taskTypeByServiceNo[service.service_no];
        if (!taskType) continue;

        const existingTask = await tx.userLeadTask.findFirst({
          where: {
            vendor_id: vendorId,
            lead_id: leadId,
            user_id: siteSupervisorMapping.user_id,
            task_type: taskType,
            due_date: service.scheduled_for,
          },
          select: { id: true },
        });

        if (!existingTask) {
          await tx.userLeadTask.create({
            data: {
              vendor_id: vendorId,
              lead_id: leadId,
              account_id: lead.account_id!,
              franchise_id: lead.franchise_id ?? null,
              user_id: siteSupervisorMapping.user_id,
              task_type: taskType,
              lead_stage: "servicing-stage",
              due_date: service.scheduled_for,
              remark: null,
              status: "open",
              created_by: updatedBy,
            },
          });
        }
      }

      // 4. Insert Audit Log
      const actionMessage = `Lead moved to Project Completed Stage.`;

      await tx.leadDetailedLogs.create({
        data: {
          vendor_id: vendorId,
          lead_id: leadId,
          account_id: lead.account_id!,
          action: actionMessage,
          action_type: "UPDATE",
          created_by: updatedBy,
          created_at: new Date(),
        },
      });

      logger.info("✅ Project Completed DB update done", {
        lead_id: leadId,
        vendor_id: vendorId,
      });

      return {
        leadId,
        accountId: lead.account_id,
        leadCode: lead.lead_code ?? `LEAD-${String(leadId).padStart(4, "0")}`,
        leadName: `${lead.firstname ?? ""} ${lead.lastname ?? ""}`.trim(),
      };
    });

    // ==================================================
    // 2️⃣ NOTIFICATION + EMAIL LAYER (SIDE EFFECTS)
    // ==================================================

    try {
      const [leadUsers, leadMeta, firstInstance] = await Promise.all([
        // MAPPED USERS
        prisma.leadUserMapping.findMany({
          where: { vendor_id: vendorId, lead_id: leadId, status: "active" },
          select: { user_id: true },
        }),
        // FRANCHISE ID for admin filter
        prisma.leadMaster.findUnique({
          where: { id: leadId },
          select: { franchise_id: true },
        }),
        // FIRST INSTANCE for deep link
        prisma.leadProductStructureInstance.findFirst({
          where: { lead_id: leadId, vendor_id: vendorId },
          select: { id: true },
          orderBy: [{ product_structure_id: "asc" }, { quantity_index: "asc" }],
        }),
      ]);

      const franchiseId = leadMeta?.franchise_id ?? null;

      const admins = await prisma.userMaster.findMany({
        where: {
          vendor_id: vendorId,
          status: "active",
          user_type: { user_type: { equals: "admin", mode: "insensitive" } },
          ...(franchiseId ? { franchise_id: franchiseId } : {}),
        },
        select: { id: true, user_name: true, user_email: true },
      });

      const salesUserIds = Array.from(new Set(leadUsers.map((m) => m.user_id)));

      const salesExecutives =
        salesUserIds.length > 0
          ? await prisma.userMaster.findMany({
              where: {
                id: { in: salesUserIds },
                status: "active",
                user_type: { user_type: { in: ["sales-executive"], mode: "insensitive" } },
              },
              select: { id: true, user_name: true, user_email: true },
            })
          : [];

      const recipientMap = new Map<number, { id: number; user_name: string | null; user_email: string | null }>();
      for (const u of [...admins, ...salesExecutives]) recipientMap.set(u.id, u);
      const recipients = Array.from(recipientMap.values());

      if (!recipients.length) return result;

      const stagePath = `${STAGE_PATH_BY_TAG["Type 17"]}/${leadId}`;
      const qp = new URLSearchParams();
      if (result.accountId) qp.set("accountId", String(result.accountId));
      if (firstInstance?.id) qp.set("instance_id", String(firstInstance.id));
      const redirectPath = qp.toString() ? `${stagePath}?${qp.toString()}` : stagePath;
      const projectUrl = `${baseUrl}${redirectPath}`;

      // ==================================================
      // 3️⃣ SEND NOTIFICATIONS + EMAILS
      // ==================================================

      await Promise.allSettled(
        recipients.map(async (user) => {
          // 🔔 IN-APP NOTIFICATION
          await NotificationService.createAndSend({
            vendor_id: vendorId,
            user_id: user.id,
            sender_id: updatedBy,
            type: NotificationType.LEAD_MILESTONE,
            title: "Project Completed",
            message: `Final handover documents have been uploaded and ${result.leadCode} - ${result.leadName} has been marked as Completed.`,
            entity_type: "lead",
            entity_id: leadId,
            redirect_url: redirectPath,
          });

          // 📧 EMAIL
          if (!user.user_email) return;

          await sendProjectCompletedEmail({
            vendor_id: vendorId,
            toEmail: user.user_email,
            toName: user.user_name ?? undefined,
            leadCode: result.leadCode,
            leadName: result.leadName,
            projectUrl,
          });
        }),
      );
    } catch (notifyErr: any) {
      logger.warn("⚠️ Project Completed notification failed", {
        lead_id: leadId,
        error: notifyErr?.message,
      });
    }

    return result;
  }
}
