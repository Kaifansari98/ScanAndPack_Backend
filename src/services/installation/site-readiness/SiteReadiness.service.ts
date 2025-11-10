import { Prisma } from "@prisma/client";
import { prisma } from "../../../prisma/client";

export class SiteReadinessService {
  /** ✅ Fetch all leads with status = Type 12 (Site Readiness) */
  async getLeadsWithStatusSiteReadiness(
    vendorId: number,
    userId: number,
    limit = 10,
    page = 1
  ) {
    const skip = (page - 1) * limit;

    // 🔹 Fetch Site Readiness Status (Type 12)
    const siteReadinessStatus = await prisma.statusTypeMaster.findFirst({
      where: { vendor_id: vendorId, tag: "Type 12" },
      select: { id: true },
    });

    if (!siteReadinessStatus) {
      throw new Error(
        `Site Readiness status (Type 12) not found for vendor ${vendorId}`
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
}
