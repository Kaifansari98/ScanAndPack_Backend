import { prisma } from "../../prisma/client";
import {
  NotificationType,
  Prisma,
  SuperAdminApprovalType,
} from "../../prisma/generated";
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

export class LeadSuperAdminApprovalLockInService {
  private getDb(tx?: TxClient) {
    return tx ?? prisma;
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

      await NotificationService.createAndSend({
        vendor_id: input.vendor_id,
        user_id: superAdmin.id,
        sender_id: input.created_by,
        type: NotificationType.TASK_ASSIGNED,
        title: "Booking Done approval pending",
        message: `A Booking Done approval task has been assigned for ${displayLead}.`,
        entity_type: "lead_super_admin_approval_lockin",
        entity_id: approval.id,
        redirect_url: "/dashboard/my-tasks",
      });
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
}
