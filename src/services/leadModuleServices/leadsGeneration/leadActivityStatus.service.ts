import { prisma } from "../../../prisma/client";
import {
  ActivityStatus,
  NotificationType,
  Prisma,
} from "../../../prisma/generated";
import { NotificationService } from "../../notification/notification.service";
import { getFranchiseAdminRecipients } from "../../notification/adminRecipients.service";
import logger from "../../../utils/logger";
import { cache } from "../../../utils/cache";
import { createTaskHistoryLog } from "../../task/taskHistory.service";
import { createLeadLog } from "../../../utils/leadDetailedLog";
import {
  sendLeadLostApprovalEmail,
  sendLeadLostApprovedEmail,
  sendLeadLostRejectedEmail,
  sendLeadActiveEmail,
  sendLeadOnHoldEmail,
  sendLeadMarkedActiveEmail,
} from "../../email/brevoEmail.service";

export const STAGE_PATH_BY_TAG: Record<string, string> = {
  "Type 1":  "/dashboard/leads/leadstable/details",
  "Type 2":  "/dashboard/leads/initial-site-measurement/details",
  "Type 3":  "/dashboard/leads/designing-stage/details",
  "Type 4":  "/dashboard/leads/booking-stage/details",
  "Type 5":  "/dashboard/project/final-measurement/details",
  "Type 6":  "/dashboard/project/client-documentation/details",
  "Type 7":  "/dashboard/project/client-approval/details",
  "Type 8":  "/dashboard/production/tech-check/details",
  "Type 9":  "/dashboard/production/order-login/details",
  "Type 10": "/dashboard/production/pre-post-prod/details",
  "Type 11": "/dashboard/production/ready-to-dispatch/details",
  "Type 12": "/dashboard/installation/site-readiness/details",
  "Type 13": "/dashboard/installation/dispatch-planning/details",
  "Type 14": "/dashboard/installation/dispatch-stage/details",
  "Type 15": "/dashboard/installation/under-installation/details",
  "Type 16": "/dashboard/installation/final-handover/details",
  "Type 17": "/dashboard/installation/final-handover/details",
};

export const resolveLeadStagePath = (
  leadId: number,
  stageTag: string | null | undefined,
  accountId?: number | null,
): string => {
  const base = stageTag && STAGE_PATH_BY_TAG[stageTag]
    ? `${STAGE_PATH_BY_TAG[stageTag]}/${leadId}`
    : `/dashboard/leads/leadstable/details/${leadId}`;
  return accountId ? `${base}?accountId=${accountId}` : base;
};

export const buildLeadDetailsPath = (leadId: number, accountId?: number) => {
  return accountId
    ? `/dashboard/leads/details/${leadId}?accountId=${accountId}`
    : `/dashboard/leads/details/${leadId}`;
};

export const buildLeadDetailsUrl = (
  baseUrl: string,
  leadId: number,
  accountId?: number,
) => {
  return `${baseUrl}${buildLeadDetailsPath(leadId, accountId)}`;
};

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
    baseUrl: string,
    dueDate?: string,
  ) {
    if (!remark) {
      throw new Error("Remark is required when changing activity status.");
    }

    let effectiveStatus = status;

    if (status === ActivityStatus.lost) {
      const actor = await prisma.userMaster.findUnique({
        where: { id: createdBy },
        select: {
          user_type: { select: { user_type: true } },
        },
      });

      const actorRole = (actor?.user_type?.user_type || "").toLowerCase();
      const isActorAdmin = actorRole === "admin" || actorRole === "super-admin";

      if (!isActorAdmin) {
        const targetLead = await prisma.leadMaster.findUnique({
          where: { id: leadId, vendor_id: vendorId },
          select: { franchise_id: true },
        });

        if (targetLead?.franchise_id) {
          const storeAdminExists = await prisma.userMaster.findFirst({
            where: {
              vendor_id: vendorId,
              franchise_id: targetLead.franchise_id,
              status: "active",
              user_type: {
                user_type: {
                  equals: "admin",
                  mode: "insensitive",
                },
              },
            },
            select: { id: true },
          });

          if (storeAdminExists) {
            effectiveStatus = ActivityStatus.lostApproval;
          }
        }
      }
    }

    const affectedTaskUserIds = new Set<number>();

    const lead = await prisma.$transaction(async (tx) => {
      // 1. Update LeadMaster
      const updatedLead = await tx.leadMaster.update({
        where: { id: leadId, vendor_id: vendorId },
        data: {
          activity_status: effectiveStatus,
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
          activity_status: effectiveStatus,
          activity_status_remark: remark,
          created_by: createdBy,
        },
      });

      // 3. If status is lost → cancel all still-open tasks for this lead
      if (effectiveStatus === ActivityStatus.lost) {
        const openTasks = await tx.userLeadTask.findMany({
          where: {
            lead_id: leadId,
            vendor_id: vendorId,
            status: "open",
          },
          select: {
            id: true,
            user_id: true,
          },
        });

        openTasks.forEach((task) => affectedTaskUserIds.add(task.user_id));

        if (openTasks.length > 0) {
          await tx.userLeadTask.updateMany({
            where: {
              id: { in: openTasks.map((task) => task.id) },
            },
            data: {
              status: "cancelled",
              closed_by: userId,
              closed_at: new Date(),
              remark: "Lead has been marked as Lost.",
              updated_by: createdBy,
            },
          });
        }
      }

      // 4. If status is onHold → create a follow-up task
      if (effectiveStatus === ActivityStatus.onHold) {
        if (!dueDate) {
          throw new Error("Due date is required when marking lead as On Hold.");
        }

        const leadStage = updatedLead.status_id
          ? ((
              await tx.statusTypeMaster.findUnique({
                where: { id: updatedLead.status_id },
                select: { type: true },
              })
            )?.type ?? null)
          : null;

        const task = await tx.userLeadTask.create({
          data: {
            lead_id: leadId,
            account_id: accountId,
            vendor_id: vendorId,
            franchise_id: updatedLead.franchise_id ?? null,
            user_id: userId,
            task_type: "Follow Up",
            lead_stage: leadStage,
            due_date: new Date(dueDate),
            remark: remark,
            status: "open",
            created_by: createdBy,
          },
        });

        await createTaskHistoryLog({
          db: tx,
          task,
          createdBy: createdBy,
          actionType: "CREATE",
        });
      }

      // 🧹 Invalidate Sales-Executive Dashboard Cache
      await cache.del(`dashboard:tasks:${vendorId}:${userId}`);
      await Promise.all(
        Array.from(affectedTaskUserIds).map((taskUserId) =>
          cache.del(`dashboard:tasks:${vendorId}:${taskUserId}`),
        ),
      );

      // 5. Insert into LeadDetailedLogs (Audit Trail)
      let actionMessage = "";

      if (effectiveStatus === ActivityStatus.onHold) {
        const formattedDate = new Date(dueDate!).toLocaleDateString("en-IN", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        });
        actionMessage = `Lead has been put On Hold till ${formattedDate}.`;
      } else if (effectiveStatus === ActivityStatus.lostApproval) {
        actionMessage = `Lead has been sent for Lost Approval.`;
      } else if (effectiveStatus === ActivityStatus.lost) {
        actionMessage = `Lead has been marked as Lost.`;
      }

      if (remark && remark.trim() !== "") {
        actionMessage += ` — Remark: ${remark.trim()}`;
      }

      await createLeadLog(tx, {
        vendor_id: vendorId,
        lead_id: leadId,
        account_id: accountId,
        action: actionMessage,
        action_type: "UPDATE",
        created_by: createdBy,
        created_at: new Date(),
      });

      logger.info(
        "✅ LeadDetailedLogs entry created for activity status change",
        { leadId, status: effectiveStatus, actionMessage },
      );

      logger.info("Lead activity status updated", { leadId, vendorId, status: effectiveStatus });
      return updatedLead;
    });

    // ✅ Notification and Email Handling (Outside Transaction)
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
            franchise_id: true,
          },
        }),
        prisma.userMaster.findUnique({
          where: { id: createdBy },
          select: {
            id: true,
            user_name: true,
            user_type: { select: { user_type: true } },
          },
        }),
      ]);

      const leadCode =
        leadInfo?.lead_code ?? `LEAD-${String(leadId).padStart(4, "0")}`;
      const leadName = `${leadInfo?.firstname ?? ""} ${
        leadInfo?.lastname ?? ""
      }`.trim();
      const franchiseId = leadInfo?.franchise_id ?? null;
      const updatedByName = updatedByUser?.user_name ?? "Sales Executive";
      const updatedByRole = updatedByUser?.user_type?.user_type?.toLowerCase();
      const isAdminActor =
        updatedByRole === "admin" || updatedByRole === "super-admin";
      const updatedByRoleLabel = isAdminActor ? "Admin" : "Sales Executive";
      const updatedAt = new Date().toLocaleString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });

      // ✅ UPDATED: Correct routes with leadId and accountId
      const onHoldPath = `/dashboard/leads/leadstable/pendingleaddetails/${leadId}?accountId=${accountId}&tab=onHold`;
      const lostApprovalPath = `/dashboard/leads/leadstable/pendingleaddetails/${leadId}?accountId=${accountId}&tab=lostApproval`;
      const lostPath = `/dashboard/leads/leadstable/pendingleaddetails/${leadId}?accountId=${accountId}&tab=lost`;

      const onHoldUrl = `${baseUrl}${onHoldPath}`;
      const lostApprovalUrl = `${baseUrl}${lostApprovalPath}`;
      const lostUrl = `${baseUrl}${lostPath}`;

      const finalStatus = lead.activity_status;

      // 🔔 Handle onHold and lostApproval notifications
      if (
        finalStatus === ActivityStatus.onHold ||
        finalStatus === ActivityStatus.lostApproval
      ) {
        const { recipients: admins, isSuperAdminFallback } = await getFranchiseAdminRecipients({
          vendorId,
          franchiseId,
          excludeUserId: createdBy,
        });

        const isOnHold = finalStatus === ActivityStatus.onHold;
        const redirectUrl = isOnHold ? onHoldPath : lostApprovalPath; // ✅ UPDATED
        const leadUrl = isOnHold ? onHoldUrl : lostApprovalUrl;

        await Promise.allSettled(
          admins.map(async (admin) => {
              await NotificationService.createAndSend({
                vendor_id: vendorId,
                user_id: admin.id,
                sender_id: createdBy,
                type: NotificationType.LEAD_ACTION,
                title: isOnHold
                  ? "Lead placed On Hold"
                  : "Lost approval required",
                message: isOnHold
                  ? `Lead ${leadCode} - ${leadName} placed On Hold by ${updatedByName}.`
                  : `Lead ${leadCode} - ${leadName} marked Lost and awaiting approval.`,
                entity_type: "lead",
                entity_id: leadId,
                redirect_url: redirectUrl, // ✅ UPDATED
              });

              if (!admin.user_email) return;

              if (isOnHold) {
                await sendLeadOnHoldEmail({
                  vendor_id: vendorId,
                  allowSuperAdmin: isSuperAdminFallback,
              toEmail: admin.user_email,
                  toName: admin.user_name ?? undefined,
                  leadCode,
                  leadName: leadName || "Lead",
                  updatedBy: updatedByName,
                  updatedByRole: updatedByRoleLabel,
                  updatedAt,
                  remark,
                  leadUrl,
                });
              } else {
                await sendLeadLostApprovalEmail({
                  vendor_id: vendorId,
                  allowSuperAdmin: isSuperAdminFallback,
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
            }),
        );

        // 🔔 If onHold and admin is the actor, notify sales executives too
        if (isOnHold && isAdminActor) {
          const mappings = await prisma.leadUserMapping.findMany({
            where: {
              vendor_id: vendorId,
              lead_id: leadId,
              status: "active",
            },
            select: { user_id: true },
          });
          const mappedUserIds = Array.from(
            new Set(mappings.map((mapping) => mapping.user_id)),
          ).filter((id) => id !== createdBy);

          if (mappedUserIds.length > 0) {
            const salesExecutives = await prisma.userMaster.findMany({
              where: {
                id: { in: mappedUserIds },
                status: "active",
                user_type: {
                  user_type: { in: ["sales-executive"], mode: "insensitive" },
                },
              },
              select: { id: true, user_name: true, user_email: true },
            });

            await Promise.allSettled(
              salesExecutives.map(async (salesExec) => {
                await NotificationService.createAndSend({
                  vendor_id: vendorId,
                  user_id: salesExec.id,
                  sender_id: createdBy,
                  type: NotificationType.LEAD_ACTION,
                  title: "Lead placed On Hold",
                  message: `Lead ${leadCode} - ${leadName} placed On Hold by ${updatedByName}.`,
                  entity_type: "lead",
                  entity_id: leadId,
                  redirect_url: onHoldPath, // ✅ UPDATED
                });

                if (!salesExec.user_email) return;

                await sendLeadOnHoldEmail({
                  vendor_id: vendorId,
                  toEmail: salesExec.user_email,
                  toName: salesExec.user_name ?? undefined,
                  leadCode,
                  leadName: leadName || "Lead",
                  updatedBy: updatedByName,
                  updatedByRole: updatedByRoleLabel,
                  updatedAt,
                  remark,
                  leadUrl: onHoldUrl, // ✅ UPDATED
                });
              }),
            );
          }
        }
      }

      // 🔔 Handle lost status notifications
      if (finalStatus === ActivityStatus.lost) {
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
            redirect_url: lostPath, // ✅ UPDATED
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
              leadUrl: lostUrl, // ✅ UPDATED
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
        status: lead.activity_status,
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
    createdBy: number,
    baseUrl: string,
  ) {
    if (!remark) {
      throw new Error("Remark is required when reverting to onGoing.");
    }

    let previousStatus: ActivityStatus | null = null;
    const lead = await prisma.$transaction(async (tx) => {
      const existingLead = await tx.leadMaster.findUnique({
        where: { id: leadId, vendor_id: vendorId },
        select: { activity_status: true },
      });
      previousStatus = existingLead?.activity_status ?? null;

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
      await createLeadLog(tx, {
        vendor_id: vendorId,
        lead_id: leadId,
        account_id: accountId,
        action: actionMessage,
        action_type: "UPDATE",
        created_by: createdBy,
        created_at: new Date(),
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

    // ✅ Notification and Email Handling (Outside Transaction)
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
            franchise_id: true,
            statusType: { select: { tag: true } },
          },
        }),
        prisma.userMaster.findUnique({
          where: { id: createdBy },
          select: {
            id: true,
            user_name: true,
            user_type: { select: { user_type: true } },
          },
        }),
      ]);

      const leadCode =
        leadInfo?.lead_code ?? `LEAD-${String(leadId).padStart(4, "0")}`;
      const leadName = `${leadInfo?.firstname ?? ""} ${
        leadInfo?.lastname ?? ""
      }`.trim();
      const franchiseId = leadInfo?.franchise_id ?? null;
      const stageTag = leadInfo?.statusType?.tag ?? null;
      const rejectedByName = rejectedByUser?.user_name ?? "Admin";
      const rejectedByRole =
        rejectedByUser?.user_type?.user_type?.toLowerCase();
      const isAdminActor =
        rejectedByRole === "admin" || rejectedByRole === "super-admin";
      const rejectedByRoleLabel = isAdminActor ? "Admin" : "Sales Executive";
      const rejectedAt = new Date().toLocaleString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });

      // Resolve stage-aware redirect path
      const leadDetailsPath = resolveLeadStagePath(leadId, stageTag, leadInfo?.account_id);
      const leadDetailsUrl = `${baseUrl}${leadDetailsPath}`;

      // 🔔 Handle onHold → onGoing revert notifications
      if (previousStatus === ActivityStatus.onHold) {
        const { recipients: admins, isSuperAdminFallback } = await getFranchiseAdminRecipients({
          vendorId,
          franchiseId,
          excludeUserId: createdBy,
        });

        await Promise.allSettled(
          admins.map(async (admin) => {
            await NotificationService.createAndSend({
              vendor_id: vendorId,
              user_id: admin.id,
              sender_id: createdBy,
              type: NotificationType.LEAD_ACTION,
              title: "Lead Marked Active from On Hold",
              message: `${leadCode} - ${leadName} has been marked Active"`,
              entity_type: "lead",
              entity_id: leadId,
              redirect_url: leadDetailsPath, // ✅ UPDATED
            });

            if (!admin.user_email) return;

            await sendLeadMarkedActiveEmail({
              vendor_id: vendorId,
              allowSuperAdmin: isSuperAdminFallback,
              toEmail: admin.user_email,
              toName: admin.user_name ?? undefined,
              leadCode,
              leadName: leadName || "Lead",
              updatedBy: rejectedByName,
              updatedAt: rejectedAt,
              remark,
              leadUrl: leadDetailsUrl,
            });
          }),
        );
      }

      // 🔔 Handle lostApproval → onGoing revert notifications
      if (previousStatus === ActivityStatus.lostApproval) {
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
            redirect_url: leadDetailsPath, // ✅ UPDATED
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
      }

      // 🔔 Handle lost → onGoing revert notifications
      if (previousStatus === ActivityStatus.lost) {
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
            title: "Lead Marked Active from Lost",
            message: `${leadCode} - ${leadName} has been marked Active Remark: "${remark}" ${rejectedByName}`,
            entity_type: "lead",
            entity_id: leadId,
            redirect_url: leadDetailsPath, // ✅ UPDATED
          });

          if (salesExec.user_email) {
            await sendLeadActiveEmail({
              vendor_id: vendorId,
              toEmail: salesExec.user_email,
              toName: salesExec.user_name ?? undefined,
              leadCode,
              leadName: leadName || "Lead",
              updatedBy: rejectedByName,
              updatedByRole: rejectedByRoleLabel,
              updatedAt: rejectedAt,
              remark,
              leadUrl: leadDetailsUrl,
            });
          }
        }
      }
    } catch (notifyError: any) {
      logger.warn("⚠️ Failed to send revert to Active notifications", {
        error: notifyError?.message,
        lead_id: leadId,
      });
    }

    return lead;
  }

  // ✅ Helper function to add filter conditions
  private static addFilterConditions(
    baseWhere: Prisma.LeadMasterWhereInput,
    filters: {
      global_search?: string;
      filter_lead_code?: string;
      filter_name?: string;
      contact?: string;
      furniture_type?: Array<number | string>;
      furniture_structure?: Array<number | string>;
      site_map_link?: boolean;
      site_type?: Array<number | string>;
      assign_to?: Array<number>;
      site_address?: string;
      source?: Array<number | string>;
      status?: Array<string>;
      date_range?: { from: string; to: string };
      created_at?: "asc" | "desc";
    },
  ): Prisma.LeadMasterWhereInput {
    const whereClause = { ...baseWhere };

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

    // Lead Code Filter
    const leadCode = toString(filters.filter_lead_code);
    if (leadCode) {
      addAnd({ lead_code: { contains: leadCode, mode: "insensitive" } });
    }

    // Name Filter
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

    // Global Search
    const globalSearch = toString(filters.global_search);
    if (globalSearch) {
      const nameParts = globalSearch.split(/\s+/).filter(Boolean);

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
      } else {
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

    // Contact Filter
    const contactFilter = toString(filters.contact);
    if (contactFilter) {
      addAnd({
        contact_no: { contains: contactFilter, mode: "insensitive" },
      });
    }

    // Site Address Filter
    const siteAddressFilter = toString(filters.site_address);
    if (siteAddressFilter) {
      addAnd({
        site_address: { contains: siteAddressFilter, mode: "insensitive" },
      });
    }

    // Assign To Filter - ARRAY OF NUMBERS
    if (filters.assign_to !== undefined && filters.assign_to !== null) {
      const assignToArray = toArray(filters.assign_to);
      const assignToNumbers = assignToArray
        .map((item) => Number(item))
        .filter((item) => !Number.isNaN(item));

      if (assignToNumbers.length > 0) {
        addAnd({ assign_to: { in: assignToNumbers } });
      }
    }

    // Site Type Filter
    const siteTypeList = parseNumberList(filters.site_type);
    if (siteTypeList.numbers.length > 0) {
      addAnd({ site_type_id: { in: siteTypeList.numbers } });
    } else if (siteTypeList.strings.length > 0) {
      addAnd({ siteType: { type: { in: siteTypeList.strings } } });
    }

    // Source Filter
    const sourceList = parseNumberList(filters.source);
    if (sourceList.numbers.length > 0) {
      addAnd({ source_id: { in: sourceList.numbers } });
    } else if (sourceList.strings.length > 0) {
      addAnd({ source: { type: { in: sourceList.strings } } });
    }

    // Status Filter - ONLY STRINGS
    if (
      filters.status &&
      Array.isArray(filters.status) &&
      filters.status.length > 0
    ) {
      addAnd({
        statusType: {
          type: { in: filters.status },
        },
      });
    }

    // Furniture Type Filter
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

    // Furniture Structure Filter
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

    // Site Map Link Filter
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

    // Date Range Filter
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

      // Main case: Both dates exist (includes single date scenario)
      if (fromDate && toDate) {
        addAnd({
          created_at: {
            gte: fromDate,
            lte: toDate,
          },
        });
      }
      // Edge case: Only 'from' provided
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
      // Edge case: Only 'to' provided
      else if (toDate) {
        addAnd({
          created_at: {
            lte: toDate,
          },
        });
      }
    }

    return whereClause;
  }

  // ✅ Get all onHold leads with filters (POST API with Pagination)
  static async getOnHoldLeadsFilter(
    vendorId: number,
    page: number = 1,
    limit: number = 10,
    filters: {
      franchise_id?: number;
      global_search?: string;
      filter_lead_code?: string;
      filter_name?: string;
      contact?: string;
      furniture_type?: Array<number | string>;
      furniture_structure?: Array<number | string>;
      site_map_link?: boolean;
      site_type?: Array<number | string>;
      assign_to?: Array<number>;
      site_address?: string;
      source?: Array<number | string>;
      status?: Array<string>;
      date_range?: { from: string; to: string };
      created_at?: "asc" | "desc";
    } = {},
  ): Promise<{ leads: any[]; count: number }> {
    logger.info("[LeadActivityStatusService] getOnHoldLeadsFilter called", {
      vendorId,
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

    const whereClause = LeadActivityStatusService.addFilterConditions(
      {
        vendor_id: vendorId,
        ...(filters.franchise_id ? { franchise_id: filters.franchise_id } : {}),
        activity_status: ActivityStatus.onHold,
        is_deleted: false,
      },
      filters,
    );

    const [leads, total] = await Promise.all([
      prisma.leadMaster.findMany({
        where: whereClause,
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
          source: true,
          assignedTo: { select: { id: true, user_name: true } },
          assignedBy: { select: { id: true, user_name: true } },
          createdBy: { select: { id: true, user_name: true } },
        },
        orderBy,
        skip,
        take: limit,
      }),
      prisma.leadMaster.count({ where: whereClause }),
    ]);

    return { leads, count: total };
  }

  // ✅ Get all lost leads with filters (POST API with Pagination)
  static async getLostLeadsFilter(
    vendorId: number,
    page: number = 1,
    limit: number = 10,
    filters: {
      franchise_id?: number;
      global_search?: string;
      filter_lead_code?: string;
      filter_name?: string;
      contact?: string;
      furniture_type?: Array<number | string>;
      furniture_structure?: Array<number | string>;
      site_map_link?: boolean;
      site_type?: Array<number | string>;
      assign_to?: Array<number>;
      site_address?: string;
      source?: Array<number | string>;
      status?: Array<string>;
      date_range?: { from: string; to: string };
      created_at?: "asc" | "desc";
    } = {},
  ): Promise<{ leads: any[]; count: number }> {
    logger.info("[LeadActivityStatusService] getLostLeadsFilter called", {
      vendorId,
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

    const whereClause = LeadActivityStatusService.addFilterConditions(
      {
        vendor_id: vendorId,
        ...(filters.franchise_id ? { franchise_id: filters.franchise_id } : {}),
        activity_status: ActivityStatus.lost,
        is_deleted: false,
      },
      filters,
    );

    const [leads, total] = await Promise.all([
      prisma.leadMaster.findMany({
        where: whereClause,
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
          source: true,
          assignedTo: { select: { id: true, user_name: true } },
          assignedBy: { select: { id: true, user_name: true } },
          createdBy: { select: { id: true, user_name: true } },
        },
        orderBy,
        skip,
        take: limit,
      }),
      prisma.leadMaster.count({ where: whereClause }),
    ]);

    return { leads, count: total };
  }

  // ✅ Get all lostApproval leads with filters (POST API with Pagination)
  static async getLostApprovalLeadsFilter(
    vendorId: number,
    page: number = 1,
    limit: number = 10,
    filters: {
      franchise_id?: number;
      global_search?: string;
      filter_lead_code?: string;
      filter_name?: string;
      contact?: string;
      furniture_type?: Array<number | string>;
      furniture_structure?: Array<number | string>;
      site_map_link?: boolean;
      site_type?: Array<number | string>;
      assign_to?: Array<number>;
      site_address?: string;
      source?: Array<number | string>;
      status?: Array<string>;
      date_range?: { from: string; to: string };
      created_at?: "asc" | "desc";
    } = {},
  ): Promise<{ leads: any[]; count: number }> {
    logger.info(
      "[LeadActivityStatusService] getLostApprovalLeadsFilter called",
      {
        vendorId,
        page,
        limit,
      },
    );

    const skip = (page - 1) * limit;
    const orderBy = {
      created_at:
        filters.created_at === "asc"
          ? Prisma.SortOrder.asc
          : Prisma.SortOrder.desc,
    };

    const whereClause = LeadActivityStatusService.addFilterConditions(
      {
        vendor_id: vendorId,
        ...(filters.franchise_id ? { franchise_id: filters.franchise_id } : {}),
        activity_status: ActivityStatus.lostApproval,
        is_deleted: false,
      },
      filters,
    );

    const [leads, total] = await Promise.all([
      prisma.leadMaster.findMany({
        where: whereClause,
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
          source: true,
          assignedTo: { select: { id: true, user_name: true } },
          assignedBy: { select: { id: true, user_name: true } },
          createdBy: { select: { id: true, user_name: true } },
        },
        orderBy,
        skip,
        take: limit,
      }),
      prisma.leadMaster.count({ where: whereClause }),
    ]);

    return { leads, count: total };
  }

  // ✅ Get activity status counts
  static async getActivityStatusCount(
    vendorId: number,
    franchiseId?: number,
    assignTo?: number,
  ) {
    const counts = await prisma.leadMaster.groupBy({
      by: ["activity_status"],
      where: {
        vendor_id: vendorId,
        ...(franchiseId ? { franchise_id: franchiseId } : {}),
        ...(assignTo ? { assign_to: assignTo } : {}),
        is_draft: false,
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

    // Fill totals from groupBy
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

    // Query for openOnGoing (statusTypeMaster.type = 'open')
    const openOnGoingCount = await prisma.leadMaster.count({
      where: {
        vendor_id: vendorId,
        ...(franchiseId ? { franchise_id: franchiseId } : {}),
        ...(assignTo ? { assign_to: assignTo } : {}),
        is_deleted: false,
        is_draft: false,
        activity_status: "onGoing",
        statusType: {
          type: "open",
        },
      },
    });

    response.openOnGoing = openOnGoingCount;

    return response;
  }
}
