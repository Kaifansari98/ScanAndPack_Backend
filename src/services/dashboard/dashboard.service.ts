import { prisma } from "../../prisma/client";
import { cache } from "../../utils/cache";
import {
  LeadUserStatus,
  LeadTaskStatus,
  ActivityStatus,
} from "../../prisma/generated";

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

const getMonthFourRanges = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();

  const totalDays = new Date(year, month + 1, 0).getDate();
  const bucketSize = Math.ceil(totalDays / 4); // 4 buckets

  const weeks: { start: Date; end: Date }[] = [];

  let day = 1;
  for (let i = 0; i < 4; i++) {
    const start = new Date(year, month, day, 0, 0, 0);
    let endDay = Math.min(day + bucketSize - 1, totalDays);
    const end = new Date(year, month, endDay, 23, 59, 59, 999);

    weeks.push({ start, end });
    day = endDay + 1;
  }

  return weeks;
};

const getWeekDayRanges = () => {
  const now = new Date();
  const monday = new Date(now);
  monday.setDate(now.getDate() - now.getDay() + 1); // Monday

  const week: { start: Date; end: Date }[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);

    const start = new Date(d);
    start.setHours(0, 0, 0, 0);

    const end = new Date(d);
    end.setHours(23, 59, 59, 999);

    week.push({ start, end });
  }
  return week;
};

const getYearMonthRanges = () => {
  const year = new Date().getFullYear();
  const months: { start: Date; end: Date }[] = [];

  for (let m = 0; m < 12; m++) {
    const start = new Date(year, m, 1, 0, 0, 0);
    const end = new Date(year, m + 1, 0, 23, 59, 59, 999);
    months.push({ start, end });
  }
  return months;
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

    const activityStatusExclusion = {
      lead: {
        activity_status: {
          notIn: [
            ActivityStatus.onHold,
            ActivityStatus.lostApproval,
            ActivityStatus.lost,
          ],
        },
        is_deleted: false,
      },
    };

    const totalLeadsAssigned = (
      await prisma.leadUserMapping.groupBy({
        by: ["lead_id"],
        where: { ...assignedWhere, ...activityStatusExclusion },
        _count: { lead_id: true }, // ensures unique lead_id per group
      })
    ).length;

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
    // BOOKED LEADS (Type 4) — DISTINCT LEADS ONLY
    // -------------------------------------
    const bookingStatus = await prisma.statusTypeMaster.findFirst({
      where: { vendor_id, tag: "Type 4" },
      select: { id: true },
    });

    let bookedToday = 0;
    let bookedThisWeek: number[] = [];
    let bookedThisMonth: number[] = [];
    let bookedThisYear: number[] = [];
    let bookedOverall = 0;
    let bookedThisWeekTotal = 0;
    let bookedThisMonthTotal = 0;
    let bookedThisYearTotal = 0;

    // User-scoped lead IDs for booking metrics (vendor + user)
    const userBookingLeadIds = (
      await prisma.leadUserMapping.findMany({
        where: {
          vendor_id,
          user_id,
          status: LeadUserStatus.active,
        },
        select: { lead_id: true },
      })
    ).map((m) => m.lead_id);

    if (bookingStatus && (isAdmin || userBookingLeadIds.length > 0)) {
      // Helper function: return DISTINCT lead count
      const countDistinct = async (range: { start: Date; end: Date }) => {
        const logs = await prisma.leadStatusLogs.findMany({
          where: {
            vendor_id,
            status_id: bookingStatus.id,
            created_at: { gte: range.start, lte: range.end },
            ...(isAdmin ? {} : { lead_id: { in: userBookingLeadIds } }),
          },
          distinct: ["lead_id"],
          select: { lead_id: true },
        });
        return logs.length;
      };

      // ---------- TODAY ----------
      bookedToday = await countDistinct(ranges.today);

      // ---------- WEEK (Mon–Sun array) ----------
      const weekRanges = getWeekDayRanges();
      bookedThisWeek = [];
      for (const r of weekRanges) {
        bookedThisWeek.push(await countDistinct(r));
      }
      bookedThisWeekTotal = bookedThisWeek.reduce((a, b) => a + b, 0);

      // ---------- MONTH (4 blocks array) ----------
      const monthRanges = getMonthFourRanges();
      bookedThisMonth = [];
      for (const r of monthRanges) {
        bookedThisMonth.push(await countDistinct(r));
      }
      bookedThisMonthTotal = await countDistinct(ranges.month);

      // ---------- YEAR (Jan–Dec array) ----------
      const yearRanges = getYearMonthRanges();
      bookedThisYear = [];
      for (const r of yearRanges) {
        bookedThisYear.push(await countDistinct(r));
      }
      bookedThisYearTotal = await countDistinct(ranges.year);

      // ---------- OVERALL (distinct leads ever booked) ----------
      const overallLogs = await prisma.leadStatusLogs.findMany({
        where: {
          vendor_id,
          status_id: bookingStatus.id,
          ...(isAdmin ? {} : { lead_id: { in: userBookingLeadIds } }),
        },
        distinct: ["lead_id"],
        select: { lead_id: true },
      });
      bookedOverall = overallLogs.length;
    }

    // -------------------------------------
    // BOOKING VALUE (Distinct leads who reached Type 4)
    // -------------------------------------

    let bookingValue = { week: 0, month: 0, year: 0, overall: 0 };
    let bookingValueThisWeekArray: number[] = [];
    let bookingValueThisMonthArray: number[] = [];
    let bookingValueThisYearArray: number[] = [];

    if (bookingStatus && (isAdmin || userBookingLeadIds.length > 0)) {
      // Filter for admin/user scopes
      const userFilter = isAdmin
        ? {}
        : {
            id: { in: userBookingLeadIds },
          };

      // Helper → get distinct booked leads in a date range
      const getDistinctBookedLeads = async (start: Date, end: Date) => {
        return prisma.leadStatusLogs.findMany({
          where: {
            vendor_id,
            status_id: bookingStatus.id,
            created_at: { gte: start, lte: end },
            ...(isAdmin ? {} : { lead_id: { in: userBookingLeadIds } }),
          },
          distinct: ["lead_id"],
          select: { lead_id: true },
        });
      };

      // Helper → sum booking values from a list of lead IDs
      const sumBookingValues = async (leadIds: number[]) => {
        if (leadIds.length === 0) return 0;

        const res = await prisma.leadMaster.aggregate({
          where: {
            id: { in: leadIds },
            ...userFilter,
          },
          _sum: { total_project_amount: true },
        });

        return res._sum.total_project_amount || 0;
      };

      // ---------------- WEEKLY ARRAY ----------------
      const weekRanges = getWeekDayRanges();
      bookingValueThisWeekArray = [];

      for (const r of weekRanges) {
        const leads = await getDistinctBookedLeads(r.start, r.end);
        const total = await sumBookingValues(leads.map((l) => l.lead_id));
        bookingValueThisWeekArray.push(total);
      }

      // ---------------- MONTH ARRAY ----------------
      const monthRanges = getMonthFourRanges();
      bookingValueThisMonthArray = [];

      for (const r of monthRanges) {
        const leads = await getDistinctBookedLeads(r.start, r.end);
        const total = await sumBookingValues(leads.map((l) => l.lead_id));
        bookingValueThisMonthArray.push(total);
      }

      // ---------------- YEAR ARRAY ----------------
      const yearRanges = getYearMonthRanges();
      bookingValueThisYearArray = [];

      for (const r of yearRanges) {
        const leads = await getDistinctBookedLeads(r.start, r.end);
        const total = await sumBookingValues(leads.map((l) => l.lead_id));
        bookingValueThisYearArray.push(total);
      }

      // SUM UTIL
      const sumArray = (arr: number[]) => arr.reduce((acc, v) => acc + v, 0);

      // ---------------- TOTALS ----------------
      bookingValue = {
        week: sumArray(bookingValueThisWeekArray),
        month: sumArray(bookingValueThisMonthArray),
        year: sumArray(bookingValueThisYearArray),

        // OVERALL booking value (distinct Type 4 leads only)
        overall: await (async () => {
          const leads = await prisma.leadStatusLogs.findMany({
            where: { vendor_id, status_id: bookingStatus.id },
            distinct: ["lead_id"],
            select: { lead_id: true },
          });

          return sumBookingValues(leads.map((l) => l.lead_id));
        })(),
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

      bookedToday,
      bookedThisWeek,
      bookedThisMonth,
      bookedThisYear,
      bookedOverall,
      bookedThisWeekTotal,
      bookedThisMonthTotal,
      bookedThisYearTotal,

      bookingValueThisWeek: bookingValue.week,
      bookingValueThisMonth: bookingValue.month,
      bookingValueThisYear: bookingValue.year,
      bookingValueOverall: bookingValue.overall,
      bookingValueThisWeekArray,
      bookingValueThisMonthArray,
      bookingValueThisYearArray,

      avgDaysToBooking,
    };
  }

  public async calculateAvgDaysToBooking(
    vendor_id: number,
    user_id: number,
    isAdmin?: boolean
  ) {
    // Compute isAdmin if not provided (e.g., when called externally)
    if (isAdmin === undefined) {
      const user = await prisma.userMaster.findUnique({
        where: { id: user_id },
        include: { user_type: true },
      });
      isAdmin = user?.user_type?.user_type?.toLowerCase() === "admin";
    }

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

    // 🔥 1) Redis
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

    const activityStatusFilter = {
      activity_status: {
        notIn: [
          ActivityStatus.onHold,
          ActivityStatus.lostApproval,
          ActivityStatus.lost,
        ],
      },
    };

    // Helper to count leads for a status (excluding onHold/lostApproval/lost)
    const countStatus = async (typeTag: string) => {
      const status_id = statusMap.get(typeTag);
      if (!status_id) return 0;

      return prisma.leadMaster.count({
        where: {
          vendor_id,
          status_id,
          is_deleted: false,
          ...activityStatusFilter,
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
    await cache.set(cacheKey, JSON.stringify(result), 1);

    return { fromCache: false, data: result };
  }

  // ----------------------------------------------------------------
  // Admin Dashboard : Projects Overview (distinct lead counts by created_at)
  // Only count leads whose FINAL status is between Type 4 ↠ Type 16
  // ----------------------------------------------------------------
  public async getProjectsOverview(vendor_id: number) {
    // Get Type 4 (booking) ID
    const type4 = await prisma.statusTypeMaster.findFirst({
      where: { vendor_id, tag: "Type 4" },
      select: { id: true },
    });

    // Get Type 16 (the upper bound) ID
    const type16 = await prisma.statusTypeMaster.findFirst({
      where: { vendor_id, tag: "Type 16" },
      select: { id: true },
    });

    if (!type4?.id || !type16?.id) {
      // Missing statuses => cannot compute reliably
      return {
        thisWeekArray: Array(7).fill(0),
        thisMonthArray: Array(4).fill(0),
        thisYearArray: Array(12).fill(0),
        thisWeekTotal: 0,
        thisMonthTotal: 0,
        thisYearTotal: 0,
        overall: 0,
      };
    }

    const baseWhere = {
      vendor_id,
      is_deleted: false, // Only active leads
      status_id: { gte: type4.id, lte: type16.id }, // Only Type 4 → Type 16
    };

    // Helper to count distinct leads in a date range
    const countLeadsInRange = (range: { start: Date; end: Date }) => {
      return prisma.leadMaster.count({
        where: {
          ...baseWhere,
          created_at: { gte: range.start, lte: range.end },
        },
      });
    };

    // Weekly breakdown (7 days)
    const weekRanges = getWeekDayRanges();
    const thisWeekArray = [];
    for (const r of weekRanges) {
      thisWeekArray.push(await countLeadsInRange(r));
    }

    // Monthly breakdown (4 segments)
    const monthRanges = getMonthFourRanges();
    const thisMonthArray = [];
    for (const r of monthRanges) {
      thisMonthArray.push(await countLeadsInRange(r));
    }

    // Yearly breakdown (12 months)
    const yearRanges = getYearMonthRanges();
    const thisYearArray = [];
    for (const r of yearRanges) {
      thisYearArray.push(await countLeadsInRange(r));
    }

    // Totals
    const sum = (arr: number[]) => arr.reduce((acc, v) => acc + v, 0);

    const overall = await prisma.leadMaster.count({
      where: baseWhere,
    });

    return {
      thisWeekArray,
      thisMonthArray,
      thisYearArray,
      thisWeekTotal: sum(thisWeekArray),
      thisMonthTotal: sum(thisMonthArray),
      thisYearTotal: sum(thisYearArray),
      overall,
    };
  }

  // ----------------------------------------------------------------
  // Admin Dashboard : Total Revenue (sum total_project_amount)
  // ----------------------------------------------------------------
  public async getTotalRevenue(vendor_id: number) {
    const baseWhere = {
      vendor_id,
      is_deleted: false,
      activity_status: {
        notIn: [
          ActivityStatus.lostApproval,
          ActivityStatus.lost,
          ActivityStatus.onHold,
        ],
      },
    };

    const sumByRange = (range?: { start: Date; end: Date }) =>
      prisma.leadMaster.aggregate({
        where: {
          ...baseWhere,
          ...(range && { created_at: { gte: range.start, lte: range.end } }),
        },
        _sum: { total_project_amount: true },
      });

    const weekRanges = getWeekDayRanges();
    const thisWeekArray: number[] = [];
    for (const r of weekRanges) {
      const res = await sumByRange(r);
      thisWeekArray.push(res._sum?.total_project_amount || 0);
    }

    const monthRanges = getMonthFourRanges();
    const thisMonthArray: number[] = [];
    for (const r of monthRanges) {
      const res = await sumByRange(r);
      thisMonthArray.push(res._sum?.total_project_amount || 0);
    }

    const yearRanges = getYearMonthRanges();
    const thisYearArray: number[] = [];
    for (const r of yearRanges) {
      const res = await sumByRange(r);
      thisYearArray.push(res._sum?.total_project_amount || 0);
    }

    const sum = (arr: number[]) => arr.reduce((acc, v) => acc + v, 0);
    const overall = (await sumByRange())._sum?.total_project_amount || 0;

    return {
      thisWeekArray,
      thisMonthArray,
      thisYearArray,
      thisWeekTotal: sum(thisWeekArray),
      thisMonthTotal: sum(thisMonthArray),
      thisYearTotal: sum(thisYearArray),
      overall,
    };
  }

  // -------------------------------------------------------
  // Sales Executive : Stage counts for selected tags
  // -------------------------------------------------------
  public async getSalesExecutiveStageCounts(
    vendor_id: number,
    user_id: number
  ) {
    const targetTags = [
      "Type 1", // Open Lead
      "Type 2", // ISM Lead
      "Type 3", // Designing
      "Type 4", // Booking Done
      "Type 6", // Client Documentation
      "Type 7", // Client Approval
      "Type 8", // Tech Check
      "Type 11", // Ready to Dispatch
      "Type 13", // Dispatch Planning
    ];

    const statuses = await prisma.statusTypeMaster.findMany({
      where: { vendor_id, tag: { in: targetTags } },
      select: { id: true, tag: true },
    });

    const statusMap = new Map<string, number>();
    statuses.forEach((s) => statusMap.set(s.tag, s.id));

    const userFilter = {
      userMappings: {
        some: {
          user_id,
          status: LeadUserStatus.active,
        },
      },
    };

    const activityStatusFilter = {
      activity_status: {
        notIn: [
          ActivityStatus.onHold,
          ActivityStatus.lostApproval,
          ActivityStatus.lost,
        ],
      },
    };

    const countForTag = async (tag: string) => {
      const status_id = statusMap.get(tag);
      if (!status_id) return 0;
      return prisma.leadMaster.count({
        where: {
          vendor_id,
          is_deleted: false,
          status_id,
          ...activityStatusFilter,
          ...userFilter,
        },
      });
    };

    const [
      openLead,
      ismLead,
      designing,
      bookingDone,
      clientDocumentation,
      clientApproval,
      techCheck,
      readyToDispatch,
      dispatchPlanning,
    ] = await Promise.all([
      countForTag("Type 1"),
      countForTag("Type 2"),
      countForTag("Type 3"),
      countForTag("Type 4"),
      countForTag("Type 6"),
      countForTag("Type 7"),
      countForTag("Type 8"),
      countForTag("Type 11"),
      countForTag("Type 13"),
    ]);

    return {
      openLead,
      ismLead,
      designing,
      bookingDone,
      clientDocumentation,
      clientApproval,
      techCheck,
      readyToDispatch,
      dispatchPlanning,
    };
  }

  // -------------------------------------------------------
  // Sales Executive : Activity status counts (onHold, lostApproval, lost)
  // -------------------------------------------------------
  public async getSalesExecutiveActivityStatusCounts(
    vendor_id: number,
    user_id: number
  ) {
    const statuses = ["onHold", "lostApproval", "lost"] as const;

    const userFilter = {
      userMappings: {
        some: {
          user_id,
          status: LeadUserStatus.active,
        },
      },
    };

    const countByStatus = async (status: (typeof statuses)[number]) =>
      prisma.leadMaster.count({
        where: {
          vendor_id,
          is_deleted: false,
          activity_status: status as any,
          ...userFilter,
        },
      });

    const [onHold, lostApproval, lost] = await Promise.all(
      statuses.map((s) => countByStatus(s))
    );

    return { onHold, lostApproval, lost };
  }

  // -------------------------------------------------------
  // Sales Executive : Stage leads (minimal fields)
  // -------------------------------------------------------
  public async getSalesExecutiveStageLeads(vendor_id: number, user_id: number) {
    const targetTags = [
      { tag: "Type 1", key: "openLead" },
      { tag: "Type 2", key: "ismLead" },
      { tag: "Type 3", key: "designing" },
      { tag: "Type 4", key: "bookingDone" },
      { tag: "Type 6", key: "clientDocumentation" },
      { tag: "Type 7", key: "clientApproval" },
      { tag: "Type 8", key: "techCheck" },
      { tag: "Type 11", key: "readyToDispatch" },
      { tag: "Type 13", key: "dispatchPlanning" },
    ] as const;

    const statuses = await prisma.statusTypeMaster.findMany({
      where: {
        vendor_id,
        tag: { in: targetTags.map((t) => t.tag) },
      },
      select: { id: true, tag: true },
    });

    const statusMap = new Map<string, number>();
    statuses.forEach((s) => statusMap.set(s.tag, s.id));

    const userFilter = {
      userMappings: {
        some: {
          user_id,
          status: LeadUserStatus.active,
        },
      },
    };

    const activityStatusFilter = {
      activity_status: {
        notIn: [
          ActivityStatus.onHold,
          ActivityStatus.lostApproval,
          ActivityStatus.lost,
        ],
      },
    };

    const fetchLeadsForTag = async (tag: string) => {
      const status_id = statusMap.get(tag);
      if (!status_id) return [];

      const leads = await prisma.leadMaster.findMany({
        where: {
          vendor_id,
          is_deleted: false,
          status_id,
          ...activityStatusFilter,
          ...userFilter,
        },
        select: {
          id: true,
          lead_code: true,
          account_id: true,
          firstname: true,
          lastname: true,
        },
      });

      return leads.map((lead) => ({
        id: lead.id,
        lead_code: lead.lead_code,
        account_id: lead.account_id,
        name: `${lead.firstname ?? ""} ${lead.lastname ?? ""}`.trim(),
      }));
    };

    const results: Record<string, any[]> = {};

    for (const entry of targetTags) {
      results[entry.key] = await fetchLeadsForTag(entry.tag);
    }

    return results as {
      openLead: any[];
      ismLead: any[];
      designing: any[];
      bookingDone: any[];
      clientDocumentation: any[];
      clientApproval: any[];
      techCheck: any[];
      readyToDispatch: any[];
      dispatchPlanning: any[];
    };
  }

  // -------------------------------------------------------
  // Sales Executive : Post-booking stage leads (Type 4–16, excluding 17)
  // -------------------------------------------------------
  public async getSalesExecutivePostBookingStageLeads(
    vendor_id: number,
    user_id: number
  ) {
    const targetTags = [
      { tag: "Type 4", key: "bookingStage" },
      { tag: "Type 5", key: "finalSiteMeasurementStage" },
      { tag: "Type 6", key: "clientDocumentationStage" },
      { tag: "Type 7", key: "clientApprovalStage" },
      { tag: "Type 8", key: "techCheckStage" },
      { tag: "Type 9", key: "orderLoginStage" },
      { tag: "Type 10", key: "productionStage" },
      { tag: "Type 11", key: "readyToDispatchStage" },
      { tag: "Type 12", key: "siteReadinessStage" },
      { tag: "Type 13", key: "dispatchPlanningStage" },
      { tag: "Type 14", key: "dispatchStage" },
      { tag: "Type 15", key: "underInstallationStage" },
      { tag: "Type 16", key: "finalHandoverStage" },
    ] as const;

    const statuses = await prisma.statusTypeMaster.findMany({
      where: {
        vendor_id,
        tag: { in: targetTags.map((t) => t.tag) },
      },
      select: { id: true, tag: true },
    });

    const statusMap = new Map<string, number>();
    statuses.forEach((s) => statusMap.set(s.tag, s.id));

    const userFilter = {
      userMappings: {
        some: {
          user_id,
          status: LeadUserStatus.active,
        },
      },
    };

    const activityStatusFilter = {
      activity_status: {
        notIn: [
          ActivityStatus.onHold,
          ActivityStatus.lostApproval,
          ActivityStatus.lost,
        ],
      },
    };

    const fetchLeadsForTag = async (tag: string) => {
      const status_id = statusMap.get(tag);
      if (!status_id) return [];

      const leads = await prisma.leadMaster.findMany({
        where: {
          vendor_id,
          is_deleted: false,
          status_id,
          ...activityStatusFilter,
          ...userFilter,
        },
        select: {
          id: true,
          lead_code: true,
          account_id: true,
          firstname: true,
          lastname: true,
        },
      });

      return leads.map((lead) => ({
        id: lead.id,
        lead_code: lead.lead_code,
        account_id: lead.account_id,
        name: `${lead.firstname ?? ""} ${lead.lastname ?? ""}`.trim(),
      }));
    };

    const results: Record<string, any[]> = {};

    for (const entry of targetTags) {
      results[entry.key] = await fetchLeadsForTag(entry.tag);
    }

    return results as {
      bookingStage: any[];
      finalSiteMeasurementStage: any[];
      clientDocumentationStage: any[];
      clientApprovalStage: any[];
      techCheckStage: any[];
      orderLoginStage: any[];
      productionStage: any[];
      readyToDispatchStage: any[];
      siteReadinessStage: any[];
      dispatchPlanningStage: any[];
      dispatchStage: any[];
      underInstallationStage: any[];
      finalHandoverStage: any[];
    };
  }

  // -------------------------------------------------------
  // Sales Executive : All stage leads (Type 1–17) excluding onHold/lostApproval/lost
  // -------------------------------------------------------
  public async getSalesExecutiveAllStageLeads(
    vendor_id: number,
    user_id: number
  ) {
    const targetTags = [
      { tag: "Type 1", key: "openStage" },
      { tag: "Type 2", key: "initialSiteMeasurementStage" },
      { tag: "Type 3", key: "designingStage" },
      { tag: "Type 4", key: "bookingStage" },
      { tag: "Type 5", key: "finalSiteMeasurementStage" },
      { tag: "Type 6", key: "clientDocumentationStage" },
      { tag: "Type 7", key: "clientApprovalStage" },
      { tag: "Type 8", key: "techCheckStage" },
      { tag: "Type 9", key: "orderLoginStage" },
      { tag: "Type 10", key: "productionStage" },
      { tag: "Type 11", key: "readyToDispatchStage" },
      { tag: "Type 12", key: "siteReadinessStage" },
      { tag: "Type 13", key: "dispatchPlanningStage" },
      { tag: "Type 14", key: "dispatchStage" },
      { tag: "Type 15", key: "underInstallationStage" },
      { tag: "Type 16", key: "finalHandoverStage" },
      { tag: "Type 17", key: "projectCompletedStage" },
    ] as const;

    const statuses = await prisma.statusTypeMaster.findMany({
      where: {
        vendor_id,
        tag: { in: targetTags.map((t) => t.tag) },
      },
      select: { id: true, tag: true },
    });

    const statusMap = new Map<string, number>();
    statuses.forEach((s) => statusMap.set(s.tag, s.id));

    const userFilter = {
      userMappings: {
        some: {
          user_id,
          status: LeadUserStatus.active,
        },
      },
    };

    const activityStatusFilter = {
      activity_status: {
        notIn: [
          ActivityStatus.onHold,
          ActivityStatus.lostApproval,
          ActivityStatus.lost,
        ],
      },
    };

    const fetchLeadsForTag = async (tag: string) => {
      const status_id = statusMap.get(tag);
      if (!status_id) return [];

      const leads = await prisma.leadMaster.findMany({
        where: {
          vendor_id,
          is_deleted: false,
          status_id,
          ...activityStatusFilter,
          ...userFilter,
        },
        select: {
          id: true,
          lead_code: true,
          account_id: true,
          firstname: true,
          lastname: true,
        },
      });

      return leads.map((lead) => ({
        id: lead.id,
        lead_code: lead.lead_code,
        account_id: lead.account_id,
        name: `${lead.firstname ?? ""} ${lead.lastname ?? ""}`.trim(),
      }));
    };

    const results: Record<string, any[]> = {};

    for (const entry of targetTags) {
      results[entry.key] = await fetchLeadsForTag(entry.tag);
    }

    return results as {
      openStage: any[];
      initialSiteMeasurementStage: any[];
      designingStage: any[];
      bookingStage: any[];
      finalSiteMeasurementStage: any[];
      clientDocumentationStage: any[];
      clientApprovalStage: any[];
      techCheckStage: any[];
      orderLoginStage: any[];
      productionStage: any[];
      readyToDispatchStage: any[];
      siteReadinessStage: any[];
      dispatchPlanningStage: any[];
      dispatchStage: any[];
      underInstallationStage: any[];
      finalHandoverStage: any[];
      projectCompletedStage: any[];
    };
  }

  // -------------------------------------------------------
  // Orders In Pipeline (lead counts by activity_status)
  // -------------------------------------------------------
  public async getOrdersInPipeline(vendor_id: number) {
    const ranges = getDateRanges();
    const statuses = ["onGoing", "onHold", "lostApproval", "lost"] as const;

    const countByStatus = async (
      status: (typeof statuses)[number],
      range?: { start: Date; end: Date }
    ) =>
      prisma.leadMaster.count({
        where: {
          vendor_id,
          is_deleted: false,
          activity_status: status,
          ...(range && { created_at: { gte: range.start, lte: range.end } }),
        },
      });

    const results = await Promise.all(
      statuses.map(async (status) => {
        const [thisWeek, thisMonth, thisYear, overall] = await Promise.all([
          countByStatus(status, ranges.week),
          countByStatus(status, ranges.month),
          countByStatus(status, ranges.year),
          countByStatus(status),
        ]);
        return { status, thisWeek, thisMonth, thisYear, overall };
      })
    );

    const mapResult = (status: (typeof statuses)[number]) => {
      const item = results.find((r) => r.status === status)!;
      return {
        thisWeek: item.thisWeek,
        thisMonth: item.thisMonth,
        thisYear: item.thisYear,
        overall: item.overall,
      };
    };

    return {
      onGoing: mapResult("onGoing"),
      onHold: mapResult("onHold"),
      lostApproval: mapResult("lostApproval"),
      lost: mapResult("lost"),
    };
  }
}
