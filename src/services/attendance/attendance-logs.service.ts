import { prisma } from "../../prisma/client";
import { attendanceContext, normalizeRole, type AttendanceActor } from "./attendance-workspace.service";
import { attendanceError, decorateAttendance, deriveVendorLocalDate, validDate } from "./attendance.utils";

type LogStatus = "WORKING" | "ON_BREAK" | "COMPLETED" | "MISSING_PUNCH" | "NO_RECORD";
type LogFilters = { from?: unknown; to?: unknown; search?: unknown; location?: unknown; role?: unknown; unit?: unknown; status?: unknown; page?: unknown; page_size?: unknown; export?: unknown };
type Franchise = { id: number; franchise_name: string; Department: string };
const statuses: LogStatus[] = ["WORKING", "ON_BREAK", "COMPLETED", "MISSING_PUNCH", "NO_RECORD"];
const units = ["BRANCH", "FRANCHISE", "FACTORY"];
const HEAD_OFFICE = "head-office";
const MAX_RANGE_DAYS = 35;
const EXPORT_LIMIT = 20000;
// Open sessions older than this are flagged for review; shorter ones may be overnight shifts.
const MISSING_PUNCH_AFTER_MS = 16 * 3600 * 1000;
const breakInclude = { breaks: { orderBy: { started_at: "asc" as const } } };
const text = (value: unknown) => typeof value === "string" && value.trim() && value !== "all" ? value.trim() : undefined;

async function superAdminContext(actor?: AttendanceActor) {
  const context = await attendanceContext(actor);
  if (normalizeRole(context.user.user_type.user_type) !== "super-admin") attendanceError("Only super admins can view company attendance logs.", 403);
  return context;
}

function employeeOf(user: { id: number; user_name: string; designation: string | null; user_type: { user_type: string } }, franchise?: Franchise) {
  return {
    id: user.id, name: user.user_name, designation: user.designation || null, role: user.user_type.user_type,
    location: franchise?.franchise_name || "Head office", location_id: franchise ? String(franchise.id) : HEAD_OFFICE, unit: franchise?.Department || null,
  };
}

function rowOf(record: any, timeZone: string, now: Date) {
  const decorated = decorateAttendance(record, timeZone, now)!;
  const status: LogStatus = decorated.check_out ? "COMPLETED"
    : now.getTime() - new Date(record.check_in).getTime() > MISSING_PUNCH_AFTER_MS ? "MISSING_PUNCH"
    : decorated.status === "ON_BREAK" ? "ON_BREAK" : "WORKING";
  return {
    attendance_id: record.id as number, status, check_in: record.check_in as Date, check_out: record.check_out as Date | null,
    source: record.source as string, work_location: record.work_location as string | null, time_zone: decorated.vendor_time_zone as string,
    break_minutes: Math.round(decorated.break_seconds / 60), work_minutes: status === "MISSING_PUNCH" ? null : Math.round(decorated.work_seconds / 60),
  };
}

function dateRange(from: unknown, to: unknown, today: string) {
  const gte = validDate(from === undefined || from === "" ? today : from), lte = validDate(to === undefined || to === "" ? today : to);
  const start = gte.toISOString().slice(0, 10), end = lte.toISOString().slice(0, 10);
  if (gte > lte) attendanceError("The start date must be on or before the end date.");
  if (end > today) attendanceError("Attendance logs cannot include future dates.");
  const days = Math.round((lte.getTime() - gte.getTime()) / 86400000) + 1;
  if (days > MAX_RANGE_DAYS) attendanceError(`Choose a range of up to ${MAX_RANGE_DAYS} days.`);
  const dates = Array.from({ length: days }, (_, index) => new Date(lte.getTime() - index * 86400000).toISOString().slice(0, 10));
  return { from: start, to: end, where: { gte, lte }, dates };
}

export async function listAttendanceLogs(actor: AttendanceActor | undefined, filters: LogFilters) {
  const context = await superAdminContext(actor);
  const vendorId = context.user.vendor_id;
  const now = new Date();
  const today = deriveVendorLocalDate(now, context.timeZone).localDateString;
  const range = dateRange(filters.from, filters.to, today);
  const status = text(filters.status) as LogStatus | undefined;
  if (status && !statuses.includes(status)) attendanceError("Invalid attendance status.");
  const unit = text(filters.unit);
  if (unit && !units.includes(unit)) attendanceError("Unit type must be BRANCH, FRANCHISE or FACTORY.");
  const location = text(filters.location), role = text(filters.role), search = text(filters.search)?.toLowerCase();
  const exporting = filters.export === "true" || filters.export === true;
  const pageSize = Math.min(100, Math.max(1, Number(filters.page_size) || 20));
  const requestedPage = Math.max(1, Number(filters.page) || 1);
  if (!Number.isSafeInteger(requestedPage)) attendanceError("Invalid page.");

  const [franchises, users, records] = await prisma.$transaction([
    prisma.franchiseMaster.findMany({ where: { vendor_id: vendorId }, select: { id: true, franchise_name: true, Department: true }, orderBy: { franchise_name: "asc" } }),
    // Inactive employees still appear on the days they recorded attendance.
    prisma.userMaster.findMany({
      where: { vendor_id: vendorId, OR: [{ status: "active" }, { attendances: { some: { vendor_id: vendorId, attendance_date: range.where } } }] },
      select: { id: true, user_name: true, designation: true, status: true, created_at: true, franchise_id: true, user_type: { select: { user_type: true } } },
      orderBy: { user_name: "asc" },
    }),
    prisma.attendance.findMany({ where: { vendor_id: vendorId, attendance_date: range.where }, include: { ...breakInclude, logs: { where: { action: "CORRECTED" }, select: { id: true }, take: 1 } } }),
  ]);
  const franchiseById = new Map(franchises.map(franchise => [franchise.id, franchise]));
  const recordByKey = new Map(records.map(record => [`${record.attendance_date.toISOString().slice(0, 10)}-${record.user_id}`, record]));

  const rows = [];
  for (const user of users) {
    const joined = deriveVendorLocalDate(user.created_at, context.timeZone).localDateString;
    for (const date of range.dates) {
      const record = recordByKey.get(`${date}-${user.id}`);
      if (!record && (user.status !== "active" || date < joined)) continue;
      const franchiseId = record ? record.franchise_id : user.franchise_id;
      const employee = employeeOf(user, franchiseId ? franchiseById.get(franchiseId) : undefined);
      if (location && employee.location_id !== location) continue;
      if (role && employee.role !== role) continue;
      if (unit && employee.unit !== unit) continue;
      if (search && ![employee.name, employee.designation, employee.role].some(value => value?.toLowerCase().includes(search))) continue;
      rows.push({
        id: `${date}-${user.id}`, date, employee, corrected: !!record?.logs.length,
        ...(record ? rowOf(record, context.timeZone, now) : { attendance_id: null, status: "NO_RECORD" as LogStatus, check_in: null, check_out: null, source: null, work_location: null, time_zone: context.timeZone, break_minutes: 0, work_minutes: null }),
      });
    }
  }
  rows.sort((a, b) => b.date.localeCompare(a.date) || a.employee.name.localeCompare(b.employee.name) || a.employee.id - b.employee.id);

  const counts = Object.fromEntries(statuses.map(value => [value, 0])) as Record<LogStatus, number>;
  rows.forEach(row => counts[row.status]++);
  const filtered = status ? rows.filter(row => row.status === status) : rows;
  const meta = { range: { from: range.from, to: range.to, today, max_days: MAX_RANGE_DAYS }, vendor_time_zone: context.timeZone, server_time: now, total: filtered.length };
  if (exporting) {
    if (filtered.length > EXPORT_LIMIT) attendanceError(`Exports are limited to ${EXPORT_LIMIT} records. Narrow your filters and try again.`);
    return { ...meta, rows: filtered };
  }

  const summaries = new Map<number, { employee: (typeof rows)[number]["employee"]; recorded: number; completed: number; missing: number; work_minutes: number; completed_minutes: number; latest: (typeof rows)[number] }>();
  for (const row of filtered) {
    const item = summaries.get(row.employee.id) ?? { employee: row.employee, recorded: 0, completed: 0, missing: 0, work_minutes: 0, completed_minutes: 0, latest: row };
    if (row.attendance_id) item.recorded++;
    if (row.status === "COMPLETED") { item.completed++; item.completed_minutes += row.work_minutes || 0; }
    if (row.status === "MISSING_PUNCH") item.missing++;
    item.work_minutes += row.work_minutes || 0;
    // Rows are newest first, so the first recorded row is the latest punch.
    if (!item.latest.attendance_id && row.attendance_id) item.latest = row;
    summaries.set(row.employee.id, item);
  }

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const page = Math.min(requestedPage, totalPages);
  return {
    ...meta, page, page_size: pageSize, total_pages: totalPages, counts,
    filters: {
      locations: [{ value: HEAD_OFFICE, label: "Head office", unit: null }, ...franchises.map(franchise => ({ value: String(franchise.id), label: franchise.franchise_name, unit: franchise.Department }))],
      roles: Array.from(new Set(users.map(user => user.user_type.user_type))).sort(),
    },
    overview: {
      employees: new Set(rows.map(row => row.employee.id)).size,
      check_ins: rows.filter(row => row.attendance_id).length,
      needs_review: counts.MISSING_PUNCH,
      work_minutes: rows.reduce((sum, row) => sum + (row.work_minutes || 0), 0),
    },
    rows: filtered.slice((page - 1) * pageSize, page * pageSize),
    summary: Array.from(summaries.values()).map(({ completed_minutes, ...item }) => ({ ...item, average_minutes: item.completed ? Math.round(completed_minutes / item.completed) : null })),
  };
}

export async function getAttendanceLogDetail(actor: AttendanceActor | undefined, attendanceId: number) {
  const context = await superAdminContext(actor);
  const record = await prisma.attendance.findFirst({
    where: { id: attendanceId, vendor_id: context.user.vendor_id },
    include: {
      ...breakInclude,
      user: { select: { id: true, user_name: true, designation: true, user_type: { select: { user_type: true } } } },
      franchise: { select: { id: true, franchise_name: true, Department: true } },
      logs: {
        orderBy: [{ action_time: "asc" }, { id: "asc" }],
        include: { actor: { select: { id: true, user_name: true } }, correction: { select: { reason: true, review_note: true, requestedBy: { select: { user_name: true } } } } },
      },
    },
  });
  if (!record) attendanceError("Attendance record not found.", 404);
  const now = new Date();
  return {
    id: `${record.attendance_date.toISOString().slice(0, 10)}-${record.user_id}`, date: record.attendance_date.toISOString().slice(0, 10),
    employee: employeeOf(record.user, record.franchise ?? undefined), corrected: record.logs.some(log => log.action === "CORRECTED"),
    ...rowOf(record, context.timeZone, now),
    breaks: record.breaks.map(pause => ({ started_at: pause.started_at, ended_at: pause.ended_at })),
    events: record.logs.map(log => ({
      id: log.id, action: log.action, time: log.action_time, source: log.source, actor: log.actor && log.actor.id !== record.user_id ? log.actor.user_name : null,
      before: log.before_values, after: log.after_values,
      correction: log.correction ? { reason: log.correction.reason, review_note: log.correction.review_note, requested_by: log.correction.requestedBy.user_name } : null,
    })),
    server_time: now,
  };
}
