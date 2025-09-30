import { prisma } from "../../../prisma/client";
import { ActivityStatus } from "@prisma/client";
import { ApiErrorResponse } from "../../../types/leadModule.types";
import logger from "../../../utils/logger";
import { ApiResponse } from "../../../utils/apiResponse";

export class LeadActivityStatusService {
  // Change status (onHold / lost)
  static async updateStatus(
    leadId: number,
    vendorId: number,
    accountId: number,
    userId: number,
    status: ActivityStatus,
    remark: string,
    createdBy: number
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
}