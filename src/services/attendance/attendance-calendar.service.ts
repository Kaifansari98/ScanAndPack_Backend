import { prisma } from "../../prisma/client";
import { Prisma } from "../../../generated/prisma_client/client";
import { leaveContext } from "../leaves/leaves.service";
import { leaveText, positiveId } from "../leaves/leave.utils";
import { attendanceError, deriveVendorLocalDate, validDate } from "./attendance.utils";
import { addCalendarCount, calendarStatuses, classifyCalendarDay, emptyCalendarCounts, validateShiftMinutes, type CalendarStatus } from "./attendance-calendar.utils";
import type { AttendanceActor } from "./attendance-workspace.service";

type Query = Record<string, unknown>;
const units = ["BRANCH", "FRANCHISE", "FACTORY", "UNASSIGNED"];
const optional = (value: unknown, label: string) => value === undefined || value === "all" || value === "" ? undefined : leaveText(value, label, 100);
async function dataset(actor: AttendanceActor | undefined, query: Query, oneDay = false) {
  const context = await leaveContext(actor, true);
  const today = context.today;
  const month = query.month === undefined ? today.slice(0, 7) : query.month;
  let from: Date, to: Date;
  if (oneDay) { from = validDate(query.date); to = from; }
  else {
    if (typeof month !== "string" || !/^(20\d{2}|2100)-(0[1-9]|1[0-2])$/.test(month)) attendanceError("Month must use YYYY-MM, between 2000 and 2100.");
    from = validDate(`${month}-01`); to = new Date(from); to.setUTCMonth(to.getUTCMonth() + 1); to.setUTCDate(0);
  }
  if (from.getUTCFullYear() < 2000 || to.getUTCFullYear() > 2100) attendanceError("Choose dates between 2000 and 2100.");
  const location = optional(query.location, "Location"), unit = optional(query.unit, "Unit type");
  if (unit && !units.includes(unit)) attendanceError("Invalid unit type.");
  const locationId = location && location !== "head-office" ? positiveId(location, "location id") : undefined;
  const vendor_id = context.user.vendor_id;
  const locations = await prisma.franchiseMaster.findMany({ where: { vendor_id }, select: { id: true, franchise_name: true, Department: true, shift_minutes: true }, orderBy: { franchise_name: "asc" } });
  if (locationId && !locations.some(row => row.id === locationId)) attendanceError("Location not found in your vendor.", 404);
  const recordRange = { gte: from, lte: to < validDate(today) ? to : validDate(today) };
  const facts = await prisma.$transaction(async tx => {
    const users = await tx.userMaster.findMany({
      where: { vendor_id, OR: [{ status: "active" }, { exit_date: { gte: from } }, { attendances: { some: { vendor_id, attendance_date: recordRange } } }] },
      select: { id: true, user_name: true, employee_code: true, designation: true, franchise_id: true, status: true, created_at: true, joining_date: true, exit_date: true, user_type: { select: { user_type: true } } }, orderBy: [{ user_name: "asc" }, { id: "asc" }],
    });
    const records = await tx.attendance.findMany({ where: { vendor_id, attendance_date: recordRange }, include: { breaks: { orderBy: { started_at: "asc" } } } });
    const leaves = await tx.leaveRequest.findMany({ where: { vendor_id, leave_date: { lte: to }, end_date: { gte: from }, status: { in: ["APPROVED", "RECORDED", "PENDING"] } }, select: { id: true, user_id: true, franchise_id: true, title: true, status: true, leave_date: true, end_date: true } });
    const holidays = await tx.leaveHoliday.findMany({ where: { vendor_id, holiday_date: { gte: from, lte: to } }, select: { scope_key: true, holiday_date: true, name: true } });
    const policies = await tx.leaveWeeklyOff.findMany({ where: { vendor_id }, select: { scope_key: true, days: true } });
    return { users, records, leaves, holidays, policies };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 20000 });
  const dates: string[] = [];
  for (let date = new Date(from); date <= to; date.setUTCDate(date.getUTCDate() + 1)) dates.push(date.toISOString().slice(0, 10));
  const byLocation = new Map(locations.map(row => [row.id, row]));
  const records = new Map(facts.records.map(row => [`${row.user_id}:${row.attendance_date.toISOString().slice(0, 10)}`, row]));
  const holidays = new Map(facts.holidays.map(row => [`${row.scope_key}:${row.holiday_date.toISOString().slice(0, 10)}`, row.name]));
  const policies = new Map(facts.policies.map(row => [row.scope_key, row.days]));
  const leaves = new Map<number, typeof facts.leaves>();
  for (const row of facts.leaves) { const list = leaves.get(row.user_id) || []; list.push(row); leaves.set(row.user_id, list); }
  const now = new Date();
  const users = facts.users.filter(user => !user.franchise_id || byLocation.has(user.franchise_id)).map(user => ({ ...user,
    joined: user.joining_date ? user.joining_date.toISOString().slice(0, 10) : deriveVendorLocalDate(user.created_at, context.timeZone).localDateString,
    exited: user.exit_date ? user.exit_date.toISOString().slice(0, 10) : null,
  }));
  function rowsFor(date: string) {
    const result = [];
    for (const user of users) {
      const record = date <= today ? records.get(`${user.id}:${date}`) : undefined;
      if (!record && (date < user.joined || (user.exited && date > user.exited) || (user.status !== "active" && (!user.exited || date > today)))) continue;
      const userLeaves = (leaves.get(user.id) || []).filter(row => row.leave_date.toISOString().slice(0, 10) <= date && row.end_date.toISOString().slice(0, 10) >= date);
      const leave = userLeaves.find(row => row.status !== "PENDING");
      const franchiseId = record ? record.franchise_id : date < today && leave ? leave.franchise_id : user.franchise_id;
      const franchise = franchiseId ? byLocation.get(franchiseId) : undefined;
      const locationKey = franchise ? String(franchise.id) : "head-office", unitType = franchise?.Department || "UNASSIGNED";
      if (location && locationKey !== location) continue;
      if (unit && unitType !== unit) continue;
      const holiday = holidays.get(`${locationKey}:${date}`) || holidays.get(`company:${date}`);
      const weeklyOff = (policies.get(locationKey) ?? policies.get("company") ?? []).includes(new Date(`${date}T12:00:00Z`).getUTCDay());
      const classification = classifyCalendarDay({ date, today, now, shiftMinutes: franchise?.shift_minutes || 480, record, offReason: holiday || (weeklyOff ? "Weekly off" : undefined), leaveTitle: leave?.title });
      result.push({ user_id: user.id, employee: user.user_name, employee_code: user.employee_code || `User #${user.id}`, designation: user.designation, role: user.user_type.user_type,
        date, location_id: locationKey, location_name: franchise?.franchise_name || "Head office / Unassigned", unit: unitType,
        ...classification, attendance_id: record?.id || null, check_in: record?.check_in || null, check_out: record?.check_out || null,
        leave_title: leave?.title || null, leave_status: leave?.status || null, pending_leave: userLeaves.some(row => row.status === "PENDING"), off_reason: holiday || (weeklyOff ? "Weekly off" : null),
      });
    }
    return result;
  }
  const locationOptions = [{ id: "head-office", name: "Head office / Unassigned", unit: "UNASSIGNED", shift_minutes: 480 }, ...locations.map(row => ({ id: String(row.id), name: row.franchise_name, unit: row.Department, shift_minutes: row.shift_minutes }))];
  const selectedLocations = locations.filter(row => (!locationId || row.id === locationId) && (!unit || row.Department === unit));
  const needsCompanyPolicy = location === "head-office" || (!location && (!unit || unit === "UNASSIGNED") && users.some(user => !user.franchise_id));
  const weeklyOffConfigured = policies.has("company") || (!needsCompanyPolicy && selectedLocations.length > 0 && selectedLocations.every(row => policies.has(String(row.id))));
  return { rowsFor, dates, today, now, time_zone: context.timeZone, company_name: context.user.vendor.vendor_name, locations: locationOptions, weekly_off_configured: weeklyOffConfigured };
}
export async function getAttendanceCalendar(actor: AttendanceActor | undefined, query: Query) {
  const data = await dataset(actor, query);
  const days = data.dates.map(date => {
    const rows = data.rowsFor(date), counts = emptyCalendarCounts();
    const byUnit = Object.fromEntries(units.map(unit => [unit, emptyCalendarCounts()]));
    rows.forEach(row => { addCalendarCount(counts, row); addCalendarCount(byUnit[row.unit], row); });
    return { date, is_forecast: date > data.today, is_live: date === data.today, counts, units: byUnit };
  });
  return { month: data.dates[0].slice(0, 7), today: data.today, server_time: data.now, time_zone: data.time_zone, company_name: data.company_name, locations: data.locations, weekly_off_configured: data.weekly_off_configured, days };
}
export async function getAttendanceCalendarDay(actor: AttendanceActor | undefined, query: Query) {
  const data = await dataset(actor, query, true), rows = data.rowsFor(data.dates[0]);
  const counts = emptyCalendarCounts(), groups = new Map<string, { id: string; name: string; unit: string; shift_minutes: number; counts: ReturnType<typeof emptyCalendarCounts> }>();
  for (const row of rows) {
    addCalendarCount(counts, row);
    const group = groups.get(row.location_id) || { id: row.location_id, name: row.location_name, unit: row.unit, shift_minutes: data.locations.find(item => item.id === row.location_id)?.shift_minutes || 480, counts: emptyCalendarCounts() };
    addCalendarCount(group.counts, row); groups.set(row.location_id, group);
  }
  const search = optional(query.search, "Search")?.toLowerCase(), status = optional(query.status, "Status") as CalendarStatus | undefined;
  if (status && !calendarStatuses.includes(status)) attendanceError("Invalid calendar status.");
  const filtered = rows.filter(row => (!status || row.status === status) && (!search || `${row.employee} ${row.employee_code} ${row.designation || ""}`.toLowerCase().includes(search)));
  const exporting = query.export === "true";
  if (exporting && filtered.length > 20000) attendanceError("Export up to 20000 employees. Narrow your filters.");
  const pageSize = query.page_size === undefined ? 20 : positiveId(query.page_size, "page size");
  if (pageSize > 100) attendanceError("Page size cannot exceed 100.");
  const requested = query.page === undefined ? 1 : positiveId(query.page, "page");
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize)), page = Math.min(requested, pages);
  return { date: data.dates[0], today: data.today, is_forecast: data.dates[0] > data.today, is_live: data.dates[0] === data.today, time_zone: data.time_zone, server_time: data.now,
    counts, groups: Array.from(groups.values()).sort((a, b) => a.name.localeCompare(b.name)), total: filtered.length, page, page_size: pageSize, total_pages: pages,
    employees: exporting ? filtered : filtered.slice((page - 1) * pageSize, page * pageSize),
  };
}
export async function updateFranchiseShift(actor: AttendanceActor | undefined, id: number, input: Record<string, unknown>) {
  const context = await leaveContext(actor, true), shiftMinutes = validateShiftMinutes(input.shift_minutes);
  const result = await prisma.franchiseMaster.updateMany({ where: { id, vendor_id: context.user.vendor_id }, data: { shift_minutes: shiftMinutes } });
  if (!result.count) attendanceError("Location not found in your vendor.", 404);
  return { id, shift_minutes: shiftMinutes };
}
