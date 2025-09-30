import { prisma } from "../../../prisma/client";
import { ActivityStatus } from "@prisma/client";
import logger from "../../../utils/logger";

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

    return await prisma.$transaction(async (tx) => {
      // 1. Update LeadMaster
      const lead = await tx.leadMaster.update({
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

        await tx.userLeadTask.create({
          data: {
            lead_id: leadId,
            account_id: accountId,
            vendor_id: vendorId,
            user_id: userId,
            task_type: "Follow Up",
            due_date: new Date(dueDate),
            remark: remark,
            status: "open", // default anyway
            created_by: createdBy,
          },
        });
      }

      logger.info("Lead activity status updated", { leadId, vendorId, status });
      return lead;
    });
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

    return await prisma.$transaction(async (tx) => {
      const lead = await tx.leadMaster.update({
        where: { id: leadId, vendor_id: vendorId },
        data: {
          activity_status: ActivityStatus.onGoing,
          activity_status_remark: remark,
          updated_by: createdBy,
        },
      });

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

      logger.info("Lead activity status reverted to onGoing", {
        leadId,
        vendorId,
      });
      return lead;
    });
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
