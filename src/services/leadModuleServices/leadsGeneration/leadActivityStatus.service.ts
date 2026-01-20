import { prisma } from "../../../prisma/client";
import { ActivityStatus, NotificationType } from "../../../prisma/generated";
import { NotificationService } from "../../notification/notification.service";
import logger from "../../../utils/logger";
import { cache } from "../../../utils/cache";
import {
  sendLeadLostApprovalEmail,
  sendLeadLostApprovedEmail,
  sendLeadLostRejectedEmail,
  sendLeadOnHoldEmail,
} from "../../email/brevoEmail.service";

export class LeadActivityStatusService {
  // Change status (onHold / lostApproval / lost )
  static async updateStatus(
    leadId: number,
    vendorId: number,
    accountId: number,
    userId: number,
    status: ActivityStatus,
    remark: string,
    createdBy: number,
    dueDate?: string // 👈 optional param, required only for onHold
  ) {
    if (!remark) {
      throw new Error("Remark is required when changing activity status.");
    }

    const lead = await prisma.$transaction(async (tx) => {
      // 1. Update LeadMaster
      const updatedLead = await tx.leadMaster.update({
        where: { id: leadId, vendor_id: vendorId },
        data: {
          activity_status: status,
          activity_status_remark: remark,
          updated_by: createdBy,
        },
      });

      // 2. Insert into logs
      await tx.leadActivityStatusLog.create({
        data: {
          vendor_id: vendorId,
          account_id: accountId,
          lead_id: leadId,
          user_id: userId,
          activity_status: status,
          activity_status_remark: remark,
          created_by: createdBy,
        },
      });

      // 3. If status is onHold → create a follow-up task
      if (status === ActivityStatus.onHold) {
        if (!dueDate) {
          throw new Error("Due date is required when marking lead as On Hold.");
        }

        const leadStage = updatedLead.status_id
          ? (
              await tx.statusTypeMaster.findUnique({
                where: { id: updatedLead.status_id },
                select: { type: true },
              })
            )?.type ?? null
          : null;

        await tx.userLeadTask.create({
          data: {
            lead_id: leadId,
            account_id: accountId,
            vendor_id: vendorId,
            user_id: userId,
            task_type: "Follow Up",
            lead_stage: leadStage,
            due_date: new Date(dueDate),
            remark: remark,
            status: "open", // default anyway
            created_by: createdBy,
          },
        });
      }

      // 🧹 Invalidate Sales-Executive Dashboard Cache
      await cache.del(`dashboard:tasks:${vendorId}:${userId}`);

      // 4️⃣ Insert into LeadDetailedLogs (Audit Trail)
      let actionMessage = "";

      if (status === ActivityStatus.onHold) {
        const formattedDate = new Date(dueDate!).toLocaleDateString("en-IN", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        });
        actionMessage = `Lead has been put On Hold till ${formattedDate}.`;
      } else if (status === ActivityStatus.lostApproval) {
        actionMessage = `Lead has been sent for Lost Approval.`;
      } else if (status === ActivityStatus.lost) {
        actionMessage = `Lead has been marked as Lost.`;
      }

      // 👇 Append remark (if provided)
      if (remark && remark.trim() !== "") {
        actionMessage += ` — Remark: ${remark.trim()}`;
      }

      await tx.leadDetailedLogs.create({
        data: {
          vendor_id: vendorId,
          lead_id: leadId,
          account_id: accountId,
          action: actionMessage,
          action_type: "UPDATE",
          created_by: createdBy,
          created_at: new Date(),
        },
      });

      logger.info(
        "✅ LeadDetailedLogs entry created for activity status change",
        {
          leadId,
          status,
          actionMessage,
        }
      );

      logger.info("Lead activity status updated", { leadId, vendorId, status });
      return updatedLead;
    });

    try {
      const [leadInfo, updatedByUser] = await Promise.all([
        prisma.leadMaster.findUnique({
          where: { id: leadId, vendor_id: vendorId },
          select: {
            lead_code: true,
            firstname: true,
            lastname: true,
            account_id: true,
            created_by: true,
            assign_to: true,
          },
        }),
        prisma.userMaster.findUnique({
          where: { id: createdBy },
          select: { id: true, user_name: true },
        }),
      ]);

      const leadCode =
        leadInfo?.lead_code ?? `LEAD-${String(leadId).padStart(4, "0")}`;
      const leadName = `${leadInfo?.firstname ?? ""} ${
        leadInfo?.lastname ?? ""
      }`.trim();
      const updatedByName = updatedByUser?.user_name ?? "Sales Executive";
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
      const leadDetailsUrl = leadInfo?.account_id
        ? `${baseUrl}/dashboard/leads/details/${leadId}?accountId=${leadInfo.account_id}`
        : `${baseUrl}/dashboard/leads/details/${leadId}`;
      const onHoldUrl = `${baseUrl}/dashboard/leads/leadstable?tab=onHold`;
      const lostApprovalUrl = `${baseUrl}/dashboard/leads/leadstable?tab=lostApproval`;
      const lostUrl = `${baseUrl}/dashboard/leads/leadstable?tab=lost`;

      if (status === ActivityStatus.onHold || status === ActivityStatus.lostApproval) {
        const admins = await prisma.userMaster.findMany({
          where: {
            vendor_id: vendorId,
            status: "active",
            user_type: {
              user_type: { in: ["admin", "super-admin"], mode: "insensitive" },
            },
          },
          select: { id: true, user_name: true, user_email: true },
        });

        const isOnHold = status === ActivityStatus.onHold;
        const redirectUrl = isOnHold ? "/dashboard/leads/leadstable?tab=onHold" : "/dashboard/leads/leadstable?tab=lostApproval";
        const leadUrl = isOnHold ? onHoldUrl : lostApprovalUrl;

        await Promise.allSettled(
          admins.map(async (admin) => {
            await NotificationService.createAndSend({
              vendor_id: vendorId,
              user_id: admin.id,
              sender_id: createdBy,
              type: NotificationType.LEAD_ACTION,
              title: isOnHold ? "Lead placed On Hold" : "Lost approval required",
              message: isOnHold
                ? `Lead ${leadCode} - ${leadName} placed On Hold by ${updatedByName}.`
                : `Lead ${leadCode} - ${leadName} marked Lost and awaiting approval.`,
              entity_type: "lead",
              entity_id: leadId,
              redirect_url: redirectUrl,
            });

            if (!admin.user_email) return;

            if (isOnHold) {
              await sendLeadOnHoldEmail({
                vendor_id: vendorId,
                toEmail: admin.user_email,
                toName: admin.user_name ?? undefined,
                leadCode,
                leadName: leadName || "Lead",
                updatedBy: updatedByName,
                updatedAt,
                remark,
                leadUrl,
              });
            } else {
              await sendLeadLostApprovalEmail({
                vendor_id: vendorId,
                toEmail: admin.user_email,
                toName: admin.user_name ?? undefined,
                leadCode,
                leadName: leadName || "Lead",
                markedBy: updatedByName,
                markedAt: updatedAt,
                remark,
                leadUrl,
              });
            }
          })
        );
      }

      if (status === ActivityStatus.lost) {
        const lostApprovalLog = await prisma.leadActivityStatusLog.findFirst({
          where: {
            lead_id: leadId,
            vendor_id: vendorId,
            activity_status: ActivityStatus.lostApproval,
          },
          orderBy: { created_at: "desc" },
          select: { created_by: true, activity_status_remark: true },
        });

        const latestLeadTask = await prisma.userLeadTask.findFirst({
          where: { lead_id: leadId, vendor_id: vendorId },
          orderBy: { created_at: "desc" },
          select: { created_by: true },
        });

        const requesterId =
          latestLeadTask?.created_by ??
          lostApprovalLog?.created_by ??
          leadInfo?.created_by ??
          null;
        const salesExec = requesterId
          ? await prisma.userMaster.findUnique({
              where: { id: requesterId },
              select: { id: true, user_name: true, user_email: true },
            })
          : null;

        if (salesExec?.id) {
          await NotificationService.createAndSend({
            vendor_id: vendorId,
            user_id: salesExec.id,
            sender_id: createdBy,
            type: NotificationType.LEAD_ACTION,
            title: "Lost lead approved",
            message: `Lead ${leadCode} - ${leadName} marked Lost approved by ${updatedByName}.`,
            entity_type: "lead",
            entity_id: leadId,
            redirect_url: "/dashboard/leads/leadstable?tab=lost",
          });

          if (salesExec.user_email) {
            await sendLeadLostApprovedEmail({
              vendor_id: vendorId,
              toEmail: salesExec.user_email,
              toName: salesExec.user_name ?? undefined,
              leadCode,
              leadName: leadName || "Lead",
              approvedBy: updatedByName,
              approvedAt: updatedAt,
              remark: lostApprovalLog?.activity_status_remark ?? remark,
              leadUrl: lostUrl,
            });
          }
        } else {
          logger.info("Lost approval email skipped: missing requester", {
            lead_id: leadId,
            requester_id: requesterId,
          });
        }
      }
    } catch (notifyError: any) {
      logger.warn("⚠️ Failed to send activity status notifications", {
        error: notifyError?.message,
        lead_id: leadId,
        status,
      });
    }

    return lead;
  }

  // Revert to onGoing
  static async revertToOnGoing(
    leadId: number,
    vendorId: number,
    accountId: number,
    userId: number,
    remark: string,
    createdBy: number
  ) {
    if (!remark) {
      throw new Error("Remark is required when reverting to onGoing.");
    }

    const lead = await prisma.$transaction(async (tx) => {
      // 1️⃣ Update LeadMaster
      const updatedLead = await tx.leadMaster.update({
        where: { id: leadId, vendor_id: vendorId },
        data: {
          activity_status: ActivityStatus.onGoing,
          activity_status_remark: remark,
          updated_by: createdBy,
        },
      });

      // 2️⃣ Insert into LeadActivityStatusLog
      await tx.leadActivityStatusLog.create({
        data: {
          vendor_id: vendorId,
          account_id: accountId,
          lead_id: leadId,
          user_id: userId,
          activity_status: ActivityStatus.onGoing,
          activity_status_remark: remark,
          created_by: createdBy,
        },
      });

      // 3️⃣ Build action message dynamically with remark
      let actionMessage = "Lead has been reverted to Active.";
      if (remark && remark.trim() !== "") {
        actionMessage += ` — Remark: ${remark.trim()}`;
      }

      // 4️⃣ Insert into LeadDetailedLogs (Audit Trail)
      await tx.leadDetailedLogs.create({
        data: {
          vendor_id: vendorId,
          lead_id: leadId,
          account_id: accountId,
          action: actionMessage,
          action_type: "UPDATE",
          created_by: createdBy,
          created_at: new Date(),
        },
      });

      logger.info("✅ LeadDetailedLogs entry created for revert to Active", {
        leadId,
        vendorId,
        actionMessage,
      });

      logger.info("Lead activity status reverted to onGoing", {
        leadId,
        vendorId,
      });
      return updatedLead;
    });

    try {
      const [leadInfo, rejectedByUser] = await Promise.all([
        prisma.leadMaster.findUnique({
          where: { id: leadId, vendor_id: vendorId },
          select: {
            lead_code: true,
            firstname: true,
            lastname: true,
            account_id: true,
            created_by: true,
          },
        }),
        prisma.userMaster.findUnique({
          where: { id: createdBy },
          select: { id: true, user_name: true },
        }),
      ]);

      const leadCode =
        leadInfo?.lead_code ?? `LEAD-${String(leadId).padStart(4, "0")}`;
      const leadName = `${leadInfo?.firstname ?? ""} ${
        leadInfo?.lastname ?? ""
      }`.trim();
      const rejectedByName = rejectedByUser?.user_name ?? "Admin";
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
      const leadDetailsUrl = leadInfo?.account_id
        ? `${baseUrl}/dashboard/leads/details/${leadId}?accountId=${leadInfo.account_id}`
        : `${baseUrl}/dashboard/leads/details/${leadId}`;

      const lostApprovalLog = await prisma.leadActivityStatusLog.findFirst({
        where: {
          lead_id: leadId,
          vendor_id: vendorId,
          activity_status: ActivityStatus.lostApproval,
        },
        orderBy: { created_at: "desc" },
        select: { created_by: true },
      });

      const latestLeadTask = await prisma.userLeadTask.findFirst({
        where: { lead_id: leadId, vendor_id: vendorId },
        orderBy: { created_at: "desc" },
        select: { created_by: true },
      });

      const salesExecId =
        latestLeadTask?.created_by ??
        lostApprovalLog?.created_by ??
        leadInfo?.created_by ??
        null;
      const salesExec = salesExecId
        ? await prisma.userMaster.findUnique({
            where: { id: salesExecId },
            select: { id: true, user_name: true, user_email: true },
          })
        : null;

      if (salesExec?.id) {
        await NotificationService.createAndSend({
          vendor_id: vendorId,
          user_id: salesExec.id,
          sender_id: createdBy,
          type: NotificationType.LEAD_ACTION,
          title: "Lost lead request rejected",
          message: `Lost request for lead ${leadCode} - ${leadName} rejected by ${rejectedByName}.`,
          entity_type: "lead",
          entity_id: leadId,
          redirect_url: `/dashboard/leads/details/${leadId}${
            leadInfo?.account_id ? `?accountId=${leadInfo.account_id}` : ""
          }`,
        });

        if (salesExec.user_email) {
          await sendLeadLostRejectedEmail({
            vendor_id: vendorId,
            toEmail: salesExec.user_email,
            toName: salesExec.user_name ?? undefined,
            leadCode,
            leadName: leadName || "Lead",
            rejectedBy: rejectedByName,
            rejectedAt,
            remark,
            leadUrl: leadDetailsUrl,
          });
        }
      }
    } catch (notifyError: any) {
      logger.warn("⚠️ Failed to send lost rejection notifications", {
        error: notifyError?.message,
        lead_id: leadId,
      });
    }

    return lead;
  }

  // Get all onHold leads with product + product structure
  static async getOnHoldLeads(vendorId: number) {
    return prisma.leadMaster.findMany({
      where: {
        vendor_id: vendorId,
        activity_status: ActivityStatus.onHold,
        is_deleted: false,
      },
      include: {
        productMappings: {
          include: {
            productType: true, // assuming relation exists
          },
        },
        leadProductStructureMapping: {
          include: {
            productStructure: true, // assuming relation exists
          },
        },
        statusType: true,
        siteType: true,
      },
      orderBy: { created_at: "desc" },
    });
  }

  // Get all lost leads with product + product structure
  static async getLostLeads(vendorId: number) {
    return prisma.leadMaster.findMany({
      where: {
        vendor_id: vendorId,
        activity_status: ActivityStatus.lost,
        is_deleted: false,
      },
      include: {
        productMappings: {
          include: {
            productType: true,
          },
        },
        leadProductStructureMapping: {
          include: {
            productStructure: true,
          },
        },
        statusType: true,
        siteType: true,
      },
      orderBy: { created_at: "desc" },
    });
  }

  // Get all lostApproval leads with product + product structure
  static async getLostApprovalLeads(vendorId: number) {
    return prisma.leadMaster.findMany({
      where: {
        vendor_id: vendorId,
        activity_status: ActivityStatus.lostApproval,
        is_deleted: false,
      },
      include: {
        productMappings: {
          include: {
            productType: true,
          },
        },
        leadProductStructureMapping: {
          include: {
            productStructure: true,
          },
        },
        statusType: true,
        siteType: true,
      },
      orderBy: { created_at: "desc" },
    });
  }

  static async getActivityStatusCount(vendorId: number) {
    const counts = await prisma.leadMaster.groupBy({
      by: ["activity_status"],
      where: {
        vendor_id: vendorId,
        is_deleted: false,
      },
      _count: {
        id: true,
      },
    });

    // Initialize response
    const response: {
      totalOnGoing: number;
      openOnGoing: number;
      onHold: number;
      lostApproval: number;
      lost: number;
    } = {
      totalOnGoing: 0,
      openOnGoing: 0,
      onHold: 0,
      lostApproval: 0,
      lost: 0,
    };

    // 2️⃣ Fill totals from groupBy
    counts.forEach((c) => {
      if (c.activity_status === "onGoing") {
        response.totalOnGoing = c._count.id;
      } else if (c.activity_status === "onHold") {
        response.onHold = c._count.id;
      } else if (c.activity_status === "lostApproval") {
        response.lostApproval = c._count.id;
      } else if (c.activity_status === "lost") {
        response.lost = c._count.id;
      }
    });

    // 3️⃣ Query for openOnGoing (statusTypeMaster.type = 'open')
    const openOnGoingCount = await prisma.leadMaster.count({
      where: {
        vendor_id: vendorId,
        is_deleted: false,
        activity_status: "onGoing",
        statusType: {
          type: "open", // depends on your StatusTypeMaster records
        },
      },
    });

    response.openOnGoing = openOnGoingCount;

    return response;
  }
}
