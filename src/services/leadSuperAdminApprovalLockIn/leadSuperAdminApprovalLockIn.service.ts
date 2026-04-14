import { prisma } from "../../prisma/client";
import {
  NotificationType,
  Prisma,
  SuperAdminApprovalType,
} from "../../prisma/generated";
import logger from "../../utils/logger";
import {
  sendBookingDoneApprovalRequiredEmail,
  sendOrderLoginApprovalRequiredEmail,
} from "../email/brevoEmail.service";
import { NotificationService } from "../notification/notification.service";

type TxClient = Prisma.TransactionClient;

interface CreateBookingDoneLockInInput {
  vendor_id: number;
  lead_id: number;
  created_by: number;
  base_date?: Date;
}

interface ApproveLockInInput {
  id: number;
  approved_by: number;
  approval_remark?: string | null;
}

interface CreateOrderLoginLockInInput {
  vendor_id: number;
  lead_id: number;
  created_by: number;
  base_date?: Date;
}

interface ApproveBookingDoneTaskInput {
  lead_id: number;
  task_id: number;
  approved_by: number;
  approval_remark?: string | null;
}

interface ApproveOrderLoginTaskInput {
  lead_id: number;
  task_id: number;
  approved_by: number;
  approval_remark?: string | null;
}

export class LeadSuperAdminApprovalLockInService {
  private getDb(tx?: TxClient) {
    return tx ?? prisma;
  }

  private formatDisplayDate(date: Date) {
    return new Intl.DateTimeFormat("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(date);
  }

  private getClientBaseUrl() {
    return (
      process.env.CLIENT_BASE_URL ||
      process.env.FRONTEND_URL ||
      "http://localhost:3000"
    );
  }

  private getNextDayDueDate(baseDate: Date = new Date()) {
    const dueDate = new Date(baseDate);
    dueDate.setDate(dueDate.getDate() + 1);
    dueDate.setHours(0, 0, 0, 0);
    return dueDate;
  }

  async createBookingDoneLockIn(
    input: CreateBookingDoneLockInInput,
    tx?: TxClient,
  ) {
    const db = this.getDb(tx);

    const lead = await db.leadMaster.findUnique({
      where: { id: input.lead_id },
      select: {
        id: true,
        firstname: true,
        lastname: true,
        lead_code: true,
        vendor_id: true,
        franchise_id: true,
        account_id: true,
        status_id: true,
      },
    });

    if (!lead) {
      throw new Error(`Lead ${input.lead_id} not found`);
    }

    if (!lead.account_id) {
      throw new Error(`Lead ${input.lead_id} is missing account_id`);
    }

    const superAdmin = await db.userMaster.findFirst({
      where: {
        vendor_id: input.vendor_id,
        status: "active",
        user_type: {
          user_type: {
            equals: "super-admin",
            mode: "insensitive",
          },
        },
      },
      select: {
        id: true,
        user_name: true,
        user_email: true,
      },
    });

    if (!superAdmin) {
      throw new Error(
        `Active super-admin not found for vendor ${input.vendor_id}`,
      );
    }

    let approval = await db.leadSuperAdminApprovalLocIns.findFirst({
      where: {
        vendor_id: input.vendor_id,
        lead_id: input.lead_id,
        approval_type: SuperAdminApprovalType.booking_done,
      },
    });
    let isNewApproval = false;

    if (!approval) {
      approval = await db.leadSuperAdminApprovalLocIns.create({
        data: {
          vendor_id: input.vendor_id,
          franchise_id: lead.franchise_id ?? null,
          lead_id: input.lead_id,
          approval_type: SuperAdminApprovalType.booking_done,
          created_by: input.created_by,
          created_at: new Date(),
          is_approved: false,
        },
      });
      isNewApproval = true;
    }

    const leadStage = lead.status_id
      ? (
          await db.statusTypeMaster.findUnique({
            where: { id: lead.status_id },
            select: { type: true },
          })
        )?.type ?? null
      : null;

    let task = await db.userLeadTask.findFirst({
      where: {
        vendor_id: input.vendor_id,
        lead_id: input.lead_id,
        user_id: superAdmin.id,
        task_type: "Booking Done Approval",
        status: {
          in: ["open", "in_progress"],
        },
      },
    });
    let isNewTask = false;

    if (!task) {
      task = await db.userLeadTask.create({
        data: {
          lead_id: input.lead_id,
          account_id: lead.account_id,
          vendor_id: input.vendor_id,
          franchise_id: lead.franchise_id ?? null,
          user_id: superAdmin.id,
          task_type: "Booking Done Approval",
          lead_stage: leadStage,
          due_date: this.getNextDayDueDate(input.base_date),
          remark: "Booking Done approval pending from Super Admin",
          status: "open",
          created_by: input.created_by,
        },
      });
      isNewTask = true;
    }

    if (isNewApproval) {
      await db.leadDetailedLogs.create({
        data: {
          vendor_id: input.vendor_id,
          lead_id: input.lead_id,
          account_id: lead.account_id,
          action: `Lead moved to Booking Done and is now waiting for Super Admin approval before Final Measurement can be assigned.`,
          action_type: "CREATE",
          created_by: input.created_by,
          created_at: new Date(),
        },
      });
    }

    if (isNewTask) {
      const leadName = `${lead.firstname ?? ""} ${lead.lastname ?? ""}`.trim();
      const leadCode =
        lead.lead_code ?? `LEAD-${String(lead.id).padStart(4, "0")}`;
      const displayLead = leadName ? `${leadCode} - ${leadName}` : leadCode;
      const dueDateText = this.formatDisplayDate(task.due_date ?? new Date());
      const actionDate = this.formatDisplayDate(input.base_date ?? new Date());
      const taskUrl = `${this.getClientBaseUrl()}/dashboard/my-tasks?taskId=${task.id}`;
      const movedByUser = await db.userMaster.findUnique({
        where: { id: input.created_by },
        select: { user_name: true },
      });
      const movedByName = movedByUser?.user_name ?? "User";

      try {
        await NotificationService.createAndSend({
          vendor_id: input.vendor_id,
          user_id: superAdmin.id,
          sender_id: input.created_by,
          type: NotificationType.TASK_ASSIGNED,
          title: "Approval Required – Booking Done",
          message: `${displayLead} is awaiting your approval at the Booking Done stage. Due by ${dueDateText}.`,
          entity_type: "lead_super_admin_approval_lockin",
          entity_id: approval.id,
          redirect_url: `/dashboard/my-tasks?taskId=${task.id}`,
        });

        if (superAdmin.user_email) {
          await sendBookingDoneApprovalRequiredEmail({
            vendor_id: input.vendor_id,
            toEmail: superAdmin.user_email,
            toName: superAdmin.user_name ?? undefined,
            leadCode,
            leadName: leadName || "Lead",
            movedBy: movedByName,
            dateOfAction: actionDate,
            dueDate: dueDateText,
            ctaLink: taskUrl,
          });
        }
      } catch (notificationError: any) {
        logger.warn("Booking Done approval notification/email failed", {
          error: notificationError?.message,
          lead_id: input.lead_id,
          super_admin_id: superAdmin.id,
        });
      }
    }

    return {
      approval,
      task,
      superAdminId: superAdmin.id,
    };
  }

  async createOrderLoginLockIn(
    input: CreateOrderLoginLockInInput,
    tx?: TxClient,
  ) {
    const db = this.getDb(tx);

    const lead = await db.leadMaster.findUnique({
      where: { id: input.lead_id },
      select: {
        id: true,
        firstname: true,
        lastname: true,
        lead_code: true,
        vendor_id: true,
        franchise_id: true,
        account_id: true,
        status_id: true,
      },
    });

    if (!lead) {
      throw new Error(`Lead ${input.lead_id} not found`);
    }

    if (!lead.account_id) {
      throw new Error(`Lead ${input.lead_id} is missing account_id`);
    }

    const superAdmin = await db.userMaster.findFirst({
      where: {
        vendor_id: input.vendor_id,
        status: "active",
        user_type: {
          user_type: {
            equals: "super-admin",
            mode: "insensitive",
          },
        },
      },
      select: {
        id: true,
        user_name: true,
        user_email: true,
      },
    });

    if (!superAdmin) {
      throw new Error(
        `Active super-admin not found for vendor ${input.vendor_id}`,
      );
    }

    let approval = await db.leadSuperAdminApprovalLocIns.findFirst({
      where: {
        vendor_id: input.vendor_id,
        lead_id: input.lead_id,
        approval_type: SuperAdminApprovalType.order_login,
      },
    });
    let isNewApproval = false;

    if (!approval) {
      approval = await db.leadSuperAdminApprovalLocIns.create({
        data: {
          vendor_id: input.vendor_id,
          franchise_id: lead.franchise_id ?? null,
          lead_id: input.lead_id,
          approval_type: SuperAdminApprovalType.order_login,
          created_by: input.created_by,
          created_at: new Date(),
          is_approved: false,
        },
      });
      isNewApproval = true;
    }

    const leadStage = lead.status_id
      ? (
          await db.statusTypeMaster.findUnique({
            where: { id: lead.status_id },
            select: { type: true },
          })
        )?.type ?? null
      : null;

    let task = await db.userLeadTask.findFirst({
      where: {
        vendor_id: input.vendor_id,
        lead_id: input.lead_id,
        user_id: superAdmin.id,
        task_type: "Order Login Approval",
        status: {
          in: ["open", "in_progress"],
        },
      },
    });
    let isNewTask = false;

    if (!task) {
      task = await db.userLeadTask.create({
        data: {
          lead_id: input.lead_id,
          account_id: lead.account_id,
          vendor_id: input.vendor_id,
          franchise_id: lead.franchise_id ?? null,
          user_id: superAdmin.id,
          task_type: "Order Login Approval",
          lead_stage: leadStage,
          due_date: this.getNextDayDueDate(input.base_date),
          remark: "Order Login approval pending from Super Admin",
          status: "open",
          created_by: input.created_by,
        },
      });
      isNewTask = true;
    }

    if (isNewApproval) {
      await db.leadDetailedLogs.create({
        data: {
          vendor_id: input.vendor_id,
          lead_id: input.lead_id,
          account_id: lead.account_id,
          action:
            "Lead moved to Order Login and is now waiting for Super Admin approval before Production Files and Order Login can be filled.",
          action_type: "CREATE",
          created_by: input.created_by,
          created_at: new Date(),
        },
      });
    }

    if (isNewTask) {
      const leadName = `${lead.firstname ?? ""} ${lead.lastname ?? ""}`.trim();
      const leadCode =
        lead.lead_code ?? `LEAD-${String(lead.id).padStart(4, "0")}`;
      const displayLead = leadName ? `${leadCode} - ${leadName}` : leadCode;
      const dueDateText = this.formatDisplayDate(task.due_date ?? new Date());
      const actionDate = this.formatDisplayDate(input.base_date ?? new Date());
      const taskUrl = `${this.getClientBaseUrl()}/dashboard/my-tasks?taskId=${task.id}`;
      const movedByUser = await db.userMaster.findUnique({
        where: { id: input.created_by },
        select: { user_name: true },
      });
      const movedByName = movedByUser?.user_name ?? "User";

      try {
        await NotificationService.createAndSend({
          vendor_id: input.vendor_id,
          user_id: superAdmin.id,
          sender_id: input.created_by,
          type: NotificationType.TASK_ASSIGNED,
          title: "Approval Required – Order Login",
          message: `${displayLead} requires approval at Order Login stage. Action due by ${dueDateText}.`,
          entity_type: "lead_super_admin_approval_lockin",
          entity_id: approval.id,
          redirect_url: `/dashboard/my-tasks?taskId=${task.id}`,
        });

        if (superAdmin.user_email) {
          await sendOrderLoginApprovalRequiredEmail({
            vendor_id: input.vendor_id,
            toEmail: superAdmin.user_email,
            toName: superAdmin.user_name ?? undefined,
            leadCode,
            leadName: leadName || "Lead",
            movedBy: movedByName,
            dateOfAction: actionDate,
            dueDate: dueDateText,
            ctaLink: taskUrl,
          });
        }
      } catch (notificationError: any) {
        logger.warn("Order Login approval notification/email failed", {
          error: notificationError?.message,
          lead_id: input.lead_id,
          super_admin_id: superAdmin.id,
        });
      }
    }

    return {
      approval,
      task,
      superAdminId: superAdmin.id,
    };
  }

  async getLeadLockIns(
    vendorId: number,
    leadId: number,
    approvalType?: SuperAdminApprovalType,
  ) {
    return this.getDb().leadSuperAdminApprovalLocIns.findMany({
      where: {
        vendor_id: vendorId,
        lead_id: leadId,
        ...(approvalType ? { approval_type: approvalType } : {}),
      },
      include: {
        approvedBy: {
          select: {
            id: true,
            user_name: true,
            user_email: true,
          },
        },
      },
      orderBy: { id: "desc" },
    });
  }

  async approveLockIn(input: ApproveLockInInput) {
    const existing = await this.getDb().leadSuperAdminApprovalLocIns.findUnique({
      where: { id: input.id },
    });

    if (!existing) {
      throw new Error(`Lock-in ${input.id} not found`);
    }

    return this.getDb().leadSuperAdminApprovalLocIns.update({
      where: { id: input.id },
      data: {
        is_approved: true,
        approved_at: new Date(),
        approved_by: input.approved_by,
        approval_remark: input.approval_remark ?? null,
      },
      include: {
        approvedBy: {
          select: {
            id: true,
            user_name: true,
            user_email: true,
          },
        },
      },
    });
  }

  async approveBookingDoneTask(input: ApproveBookingDoneTaskInput) {
    return prisma.$transaction(async (tx) => {
      const task = await tx.userLeadTask.findFirst({
        where: {
          id: input.task_id,
          lead_id: input.lead_id,
        },
        include: {
          lead: {
            select: {
              vendor_id: true,
              account_id: true,
              firstname: true,
              lastname: true,
              lead_code: true,
            },
          },
        },
      });

      if (!task) {
        throw new Error(
          `Task ${input.task_id} not found for lead ${input.lead_id}`,
        );
      }

      if (task.task_type !== "Booking Done Approval") {
        throw new Error("This task is not a Booking Done Approval task");
      }

      const approval = await tx.leadSuperAdminApprovalLocIns.findFirst({
        where: {
          vendor_id: task.vendor_id,
          lead_id: input.lead_id,
          approval_type: SuperAdminApprovalType.booking_done,
        },
      });

      if (!approval) {
        throw new Error("Booking Done lock-in entry not found");
      }

      const approvedLockIn = await tx.leadSuperAdminApprovalLocIns.update({
        where: { id: approval.id },
        data: {
          is_approved: true,
          approved_at: new Date(),
          approved_by: input.approved_by,
          approval_remark: input.approval_remark ?? null,
        },
      });

      const completedTask = await tx.userLeadTask.update({
        where: { id: input.task_id },
        data: {
          status: "completed",
          updated_by: input.approved_by,
          updated_at: new Date(),
          closed_by: input.approved_by,
          closed_at: new Date(),
          ...(input.approval_remark !== undefined
            ? { remark: input.approval_remark }
            : {}),
        },
      });

      let actionMessage =
        "Super Admin approved the Booking Done lock-in. Final Measurement can now be assigned.";

      if (input.approval_remark && input.approval_remark.trim() !== "") {
        actionMessage += ` — Remark: ${input.approval_remark.trim()}`;
      }

      await tx.leadDetailedLogs.create({
        data: {
          vendor_id: task.vendor_id,
          lead_id: input.lead_id,
          account_id: task.account_id,
          action: actionMessage,
          action_type: "UPDATE",
          created_by: input.approved_by,
          created_at: new Date(),
        },
      });

      return {
        approval: approvedLockIn,
        task: completedTask,
      };
    });
  }

  async approveOrderLoginTask(input: ApproveOrderLoginTaskInput) {
    return prisma.$transaction(async (tx) => {
      const task = await tx.userLeadTask.findFirst({
        where: {
          id: input.task_id,
          lead_id: input.lead_id,
        },
        include: {
          lead: {
            select: {
              vendor_id: true,
              account_id: true,
              firstname: true,
              lastname: true,
              lead_code: true,
            },
          },
        },
      });

      if (!task) {
        throw new Error(
          `Task ${input.task_id} not found for lead ${input.lead_id}`,
        );
      }

      if (task.task_type !== "Order Login Approval") {
        throw new Error("This task is not an Order Login Approval task");
      }

      const approval = await tx.leadSuperAdminApprovalLocIns.findFirst({
        where: {
          vendor_id: task.vendor_id,
          lead_id: input.lead_id,
          approval_type: SuperAdminApprovalType.order_login,
        },
      });

      if (!approval) {
        throw new Error("Order Login lock-in entry not found");
      }

      const approvedLockIn = await tx.leadSuperAdminApprovalLocIns.update({
        where: { id: approval.id },
        data: {
          is_approved: true,
          approved_at: new Date(),
          approved_by: input.approved_by,
          approval_remark: input.approval_remark ?? null,
        },
      });

      const completedTask = await tx.userLeadTask.update({
        where: { id: input.task_id },
        data: {
          status: "completed",
          updated_by: input.approved_by,
          updated_at: new Date(),
          closed_by: input.approved_by,
          closed_at: new Date(),
          ...(input.approval_remark !== undefined
            ? { remark: input.approval_remark }
            : {}),
        },
      });

      let actionMessage =
        "Super Admin approved the Order Login lock-in. Production file upload and Order Login can now be completed.";

      if (input.approval_remark && input.approval_remark.trim() !== "") {
        actionMessage += ` — Remark: ${input.approval_remark.trim()}`;
      }

      await tx.leadDetailedLogs.create({
        data: {
          vendor_id: task.vendor_id,
          lead_id: input.lead_id,
          account_id: task.account_id,
          action: actionMessage,
          action_type: "UPDATE",
          created_by: input.approved_by,
          created_at: new Date(),
        },
      });

      return {
        approval: approvedLockIn,
        task: completedTask,
      };
    });
  }
}
