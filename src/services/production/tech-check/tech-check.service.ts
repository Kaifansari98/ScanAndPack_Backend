import { NotificationType, Prisma } from "../../../prisma/generated";
import { prisma } from "../../../prisma/client";
import logger from "../../../utils/logger";
import { NotificationService } from "../../../../src/services/notification/notification.service";
import {
  sendLeadMovedToOrderLoginEmail,
  sendOrderLoginAssignedEmail,
  sendTechCheckApprovedEmail,
  sendTechCheckRejectedEmail,
} from "../../../../src/services/email/brevoEmail.service";

export type ApproveTechCheckResult =
  | {
      mode: "instance";
      instance_id: number;
      is_tech_check_completed: boolean | null;
      tech_check_completed_at: Date | null;
    }
  | {
      mode: "instance_and_lead_moved";
      instance_id: number;
      is_tech_check_completed: boolean | null;
      tech_check_completed_at: Date | null;
      updatedLead: any;
      mapping: any;
      moved_to_order_login: true;
      assign_to_user_id: number;
      account_id: number;
    }
  | {
      updatedLead: any;
      mapping: any;
    };

export class TechCheckService {
  public async getInstanceTechCheckStatus(
    vendorId: number,
    leadId: number,
    instanceId: number
  ) {
    return prisma.leadProductStructureInstance.findFirst({
      where: {
        id: instanceId,
        lead_id: leadId,
        vendor_id: vendorId,
      },
      select: {
        id: true,
        lead_id: true,
        vendor_id: true,
        is_tech_check_completed: true,
        tech_check_completed_at: true,
      },
    });
  }

  // ✅ Approve Tech Check
  public async approveTechCheck(
    vendorId: number,
    leadId: number,
    userId: number,
    assignToUserId: number,
    accountId: number,
    productStructureInstanceId?: number
  ): Promise<ApproveTechCheckResult> {
    const result: ApproveTechCheckResult = await prisma.$transaction(
      async (tx) => {
      if (productStructureInstanceId) {
        const instance = await tx.leadProductStructureInstance.findFirst({
          where: {
            id: productStructureInstanceId,
            lead_id: leadId,
            vendor_id: vendorId,
            account_id: accountId || undefined,
          },
          select: { id: true, title: true, account_id: true },
        });

        if (!instance) {
          throw new Error("Product structure instance not found for this lead");
        }

        const effectiveAccountId = accountId || instance.account_id;

        const updatedInstance = await tx.leadProductStructureInstance.update({
          where: { id: productStructureInstanceId },
          data: {
            is_tech_check_completed: true,
            tech_check_completed_at: new Date(),
            updated_by: userId,
            updated_at: new Date(),
          },
        });

        await tx.leadDetailedLogs.create({
          data: {
            vendor_id: vendorId,
            lead_id: leadId,
            account_id: effectiveAccountId,
            action: `Tech Check completed for instance ${instance.title}`,
            action_type: "UPDATE",
            created_by: userId,
          },
        });

        const pendingInstances = await tx.leadProductStructureInstance.count({
          where: {
            lead_id: leadId,
            vendor_id: vendorId,
            OR: [
              { is_tech_check_completed: false },
              { is_tech_check_completed: null },
            ],
          },
        });

        if (pendingInstances === 0) {
          if (!assignToUserId || !effectiveAccountId) {
            throw new Error(
              "assign_to_user_id and account_id are required to move lead to Order Login"
            );
          }

          const orderLoginStatus = await tx.statusTypeMaster.findFirst({
            where: { vendor_id: vendorId, tag: "Type 9" },
            select: { id: true },
          });

          if (!orderLoginStatus) {
            throw new Error(
              `Order Login (Type 9) not configured for vendor ${vendorId}`
            );
          }

          const updatedLead = await tx.leadMaster.update({
            where: { id: leadId },
            data: {
              status_id: orderLoginStatus.id,
              updated_by: userId,
              updated_at: new Date(),
            },
          });

          const mapping = await tx.leadUserMapping.create({
            data: {
              vendor_id: vendorId,
              lead_id: leadId,
              account_id: effectiveAccountId,
              user_id: assignToUserId,
              type: "order-login-stage",
              status: "active",
              created_by: userId,
            },
          });

          let chatRoom = await tx.leadChatRoom.findFirst({
            where: {
              lead_id: leadId,
              vendor_id: vendorId,
            },
            select: { id: true },
          });

          if (!chatRoom) {
            chatRoom = await tx.leadChatRoom.create({
              data: {
                lead_id: leadId,
                vendor_id: vendorId,
              },
              select: { id: true },
            });
          }

          const existingMember = await tx.leadChatMember.findFirst({
            where: {
              chat_room_id: chatRoom.id,
              user_id: assignToUserId,
            },
            select: { id: true },
          });

          if (!existingMember) {
            await tx.leadChatMember.create({
              data: {
                chat_room_id: chatRoom.id,
                user_id: assignToUserId,
                added_by: userId,
              },
            });
          }

          await tx.leadStatusLogs.create({
            data: {
              vendor_id: vendorId,
              lead_id: leadId,
              account_id: effectiveAccountId,
              status_id: orderLoginStatus.id,
              created_by: userId,
            },
          });

          await tx.leadDetailedLogs.create({
            data: {
              vendor_id: vendorId,
              lead_id: leadId,
              account_id: effectiveAccountId,
              action: `All instances tech check completed. Lead moved to Order Login and assigned to backend user ${assignToUserId}`,
              action_type: "STATUS_CHANGE",
              created_by: userId,
            },
          });

          return {
            mode: "instance_and_lead_moved",
            instance_id: updatedInstance.id,
            is_tech_check_completed: updatedInstance.is_tech_check_completed,
            tech_check_completed_at: updatedInstance.tech_check_completed_at,
            updatedLead,
            mapping,
            moved_to_order_login: true,
            assign_to_user_id: assignToUserId,
            account_id: effectiveAccountId,
          };
        }

        return {
          mode: "instance",
          instance_id: updatedInstance.id,
          is_tech_check_completed: updatedInstance.is_tech_check_completed,
          tech_check_completed_at: updatedInstance.tech_check_completed_at,
        };
      }

      // 1️⃣ Get Order Login Status (Type 9)
      const orderLoginStatus = await tx.statusTypeMaster.findFirst({
        where: { vendor_id: vendorId, tag: "Type 9" },
        select: { id: true },
      });

      if (!orderLoginStatus) {
        throw new Error(
          `Order Login (Type 9) not configured for vendor ${vendorId}`,
        );
      }

      // 2️⃣ Update Lead status
      const updatedLead = await tx.leadMaster.update({
        where: { id: leadId },
        data: {
          status_id: orderLoginStatus.id,
          updated_by: userId,
          updated_at: new Date(),
        },
      });

      // 3️⃣ Assign to Backend User
      const mapping = await tx.leadUserMapping.create({
        data: {
          vendor_id: vendorId,
          lead_id: leadId,
          account_id: accountId,
          user_id: assignToUserId,
          type: "order-login-stage", // 👈 IMPORTANT
          status: "active",
          created_by: userId,
        },
      });

      // ✅ Ensure assigned backend user is in lead chat members
      let chatRoom = await tx.leadChatRoom.findFirst({
        where: {
          lead_id: leadId,
          vendor_id: vendorId,
        },
        select: { id: true },
      });

      if (!chatRoom) {
        chatRoom = await tx.leadChatRoom.create({
          data: {
            lead_id: leadId,
            vendor_id: vendorId,
          },
          select: { id: true },
        });
      }

      const existingMember = await tx.leadChatMember.findFirst({
        where: {
          chat_room_id: chatRoom.id,
          user_id: assignToUserId,
        },
        select: { id: true },
      });

      if (existingMember) {
        logger.info(
          "[SERVICE] LeadChatMember already exists, skipping insert",
          {
            lead_id: leadId,
            chat_room_id: chatRoom.id,
            user_id: assignToUserId,
          },
        );
      } else {
        await tx.leadChatMember.create({
          data: {
            chat_room_id: chatRoom.id,
            user_id: assignToUserId,
            added_by: userId,
          },
        });
      }

      // 4️⃣ Log status change
      await tx.leadStatusLogs.create({
        data: {
          vendor_id: vendorId,
          lead_id: leadId,
          account_id: accountId,
          status_id: orderLoginStatus.id,
          created_by: userId,
        },
      });

      // 5️⃣ Detailed Logs
      await tx.leadDetailedLogs.create({
        data: {
          vendor_id: vendorId,
          lead_id: leadId,
          account_id: accountId,
          action: `Tech Check approved and assigned to backend user ${assignToUserId}`,
          action_type: "STATUS_CHANGE",
          created_by: userId,
        },
      });

      return { updatedLead, mapping };
    });

    const notify = async () => {
      // ===============================
      // ORDER LOGIN STAGE → ADMIN NOTIFICATION
      // ===============================
      try {
        const actorId = userId; // tech check approver

        const [lead, actor] = await Promise.all([
          prisma.leadMaster.findUnique({
            where: { id: leadId },
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

        if (!lead) return;

        const leadName = `${lead.firstname ?? ""} ${lead.lastname ?? ""}`.trim();

        const leadCode =
          lead.lead_code ?? `LEAD-${String(leadId).padStart(4, "0")}`;

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
          ? `${baseUrl}/dashboard/leads/details/${leadId}?accountId=${lead.account_id}`
          : `${baseUrl}/dashboard/leads/details/${leadId}`;

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
          if (admin.id === actorId) continue;

          await NotificationService.createAndSend({
            vendor_id: lead.vendor_id,
            user_id: admin.id,
            sender_id: actorId,
            type: NotificationType.LEAD_MILESTONE,
            title: "Lead Entered Order Login Stage",
            message: `${leadCode} - ${leadName} moved to Order Login stage.`,
            entity_type: "lead",
            entity_id: leadId,
            redirect_url: lead.account_id
              ? `/dashboard/leads/details/${leadId}?accountId=${lead.account_id}`
              : `/dashboard/leads/details/${leadId}`,
          });

          if (!admin.user_email) continue;

          await sendLeadMovedToOrderLoginEmail({
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
        logger.warn("⚠️ Order login admin notification failed", {
          lead_id: leadId,
          error: err?.message,
        });
      }

      // ===============================
      // ORDER LOGIN ASSIGNMENT → BACKEND USER NOTIFICATION
      // ===============================
      try {
        const assignedUserId = assignToUserId;

        if (assignedUserId !== userId) {
          const [lead, assigner, assignee] = await Promise.all([
            prisma.leadMaster.findUnique({
              where: { id: leadId },
              select: {
                firstname: true,
                lastname: true,
                lead_code: true,
                vendor_id: true,
                account_id: true,
              },
            }),

            prisma.userMaster.findUnique({
              where: { id: userId },
              select: { user_name: true },
            }),

            prisma.userMaster.findUnique({
              where: { id: assignedUserId },
              select: {
                user_name: true,
                user_email: true,
              },
            }),
          ]);

          if (!lead || !assignee) return;

          const leadName =
            `${lead.firstname ?? ""} ${lead.lastname ?? ""}`.trim();

          const leadCode =
            lead.lead_code ?? `LEAD-${String(leadId).padStart(4, "0")}`;

          const assignedAt = new Date().toLocaleString("en-IN", {
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
            ? `${baseUrl}/dashboard/leads/details/${leadId}?accountId=${lead.account_id}`
            : `${baseUrl}/dashboard/leads/details/${leadId}`;

          await NotificationService.createAndSend({
            vendor_id: lead.vendor_id,
            user_id: assignedUserId,
            sender_id: userId,
            type: NotificationType.TASK_ASSIGNED,
            title: "Order Login Task Assigned",
            message: `${leadCode} - ${leadName} has been assigned to you for Order Login.`,
            entity_type: "lead",
            entity_id: leadId,
            redirect_url: lead.account_id
              ? `/dashboard/leads/details/${leadId}?accountId=${lead.account_id}`
              : `/dashboard/leads/details/${leadId}`,
          });

          if (assignee.user_email) {
            await sendOrderLoginAssignedEmail({
              vendor_id: lead.vendor_id,
              toEmail: assignee.user_email,
              toName: assignee.user_name,
              leadCode,
              leadName,
              assignedBy: assigner?.user_name ?? "System",
              assignedAt,
              projectUrl,
            });
          }
        }
      } catch (err: any) {
        logger.warn("⚠️ Order login assignment notification failed", {
          lead_id: leadId,
          assigned_user_id: assignToUserId,
          error: err?.message,
        });
      }
    };

    void notify();
    return result;
  }

  // ✅ Reject Tech Check
  public async rejectTechCheck(
    vendorId: number,
    leadId: number,
    userId: number,
    rejectedDocs: number[],
    remark?: string,
  ) {
    // ===============================
    // 1️⃣ TRANSACTION LAYER
    // ===============================

    const result = await prisma.$transaction(async (tx) => {
      // Resolve Account ID
      const accountId = (
        await tx.leadMaster.findUnique({
          where: { id: leadId },
          select: { account_id: true },
        })
      )?.account_id;

      if (!accountId) {
        throw new Error("Lead account not found");
      }

      // Build Log Message
      const actionText = remark
        ? `Tech check rejected ${rejectedDocs.length} documents — Remark: ${remark}`
        : `Tech check rejected ${rejectedDocs.length} documents`;

      // Create Detailed Log
      const detailedLog = await tx.leadDetailedLogs.create({
        data: {
          vendor_id: vendorId,
          lead_id: leadId,
          account_id: accountId,
          action: actionText,
          action_type: "UPDATE",
          created_by: userId,
        },
      });

      // Update Documents Status
      const updateRes = await tx.leadDocuments.updateMany({
        where: {
          id: { in: rejectedDocs },
          vendor_id: vendorId,
          documentType: {
            tag: { in: ["Type 11", "Type 12"] },
          },
        },
        data: {
          tech_check_status: "REJECTED",
        },
      });

      // Insert Document Logs
      if (rejectedDocs.length) {
        const docLogsData = rejectedDocs.map((docId) => ({
          vendor_id: vendorId,
          lead_id: leadId,
          account_id: accountId,
          doc_id: docId,
          lead_logs_id: detailedLog.id,
          created_by: userId,
        }));

        await tx.leadDocumentLogs.createMany({
          data: docLogsData,
        });
      }

      return {
        accountId,
        rejectedUpdated: updateRes.count,
      };
    });

    // ===============================
    // 2️⃣ NOTIFICATION + EMAIL LAYER
    // ===============================

    try {
      const [leadInfo, rejectedByUser] = await Promise.all([
        prisma.leadMaster.findUnique({
          where: { id: leadId, vendor_id: vendorId },
          select: {
            lead_code: true,
            firstname: true,
            lastname: true,
            account_id: true,
          },
        }),

        prisma.userMaster.findUnique({
          where: { id: userId },
          select: { user_name: true },
        }),
      ]);

      if (!leadInfo) return result;

      const leadCode =
        leadInfo.lead_code ?? `LEAD-${String(leadId).padStart(4, "0")}`;

      const leadName =
        `${leadInfo.firstname ?? ""} ${leadInfo.lastname ?? ""}`.trim();

      const rejectedByName = rejectedByUser?.user_name ?? "Tech Check Team";

      const rejectedAt = new Date().toLocaleString("en-IN", {
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

      const redirectPath = leadInfo.account_id
        ? `/dashboard/leads/details/${leadId}?accountId=${leadInfo.account_id}`
        : `/dashboard/leads/details/${leadId}`;

      const projectUrl = `${baseUrl}${redirectPath}`;

      // Fetch Assigned Sales Executives
      const mappings = await prisma.leadUserMapping.findMany({
        where: {
          vendor_id: vendorId,
          lead_id: leadId,
          status: "active",
        },
        select: { user_id: true },
      });

      const salesUserIds = [...new Set(mappings.map((m) => m.user_id))];

      if (!salesUserIds.length) return result;

      const salesExecutives = await prisma.userMaster.findMany({
        where: {
          id: { in: salesUserIds },
          status: "active",
          user_type: {
            user_type: { equals: "sales-executive", mode: "insensitive" },
          },
        },
        select: {
          id: true,
          user_name: true,
          user_email: true,
        },
      });

      // ===============================
      // Broadcast Notifications
      // ===============================

      await Promise.allSettled(
        salesExecutives.map(async (salesExec) => {
          // 🔔 In-App Notification
          await NotificationService.createAndSend({
            vendor_id: vendorId,
            user_id: salesExec.id,
            sender_id: userId,
            type: NotificationType.LEAD_ACTION,
            title: "Tech Check Document Rejected",
            message: `Documents for ${leadCode} - ${leadName} have been rejected by Tech Check.`,
            entity_type: "lead",
            entity_id: leadId,
            redirect_url: redirectPath,
          });

          // 📧 Email
          if (!salesExec.user_email) return;

          await sendTechCheckRejectedEmail({
            vendor_id: vendorId,
            toEmail: salesExec.user_email,
            toName: salesExec.user_name ?? undefined,
            leadCode,
            leadName,
            rejectedBy: rejectedByName,
            rejectedAt,
            remark,
            projectUrl,
          });
        }),
      );
    } catch (err: any) {
      logger.warn("⚠️ Tech Check rejection notification failed", {
        lead_id: leadId,
        error: err?.message,
      });
    }

    return result;
  }

  // ✅ Keep your existing method
  public async getLeadsWithStatusTechCheck(
    vendorId: number,
    userId: number,
    limit = 10,
    page = 1,
  ) {
    const skip = (page - 1) * limit;

    const techCheckStatus = await prisma.statusTypeMaster.findFirst({
      where: { vendor_id: vendorId, tag: "Type 8" },
      select: { id: true },
    });

    if (!techCheckStatus) {
      throw new Error(
        `Tech Check status (Type 8) not found for vendor ${vendorId}`,
      );
    }

    const creator = await prisma.userMaster.findUnique({
      where: { id: userId },
      include: { user_type: true },
    });

    const isAdmin = creator?.user_type?.user_type?.toLowerCase() === "admin";

    const baseWhere: any = {
      vendor_id: vendorId,
      is_deleted: false,
      status_id: techCheckStatus.id,
      activity_status: { in: ["onGoing", "lostApproval"] },
    };

    if (isAdmin) {
      const [total, leads] = await Promise.all([
        prisma.leadMaster.count({ where: baseWhere }),
        prisma.leadMaster.findMany({
          where: baseWhere,
          include: this.defaultIncludes(),
          orderBy: { created_at: Prisma.SortOrder.desc },
          skip,
          take: limit,
        }),
      ]);

      return { total, leads };
    }

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
        orderBy: { created_at: Prisma.SortOrder.desc },
        skip,
        take: limit,
      }),
    ]);

    return { total, leads };
  }

  // ✅ Approve Multiple Documents (Tech Check)
  public async approveMultipleDocuments(
    vendorId: number,
    leadId: number,
    userId: number,
    approvedDocs: number[],
  ) {
    // ===============================
    // 1️⃣ TRANSACTION LAYER
    // ===============================

    const result = await prisma.$transaction(async (tx) => {
      // Resolve Account ID
      const accountId = (
        await tx.leadMaster.findUnique({
          where: { id: leadId },
          select: { account_id: true },
        })
      )?.account_id;

      if (!accountId) {
        throw new Error("Lead account not found");
      }

      // Update Tech Check Status
      const updateRes = await tx.leadDocuments.updateMany({
        where: {
          id: { in: approvedDocs },
          vendor_id: vendorId,
          documentType: {
            tag: { in: ["Type 11", "Type 12"] },
          },
        },
        data: {
          tech_check_status: "APPROVED",
        },
      });

      // Create Detailed Log
      const detailedLog = await tx.leadDetailedLogs.create({
        data: {
          vendor_id: vendorId,
          lead_id: leadId,
          account_id: accountId,
          action: `Tech check approved ${approvedDocs.length} documents`,
          action_type: "UPDATE",
          created_by: userId,
        },
      });

      // Create Document Logs
      if (approvedDocs.length) {
        const docLogsData = approvedDocs.map((docId) => ({
          vendor_id: vendorId,
          lead_id: leadId,
          account_id: accountId,
          doc_id: docId,
          lead_logs_id: detailedLog.id,
          created_by: userId,
        }));

        await tx.leadDocumentLogs.createMany({
          data: docLogsData,
        });
      }

      return {
        accountId,
        updatedCount: updateRes.count,
      };
    });

    // ===============================
    // 2️⃣ NOTIFICATION + EMAIL LAYER
    // ===============================

    try {
      const [leadInfo, approvedByUser] = await Promise.all([
        prisma.leadMaster.findUnique({
          where: { id: leadId, vendor_id: vendorId },
          select: {
            lead_code: true,
            firstname: true,
            lastname: true,
            account_id: true,
          },
        }),

        prisma.userMaster.findUnique({
          where: { id: userId },
          select: { user_name: true },
        }),
      ]);

      if (!leadInfo) return result;

      const leadCode =
        leadInfo.lead_code ?? `LEAD-${String(leadId).padStart(4, "0")}`;

      const leadName =
        `${leadInfo.firstname ?? ""} ${leadInfo.lastname ?? ""}`.trim();

      const approvedByName = approvedByUser?.user_name ?? "Tech Check Team";

      const approvedAt = new Date().toLocaleString("en-IN", {
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

      const redirectPath = leadInfo.account_id
        ? `/dashboard/leads/details/${leadId}?accountId=${leadInfo.account_id}`
        : `/dashboard/leads/details/${leadId}`;

      const projectUrl = `${baseUrl}${redirectPath}`;

      // Fetch Sales Executives linked to Lead
      const mappings = await prisma.leadUserMapping.findMany({
        where: {
          vendor_id: vendorId,
          lead_id: leadId,
          status: "active",
        },
        select: { user_id: true },
      });

      const salesUserIds = [...new Set(mappings.map((m) => m.user_id))];

      if (!salesUserIds.length) return result;

      const salesExecutives = await prisma.userMaster.findMany({
        where: {
          id: { in: salesUserIds },
          status: "active",
          user_type: {
            user_type: { equals: "sales-executive", mode: "insensitive" },
          },
        },
        select: {
          id: true,
          user_name: true,
          user_email: true,
        },
      });

      // ===============================
      // Broadcast Notifications
      // ===============================

      await Promise.allSettled(
        salesExecutives.map(async (salesExec) => {
          // 🔔 In-App Notification
          await NotificationService.createAndSend({
            vendor_id: vendorId,
            user_id: salesExec.id,
            sender_id: userId,
            type: NotificationType.LEAD_ACTION,
            title: "Tech Check Document Approved",
            message: `The documents for ${leadCode} - ${leadName} have been approved by Tech Check.`,
            entity_type: "lead",
            entity_id: leadId,
            redirect_url: redirectPath,
          });

          // 📧 Email Notification
          if (!salesExec.user_email) return;

          await sendTechCheckApprovedEmail({
            vendor_id: vendorId,
            toEmail: salesExec.user_email,
            toName: salesExec.user_name ?? undefined,
            leadCode,
            leadName,
            approvedBy: approvedByName,
            approvedAt,
            projectUrl,
          });
        }),
      );
    } catch (err: any) {
      logger.warn("⚠️ Tech Check approval notification failed", {
        lead_id: leadId,
        error: err?.message,
      });
    }

    return result;
  }

  private defaultIncludes() {
    return {
      account: {
        select: { id: true, name: true, email: true, contact_no: true },
      },
      siteType: true,
      source: true,
      statusType: true,
      productMappings: { include: { productType: true } },
      leadProductStructureMapping: { include: { productStructure: true } },
      assignedTo: { select: { id: true, user_name: true } },
      createdBy: { select: { id: true, user_name: true } },
    };
  }
}
