import { prisma } from "../../prisma/client";
import { cache } from "../../utils/cache";
import { LeadUserStatus, LeadTaskStatus } from "@prisma/client";

// Utility → Date ranges
const getDateRanges = () => {
  const now = new Date();

  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);

  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay() + 1);
  startOfWeek.setHours(0, 0, 0, 0);

  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 6);
  endOfWeek.setHours(23, 59, 59, 999);

  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  endOfMonth.setHours(23, 59, 59, 999);

  const startOfYear = new Date(now.getFullYear(), 0, 1);
  const endOfYear = new Date(now.getFullYear(), 11, 31);
  endOfYear.setHours(23, 59, 59, 999);

  return {
    today: { start: startOfToday, end: endOfToday },
    week: { start: startOfWeek, end: endOfWeek },
    month: { start: startOfMonth, end: endOfMonth },
    year: { start: startOfYear, end: endOfYear },
  };
};

export class DashboardService {
  // -------------------------------------------------------
  // 1️⃣ SALES EXECUTIVE TASK STATS (Today / Upcoming / Overdue)
  //     ✔ Admin → sees ALL tasks for vendor
  // -------------------------------------------------------
  public async getSalesExecutiveTaskStats(vendor_id: number, user_id: number) {
    // Determine if user is admin
    const user = await prisma.userMaster.findUnique({
      where: { id: user_id },
      include: { user_type: true },
    });

    const isAdmin = user?.user_type?.user_type?.toLowerCase() === "admin";

    const cacheKey = isAdmin
      ? `dashboard:tasks:${vendor_id}:admin`
      : `dashboard:tasks:${vendor_id}:${user_id}`;

    // 🚀 Check Cache
    const cached = await cache.get<any>(cacheKey);
    if (cached) {
      return { fromCache: true, data: cached };
    }

    // Date Boundaries
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    // If admin → remove user filter
    const whereUser = isAdmin
      ? { vendor_id, status: LeadTaskStatus.open }
      : { vendor_id, user_id, status: LeadTaskStatus.open };

    // TODAY tasks
    const todayCount = await prisma.userLeadTask.count({
      where: {
        ...whereUser,
        due_date: { gte: todayStart, lte: todayEnd },
      },
    });

    // UPCOMING tasks
    const upcomingCount = await prisma.userLeadTask.count({
      where: {
        ...whereUser,
        due_date: { gt: todayEnd },
      },
    });

    // OVERDUE tasks
    const overdueCount = await prisma.userLeadTask.count({
      where: {
        ...whereUser,
        due_date: { lt: todayStart },
      },
    });

    const result = {
      today: todayCount,
      upcoming: upcomingCount,
      overdue: overdueCount,
      isAdmin, // optional debug output
    };

    // Save to cache (5 min)
    await cache.set(cacheKey, result, 300);

    return { fromCache: false, data: result };
  }

  // -------------------------------------------------------
  // 2️⃣ PERFORMANCE SNAPSHOT (Leads + Bookings Value)
  //     ✔ Admin → sees vendor-wide performance
  // -------------------------------------------------------
  public async getPerformanceSnapshot(vendor_id: number, user_id: number) {
    const ranges = getDateRanges();

    // Fetch user and check role
    const user = await prisma.userMaster.findUnique({
      where: { id: user_id },
      include: { user_type: true },
    });

    const isAdmin = user?.user_type?.user_type?.toLowerCase() === "admin";

    // -------------------------------------
    // LEADS ASSIGNED
    // -------------------------------------
    const assignedWhere = isAdmin
      ? { vendor_id, status: LeadUserStatus.active }
      : { vendor_id, user_id, status: LeadUserStatus.active };

    const totalLeadsAssigned = await prisma.leadUserMapping.count({
      where: assignedWhere,
    });

    // -------------------------------------
    // COMPLETED LEADS (Type 17)
    // -------------------------------------
    const completedStatus = await prisma.statusTypeMaster.findFirst({
      where: { vendor_id, tag: "Type 17" },
      select: { id: true },
    });

    let totalCompletedLeads = 0;

    if (completedStatus) {
      const completedWhere = isAdmin
        ? {
            vendor_id,
            status_id: completedStatus.id,
          }
        : {
            vendor_id,
            status_id: completedStatus.id,
            userMappings: {
              some: { user_id, status: LeadUserStatus.active },
            },
          };

      totalCompletedLeads = await prisma.leadMaster.count({
        where: completedWhere,
      });
    }

    // Pending = Assigned - Completed
    const totalPendingLeads = totalLeadsAssigned - totalCompletedLeads;

    // -------------------------------------
    // BOOKED LEADS (Type 4)
    // -------------------------------------
    const bookingStatus = await prisma.statusTypeMaster.findFirst({
      where: { vendor_id, tag: "Type 4" },
      select: { id: true },
    });

    let booked = { today: 0, week: 0, month: 0, year: 0, overall: 0 };

    if (bookingStatus) {
      const countByRange = (start: Date, end: Date) =>
        prisma.leadStatusLogs.count({
          where: {
            vendor_id,
            status_id: bookingStatus.id,
            created_at: { gte: start, lte: end },
          },
        });

      booked = {
        today: await countByRange(ranges.today.start, ranges.today.end),
        week: await countByRange(ranges.week.start, ranges.week.end),
        month: await countByRange(ranges.month.start, ranges.month.end),
        year: await countByRange(ranges.year.start, ranges.year.end),
        overall: await prisma.leadStatusLogs.count({
          where: { vendor_id, status_id: bookingStatus.id },
        }),
      };
    }

    // -------------------------------------
    // BOOKING VALUE (Payment Type 2)
    // -------------------------------------
    const bookingType = await prisma.paymentTypeMaster.findFirst({
      where: { vendor_id, tag: "Type 2" },
      select: { id: true },
    });

    let bookingValue = { today: 0, week: 0, month: 0, year: 0, overall: 0 };

    if (bookingType) {
      const sumByRange = (start: Date, end: Date) =>
        prisma.paymentInfo.aggregate({
          where: {
            vendor_id,
            payment_type_id: bookingType.id,
            payment_date: { gte: start, lte: end },
          },
          _sum: { amount: true },
        });

      bookingValue = {
        today:
          (await sumByRange(ranges.today.start, ranges.today.end))._sum
            .amount || 0,
        week:
          (await sumByRange(ranges.week.start, ranges.week.end))._sum.amount ||
          0,
        month:
          (await sumByRange(ranges.month.start, ranges.month.end))._sum
            .amount || 0,
        year:
          (await sumByRange(ranges.year.start, ranges.year.end))._sum.amount ||
          0,
        overall:
          (
            await prisma.paymentInfo.aggregate({
              where: {
                vendor_id,
                payment_type_id: bookingType.id,
              },
              _sum: { amount: true },
            })
          )._sum.amount || 0,
      };
    }

    const avgDaysToBooking = await this.calculateAvgDaysToBooking(
      vendor_id,
      user_id,
      isAdmin
    );

    return {
      isAdmin,
      totalLeadsAssigned,
      totalCompletedLeads,
      totalPendingLeads,

      bookedToday: booked.today,
      bookedThisWeek: booked.week,
      bookedThisMonth: booked.month,
      bookedThisYear: booked.year,
      bookedOverall: booked.overall,

      bookingValueToday: bookingValue.today,
      bookingValueThisWeek: bookingValue.week,
      bookingValueThisMonth: bookingValue.month,
      bookingValueThisYear: bookingValue.year,
      bookingValueOverall: bookingValue.overall,

      avgDaysToBooking,
    };
  }

  private async calculateAvgDaysToBooking(
    vendor_id: number,
    user_id: number,
    isAdmin: boolean
  ) {
    // Fetch Status IDs (Type 1 = Open, Type 4 = Booking)
    const [openStatus, bookingStatus] = await Promise.all([
      prisma.statusTypeMaster.findFirst({
        where: { vendor_id, tag: "Type 1" },
        select: { id: true },
      }),
      prisma.statusTypeMaster.findFirst({
        where: { vendor_id, tag: "Type 4" },
        select: { id: true },
      }),
    ]);

    if (!openStatus || !bookingStatus) return 0;

    const openId = openStatus.id;
    const bookingId = bookingStatus.id;

    // ---------------------------------------------
    // ⭐ STEP 1: Fetch logs only for relevant leads
    // ---------------------------------------------
    // Admin → no user filter
    // SE → only leads mapped to SE
    let leadFilter: any = { vendor_id };

    if (!isAdmin) {
      leadFilter = {
        vendor_id,
        userMappings: {
          some: {
            user_id,
            status: "active",
          },
        },
      };
    }

    // Get all relevant lead IDs first
    const relevantLeads = await prisma.leadMaster.findMany({
      where: leadFilter,
      select: { id: true },
    });

    if (relevantLeads.length === 0) return 0;

    const leadIds = relevantLeads.map((l) => l.id);

    // Now fetch logs only for these leads
    const logs = await prisma.leadStatusLogs.findMany({
      where: {
        vendor_id,
        lead_id: { in: leadIds },
        status_id: { in: [openId, bookingId] },
      },
      orderBy: { created_at: "asc" },
      select: {
        lead_id: true,
        status_id: true,
        created_at: true,
      },
    });

    // ---------------------------------------------
    // ⭐ STEP 2: Build lead-wise mapping
    // ---------------------------------------------
    const leadMap = new Map<number, { openDate?: Date; bookingDate?: Date }>();

    for (const log of logs) {
      if (!leadMap.has(log.lead_id)) leadMap.set(log.lead_id, {});

      const entry = leadMap.get(log.lead_id)!;

      if (log.status_id === openId && !entry.openDate) {
        entry.openDate = log.created_at;
      }

      if (log.status_id === bookingId && !entry.bookingDate) {
        entry.bookingDate = log.created_at;
      }
    }

    // ---------------------------------------------
    // ⭐ STEP 3: Calculate differences
    // ---------------------------------------------
    let totalDays = 0;
    let count = 0;

    for (const { openDate, bookingDate } of leadMap.values()) {
      if (!openDate || !bookingDate) continue;

      const diffMs = bookingDate.getTime() - openDate.getTime();
      const days = diffMs / (1000 * 60 * 60 * 24);

      if (days >= 0) {
        totalDays += days;
        count++;
      }
    }

    function convertDaysToReadableFormat(decimalDays: number) {
      if (decimalDays <= 0) return { days: 0, hours: 0, minutes: 0 };

      const totalMinutes = decimalDays * 24 * 60;

      const days = Math.floor(totalMinutes / (24 * 60));
      const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
      const minutes = Math.floor(totalMinutes % 60);

      return { days, hours, minutes };
    }

    const avgDays = count === 0 ? 0 : Number((totalDays / count).toFixed(2));
    const readable = convertDaysToReadableFormat(avgDays);

    return { avgDays, readable };
  }

  public async getLeadStatusWiseCounts(vendor_id: number, user_id?: number) {
    const cacheKey = user_id
      ? `lead-status-counts:${vendor_id}:${user_id}`
      : `lead-status-counts:${vendor_id}:overall`;

    // 🔥 1) Try Redis
    const cached = await cache.get(cacheKey);
    if (cached) {
      return { fromCache: true, data: JSON.parse(cached as string) };
    }

    // 2️⃣ Fetch all statusTypeMaster entries (Type 1–16)
    const statuses = await prisma.statusTypeMaster.findMany({
      where: { vendor_id },
      select: { id: true, tag: true },
    });

    const statusMap = new Map<string, number>();
    statuses.forEach((s) => statusMap.set(s.tag, s.id));

    // 3️⃣ User filter (applies only for SE mode)
    const userFilter = user_id
      ? { userMappings: { some: { user_id, status: LeadUserStatus.active } } }
      : {};

    // Helper to count leads for a status
    const countStatus = async (typeTag: string) => {
      const status_id = statusMap.get(typeTag);
      if (!status_id) return 0;

      return prisma.leadMaster.count({
        where: {
          vendor_id,
          status_id,
          ...userFilter,
        },
      });
    };

    const result = {
      total_open_leads: await countStatus("Type 1"),
      total_initial_site_measurement_leads: await countStatus("Type 2"),
      total_designing_stage_leads: await countStatus("Type 3"),
      total_booking_stage_leads: await countStatus("Type 4"),
      total_final_measurement_leads: await countStatus("Type 5"),
      total_client_documentation_leads: await countStatus("Type 6"),
      total_client_approval_leads: await countStatus("Type 7"),
      total_tech_check_leads: await countStatus("Type 8"),
      total_order_login_leads: await countStatus("Type 9"),
      total_production_stage_leads: await countStatus("Type 10"),
      total_ready_to_dispatch_leads: await countStatus("Type 11"),
      total_site_readiness_stage_leads: await countStatus("Type 12"),
      total_dispatch_planning_stage_leads: await countStatus("Type 13"),
      total_dispatch_stage_leads: await countStatus("Type 14"),
      total_under_installation_stage_leads: await countStatus("Type 15"),
      total_final_handover_stage_leads: await countStatus("Type 16"),
      total_project_completed_stage_leads: await countStatus("Type 17"),
    };

    // 🔐 Save to Redis for 10 minutes (600 sec)
    await cache.set(cacheKey, JSON.stringify(result), 600);

    return { fromCache: false, data: result };
  }
}
