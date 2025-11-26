import { prisma } from "../../prisma/client";
import { cache } from "../../utils/cache";

export class DashboardService {
  async getSalesExecutiveTaskStats(vendor_id: number, user_id: number) {
    const cacheKey = `dashboard:tasks:${vendor_id}:${user_id}`;

    // 1️⃣ Check Redis Cache
    const cached = await cache.get<any>(cacheKey);
    if (cached) {
      return { fromCache: true, data: cached };
    }

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    // TODAY tasks
    const todayCount = await prisma.userLeadTask.count({
      where: {
        vendor_id,
        user_id,
        status: "open",
        due_date: {
          gte: todayStart,
          lte: todayEnd,
        },
      },
    });

    // UPCOMING tasks (after today)
    const upcomingCount = await prisma.userLeadTask.count({
      where: {
        vendor_id,
        user_id,
        status: "open",
        due_date: {
          gt: todayEnd,
        },
      },
    });

    // OVERDUE tasks (before today)
    const overdueCount = await prisma.userLeadTask.count({
      where: {
        vendor_id,
        user_id,
        status: "open",
        due_date: {
          lt: todayStart,
        },
      },
    });

    const result = {
      today: todayCount,
      upcoming: upcomingCount,
      overdue: overdueCount,
    };

    // 2️⃣ Set Cache (TTL: 5 min)
    await cache.set(cacheKey, result, 300);

    return { fromCache: false, data: result };
  }

  public async getPerformanceSnapshot(vendor_id: number, user_id: number) {
    // 1️⃣ Total Leads Assigned to This User
    const totalLeadsAssigned = await prisma.leadUserMapping.count({
      where: {
        vendor_id,
        user_id,
        status: "active",
      },
    });

    // 2️⃣ Fetch the Status ID for Completed Leads (Tag = Type 17)
    const completedStatus = await prisma.statusTypeMaster.findFirst({
      where: {
        vendor_id,
        tag: "Type 17",
      },
      select: { id: true },
    });

    let totalCompletedLeads = 0;

    if (completedStatus) {
      // Count how many assigned leads are completed
      totalCompletedLeads = await prisma.leadMaster.count({
        where: {
          vendor_id,
          status_id: completedStatus.id,
          userMappings: {
            some: {
              user_id,
              status: "active",
            },
          },
        },
      });
    }

    // 3️⃣ Pending = Assigned − Completed
    const totalPendingLeads = totalLeadsAssigned - totalCompletedLeads;

    return {
      totalLeadsAssigned,
      totalCompletedLeads,
      totalPendingLeads,
    };
  }
}
