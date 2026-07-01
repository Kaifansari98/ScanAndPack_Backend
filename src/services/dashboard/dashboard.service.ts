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
  public async getPerformanceSnapshot(vendor_id: number, user_id: number, franchise_id?: number) {
    const ranges = getDateRanges();

    // Fetch user and check role
    const user = await prisma.userMaster.findUnique({
      where: { id: user_id },
      include: { user_type: true },
    });

    const isAdmin = user?.user_type?.user_type?.toLowerCase() === "admin";

    // Pre-fetch franchise lead IDs if franchise filter is active
    const franchiseLeadIds = franchise_id
      ? (await prisma.leadMaster.findMany({
          where: { vendor_id, franchise_id, is_deleted: false },
          select: { id: true },
        })).map((l) => l.id)
      : null;

    const franchiseLeadFilter = franchiseLeadIds ? { lead_id: { in: franchiseLeadIds } } : {};

    // -------------------------------------
    // LEADS ASSIGNED
    // -------------------------------------
    const assignedWhere = isAdmin
      ? { vendor_id, status: LeadUserStatus.active, ...franchiseLeadFilter }
      : { vendor_id, user_id, status: LeadUserStatus.active, ...franchiseLeadFilter };

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
            ...(franchiseLeadIds ? { id: { in: franchiseLeadIds } } : {}),
          }
        : {
            vendor_id,
            status_id: completedStatus.id,
            ...(franchiseLeadIds ? { id: { in: franchiseLeadIds } } : {}),
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
          ...franchiseLeadFilter,
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

    if (bookingStatus) {
      // Filter for admin/user scopes (userMappings)
      const userFilter = isAdmin
        ? {}
        : {
            userMappings: {
              some: { user_id, status: LeadUserStatus.active },
            },
          };

      // Helper → get distinct booked leads in a date range
      const getDistinctBookedLeads = async (start?: Date, end?: Date) => {
        return prisma.leadStatusLogs.findMany({
          where: {
            vendor_id,
            status_id: bookingStatus.id,
            ...(start && end ? { created_at: { gte: start, lte: end } } : {}),
            ...franchiseLeadFilter,
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
          const leads = await getDistinctBookedLeads();
          return sumBookingValues(leads.map((l) => l.lead_id));
        })(),
      };
    }

    const avgDaysToBooking = await this.calculateAvgDaysToBooking(
      vendor_id,
      user_id,
      isAdmin,
      franchise_id
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
    isAdmin?: boolean,
    franchise_id?: number
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
    const franchiseFilter = franchise_id ? { franchise_id } : {};
    let leadFilter: any = { vendor_id, ...franchiseFilter };

    if (!isAdmin) {
      leadFilter = {
        vendor_id,
        ...franchiseFilter,
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
          ...(typeTag === "Type 1" ? { is_draft: false } : {}),
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
  public async getProjectsOverview(vendor_id: number, franchise_id?: number) {
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
      ...(franchise_id ? { franchise_id } : {}),
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
  // Admin Dashboard : Completed Overview (Type 17 counts by created_at)
  // ----------------------------------------------------------------
  public async getCompletedOverview(vendor_id: number, franchise_id?: number) {
    const type17 = await prisma.statusTypeMaster.findFirst({
      where: { vendor_id, tag: "Type 17" },
      select: { id: true },
    });

    if (!type17?.id) {
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
      is_deleted: false,
      status_id: type17.id,
      ...(franchise_id ? { franchise_id } : {}),
    };

    const countLeadsInRange = (range?: { start: Date; end: Date }) =>
      prisma.leadMaster.count({
        where: {
          ...baseWhere,
          ...(range && { created_at: { gte: range.start, lte: range.end } }),
        },
      });

    const weekRanges = getWeekDayRanges();
    const thisWeekArray = [];
    for (const r of weekRanges) {
      thisWeekArray.push(await countLeadsInRange(r));
    }

    const monthRanges = getMonthFourRanges();
    const thisMonthArray = [];
    for (const r of monthRanges) {
      thisMonthArray.push(await countLeadsInRange(r));
    }

    const yearRanges = getYearMonthRanges();
    const thisYearArray = [];
    for (const r of yearRanges) {
      thisYearArray.push(await countLeadsInRange(r));
    }

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
  // Admin Dashboard : Lost Approval Overview
  // Current lead activity_status = lostApproval, bucketed by log created_at
  // ----------------------------------------------------------------
  public async getLostApprovalOverview(vendor_id: number, franchise_id?: number) {
    const baseWhere = {
      vendor_id,
      activity_status: ActivityStatus.lostApproval,
      lead: {
        vendor_id,
        is_deleted: false,
        activity_status: ActivityStatus.lostApproval,
        ...(franchise_id ? { franchise_id } : {}),
      },
    };

    const countLeadsInRange = async (range?: { start: Date; end: Date }) => {
      const rows = await prisma.leadActivityStatusLog.findMany({
        where: {
          ...baseWhere,
          ...(range && { created_at: { gte: range.start, lte: range.end } }),
        },
        select: { lead_id: true },
        distinct: ["lead_id"],
      });
      return rows.length;
    };

    const weekRanges = getWeekDayRanges();
    const thisWeekArray = [];
    for (const r of weekRanges) {
      thisWeekArray.push(await countLeadsInRange(r));
    }

    const monthRanges = getMonthFourRanges();
    const thisMonthArray = [];
    for (const r of monthRanges) {
      thisMonthArray.push(await countLeadsInRange(r));
    }

    const yearRanges = getYearMonthRanges();
    const thisYearArray = [];
    for (const r of yearRanges) {
      thisYearArray.push(await countLeadsInRange(r));
    }

    const overall = await prisma.leadMaster.count({
      where: {
        vendor_id,
        is_deleted: false,
        activity_status: ActivityStatus.lostApproval,
        ...(franchise_id ? { franchise_id } : {}),
      },
    });

    const sum = (arr: number[]) => arr.reduce((acc, v) => acc + v, 0);

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
  public async getTotalRevenue(vendor_id: number, franchise_id?: number) {
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
      ...(franchise_id ? { franchise_id } : {}),
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

    const now = new Date();
    let sixMonthsTotal = 0;
    for (let i = 1; i <= 6; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const start = new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0);
      const end   = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
      const res = await sumByRange({ start, end });
      sixMonthsTotal += res._sum?.total_project_amount || 0;
    }
    const lastSixMonthsAvg = sixMonthsTotal / 6;

    return {
      thisWeekArray,
      thisMonthArray,
      thisYearArray,
      thisWeekTotal: sum(thisWeekArray),
      thisMonthTotal: sum(thisMonthArray),
      thisYearTotal: sum(thisYearArray),
      lastSixMonthsAvg,
      overall,
    };
  }

  // -------------------------------------------------------
  // Admin Dashboard : Stage Counts (Type 1 → Type 17 buckets)
  // -------------------------------------------------------
  public async getAvgDaysPerStage(vendor_id: number, franchise_id?: number) {
    // Fetch ALL status IDs for this vendor to map tags → ids
    const statuses = await prisma.statusTypeMaster.findMany({
      where: { vendor_id },
      select: { id: true, tag: true },
    });

    const idOf = (tag: string) => statuses.find((s) => s.tag === tag)?.id;
    const idsOf = (tags: string[]) =>
      tags.map((t) => idOf(t)).filter(Boolean) as number[];

    // Stage start IDs
    const type1Id  = idOf("Type 1");
    const type5Id  = idOf("Type 5");
    const type8Id  = idOf("Type 8");
    const type12Id = idOf("Type 12");
    const type17Id = idOf("Type 17");

    const leadEndIds         = idsOf(["Type 4"]);
    const projectEndIds      = idsOf(["Type 7"]);
    const productionEndIds   = idsOf(["Type 11"]);
    const installationEndIds = idsOf(["Type 17"]);

    const allRelevantIds = [
      ...(type1Id  ? [type1Id]  : []),
      ...(type5Id  ? [type5Id]  : []),
      ...(type8Id  ? [type8Id]  : []),
      ...(type12Id ? [type12Id] : []),
      ...leadEndIds,         // Type 4
      ...projectEndIds,      // Type 7
      ...productionEndIds,   // Type 11
      ...installationEndIds, // Type 17
    ];

    const uniqueIds = [...new Set(allRelevantIds)];

    if (uniqueIds.length === 0) {
      return { lead: 0, project: 0, production: 0, installation: 0 };
    }

    // If franchise_id provided, restrict to lead_ids belonging to that franchise
    let leadIdFilter: { in: number[] } | undefined;
    if (franchise_id) {
      const franchiseLeads = await prisma.leadMaster.findMany({
        where: { vendor_id, franchise_id, is_deleted: false },
        select: { id: true },
      });
      const ids = franchiseLeads.map((l) => l.id);
      if (ids.length === 0) return { lead: 0, project: 0, production: 0, installation: 0 };
      leadIdFilter = { in: ids };
    }

    // Fetch all relevant logs in one query
    const logs = await prisma.leadStatusLogs.findMany({
      where: {
        vendor_id,
        status_id: { in: uniqueIds },
        ...(leadIdFilter ? { lead_id: leadIdFilter } : {}),
      },
      orderBy: { created_at: "asc" },
      select: { lead_id: true, status_id: true, created_at: true },
    });

    // Build per-lead map: status_id → earliest timestamp
    const leadMap = new Map<number, Record<number, Date>>();
    for (const log of logs) {
      if (!leadMap.has(log.lead_id)) leadMap.set(log.lead_id, {});
      const entry = leadMap.get(log.lead_id)!;
      if (!entry[log.status_id]) entry[log.status_id] = log.created_at;
    }

    // avgDays: for each lead that has a start log, find the earliest end log from endIds
    const avgDaysMultiEnd = (startId?: number, endIds?: number[]): number => {
      if (!startId || !endIds?.length) return 0;
      let total = 0, count = 0;
      for (const timestamps of leadMap.values()) {
        const start = timestamps[startId];
        if (!start) continue;
        // Pick earliest end timestamp among all endIds
        const end = endIds
          .map((id) => timestamps[id])
          .filter(Boolean)
          .sort((a, b) => a.getTime() - b.getTime())[0];
        if (!end || end <= start) continue;
        total += (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
        count++;
      }
      return count > 0 ? Math.round((total / count) * 10) / 10 : 0;
    };

    return {
      lead:         avgDaysMultiEnd(type1Id,  leadEndIds),
      project:      avgDaysMultiEnd(type5Id,  projectEndIds),
      production:   avgDaysMultiEnd(type8Id,  productionEndIds),
      installation: avgDaysMultiEnd(type12Id, installationEndIds),
    };
  }

  public async getFranchisePerformance(vendor_id: number) {
    // Resolve Type 4 status id for this vendor
    const type4Status = await prisma.statusTypeMaster.findFirst({
      where: { vendor_id, tag: "Type 4" },
      select: { id: true },
    });

    // All lead_ids that have ever had a Type 4 log entry for this vendor
    const closedLeadIds: Set<number> = type4Status
      ? await prisma.leadStatusLogs
          .findMany({
            where: { vendor_id, status_id: type4Status.id },
            select: { lead_id: true },
            distinct: ["lead_id"],
          })
          .then((rows) => new Set(rows.map((r) => r.lead_id)))
      : new Set();

    const franchises = await prisma.franchiseMaster.findMany({
      where: { vendor_id },
      select: { id: true, franchise_name: true },
      orderBy: { franchise_name: "asc" },
    });

    const results = await Promise.all(
      franchises.map(async (f) => {
        const leads = await prisma.leadMaster.findMany({
          where: { vendor_id, franchise_id: f.id, is_deleted: false },
          select: { id: true, total_project_amount: true },
        });

        const closures = leads.filter((l) => closedLeadIds.has(l.id)).length;
        const revenue = leads.reduce(
          (sum, l) => sum + (l.total_project_amount ?? 0),
          0
        );

        return {
          franchise_id: f.id,
          name: f.franchise_name,
          leads: leads.length,
          closures,
          revenue,
        };
      })
    );

    return results.sort((a, b) => b.leads - a.leads);
  }

  public async getOverdueProjectsCount(vendor_id: number) {
    // Debug: check what the count query sees
    const debug = await prisma.$queryRaw<{ id: number; expected_installation_end_date: Date | null; actual_installation_completion_at: Date | null; franchise_id: number | null }[]>`
      SELECT id, expected_installation_end_date, actual_installation_completion_at, franchise_id
      FROM "LeadMaster"
      WHERE vendor_id = ${vendor_id}
        AND is_deleted = false
        AND expected_installation_end_date IS NOT NULL
    `;
    console.log(`[OverdueCount DEBUG] vendor_id=${vendor_id} — leads with expected_installation_end_date set:`, debug.length);
    debug.forEach((r) => {
      const isOverdue = r.actual_installation_completion_at === null && r.expected_installation_end_date && r.expected_installation_end_date < new Date();
      console.log(`  lead id=${r.id} franchise_id=${r.franchise_id} expected=${r.expected_installation_end_date?.toISOString()} actual=${r.actual_installation_completion_at?.toISOString() ?? "NULL"} → counts=${isOverdue}`);
    });

    const result = await prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(*) AS count
      FROM "LeadMaster" lm
      LEFT JOIN "StatusTypeMaster" stm ON stm.id = lm.status_id
      WHERE lm.vendor_id = ${vendor_id}
        AND lm.is_deleted = false
        AND lm.expected_installation_end_date IS NOT NULL
        AND lm.actual_installation_completion_at IS NULL
        AND lm.expected_installation_end_date < NOW()
        AND stm.tag = 'Type 10'
    `;
    console.log(`[OverdueCount] vendor_id=${vendor_id} count=${Number(result[0].count)}`);
    return { count: Number(result[0].count) };
  }

  public async getOverdueInstallations(vendor_id: number, franchise_id?: number) {
    type Row = {
      id: bigint;
      lead_code: string | null;
      name: string;
      account_id: bigint | null;
      franchise_name: string | null;
      expected_installation_end_date: Date;
      stage_tag: string | null;
      instance_id: bigint | null;
      quantity_index: number | null;
      instance_title: string | null;
      days_overdue: number;
    };

    let rows: Row[];
    if (franchise_id) {
      rows = await prisma.$queryRaw<Row[]>`
        SELECT
          lm.id,
          lm.lead_code,
          CONCAT(lm.firstname, ' ', lm.lastname) AS name,
          lm.account_id,
          fm.franchise_name,
          lm.expected_installation_end_date,
          stm.tag AS stage_tag,
          lpsi.id AS instance_id,
          lpsi.quantity_index,
          lpsi.title AS instance_title,
          EXTRACT(DAY FROM (NOW() - lm.expected_installation_end_date))::int AS days_overdue
        FROM "LeadMaster" lm
        LEFT JOIN "FranchiseMaster" fm ON fm.id = lm.franchise_id
        LEFT JOIN "StatusTypeMaster" stm ON stm.id = lm.status_id
        LEFT JOIN "LeadProductStructureInstance" lpsi ON lpsi.lead_id = lm.id
          AND lpsi.vendor_id = lm.vendor_id
          AND lpsi.is_tech_check_completed = true
          AND lpsi.is_order_login_completed = true
        WHERE lm.vendor_id = ${vendor_id}
          AND lm.franchise_id = ${franchise_id}
          AND lm.is_deleted = false
          AND lm.expected_installation_end_date IS NOT NULL
          AND lm.actual_installation_completion_at IS NULL
          AND lm.expected_installation_end_date < NOW()
          AND stm.tag = 'Type 10'
        ORDER BY days_overdue DESC
      `;
    } else {
      rows = await prisma.$queryRaw<Row[]>`
        SELECT
          lm.id,
          lm.lead_code,
          CONCAT(lm.firstname, ' ', lm.lastname) AS name,
          lm.account_id,
          fm.franchise_name,
          lm.expected_installation_end_date,
          stm.tag AS stage_tag,
          lpsi.id AS instance_id,
          lpsi.quantity_index,
          lpsi.title AS instance_title,
          EXTRACT(DAY FROM (NOW() - lm.expected_installation_end_date))::int AS days_overdue
        FROM "LeadMaster" lm
        LEFT JOIN "FranchiseMaster" fm ON fm.id = lm.franchise_id
        LEFT JOIN "StatusTypeMaster" stm ON stm.id = lm.status_id
        LEFT JOIN "LeadProductStructureInstance" lpsi ON lpsi.lead_id = lm.id
          AND lpsi.vendor_id = lm.vendor_id
          AND lpsi.is_tech_check_completed = true
          AND lpsi.is_order_login_completed = true
        WHERE lm.vendor_id = ${vendor_id}
          AND lm.is_deleted = false
          AND lm.expected_installation_end_date IS NOT NULL
          AND lm.actual_installation_completion_at IS NULL
          AND lm.expected_installation_end_date < NOW()
          AND stm.tag = 'Type 10'
        ORDER BY days_overdue DESC
      `;
    }

    return rows.map((r) => ({
      id: Number(r.id),
      lead_code:
        r.lead_code && r.quantity_index !== null && r.quantity_index !== undefined
          ? `${r.lead_code}.${r.quantity_index}`
          : r.lead_code,
      name: r.name,
      account_id: r.account_id ? Number(r.account_id) : null,
      franchise_name: r.franchise_name,
      expected_end: r.expected_installation_end_date,
      stage_tag: r.stage_tag,
      instance_id: r.instance_id ? Number(r.instance_id) : null,
      instance_title: r.instance_title,
      quantity_index: r.quantity_index,
      days_overdue: r.days_overdue,
    }));
  }

  public async getOverdueProductionCount(vendor_id: number) {
    const result = await prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(lpsi.id) AS count
      FROM "LeadMaster" lm
      LEFT JOIN "StatusTypeMaster" stm ON stm.id = lm.status_id
      INNER JOIN "LeadProductStructureInstance" lpsi ON lpsi.lead_id = lm.id
        AND lpsi.vendor_id = lm.vendor_id
        AND lpsi.is_tech_check_completed = true
        AND lpsi.is_order_login_completed = true
      WHERE lm.vendor_id = ${vendor_id}
        AND lm.is_deleted = false
        AND lpsi.production_erd_date IS NOT NULL
        AND lm.client_required_order_login_complition_date IS NOT NULL
        AND lpsi.production_erd_date > lm.client_required_order_login_complition_date
        AND (
          stm.tag = 'Type 10'
          OR (
            lpsi.is_tech_check_completed = true
            AND lpsi.is_order_login_completed = true
            AND (lpsi.is_production_completed = false OR lpsi.is_production_completed IS NULL)
          )
        )
    `;
    return { count: Number(result[0].count) };
  }

  public async getOverdueProduction(vendor_id: number, franchise_id?: number) {
    type Row = {
      id: bigint;
      lead_code: string | null;
      name: string;
      account_id: bigint | null;
      franchise_name: string | null;
      client_required_order_login_complition_date: Date;
      production_erd_date: Date;
      stage_tag: string | null;
      instance_id: bigint | null;
      quantity_index: number | null;
      instance_title: string | null;
      days_overdue: number;
    };

    let rows: Row[];
    if (franchise_id) {
      rows = await prisma.$queryRaw<Row[]>`
        SELECT
          lm.id,
          lm.lead_code,
          CONCAT(lm.firstname, ' ', lm.lastname) AS name,
          lm.account_id,
          fm.franchise_name,
          lm.client_required_order_login_complition_date,
          lpsi.production_erd_date,
          stm.tag AS stage_tag,
          lpsi.id AS instance_id,
          lpsi.quantity_index,
          lpsi.title AS instance_title,
          EXTRACT(DAY FROM (lpsi.production_erd_date - lm.client_required_order_login_complition_date))::int AS days_overdue
        FROM "LeadMaster" lm
        LEFT JOIN "FranchiseMaster" fm ON fm.id = lm.franchise_id
        LEFT JOIN "StatusTypeMaster" stm ON stm.id = lm.status_id
        INNER JOIN "LeadProductStructureInstance" lpsi ON lpsi.lead_id = lm.id
          AND lpsi.vendor_id = lm.vendor_id
          AND lpsi.is_tech_check_completed = true
          AND lpsi.is_order_login_completed = true
        WHERE lm.vendor_id = ${vendor_id}
          AND lm.franchise_id = ${franchise_id}
          AND lm.is_deleted = false
          AND lpsi.production_erd_date IS NOT NULL
          AND lm.client_required_order_login_complition_date IS NOT NULL
          AND lpsi.production_erd_date > lm.client_required_order_login_complition_date
          AND (
            stm.tag = 'Type 10'
            OR (
              lpsi.is_tech_check_completed = true
              AND lpsi.is_order_login_completed = true
              AND (lpsi.is_production_completed = false OR lpsi.is_production_completed IS NULL)
            )
          )
        ORDER BY days_overdue DESC
      `;
    } else {
      rows = await prisma.$queryRaw<Row[]>`
        SELECT
          lm.id,
          lm.lead_code,
          CONCAT(lm.firstname, ' ', lm.lastname) AS name,
          lm.account_id,
          fm.franchise_name,
          lm.client_required_order_login_complition_date,
          lpsi.production_erd_date,
          stm.tag AS stage_tag,
          lpsi.id AS instance_id,
          lpsi.quantity_index,
          lpsi.title AS instance_title,
          EXTRACT(DAY FROM (lpsi.production_erd_date - lm.client_required_order_login_complition_date))::int AS days_overdue
        FROM "LeadMaster" lm
        LEFT JOIN "FranchiseMaster" fm ON fm.id = lm.franchise_id
        LEFT JOIN "StatusTypeMaster" stm ON stm.id = lm.status_id
        INNER JOIN "LeadProductStructureInstance" lpsi ON lpsi.lead_id = lm.id
          AND lpsi.vendor_id = lm.vendor_id
          AND lpsi.is_tech_check_completed = true
          AND lpsi.is_order_login_completed = true
        WHERE lm.vendor_id = ${vendor_id}
          AND lm.is_deleted = false
          AND lpsi.production_erd_date IS NOT NULL
          AND lm.client_required_order_login_complition_date IS NOT NULL
          AND lpsi.production_erd_date > lm.client_required_order_login_complition_date
          AND (
            stm.tag = 'Type 10'
            OR (
              lpsi.is_tech_check_completed = true
              AND lpsi.is_order_login_completed = true
              AND (lpsi.is_production_completed = false OR lpsi.is_production_completed IS NULL)
            )
          )
        ORDER BY days_overdue DESC
      `;
    }

    return rows.map((r) => ({
      id: Number(r.id),
      lead_code:
        r.lead_code && r.quantity_index !== null && r.quantity_index !== undefined
          ? `${r.lead_code}.${r.quantity_index}`
          : r.lead_code,
      name: r.name,
      account_id: r.account_id ? Number(r.account_id) : null,
      franchise_name: r.franchise_name ?? null,
      client_required_date: r.client_required_order_login_complition_date,
      expected_ready_date: r.production_erd_date,
      stage_tag: r.stage_tag,
      instance_id: r.instance_id ? Number(r.instance_id) : null,
      instance_title: r.instance_title,
      quantity_index: r.quantity_index,
      days_overdue: r.days_overdue,
    }));
  }

  public async getFranchiseLeads(vendor_id: number, franchise_id: number) {
    const leads = await prisma.leadMaster.findMany({
      where: {
        vendor_id,
        franchise_id,
        is_deleted: false,
      
      },
      select: {
        id: true,
        lead_code: true,
        firstname: true,
        lastname: true,
        account_id: true,
        statusType: {
          select: { tag: true },
        },
        productStructureInstances: {
          select: { id: true },
          orderBy: { id: "asc" },
          take: 1,
        },
      },
      orderBy: { id: "desc" },
    });

    return leads.map((l) => ({
      id: Number(l.id),
      lead_code: l.lead_code,
      name: `${l.firstname || ""} ${l.lastname || ""}`.trim(),
      account_id: l.account_id ? Number(l.account_id) : null,
      stage_tag: l.statusType?.tag || null,
      instance_id: l.productStructureInstances?.[0]?.id ? Number(l.productStructureInstances[0].id) : null,
    }));
  }

  public async getStageLeads(vendor_id: number, tag: string, franchise_id?: number) {
    type Row = {
      id: bigint;
      lead_code: string | null;
      name: string;
      franchise_name: string | null;
      account_id: bigint | null;
      stage_tag: string | null;
      instance_id: bigint | null;
    };

    let rows: Row[];
    if (franchise_id) {
      rows = await prisma.$queryRaw<Row[]>`
        SELECT
          lm.id,
          lm.lead_code,
          CONCAT(lm.firstname, ' ', lm.lastname) AS name,
          fm.franchise_name,
          lm.account_id,
          stm.tag AS stage_tag,
          (
            SELECT lpsi.id
            FROM "LeadProductStructureInstance" lpsi
            WHERE lpsi.lead_id = lm.id
            ORDER BY lpsi.id ASC
            LIMIT 1
          ) AS instance_id
        FROM "LeadMaster" lm
        LEFT JOIN "StatusTypeMaster" stm ON stm.id = lm.status_id
        LEFT JOIN "FranchiseMaster" fm ON fm.id = lm.franchise_id
        WHERE lm.vendor_id = ${vendor_id}
          AND stm.tag = ${tag}
          AND lm.franchise_id = ${franchise_id}
          AND lm.is_deleted = false
          AND lm.activity_status != 'lost'
        ORDER BY lm.id DESC
      `;
    } else {
      rows = await prisma.$queryRaw<Row[]>`
        SELECT
          lm.id,
          lm.lead_code,
          CONCAT(lm.firstname, ' ', lm.lastname) AS name,
          fm.franchise_name,
          lm.account_id,
          stm.tag AS stage_tag,
          (
            SELECT lpsi.id
            FROM "LeadProductStructureInstance" lpsi
            WHERE lpsi.lead_id = lm.id
            ORDER BY lpsi.id ASC
            LIMIT 1
          ) AS instance_id
        FROM "LeadMaster" lm
        LEFT JOIN "StatusTypeMaster" stm ON stm.id = lm.status_id
        LEFT JOIN "FranchiseMaster" fm ON fm.id = lm.franchise_id
        WHERE lm.vendor_id = ${vendor_id}
          AND stm.tag = ${tag}
          AND lm.is_deleted = false
          AND lm.activity_status != 'lost'
        ORDER BY lm.id DESC
      `;
    }

    return rows.map((r) => ({
      id: Number(r.id),
      lead_code: r.lead_code,
      name: r.name,
      franchise_name: r.franchise_name ?? null,
      account_id: r.account_id ? Number(r.account_id) : null,
      stage_tag: r.stage_tag,
      instance_id: r.instance_id ? Number(r.instance_id) : null,
    }));
  }

  public async getStageWiseCounts(vendor_id: number, franchise_id?: number) {
    const statusTypes = await prisma.statusTypeMaster.findMany({
      where: { vendor_id },
      select: { id: true, tag: true, type: true },
    });

    const counts = await prisma.leadMaster.groupBy({
      by: ["status_id"],
      where: {
        vendor_id,
        is_deleted: false,
        ...(franchise_id ? { franchise_id } : {}),
      },
      _count: { id: true },
    });

    const countMap = new Map(counts.map((c) => [c.status_id, c._count.id]));

    return statusTypes
      .filter((st) => /^Type \d+$/.test(st.tag))
      .map((st) => ({
        tag: st.tag,
        type: st.type,
        count: countMap.get(st.id) ?? 0,
      }))
      .sort((a, b) => {
        const aNum = parseInt(a.tag.replace("Type ", ""));
        const bNum = parseInt(b.tag.replace("Type ", ""));
        return aNum - bNum;
      });
  }

  public async getLeadsByFranchise(vendor_id: number) {
    const franchises = await prisma.franchiseMaster.findMany({
      where: { vendor_id },
      select: { id: true, franchise_name: true,  franchise_code: true },
      orderBy: { franchise_name: "asc" },
    });

    const results = await Promise.all(
      franchises.map(async (f) => ({
        franchise_id: f.id,
        name: f.franchise_name,
        code: f.franchise_code ?? f.franchise_name,
        leads: await prisma.leadMaster.count({
          where: { vendor_id, franchise_id: f.id, is_deleted: false, activity_status: "onGoing"},
        }),
      }))
    );

    return results.sort((a, b) => b.leads - a.leads);
  }

  public async getLeadsThisMonth(vendor_id: number) {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
    const end   = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    const count = await prisma.leadMaster.count({
      where: {
        vendor_id,
        is_deleted: false,
        created_at: { gte: start, lte: end },
      },
    });

    return { count };
  }

  public async getActiveFranchiseeCount(vendor_id: number) {
    const count = await prisma.franchiseMaster.count({
      where: { vendor_id, status: "active" },
    });
    return { count };
  }

  public async getAdminStageCounts(vendor_id: number, franchise_id?: number) {
    const statuses = await prisma.statusTypeMaster.findMany({
      where: { vendor_id },
      select: { id: true, tag: true },
    });

    const statusMap = new Map<string, number>();
    statuses.forEach((s) => statusMap.set(s.tag, s.id));

    const baseWhere = {
      vendor_id,
      is_deleted: false,
      activity_status: {
        notIn: [
          ActivityStatus.onHold,
          ActivityStatus.lostApproval,
          ActivityStatus.lost,
        ],
      },
      ...(franchise_id ? { franchise_id } : {}),
    };

    const countByTags = async (tags: string[]) => {
      const statusIds = tags
        .map((tag) => statusMap.get(tag))
        .filter((id): id is number => Boolean(id));

      if (statusIds.length === 0) return 0;

      return prisma.leadMaster.count({
        where: {
          ...baseWhere,
          status_id: { in: statusIds },
        },
      });
    };

    // Count instances (not leads) for production stages Type 8, 9, 10
    const countInstancesByTags = async (tags: string[]) => {
      const statusIds = tags
        .map((tag) => statusMap.get(tag))
        .filter((id): id is number => Boolean(id));

      if (statusIds.length === 0) return 0;

      return prisma.leadProductStructureInstance.count({
        where: {
          lead: {
            ...baseWhere,
            status_id: { in: statusIds },
          },
        },
      });
    };

    const sumByTags = async (tags: string[]) => {
      const statusIds = tags
        .map((tag) => statusMap.get(tag))
        .filter((id): id is number => Boolean(id));

      if (statusIds.length === 0) return 0;

      const result = await prisma.leadMaster.aggregate({
        where: {
          ...baseWhere,
          status_id: { in: statusIds },
        },
        _sum: { total_project_amount: true },
      });

      return result._sum?.total_project_amount || 0;
    };

    const [leads, project, productionInstances, productionLeads, installation] = await Promise.all([
      countByTags(["Type 1", "Type 2", "Type 3", "Type 4"]),
      countByTags(["Type 5", "Type 6", "Type 7"]),
      countInstancesByTags(["Type 8", "Type 9", "Type 10"]),
      countByTags(["Type 11"]),
      countByTags(["Type 12", "Type 13", "Type 14", "Type 15", "Type 16"]),
    ]);

    const production = productionInstances + productionLeads;

    const [
      leadsAmount,
      projectAmount,
      productionAmount,
      installationAmount,
    ] = await Promise.all([
      sumByTags(["Type 1", "Type 2", "Type 3", "Type 4"]),
      sumByTags(["Type 5", "Type 6", "Type 7"]),
      sumByTags(["Type 8", "Type 9", "Type 10", "Type 11"]),
      sumByTags(["Type 12", "Type 13", "Type 14", "Type 15", "Type 16", "Type 17"]),
    ]);

    return {
      leads,
      leadsAmount,
      project,
      projectAmount,
      production,
      productionAmount,
      installation,
      installationAmount,
    };
  }

  // -------------------------------------------------------
  // Admin : Priority lead counts (Open / ISM / Designing)
  // -------------------------------------------------------
  public async getPriorityLeadCounts(vendor_id: number, franchise_id?: number) {
    const statuses = await prisma.statusTypeMaster.findMany({
      where: { vendor_id },
      select: { id: true, tag: true },
    });

    const statusMap = new Map<string, number>();
    statuses.forEach((s) => statusMap.set(s.tag, s.id));

    const baseWhere = {
      vendor_id,
      is_deleted: false,
      activity_status: {
        notIn: [
          ActivityStatus.onHold,
          ActivityStatus.lostApproval,
          ActivityStatus.lost,
        ],
      },
      ...(franchise_id ? { franchise_id } : {}),
    };

    const count = async (tag: string, priority: string) => {
      const statusId = statusMap.get(tag);
      if (!statusId) return 0;
      return prisma.leadMaster.count({
        where: { ...baseWhere, status_id: statusId, priority },
      });
    };

    const [
      openHigh,   openMedium,   openLow,
      ismHigh,    ismMedium,    ismLow,
      desHigh,    desMedium,    desLow,
    ] = await Promise.all([
      count("Type 1", "High"),   count("Type 1", "Medium"),   count("Type 1", "Low"),
      count("Type 2", "High"),   count("Type 2", "Medium"),   count("Type 2", "Low"),
      count("Type 3", "High"),   count("Type 3", "Medium"),   count("Type 3", "Low"),
    ]);

    return {
      open:      { high: openHigh,  medium: openMedium,  low: openLow  },
      ism:       { high: ismHigh,   medium: ismMedium,   low: ismLow   },
      designing: { high: desHigh,   medium: desMedium,   low: desLow   },
    };
  }

  // -------------------------------------------------------
  // Admin : Lost Approval Leads (by franchise_id)
  // -------------------------------------------------------
  public async getAdminLostApprovalLeads(vendor_id: number, franchise_id?: number) {
    const leads = await prisma.leadMaster.findMany({
      where: {
        vendor_id,
        is_deleted: false,
        activity_status: ActivityStatus.lostApproval,
        ...(franchise_id ? { franchise_id } : {}),
      },
      select: {
        id: true,
        lead_code: true,
        firstname: true,
        lastname: true,
        contact_no: true,
        country_code: true,
        priority: true,
        account_id: true,
        assignedTo: { select: { user_name: true } },
        productMappings: {
          select: { productType: { select: { type: true } } },
        },
      },
      orderBy: { created_at: "desc" },
    });

    return leads.map((l) => ({
      id: l.id,
      lead_code: l.lead_code,
      name: `${l.firstname ?? ""} ${l.lastname ?? ""}`.trim(),
      contact: `${l.country_code ?? ""}${l.contact_no ?? ""}`,
      furniture_type: l.productMappings.map((p) => p.productType?.type).filter(Boolean).join(", "),
      sales_executive: l.assignedTo?.user_name ?? "",
      priority: l.priority ?? "",
      account_id: l.account_id,
    }));
  }

  // -------------------------------------------------------
  // Admin : Sales Executive Task Overview (by franchise_id)
  // -------------------------------------------------------
  public async getAdminTaskOverview(
    vendor_id: number,
    franchise_id?: number,
    sales_executive_id?: number,
    page = 1,
    limit = 20,
    search = "",
    status?: string,
    overview?: string
  ) {
    const skip = (page - 1) * limit;
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const startOfTomorrow = new Date(startOfToday);
    startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);

    const statusFilter =
      status && status !== "all"
        ? { in: [status as any] }
        : { in: ["open", "in_progress", "completed"] as const };

    const overviewWhere =
      overview === "today"
        ? {
            status: { not: "completed" as const },
            due_date: { gte: startOfToday, lt: startOfTomorrow },
          }
        : overview === "upcoming"
          ? {
              status: { not: "completed" as const },
              due_date: { gte: startOfTomorrow },
            }
          : overview === "overdue"
            ? {
                status: { not: "completed" as const },
                due_date: { lt: startOfToday },
              }
            : undefined;

    const andConditions: any[] = [];
    if (overviewWhere) {
      andConditions.push(overviewWhere);
    }

    const where: any = {
      vendor_id,
      status: statusFilter,
      ...(franchise_id ? { franchise_id } : {}),
      ...(sales_executive_id ? { user_id: sales_executive_id } : {}),
      user: { user_type: { user_type: "sales-executive" } },
      ...(andConditions.length ? { AND: andConditions } : {}),
      ...(search
        ? {
            OR: [
              { lead: { lead_code: { contains: search } } },
              { user: { user_name: { contains: search } } },
              { task_type: { contains: search } },
            ],
          }
        : {}),
    };

    const [total, tasks] = await Promise.all([
      prisma.userLeadTask.count({ where }),
      prisma.userLeadTask.findMany({
        where,
        select: {
          id: true,
          task_type: true,
          status: true,
          due_date: true,
          lead: { select: { lead_code: true } },
          user: { select: { user_name: true } },
        },
        orderBy: { due_date: "asc" },
        skip,
        take: limit,
      }),
    ]);

    return {
      data: tasks.map((t) => ({
        id: t.id,
        lead_code: t.lead?.lead_code ?? "",
        sales_executive: t.user?.user_name ?? "",
        task_type: t.task_type,
        status: t.status,
        due_date: t.due_date,
      })),
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  // -------------------------------------------------------
  // Sales Executive : Stage counts for selected tags
  // -------------------------------------------------------
  public async getSalesExecutiveStageCounts(
    vendor_id: number,
    user_id: number,
    franchise_id?: number
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

    const franchiseFilter = franchise_id ? { franchise_id } : {};

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
          ...franchiseFilter,
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
  // -------------------------------------------------------
  // Site Supervisor : Service schedule counts (total / completed / pending)
  // -------------------------------------------------------
  public async getSiteSupervisorServiceCounts(vendor_id: number, user_id: number) {
    const type14 = await prisma.statusTypeMaster.findFirst({
      where: { vendor_id, tag: "Type 14" },
      select: { id: true },
    });

    if (!type14) return { count: 0 };

    const count = await prisma.leadMaster.count({
      where: {
        vendor_id,
        is_deleted: false,
        status_id: type14.id,
        userMappings: { some: { user_id, status: LeadUserStatus.active } },
      },
    });

    return { count };
  }

  public async getSupervisorLeads(
    vendor_id: number,
    site_supervisor_id?: number,
    page = 1,
    limit = 12,
  ) {
    const safePage = Math.max(1, Number(page) || 1);
    const safeLimit = Math.max(1, Math.min(50, Number(limit) || 12));
    const skip = (safePage - 1) * safeLimit;

    const where = {
      vendor_id,
      is_deleted: false,
      activity_status: {
        not: ActivityStatus.lost,
      },
      userMappings: {
        some: {
          status: LeadUserStatus.active,
          ...(site_supervisor_id ? { user_id: site_supervisor_id } : {}),
          user: {
            user_type: {
              user_type: {
                equals: "site-supervisor",
                mode: "insensitive" as const,
              },
            },
          },
        },
      },
    };

    const [total, leads] = await Promise.all([
      prisma.leadMaster.count({ where }),
      prisma.leadMaster.findMany({
        where,
        select: {
          id: true,
          lead_code: true,
          account_id: true,
          firstname: true,
          lastname: true,
          statusType: {
            select: {
              type: true,
              tag: true,
            },
          },
        },
        orderBy: { created_at: "desc" },
        skip,
        take: safeLimit,
      }),
    ]);

    return {
      rows: leads.map((lead) => ({
        id: lead.id,
        lead_id: lead.id,
        account_id: lead.account_id,
        lead_code: lead.lead_code ?? "",
        client: `${lead.firstname ?? ""} ${lead.lastname ?? ""}`.trim() || "—",
        stage: lead.statusType?.type ?? lead.statusType?.tag ?? "—",
      })),
      pagination: {
        page: safePage,
        limit: safeLimit,
        total,
        totalPages: Math.ceil(total / safeLimit),
        hasNext: skip + leads.length < total,
      },
    };
  }

  public async getSiteSupervisorPendingServices(
    vendor_id: number,
    user_id: number,
    filter: "month" | "year"
  ) {
    const leadIds = (
      await prisma.leadUserMapping.findMany({
        where: { vendor_id, user_id, status: LeadUserStatus.active },
        select: { lead_id: true },
      })
    ).map((m) => m.lead_id);

    if (leadIds.length === 0) return [];

    const now = new Date();
    const start =
      filter === "month"
        ? new Date(now.getFullYear(), now.getMonth(), 1)
        : new Date(now.getFullYear(), 0, 1);
    const end =
      filter === "month"
        ? new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)
        : new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);

    const services = await prisma.leadServiceSchedule.findMany({
      where: {
        vendor_id,
        lead_id: { in: leadIds },
        completed_at: null,
        scheduled_for: { gte: start, lte: end },
      },
      select: {
        id: true,
        service_no: true,
        service_type: true,
        scheduled_for: true,
        status: true,
        lead: {
          select: {
            id: true,
            lead_code: true,
            account_id: true,
            firstname: true,
            lastname: true,
          },
        },
      },
      orderBy: { scheduled_for: "asc" },
      take: 100,
    });

    return services.map((s) => ({
      id: s.id,
      lead_id: s.lead.id,
      account_id: s.lead.account_id,
      lead_code: s.lead.lead_code ?? "",
      client: `${s.lead.firstname ?? ""} ${s.lead.lastname ?? ""}`.trim(),
      service_no: s.service_no,
      service_type: s.service_type as "free" | "amc",
      scheduled_for: s.scheduled_for,
      status: s.status as string,
    }));
  }

  // -------------------------------------------------------
  // Site Supervisor : Upcoming sites (dispatch_date set, no Type 15 log)
  // -------------------------------------------------------
  public async getSiteSupervisorUpcomingSites(vendor_id: number, user_id: number) {
    const type15 = await prisma.statusTypeMaster.findFirst({
      where: { vendor_id, tag: "Type 15" },
      select: { id: true },
    });

    if (!type15) return [];

    const leads = await prisma.leadMaster.findMany({
      where: {
        vendor_id,
        is_deleted: false,
        dispatch_date: { not: null },
        userMappings: {
          some: { user_id, status: LeadUserStatus.active },
        },
        leadStatusLogs: {
          none: { vendor_id, status_id: type15.id },
        },
      },
      select: {
        id: true,
        lead_code: true,
        account_id: true,
        firstname: true,
        lastname: true,
        dispatch_date: true,
        productMappings: {
          select: { productType: { select: { type: true } } },
        },
      },
      orderBy: { dispatch_date: "asc" },
      take: 50,
    });

    return leads.map((lead) => ({
      id: lead.id,
      account_id: lead.account_id,
      lead_code: lead.lead_code ?? "",
      client: `${lead.firstname ?? ""} ${lead.lastname ?? ""}`.trim(),
      dispatch_date: lead.dispatch_date,
      furniture_type: lead.productMappings
        .map((m) => m.productType.type)
        .filter(Boolean)
        .join(", ") || "—",
    }));
  }

  // -------------------------------------------------------
  // Site Supervisor : Unresolved misc items on assigned leads
  // -------------------------------------------------------
  public async getSiteSupervisorMiscItems(vendor_id: number, user_id: number) {
    const items = await prisma.miscellaneousMaster.findMany({
      where: {
        vendor_id,
        is_resolved: false,
        lead: {
          is_deleted: false,
          userMappings: {
            some: { user_id, status: LeadUserStatus.active },
          },
        },
      },
      select: {
        id: true,
        expected_ready_date: true,
        required_delivery_date: true,
        misc_approved: true,
        is_resolved: true,
        problem_description: true,
        reorder_material_details: true,
        lead: {
          select: {
            id: true,
            lead_code: true,
            account_id: true,
            firstname: true,
            lastname: true,
          },
        },
        type: {
          select: { name: true },
        },
      },
      orderBy: { expected_ready_date: "asc" },
      take: 50,
    });

    if (items.length === 0) return [];

    const leadIds = [...new Set(items.map((i) => i.lead.id))];

    const miscTasks = await prisma.userLeadTask.findMany({
      where: { vendor_id, lead_id: { in: leadIds }, task_type: "Miscellaneous" },
      select: { id: true, lead_id: true, task_type: true, remark: true, status: true },
    });

    return items.map((item) => {
      const miscTaskKey = `[misc:${item.id}]`;
      const remarkKey = `${item.reorder_material_details} - ${item.problem_description}`;

      const leadTasks = miscTasks.filter((t) => t.lead_id === item.lead.id);

      const task = leadTasks.find(
        (t) =>
          (t.remark && t.remark.includes(miscTaskKey)) ||
          t.remark === remarkKey
      );

      const deliveryTask = leadTasks.find(
        (t) =>
          typeof t.remark === "string" &&
          t.remark.includes("Required delivery date set for") &&
          item.reorder_material_details != null &&
          item.problem_description != null &&
          t.remark.includes(item.reorder_material_details) &&
          t.remark.includes(item.problem_description)
      );

      return {
        id: item.id,
        lead_id: item.lead.id,
        account_id: item.lead.account_id,
        lead_code: item.lead.lead_code ?? "",
        client: `${item.lead.firstname ?? ""} ${item.lead.lastname ?? ""}`.trim(),
        misc_type: item.type.name,
        expected_ready_date: item.expected_ready_date,
        required_delivery_date: item.required_delivery_date,
        misc_approved: item.misc_approved,
        is_resolved: item.is_resolved,
        task_status: task?.status ?? null,
        delivery_task_status: deliveryTask?.status ?? null,
      };
    });
  }

  // -------------------------------------------------------
  // Site Supervisor : Avg days from installation start → final handover
  // -------------------------------------------------------
  public async getSiteSupervisorAvgDaysToInstallation(
    vendor_id: number,
    user_id: number
  ) {
    const leads = await prisma.leadMaster.findMany({
      where: {
        vendor_id,
        is_deleted: false,
        actual_installation_start_date: { not: null },
        final_handover_marked_at: { not: null },
        userMappings: {
          some: { user_id, status: LeadUserStatus.active },
        },
      },
      select: {
        actual_installation_start_date: true,
        final_handover_marked_at: true,
      },
    });

    let totalDays = 0;
    let count = 0;

    for (const lead of leads) {
      if (!lead.actual_installation_start_date || !lead.final_handover_marked_at) continue;
      const diffMs =
        lead.final_handover_marked_at.getTime() -
        lead.actual_installation_start_date.getTime();
      const days = diffMs / (1000 * 60 * 60 * 24);
      if (days >= 0) {
        totalDays += days;
        count++;
      }
    }

    const avgDays = count === 0 ? 0 : Number((totalDays / count).toFixed(2));

    const totalMinutes = avgDays * 24 * 60;
    const readable = {
      days: Math.floor(totalMinutes / (24 * 60)),
      hours: Math.floor((totalMinutes % (24 * 60)) / 60),
      minutes: Math.floor(totalMinutes % 60),
    };

    return { avgDays, readable };
  }

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
  // Admin : All stage leads (Type 1–17) onGoing only, not deleted
  // -------------------------------------------------------
  public async getAdminAllStageLeads(vendor_id: number, franchise_id?: number) {
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

    const fetchLeadsForTag = async (tag: string) => {
      const status_id = statusMap.get(tag);
      if (!status_id) return [];

      const leads = await prisma.leadMaster.findMany({
        where: {
          vendor_id,
          is_deleted: false,
          status_id,
          activity_status: ActivityStatus.onGoing,
          ...(franchise_id ? { franchise_id } : {}),
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

  // -------------------------------------------------------
  // Factory Dashboard : Lead Bifurcation
  // -------------------------------------------------------
  public async getFactoryLeadBifurcation(vendor_id: number) {
    const productionStatusIds = await prisma.statusTypeMaster
      .findMany({
        where: { vendor_id, tag: { in: ["Type 8", "Type 9", "Type 10"] } },
        select: { id: true },
      })
      .then((rows) => rows.map((r) => r.id));

    const sharedWhere = {
      vendor_id,
      is_tech_check_completed: true,
      is_order_login_completed: true,
      lead: {
        is_deleted: false,
        status_id: { in: productionStatusIds },
      },
    };

    const [pendingCount, preProdDoneCount, underProdCount, completedCount] =
      await Promise.all([
        prisma.leadProductStructureInstance.count({
          where: {
            ...sharedWhere,
            AND: [
              {
                OR: [
                  { is_pre_prod_done: false },
                  { is_pre_prod_done: null },
                ],
              },
              {
                OR: [
                  { is_under_production: false },
                  { is_under_production: null },
                ],
              },
              {
                OR: [
                  { is_post_production: false },
                  { is_post_production: null },
                ],
              },
              {
                OR: [
                  { is_production_completed: false },
                  { is_production_completed: null },
                ],
              },
            ],
          },
        }),
        // Pre-production dashboard card maps to the "Pre Prod Done" bucket
        // shown in the production stage table.
        prisma.leadProductStructureInstance.count({
          where: {
            ...sharedWhere,
            is_pre_prod_done: true,
            is_under_production: { not: true },
            is_post_production: { not: true },
            is_production_completed: { not: true },
          },
        }),
        // Under Production dashboard card maps to the explicit "Under Production"
        // bucket shown in the production stage table.
        prisma.leadProductStructureInstance.count({
          where: {
            ...sharedWhere,
            is_under_production: true,
            is_post_production: { not: true },
            is_production_completed: { not: true },
          },
        }),
        prisma.leadProductStructureInstance.count({
          where: {
            ...sharedWhere,
            is_production_completed: true,
          },
        }),
      ]);

    return { pendingCount, preProdDoneCount, underProdCount, completedCount };
  }

  // -------------------------------------------------------
  // Tech-Check Dashboard : New Leads shifted to Tech Check (Type 8)
  // -------------------------------------------------------
  public async getTechCheckNewLeads(vendor_id: number) {
    const type8 = await prisma.statusTypeMaster.findFirst({
      where: { vendor_id, tag: "Type 8" },
      select: { id: true },
    });

    if (!type8) return { count: 0 };

    const count = await prisma.leadProductStructureInstance.count({
      where: {
        vendor_id,
        is_tech_check_completed: false,
        lead: {
          is_deleted: false,
          status_id: type8.id,
        },
      },
    });

    return { count };
  }

  // -------------------------------------------------------
  // Tech-Check Dashboard : Avg Timeline – Type 7 log → tech_check_completed_at
  // -------------------------------------------------------
  public async getTechCheckAvgApprovalTimeline(vendor_id: number) {
    const type7 = await prisma.statusTypeMaster.findFirst({
      where: { vendor_id, tag: "Type 7" },
      select: { id: true },
    });

    if (!type7) return { avgDays: 0, readable: { days: 0, hours: 0, minutes: 0 } };

    // Instances that have been tech-check completed and whose lead is at Type 7
    const instances = await prisma.leadProductStructureInstance.findMany({
      where: {
        vendor_id,
        tech_check_completed_at: { not: null },
        lead: {
          is_deleted: false,
          status_id: type7.id,
        },
      },
      select: {
        lead_id: true,
        tech_check_completed_at: true,
      },
    });

    if (instances.length === 0) {
      return { avgDays: 0, readable: { days: 0, hours: 0, minutes: 0 } };
    }

    const leadIds = [...new Set(instances.map((i) => i.lead_id))];

    // Earliest Type 7 log per lead
    const type7Logs = await prisma.leadStatusLogs.findMany({
      where: { vendor_id, status_id: type7.id, lead_id: { in: leadIds } },
      select: { lead_id: true, created_at: true },
      orderBy: { created_at: "asc" },
    });

    const type7Map = new Map<number, Date>();
    for (const log of type7Logs) {
      if (!type7Map.has(log.lead_id)) type7Map.set(log.lead_id, log.created_at);
    }

    let totalMs = 0;
    let count = 0;

    for (const instance of instances) {
      const type7Date = type7Map.get(instance.lead_id);
      if (!type7Date || !instance.tech_check_completed_at) continue;
      const diffMs = instance.tech_check_completed_at.getTime() - type7Date.getTime();
      if (diffMs >= 0) {
        totalMs += diffMs;
        count++;
      }
    }

    const avgDays = count === 0 ? 0 : Number((totalMs / count / (1000 * 60 * 60 * 24)).toFixed(2));
    const totalMinutes = avgDays * 24 * 60;

    return {
      avgDays,
      readable: {
        days: Math.floor(totalMinutes / (24 * 60)),
        hours: Math.floor((totalMinutes % (24 * 60)) / 60),
        minutes: Math.floor(totalMinutes % 60),
      },
    };
  }

  // -------------------------------------------------------
  // Backend User Dashboard : New Leads in Order Login Stage (Type 9)
  // -------------------------------------------------------
  public async getBackendNewOrderLoginLeads(vendor_id: number) {
    const type9 = await prisma.statusTypeMaster.findFirst({
      where: { vendor_id, tag: "Type 9" },
      select: { id: true },
    });

    if (!type9) return { count: 0 };

    const count = await prisma.leadMaster.count({
      where: {
        vendor_id,
        is_deleted: false,
        status_id: type9.id,
      },
    });

    return { count };
  }

  // -------------------------------------------------------
  // Backend User Dashboard : Avg Timeline – OL (Type 9) → Production (Type 10)
  // -------------------------------------------------------
  public async getBackendAvgOLToProduction(vendor_id: number) {
    const statuses = await prisma.statusTypeMaster.findMany({
      where: { vendor_id, tag: { in: ["Type 9", "Type 10"] } },
      select: { id: true, tag: true },
    });

    const statusMap = new Map(statuses.map((s) => [s.tag, s.id]));
    const type9Id = statusMap.get("Type 9");
    const type10Id = statusMap.get("Type 10");

    if (!type9Id || !type10Id) {
      return { avgDays: 0, readable: { days: 0, hours: 0, minutes: 0 } };
    }

    const [type9Logs, type10Logs] = await Promise.all([
      prisma.leadStatusLogs.findMany({
        where: { vendor_id, status_id: type9Id },
        select: { lead_id: true, created_at: true },
        orderBy: { created_at: "asc" },
      }),
      prisma.leadStatusLogs.findMany({
        where: { vendor_id, status_id: type10Id },
        select: { lead_id: true, created_at: true },
        orderBy: { created_at: "asc" },
      }),
    ]);

    const type9Map = new Map<number, Date>();
    for (const log of type9Logs) {
      if (!type9Map.has(log.lead_id)) type9Map.set(log.lead_id, log.created_at);
    }

    const type10Map = new Map<number, Date>();
    for (const log of type10Logs) {
      if (!type10Map.has(log.lead_id)) type10Map.set(log.lead_id, log.created_at);
    }

    let totalMs = 0;
    let count = 0;

    for (const [leadId, type9Date] of type9Map) {
      const type10Date = type10Map.get(leadId);
      if (!type10Date) continue;
      const diffMs = type10Date.getTime() - type9Date.getTime();
      if (diffMs >= 0) {
        totalMs += diffMs;
        count++;
      }
    }

    const avgDays = count === 0 ? 0 : Number((totalMs / count / (1000 * 60 * 60 * 24)).toFixed(2));
    const totalMinutes = avgDays * 24 * 60;

    return {
      avgDays,
      readable: {
        days: Math.floor(totalMinutes / (24 * 60)),
        hours: Math.floor((totalMinutes % (24 * 60)) / 60),
        minutes: Math.floor(totalMinutes % 60),
      },
    };
  }

  // -------------------------------------------------------
  // Pre-Prod Dashboard : New Sites in Production Stage
  // -------------------------------------------------------
  public async getPreProdNewSites(vendor_id: number) {
    const productionStatusIds = await prisma.statusTypeMaster
      .findMany({
        where: { vendor_id, tag: { in: ["Type 8", "Type 9", "Type 10"] } },
        select: { id: true },
      })
      .then((rows) => rows.map((r) => r.id));

    const count = await prisma.leadProductStructureInstance.count({
      where: {
        vendor_id,
        is_order_login_completed: true,
        is_pre_prod_done: false,
        lead: {
          is_deleted: false,
          status_id: { in: productionStatusIds },
        },
      },
    });

    return { count };
  }

  // -------------------------------------------------------
  // Pre-Prod Dashboard : Avg Timeline – Order Login Done → Pre-Prod Done
  // -------------------------------------------------------
  public async getPreProdAvgTimeline(vendor_id: number) {
    const instances = await prisma.leadProductStructureInstance.findMany({
      where: {
        vendor_id,
        order_login_completed_at: { not: null },
        pre_prod_done_at: { not: null },
      },
      select: {
        order_login_completed_at: true,
        pre_prod_done_at: true,
      },
    });

    let totalMs = 0;
    let count = 0;

    for (const i of instances) {
      if (!i.order_login_completed_at || !i.pre_prod_done_at) continue;
      const diffMs = i.pre_prod_done_at.getTime() - i.order_login_completed_at.getTime();
      if (diffMs >= 0) {
        totalMs += diffMs;
        count++;
      }
    }

    const avgDays = count === 0 ? 0 : Number((totalMs / count / (1000 * 60 * 60 * 24)).toFixed(2));
    const totalMinutes = avgDays * 24 * 60;

    return {
      avgDays,
      readable: {
        days: Math.floor(totalMinutes / (24 * 60)),
        hours: Math.floor((totalMinutes % (24 * 60)) / 60),
        minutes: Math.floor(totalMinutes % 60),
      },
    };
  }

  // -------------------------------------------------------
  // Factory Dashboard : ERD Calendar
  // -------------------------------------------------------
  public async getFactoryERDCalendar(vendor_id: number) {
    const instances = await prisma.leadProductStructureInstance.findMany({
      where: {
        vendor_id,
        production_erd_date: { not: null },
        lead: { is_deleted: false },
      },
      select: {
        id: true,
        lead_id: true,
        production_erd_date: true,
        lead: {
          select: {
            lead_code: true,
            account_id: true,
            firstname: true,
            lastname: true,
          },
        },
      },
      orderBy: { production_erd_date: "asc" },
    });

    return instances.map((i) => ({
      id: i.id,
      lead_id: i.lead_id,
      account_id: i.lead.account_id,
      lead_code: i.lead.lead_code ?? "",
      name: `${i.lead.firstname ?? ""} ${i.lead.lastname ?? ""}`.trim(),
      production_erd_date: i.production_erd_date,
    }));
  }

  // -------------------------------------------------------
  // Factory Dashboard : Upcoming Dispatches
  // LeadMaster with status Type 14 and dispatch_date set
  // -------------------------------------------------------
  public async getFactoryUpcomingDispatches(vendor_id: number) {
    const type14 = await prisma.statusTypeMaster.findFirst({
      where: { vendor_id, tag: "Type 14" },
      select: { id: true },
    });

    if (!type14) return [];

    const leads = await prisma.leadMaster.findMany({
      where: {
        vendor_id,
        is_deleted: false,
        status_id: type14.id,
        dispatch_date: { not: null },
      },
      select: {
        id: true,
        lead_code: true,
        account_id: true,
        firstname: true,
        lastname: true,
        dispatch_date: true,
      },
      orderBy: { dispatch_date: "asc" },
    });

    return leads.map((l) => ({
      id: l.id,
      lead_id: l.id,
      account_id: l.account_id,
      lead_code: l.lead_code ?? "",
      name: `${l.firstname ?? ""} ${l.lastname ?? ""}`.trim(),
      dispatch_date: l.dispatch_date,
    }));
  }

  // -------------------------------------------------------
  // Factory Dashboard : Avg Timeline – Production to RTD
  // Type 10 (Production Stage) → Type 11 (Ready to Dispatch)
  // -------------------------------------------------------
  public async getFactoryAvgProductionToRTD(vendor_id: number) {
    const statuses = await prisma.statusTypeMaster.findMany({
      where: { vendor_id, tag: { in: ["Type 10", "Type 11"] } },
      select: { id: true, tag: true },
    });

    const statusMap = new Map(statuses.map((s) => [s.tag, s.id]));
    const type10Id = statusMap.get("Type 10");
    const type11Id = statusMap.get("Type 11");

    if (!type10Id || !type11Id) {
      return { avgDays: 0, readable: { days: 0, hours: 0, minutes: 0 } };
    }

    const [type10Logs, type11Logs] = await Promise.all([
      prisma.leadStatusLogs.findMany({
        where: { vendor_id, status_id: type10Id },
        select: { lead_id: true, created_at: true },
        orderBy: { created_at: "asc" },
      }),
      prisma.leadStatusLogs.findMany({
        where: { vendor_id, status_id: type11Id },
        select: { lead_id: true, created_at: true },
        orderBy: { created_at: "asc" },
      }),
    ]);

    // Earliest Type 10 log per lead
    const type10Map = new Map<number, Date>();
    for (const log of type10Logs) {
      if (!type10Map.has(log.lead_id)) type10Map.set(log.lead_id, log.created_at);
    }

    // Earliest Type 11 log per lead
    const type11Map = new Map<number, Date>();
    for (const log of type11Logs) {
      if (!type11Map.has(log.lead_id)) type11Map.set(log.lead_id, log.created_at);
    }

    let totalMs = 0;
    let count = 0;

    for (const [leadId, type10Date] of type10Map) {
      const type11Date = type11Map.get(leadId);
      if (!type11Date) continue;
      const diffMs = type11Date.getTime() - type10Date.getTime();
      if (diffMs >= 0) {
        totalMs += diffMs;
        count++;
      }
    }

    const avgDays = count === 0 ? 0 : Number((totalMs / count / (1000 * 60 * 60 * 24)).toFixed(2));
    const totalMinutes = avgDays * 24 * 60;

    return {
      avgDays,
      readable: {
        days: Math.floor(totalMinutes / (24 * 60)),
        hours: Math.floor((totalMinutes % (24 * 60)) / 60),
        minutes: Math.floor(totalMinutes % 60),
      },
    };
  }
}
