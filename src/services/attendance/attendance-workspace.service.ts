import { prisma } from "../../prisma/client";
import { Prisma, AttendanceAction, AttendanceWorkLocation, AttendanceCorrectionStatus } from "../../../generated/prisma_client/client";
import { isValidIANATimeZone } from "../timeZone/timeZone.service";
import { attendanceError, correctionTime, decorateAttendance, deriveVendorLocalDate, validDate } from "./attendance.utils";

export type AttendanceActor = { id?: number; user_id?: number; vendor_id?: number };
type PunchInput = { user_id?: unknown; action?: unknown; source?: unknown; work_location?: unknown; action_time?: unknown; vendor_id?: unknown; franchise_id?: unknown };
type CorrectionInput = { attendance_date?: unknown; reason?: unknown; requested_check_in?: unknown; requested_check_out?: unknown };
const recordInclude = { breaks: { orderBy: { started_at: "asc" as const } }, logs: { orderBy: { action_time: "asc" as const } } };
const reviewRoles = new Set(["super-admin", "hrms-admin", "hrmsadmin"]);
const normalizeRole = (role: string) => role.trim().toLowerCase().replace(/[ _]+/g, "-");
const snapshot = (record: any) => record ? JSON.parse(JSON.stringify({ check_in: record.check_in, check_out: record.check_out, work_location: record.work_location, time_zone: record.time_zone, breaks: record.breaks || [] })) as Prisma.InputJsonValue : {};

export async function attendanceContext(actor?: AttendanceActor, requireFeature = true) {
  const id = Number(actor?.id ?? actor?.user_id);
  if (!Number.isSafeInteger(id) || id <= 0) attendanceError("Authentication is required.", 401);
  const user = await prisma.userMaster.findUnique({ where: { id }, include: { user_type: true, vendor: { include: { time_zone_master: true } } } });
  if (!user || user.status !== "active") attendanceError("Active employee account required.", 403);
  if (actor?.vendor_id && actor.vendor_id !== user.vendor_id) attendanceError("Invalid vendor session.", 403);
  if (requireFeature && !user.vendor.is_hrms_master_enabled) attendanceError("HRMS is not enabled for this vendor.", 403);
  const timeZone = user.vendor.time_zone_master?.time_zone_name || user.vendor.time_zone;
  if (!timeZone || !isValidIANATimeZone(timeZone)) attendanceError("Configure a valid vendor timezone before recording attendance.");
  return { user, timeZone, canReview: reviewRoles.has(normalizeRole(user.user_type.user_type)) };
}

function monthRange(value: unknown, timeZone: string) {
  const month = value === undefined ? deriveVendorLocalDate(new Date(), timeZone).localDateString.slice(0, 7) : value;
  if (typeof month !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) attendanceError("Month must use YYYY-MM.");
  const start = validDate(`${month}-01`);
  const end = new Date(start); end.setUTCMonth(end.getUTCMonth() + 1);
  return { gte: start, lt: end };
}

async function lockEmployee(tx: Prisma.TransactionClient, id: number) {
  // All punches and correction decisions for this employee share one row lock.
  await tx.$queryRaw`SELECT "id" FROM "UserMaster" WHERE "id" = ${id} FOR UPDATE`;
}

export async function punchAttendance(actor: AttendanceActor | undefined, input: PunchInput, requireFeature = true) {
  const context = await attendanceContext(actor, requireFeature);
  const targetId = input.user_id === undefined ? context.user.id : Number(input.user_id);
  if (!Number.isSafeInteger(targetId) || targetId <= 0) attendanceError("Valid user_id is required.");
  if (targetId !== context.user.id && !context.canReview) attendanceError("You can only mark your own attendance.", 403);
  const employee = targetId === context.user.id ? context.user : await prisma.userMaster.findFirst({ where: { id: targetId, vendor_id: context.user.vendor_id, status: "active" } });
  if (!employee) attendanceError("Employee not found in your vendor.", 404);
  if (employee.franchise_id && !(await prisma.franchiseMaster.findFirst({ where: { id: employee.franchise_id, vendor_id: employee.vendor_id }, select: { id: true } }))) attendanceError("Employee franchise does not belong to their vendor.", 403);
  if (input.vendor_id !== undefined && Number(input.vendor_id) !== employee.vendor_id) attendanceError("Vendor does not match the employee.", 403);
  if (input.franchise_id !== undefined && input.franchise_id !== employee.franchise_id) attendanceError("Franchise does not match the employee.");
  if (input.action_time !== undefined) attendanceError("Punch timestamps are assigned by the server. Submit a correction for historical changes.");
  const action = String(input.action || "").toUpperCase();
  if (!["IN", "OUT", "BREAK_START", "BREAK_END"].includes(action)) attendanceError("Action must be IN, OUT, BREAK_START or BREAK_END.");
  const source = String(input.source || "MANUAL").toUpperCase();
  if (!["MANUAL", "PHONE", "CARD"].includes(source)) attendanceError("Invalid attendance source.");
  const location = input.work_location === undefined && !requireFeature ? null : String(input.work_location || "").toUpperCase();
  if (action === "IN" && location !== null && !Object.values(AttendanceWorkLocation).includes(location as AttendanceWorkLocation)) attendanceError("Choose OFFICE, FACTORY, SITE or REMOTE.");

  return prisma.$transaction(async tx => {
    await lockEmployee(tx, employee.id);
    const now = new Date();
    const { attendanceDate } = deriveVendorLocalDate(now, context.timeZone);
    const scope = { vendor_id: employee.vendor_id, user_id: employee.id };
    let record = await tx.attendance.findFirst({ where: { ...scope, check_out: null }, include: recordInclude });
    if (action === "IN") {
      if (record) attendanceError("Check out of your open attendance session before checking in again.", 409);
      if (await tx.attendance.findFirst({ where: { ...scope, attendance_date: attendanceDate }, select: { id: true } })) attendanceError("Attendance has already been recorded for this date.", 409);
      record = await tx.attendance.create({ data: { ...scope, franchise_id: employee.franchise_id, attendance_date: attendanceDate, check_in: now, source: source as "MANUAL" | "PHONE" | "CARD", work_location: location as AttendanceWorkLocation | null, time_zone: context.timeZone }, include: recordInclude });
    } else {
      if (!record) attendanceError("No open attendance session. Check in first.", 409);
      const lastEvent = record.logs[record.logs.length - 1];
      if (now < record.check_in || (lastEvent && now < lastEvent.action_time)) attendanceError("The server clock precedes the last recorded attendance event.", 409);
      const activeBreak = record.breaks.find(pause => !pause.ended_at);
      if (action === "BREAK_START") {
        if (activeBreak) attendanceError("A break is already in progress.", 409);
        await tx.attendance_breaks.create({ data: { attendance_id: record.id, started_at: now } });
      } else if (action === "BREAK_END") {
        if (!activeBreak) attendanceError("No active break to end.", 409);
        await tx.attendance_breaks.update({ where: { id: activeBreak.id }, data: { ended_at: now } });
      } else if (activeBreak) {
        await tx.attendance_breaks.update({ where: { id: activeBreak.id }, data: { ended_at: now } });
        await tx.attendance_logs.create({ data: { ...scope, franchise_id: record.franchise_id, attendance_id: record.id, action: "BREAK_END", action_time: now, source: source as "MANUAL" | "PHONE" | "CARD", actor_id: context.user.id } });
      }
      record = await tx.attendance.update({ where: { id: record.id }, data: { ...(action === "OUT" ? { check_out: now } : {}), updated_at: now }, include: recordInclude });
    }
    const log = await tx.attendance_logs.create({ data: { ...scope, franchise_id: record.franchise_id, attendance_id: record.id, action: action as AttendanceAction, action_time: now, source: source as "MANUAL" | "PHONE" | "CARD", actor_id: context.user.id } });
    const fresh = await tx.attendance.findUniqueOrThrow({ where: { id: record.id }, include: recordInclude });
    return { attendance: decorateAttendance(fresh, context.timeZone, now), log, server_time: now, latest_action: log };
  }, { timeout: 15000 });
}

export async function getAttendanceWorkspace(actor: AttendanceActor | undefined, month: unknown) {
  const context = await attendanceContext(actor);
  const range = monthRange(month, context.timeZone);
  const now = new Date();
  const scope = { vendor_id: context.user.vendor_id, user_id: context.user.id };
  const { attendanceDate } = deriveVendorLocalDate(now, context.timeZone);
  const [entries, current, corrections] = await prisma.$transaction([
    prisma.attendance.findMany({ where: { ...scope, attendance_date: range }, include: recordInclude, orderBy: { attendance_date: "desc" } }),
    prisma.attendance.findFirst({ where: { ...scope, OR: [{ check_out: null }, { attendance_date: attendanceDate }] }, include: recordInclude, orderBy: [{ check_out: { sort: "asc", nulls: "first" } }, { attendance_date: "desc" }] }),
    prisma.attendance_corrections.findMany({ where: { ...scope, attendance_date: range }, include: { reviewedBy: { select: { user_name: true } } }, orderBy: { created_at: "desc" } }),
  ]);
  const records = entries.map(record => decorateAttendance(record, context.timeZone, now));
  const completed = records.filter(record => record.check_out);
  return {
    entries: records, current: decorateAttendance(current, context.timeZone, now), corrections,
    vendor_time_zone: context.timeZone, server_time: now, can_review: context.canReview,
    summary: { days_recorded: records.length, completed_days: completed.length, work_seconds: records.reduce((sum, record) => sum + record.work_seconds, 0), average_seconds: completed.length ? completed.reduce((sum, record) => sum + record.work_seconds, 0) / completed.length : 0 },
  };
}

export async function requestAttendanceCorrection(actor: AttendanceActor | undefined, input: CorrectionInput) {
  const context = await attendanceContext(actor);
  const date = validDate(input.attendance_date);
  const reason = typeof input.reason === "string" ? input.reason.trim() : "";
  if (reason.length < 10 || reason.length > 1000) attendanceError("Reason must contain 10 to 1000 characters.");
  const requestedIn = correctionTime(input.requested_check_in, context.timeZone);
  const requestedOut = correctionTime(input.requested_check_out, context.timeZone);
  if (requestedIn && deriveVendorLocalDate(requestedIn, context.timeZone).localDateString !== input.attendance_date) attendanceError("Check-in must fall on the requested attendance date in the vendor timezone.");
  if (requestedIn && requestedOut && requestedOut <= requestedIn) attendanceError("Check-out must be after check-in.");
  if ((requestedIn && requestedIn > new Date()) || (requestedOut && requestedOut > new Date())) attendanceError("Correction times cannot be in the future.");
  if (date > deriveVendorLocalDate(new Date(), context.timeZone).attendanceDate) attendanceError("Corrections cannot be requested for future dates.");
  return prisma.$transaction(async tx => {
    await lockEmployee(tx, context.user.id);
    const scope = { vendor_id: context.user.vendor_id, user_id: context.user.id, attendance_date: date };
    if (await tx.attendance_corrections.findFirst({ where: { ...scope, status: "PENDING" } })) attendanceError("A pending correction already exists for this date.", 409);
    const record = await tx.attendance.findFirst({ where: scope });
    return tx.attendance_corrections.create({ data: { ...scope, attendance_id: record?.id, requested_check_in: requestedIn, requested_check_out: requestedOut, reason, requested_by: context.user.id, baseline_updated_at: record?.updated_at } });
  });
}

export async function listAttendanceCorrections(actor: AttendanceActor | undefined, filters: { month?: unknown; status?: unknown; page?: unknown }) {
  const context = await attendanceContext(actor);
  if (!context.canReview) attendanceError("Only HRMS admins and super admins can review corrections.", 403);
  const page = Math.max(1, Number(filters.page) || 1);
  if (!Number.isSafeInteger(page)) attendanceError("Invalid page.");
  if (filters.status && !Object.values(AttendanceCorrectionStatus).includes(filters.status as AttendanceCorrectionStatus)) attendanceError("Invalid correction status.");
  const where = { vendor_id: context.user.vendor_id, ...(filters.month ? { attendance_date: monthRange(filters.month, context.timeZone) } : {}), ...(filters.status ? { status: filters.status as AttendanceCorrectionStatus } : {}) };
  const [items, total] = await prisma.$transaction([
    prisma.attendance_corrections.findMany({ where, include: { user: { select: { id: true, user_name: true } }, reviewedBy: { select: { user_name: true } } }, orderBy: [{ created_at: "desc" }, { id: "desc" }], skip: (page - 1) * 20, take: 20 }),
    prisma.attendance_corrections.count({ where }),
  ]);
  return { items, page, total, total_pages: Math.max(1, Math.ceil(total / 20)), vendor_time_zone: context.timeZone };
}

export async function decideAttendanceCorrection(actor: AttendanceActor | undefined, id: number, input: { status?: unknown; review_note?: unknown; requested_check_in?: unknown; requested_check_out?: unknown }) {
  const context = await attendanceContext(actor);
  const status = String(input.status || "");
  if (!["APPROVED", "REJECTED", "CANCELLED"].includes(status)) attendanceError("Choose APPROVED, REJECTED or CANCELLED.");
  if (status !== "CANCELLED" && !context.canReview) attendanceError("Only HRMS admins and super admins can review corrections.", 403);
  const note = typeof input.review_note === "string" ? input.review_note.trim() : "";
  if (note.length > 1000 || (status === "REJECTED" && !note)) attendanceError("Provide a rejection reason of up to 1000 characters.");
  const request = await prisma.attendance_corrections.findFirst({ where: { id, vendor_id: context.user.vendor_id } });
  if (!request) attendanceError("Correction request not found.", 404);
  if (status === "CANCELLED" ? request.user_id !== context.user.id : request.user_id === context.user.id) attendanceError(status === "CANCELLED" ? "You can only cancel your own requests." : "You cannot review your own correction request.", 403);

  return prisma.$transaction(async tx => {
    await lockEmployee(tx, request.user_id);
    const pending = await tx.attendance_corrections.findUniqueOrThrow({ where: { id } });
    if (pending.status !== "PENDING") attendanceError("This request has already been processed.", 409);
    let attendanceId = pending.attendance_id;
    const now = new Date();
    if (status === "APPROVED") {
      const employee = await tx.userMaster.findFirst({ where: { id: pending.user_id, vendor_id: context.user.vendor_id, status: "active" } });
      if (!employee) attendanceError("The employee account is not active.", 409);
      const existing = await tx.attendance.findFirst({ where: { vendor_id: pending.vendor_id, user_id: pending.user_id, attendance_date: pending.attendance_date }, include: recordInclude });
      if ((existing?.id ?? null) !== pending.attendance_id || (existing && existing.updated_at.getTime() !== pending.baseline_updated_at?.getTime())) attendanceError("Attendance changed after this request. Cancel it and submit a fresh correction.", 409);
      const timeZone = existing?.time_zone || context.timeZone;
      const checkIn = correctionTime(input.requested_check_in, timeZone) ?? pending.requested_check_in ?? existing?.check_in;
      const checkOut = correctionTime(input.requested_check_out, timeZone) ?? pending.requested_check_out ?? existing?.check_out;
      if (!checkIn || !checkOut) attendanceError("An approved correction must include both check-in and check-out times.");
      if (checkOut <= checkIn || checkIn > now || checkOut > now) attendanceError("Check-out must follow check-in and neither time can be in the future.");
      if (deriveVendorLocalDate(checkIn, timeZone).attendanceDate.getTime() !== pending.attendance_date.getTime()) attendanceError("Check-in must fall on the requested date in the attendance timezone.");
      if (existing?.breaks.some(pause => !pause.ended_at || pause.started_at < checkIn || pause.ended_at > checkOut)) attendanceError("The corrected window must include all completed breaks. End an open break before resubmitting.", 409);
      // A corrected interval must not overlap any other day's session.
      if (await tx.attendance.findFirst({ where: { vendor_id: pending.vendor_id, user_id: pending.user_id, ...(existing ? { id: { not: existing.id } } : {}), check_in: { lt: checkOut }, OR: [{ check_out: null }, { check_out: { gt: checkIn } }] }, select: { id: true } })) attendanceError("Corrected times overlap another attendance session.", 409);
      const values = { check_in: checkIn, check_out: checkOut, time_zone: timeZone };
      const corrected = existing
        ? await tx.attendance.update({ where: { id: existing.id }, data: values, include: recordInclude })
        : await tx.attendance.create({ data: { ...values, vendor_id: pending.vendor_id, user_id: pending.user_id, franchise_id: employee.franchise_id, attendance_date: pending.attendance_date, source: "MANUAL" }, include: recordInclude });
      attendanceId = corrected.id;
      await tx.attendance_logs.create({ data: { vendor_id: pending.vendor_id, user_id: pending.user_id, franchise_id: corrected.franchise_id, attendance_id: corrected.id, action: "CORRECTED", source: "MANUAL", action_time: now, actor_id: context.user.id, correction_id: pending.id, before_values: snapshot(existing), after_values: snapshot(corrected) } });
    }
    return tx.attendance_corrections.update({ where: { id }, data: { status: status as AttendanceCorrectionStatus, attendance_id: attendanceId, reviewed_by: context.user.id, reviewed_at: now, review_note: note || null } });
  }, { timeout: 15000 });
}
