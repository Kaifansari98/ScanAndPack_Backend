import { prisma } from "../../prisma/client";
import {
  NotificationType,
  Prisma,
  SuperAdminApprovalType,
} from "../../prisma/generated";
import logger from "../../utils/logger";
import {
  sendBookingDoneApprovalRequiredEmail,
  sendDispatchPlanningApprovalRequiredEmail,
  sendOrderLoginAssignedEmail,
  sendOrderLoginApprovalRequiredEmail,
} from "../email/brevoEmail.service";
import {
  sendBookingDoneApprovedEmail,
  sendDispatchPlanningApprovedEmail,
  sendOrderLoginApprovedEmail,
} from "../email/brevoEmail2.service";
import { NotificationService } from "../notification/notification.service";
import { createTaskHistoryLog } from "../task/taskHistory.service";

type TxClient = Prisma.TransactionClient;

interface CreateBookingDoneLockInInput {
  vendor_id: number;
  lead_id: number;
  created_by: number;
  base_date?: Date;
  clientBaseUrl?: string;
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
  instance_id?: number | null;
  clientBaseUrl?: string;
}

interface CreateDispatchPlanningLockInInput {
  vendor_id: number;
  lead_id: number;
  created_by: number;
  base_date?: Date;
  clientBaseUrl?: string;
}

interface ApproveBookingDoneTaskInput {
  lead_id: number;
  task_id: number;
  approved_by: number;
  approval_remark?: string | null;
  clientBaseUrl?: string;
}

interface ApproveOrderLoginTaskInput {
  lead_id: number;
  task_id: number;
  approved_by: number;
  approval_remark?: string | null;
  clientBaseUrl?: string;
}

interface ApproveDispatchPlanningTaskInput {
  lead_id: number;
  task_id: number;
  approved_by: number;
  approval_remark?: string | null;
  clientBaseUrl?: string;
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

  private getClientBaseUrl(clientBaseUrl?: string) {
    if (typeof clientBaseUrl === "string" && clientBaseUrl.trim().length > 0) {
      return clientBaseUrl.replace(/\/$/, "");
    }

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

  private getTaskTypeForApprovalType(approvalType?: SuperAdminApprovalType) {
    switch (approvalType) {
      case SuperAdminApprovalType.booking_done:
        return "Booking Done Approval";
      case SuperAdminApprovalType.order_login:
        return "Order Login Approval";
      case SuperAdminApprovalType.dispatch_planning:
        return "Dispatch Planning Approval";
      default:
        return null;
    }
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

    const orderLoginStatusType = await db.statusTypeMaster.findFirst({
      where: {
        vendor_id: input.vendor_id,
        tag: "Type 9",
      },
      select: { type: true },
    });

    const leadStage =
      orderLoginStatusType?.type ??
      (lead.status_id
        ? (
            await db.statusTypeMaster.findUnique({
              where: { id: lead.status_id },
              select: { type: true },
            })
          )?.type ?? null
        : null);

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
      await createTaskHistoryLog({
        db,
        task,
        createdBy: input.created_by,
        actionType: "CREATE",
      });
      isNewTask = true;
    }

    if (isNewApproval) {
      await db.leadDetailedLogs.create({
        data: {
          vendor_id: input.vendor_id,
          lead_id: input.lead_id,
          account_id: lead.account_id,
          action: `Lead moved to Booking Done and is now waiting for Accounts approval before Final Measurement can be assigned.`,
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
      const taskUrl = `${this.getClientBaseUrl(input.clientBaseUrl)}/dashboard/my-tasks?taskId=${task.id}`;
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

    const instance =
      typeof input.instance_id !== "undefined" && input.instance_id !== null
        ? await db.leadProductStructureInstance.findFirst({
            where: {
              id: input.instance_id,
              lead_id: input.lead_id,
              vendor_id: input.vendor_id,
            },
            select: {
              id: true,
              title: true,
              quantity_index: true,
            },
          })
        : null;

    if (typeof input.instance_id !== "undefined" && input.instance_id !== null && !instance) {
      throw new Error(
        `Order Login instance ${input.instance_id} not found for lead ${input.lead_id}`,
      );
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

    if (approval.is_approved) {
      return {
        approval,
        task: null,
        superAdminId: superAdmin.id,
      };
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
        ...(typeof input.instance_id !== "undefined"
          ? { instance_id: input.instance_id ?? null }
          : {}),
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
          remark: instance?.title
            ? `Order Login approval pending from Super Admin for instance ${instance.title}`
            : "Order Login approval pending from Super Admin",
          status: "open",
          created_by: input.created_by,
          ...(typeof input.instance_id !== "undefined"
            ? { instance_id: input.instance_id ?? null }
            : {}),
        },
      });
      await createTaskHistoryLog({
        db,
        task,
        createdBy: input.created_by,
        actionType: "CREATE",
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
            "Lead moved to Order Login and is now waiting for Accounts approval before Production Files and Order Login can be filled.",
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
      const displayLeadWithInstance =
        instance?.quantity_index && instance?.title
          ? `${displayLead}.${instance.quantity_index} (${instance.title})`
          : displayLead;
      const dueDateText = this.formatDisplayDate(task.due_date ?? new Date());
      const actionDate = this.formatDisplayDate(input.base_date ?? new Date());
      const taskUrl = `${this.getClientBaseUrl(input.clientBaseUrl)}/dashboard/my-tasks?taskId=${task.id}`;
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
          message: `${displayLeadWithInstance} requires approval at Order Login stage. Action due by ${dueDateText}.`,
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
            leadName: instance?.title
              ? `${leadName || "Lead"} (${instance.title})`
              : leadName || "Lead",
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

  async createDispatchPlanningLockIn(
    input: CreateDispatchPlanningLockInInput,
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
        approval_type: SuperAdminApprovalType.dispatch_planning,
      },
    });
    let isNewApproval = false;

    if (!approval) {
      approval = await db.leadSuperAdminApprovalLocIns.create({
        data: {
          vendor_id: input.vendor_id,
          franchise_id: lead.franchise_id ?? null,
          lead_id: input.lead_id,
          approval_type: SuperAdminApprovalType.dispatch_planning,
          created_by: input.created_by,
          created_at: new Date(),
          is_approved: false,
        },
      });
      isNewApproval = true;
    }

    const dispatchPlanningStatusType = await db.statusTypeMaster.findFirst({
      where: {
        vendor_id: input.vendor_id,
        tag: "Type 13",
      },
      select: { type: true },
    });

    const leadStage =
      dispatchPlanningStatusType?.type ??
      (lead.status_id
        ? (
            await db.statusTypeMaster.findUnique({
              where: { id: lead.status_id },
              select: { type: true },
            })
          )?.type ?? null
        : null);

    let task = await db.userLeadTask.findFirst({
      where: {
        vendor_id: input.vendor_id,
        lead_id: input.lead_id,
        user_id: superAdmin.id,
        task_type: "Dispatch Planning Approval",
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
          task_type: "Dispatch Planning Approval",
          lead_stage: leadStage,
          due_date: this.getNextDayDueDate(input.base_date),
          remark: "Dispatch Planning approval pending from Super Admin",
          status: "open",
          created_by: input.created_by,
        },
      });
      await createTaskHistoryLog({
        db,
        task,
        createdBy: input.created_by,
        actionType: "CREATE",
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
            "Lead moved to Dispatch Planning and is now waiting for Accounts approval before Dispatch Planning inputs can be filled.",
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
      const taskUrl = `${this.getClientBaseUrl(input.clientBaseUrl)}/dashboard/my-tasks?taskId=${task.id}`;
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
          title: "Approval Required – Dispatch Planning",
          message: `${displayLead} is pending approval at Dispatch Planning stage. Due by ${dueDateText}.`,
          entity_type: "lead_super_admin_approval_lockin",
          entity_id: approval.id,
          redirect_url: `/dashboard/my-tasks?taskId=${task.id}`,
        });

        if (superAdmin.user_email) {
          await sendDispatchPlanningApprovalRequiredEmail({
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
        logger.warn("Dispatch Planning approval notification/email failed", {
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
    const db = this.getDb();
    const lockIns = await db.leadSuperAdminApprovalLocIns.findMany({
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

    const taskType = this.getTaskTypeForApprovalType(approvalType);
    if (!taskType) {
      return lockIns;
    }

    const pendingTasks = await db.userLeadTask.findMany({
      where: {
        vendor_id: vendorId,
        lead_id: leadId,
        task_type: taskType,
        status: {
          in: ["open", "in_progress"],
        },
      },
      select: {
        id: true,
        instance_id: true,
        status: true,
        due_date: true,
      },
      orderBy: { id: "desc" },
    });

    return lockIns.map((lockIn) => ({
      ...lockIn,
      pending_tasks: pendingTasks,
    }));
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
    const result = await prisma.$transaction(async (tx) => {
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
      await createTaskHistoryLog({
        db: tx,
        task: completedTask,
        createdBy: input.approved_by,
        actionType: "UPDATE",
      });

      let actionMessage =
        "Super Admin approved the Booking Done Approval.";

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
        lead: task.lead,
      };
    });

    try {
      const [approvedByUser, salesExecMappings] = await Promise.all([
        prisma.userMaster.findUnique({
          where: { id: input.approved_by },
          select: { user_name: true },
        }),
        prisma.leadUserMapping.findMany({
          where: {
            lead_id: input.lead_id,
            vendor_id: result.lead.vendor_id,
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
        }),
      ]);

      if (salesExecMappings.length > 0) {
        const leadName =
          `${result.lead.firstname ?? ""} ${result.lead.lastname ?? ""}`.trim() ||
          "Lead";
        const leadCode =
          result.lead.lead_code ??
          `LEAD-${String(input.lead_id).padStart(4, "0")}`;
        const displayLead = `${leadCode} - ${leadName}`;
        const approvedByName = approvedByUser?.user_name ?? "Super Admin";
        const approvalDate = this.formatDisplayDate(
          result.approval.approved_at ?? new Date(),
        );
        const redirectPath = result.lead.account_id
          ? `/dashboard/leads/booking-stage/details/${input.lead_id}?accountId=${result.lead.account_id}`
          : `/dashboard/leads/booking-stage/details/${input.lead_id}`;
        const ctaLink = `${this.getClientBaseUrl(input.clientBaseUrl)}${redirectPath}`;

        const seenIds = new Set<number>();
        const uniqueSalesExecs = salesExecMappings
          .map((mapping) => mapping.user)
          .filter((user) => {
            if (seenIds.has(user.id)) return false;
            seenIds.add(user.id);
            return true;
          });

        await Promise.allSettled(
          uniqueSalesExecs.map(async (user) => {
            await NotificationService.createAndSend({
              vendor_id: result.lead.vendor_id,
              user_id: user.id,
              sender_id: input.approved_by,
              type: NotificationType.LEAD_ACTION,
              title: "Booking Done Approved",
              message: `Booking done for ${displayLead} is now approved.`,
              entity_type: "lead",
              entity_id: input.lead_id,
              redirect_url: redirectPath,
            });

            if (user.user_email) {
              await sendBookingDoneApprovedEmail({
                vendor_id: result.lead.vendor_id,
                toEmail: user.user_email,
                toName: user.user_name ?? undefined,
                leadCode,
                leadName,
                approvedBy: approvedByName,
                approvalDate,
                ctaLink,
              });
            }
          }),
        );
      }
    } catch (notificationError: any) {
      logger.warn("Booking Done approved notification/email failed", {
        error: notificationError?.message,
        lead_id: input.lead_id,
        task_id: input.task_id,
      });
    }

    return {
      approval: result.approval,
      task: result.task,
    };
  }

  async approveOrderLoginTask(input: ApproveOrderLoginTaskInput) {
    const result = await prisma.$transaction(async (tx) => {
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
      await createTaskHistoryLog({
        db: tx,
        task: completedTask,
        createdBy: input.approved_by,
        actionType: "UPDATE",
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
        lead: task.lead,
      };
    });

    try {
      const [approvedByUser, salesExecMappings] = await Promise.all([
        prisma.userMaster.findUnique({
          where: { id: input.approved_by },
          select: { user_name: true },
        }),
        prisma.leadUserMapping.findMany({
          where: {
            lead_id: input.lead_id,
            vendor_id: result.lead.vendor_id,
            status: "active",
            user: {
              user_type: {
                user_type: {
                  equals: "backend",
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
        }),
      ]);

      const leadName =
        `${result.lead.firstname ?? ""} ${result.lead.lastname ?? ""}`.trim() ||
        "Lead";
      const leadCode =
        result.lead.lead_code ??
        `LEAD-${String(input.lead_id).padStart(4, "0")}`;
      const displayLead = `${leadCode} - ${leadName}`;
      const approvedByName = approvedByUser?.user_name ?? "Super Admin";
      const approvalDate = this.formatDisplayDate(
        result.approval.approved_at ?? new Date(),
      );

      const orderLoginTasks = await prisma.userLeadTask.findMany({
        where: {
          vendor_id: result.lead.vendor_id,
          lead_id: input.lead_id,
          task_type: "Order Login",
          status: { in: ["open", "in_progress"] },
        },
        select: {
          id: true,
          user_id: true,
          instance_id: true,
          user: {
            select: {
              user_name: true,
              user_email: true,
            },
          },
        },
      });
      const primaryOrderLoginTask = orderLoginTasks[0] ?? null;

      if (salesExecMappings.length > 0) {
        const salesExecRedirectParams = new URLSearchParams({
          tab: "orderLogin",
        });
        if (result.lead.account_id) {
          salesExecRedirectParams.set(
            "accountId",
            String(result.lead.account_id),
          );
        }
        if (primaryOrderLoginTask?.instance_id) {
          salesExecRedirectParams.set(
            "instance_id",
            String(primaryOrderLoginTask.instance_id),
          );
        }
        const redirectPath = `/dashboard/production/order-login/details/${input.lead_id}?${salesExecRedirectParams.toString()}`;
        const ctaLink = `${this.getClientBaseUrl()}${redirectPath}`;

        const seenIds = new Set<number>();
        const uniqueSalesExecs = salesExecMappings
          .map((mapping) => mapping.user)
          .filter((user) => {
            if (seenIds.has(user.id)) return false;
            seenIds.add(user.id);
            return true;
          });

        await Promise.allSettled(
          uniqueSalesExecs.map(async (user) => {
            await NotificationService.createAndSend({
              vendor_id: result.lead.vendor_id,
              user_id: user.id,
              sender_id: input.approved_by,
              type: NotificationType.LEAD_ACTION,
              title: "Order Login Approved",
              message: `${displayLead} approved. Proceed with Order Login actions.`,
              entity_type: "lead",
              entity_id: input.lead_id,
              redirect_url: redirectPath,
            });

            if (user.user_email) {
              await sendOrderLoginApprovedEmail({
                vendor_id: result.lead.vendor_id,
                toEmail: user.user_email,
                toName: user.user_name ?? undefined,
                leadCode,
                leadName,
                approvedBy: approvedByName,
                approvalDate,
                ctaLink,
              });
            }
          }),
        );
      }

      if (orderLoginTasks.length > 0) {
        await Promise.allSettled(
          orderLoginTasks.map(async (task) => {
            if (task.user_id === input.approved_by) return;

            const redirectParams = new URLSearchParams({
              tab: "orderLogin",
            });
            if (result.lead.account_id) {
              redirectParams.set("accountId", String(result.lead.account_id));
            }
            if (task.instance_id) {
              redirectParams.set("instance_id", String(task.instance_id));
            }

            const queryString = redirectParams.toString();
            const redirectPath = `/dashboard/production/order-login/details/${input.lead_id}${
              queryString ? `?${queryString}` : ""
            }`;
            const projectUrl = `${this.getClientBaseUrl(input.clientBaseUrl)}${redirectPath}`;
            const assignedAt = this.formatDisplayDate(
              result.approval.approved_at ?? new Date(),
            );

            await NotificationService.createAndSend({
              vendor_id: result.lead.vendor_id,
              user_id: task.user_id,
              sender_id: input.approved_by,
              type: NotificationType.TASK_ASSIGNED,
              title: "Order Login Task Assigned",
              message: `${displayLead} has been assigned to you for Order Login.`,
              entity_type: "lead",
              entity_id: input.lead_id,
              redirect_url: redirectPath,
            });

            if (task.user?.user_email) {
              await sendOrderLoginAssignedEmail({
                vendor_id: result.lead.vendor_id,
                toEmail: task.user.user_email,
                toName: task.user.user_name ?? undefined,
                leadCode,
                leadName,
                assignedBy: approvedByName,
                assignedAt,
                projectUrl,
              });
            }
          }),
        );
      }
    } catch (notificationError: any) {
      logger.warn("Order Login approved notification/email failed", {
        error: notificationError?.message,
        lead_id: input.lead_id,
        task_id: input.task_id,
      });
    }

    return {
      approval: result.approval,
      task: result.task,
    };
  }

  async approveDispatchPlanningTask(input: ApproveDispatchPlanningTaskInput) {
    const result = await prisma.$transaction(async (tx) => {
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

      if (task.task_type !== "Dispatch Planning Approval") {
        throw new Error("This task is not a Dispatch Planning Approval task");
      }

      const approval = await tx.leadSuperAdminApprovalLocIns.findFirst({
        where: {
          vendor_id: task.vendor_id,
          lead_id: input.lead_id,
          approval_type: SuperAdminApprovalType.dispatch_planning,
        },
      });

      if (!approval) {
        throw new Error("Dispatch Planning lock-in entry not found");
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
      await createTaskHistoryLog({
        db: tx,
        task: completedTask,
        createdBy: input.approved_by,
        actionType: "UPDATE",
      });

      let actionMessage =
        "Super Admin approved the Dispatch Planning lock-in. Dispatch Planning inputs can now be filled.";

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
        lead: task.lead,
      };
    });

    try {
      const [approvedByUser, salesExecMappings] = await Promise.all([
        prisma.userMaster.findUnique({
          where: { id: input.approved_by },
          select: { user_name: true },
        }),
        prisma.leadUserMapping.findMany({
          where: {
            lead_id: input.lead_id,
            vendor_id: result.lead.vendor_id,
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
        }),
      ]);

      if (salesExecMappings.length > 0) {
        const leadName =
          `${result.lead.firstname ?? ""} ${result.lead.lastname ?? ""}`.trim() ||
          "Lead";
        const leadCode =
          result.lead.lead_code ??
          `LEAD-${String(input.lead_id).padStart(4, "0")}`;
        const displayLead = `${leadCode} - ${leadName}`;
        const approvedByName = approvedByUser?.user_name ?? "Super Admin";
        const approvalDate = this.formatDisplayDate(
          result.approval.approved_at ?? new Date(),
        );
        const redirectPath = result.lead.account_id
          ? `/dashboard/installation/dispatch-planning/details/${input.lead_id}?accountId=${result.lead.account_id}`
          : `/dashboard/installation/dispatch-planning/details/${input.lead_id}`;
        const ctaLink = `${this.getClientBaseUrl(input.clientBaseUrl)}${redirectPath}`;

        const seenIds = new Set<number>();
        const uniqueSalesExecs = salesExecMappings
          .map((mapping) => mapping.user)
          .filter((user) => {
            if (seenIds.has(user.id)) return false;
            seenIds.add(user.id);
            return true;
          });

        await Promise.allSettled(
          uniqueSalesExecs.map(async (user) => {
            await NotificationService.createAndSend({
              vendor_id: result.lead.vendor_id,
              user_id: user.id,
              sender_id: input.approved_by,
              type: NotificationType.LEAD_ACTION,
              title: "Dispatch Planning Approved",
              message: `${displayLead} approved. You can now update dispatch planning details.`,
              entity_type: "lead",
              entity_id: input.lead_id,
              redirect_url: redirectPath,
            });

            if (user.user_email) {
              await sendDispatchPlanningApprovedEmail({
                vendor_id: result.lead.vendor_id,
                toEmail: user.user_email,
                toName: user.user_name ?? undefined,
                leadCode,
                leadName,
                approvedBy: approvedByName,
                approvalDate,
                ctaLink,
              });
            }
          }),
        );
      }
    } catch (notificationError: any) {
      logger.warn("Dispatch Planning approved notification/email failed", {
        error: notificationError?.message,
        lead_id: input.lead_id,
        task_id: input.task_id,
      });
    }

    return {
      approval: result.approval,
      task: result.task,
    };
  }
}
