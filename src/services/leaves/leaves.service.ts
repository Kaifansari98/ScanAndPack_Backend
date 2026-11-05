import { prisma } from "../../prisma/client";
import { Prisma, LeaveType, LeaveRequestStatus } from "../../../generated/prisma_client/client";
import { attendanceContext, normalizeRole, type AttendanceActor } from "../attendance/attendance-workspace.service";
import { attendanceError, deriveVendorLocalDate, validDate } from "../attendance/attendance.utils";
import { holidayRows, leaveDateRange, leaveStatuses, leaveText, leaveTypes, leaveYear, positiveId, typeLabels, validateLeaveAttachment, weeklyDays } from "./leave.utils";
import { removeLeaveAttachment, signedLeaveAttachment, storeLeaveAttachment } from "./leave-attachment.service";

export async function leaveContext(actor?: AttendanceActor, admin = false) {
  const context = await attendanceContext(actor);
  const isSuperAdmin = normalizeRole(context.user.user_type.user_type) === "super-admin";
  if (admin && !isSuperAdmin) attendanceError("Only super admins can manage company leaves.", 403);
  if (context.user.franchise_id && !await prisma.franchiseMaster.findFirst({ where: { id: context.user.franchise_id, vendor_id: context.user.vendor_id }, select: { id: true } })) attendanceError("Your location does not belong to your vendor.", 403);
  return { ...context, isSuperAdmin, today: deriveVendorLocalDate(new Date(), context.timeZone).localDateString };
}
type Context = Awaited<ReturnType<typeof leaveContext>>;
async function scopeOf(context: Context, value: unknown) {
  if (value === undefined || value === "company") return { scope_key: "company", franchise_id: null };
  const id = positiveId(value, "franchise id");
  if (!await prisma.franchiseMaster.findFirst({ where: { id, vendor_id: context.user.vendor_id }, select: { id: true } })) attendanceError("Franchise not found in your vendor.", 404);
  return { scope_key: String(id), franchise_id: id };
}
async function workspaceScope(context: Context, query: Record<string, unknown>) {
  if (query.mode !== undefined && !["admin", "personal"].includes(String(query.mode))) attendanceError("Mode must be admin or personal.");
  const admin = query.mode === "admin";
  if (admin && !context.isSuperAdmin) attendanceError("Only super admins can view company leave requests.", 403);
  const scope = await scopeOf(context, admin ? query.scope : context.user.franchise_id ? String(context.user.franchise_id) : "company");
  const year = leaveYear(query.year, context.today);
  const base: Prisma.LeaveRequestWhereInput = { vendor_id: context.user.vendor_id, ...(admin ? scope.franchise_id ? { franchise_id: scope.franchise_id } : {} : { user_id: context.user.id }) };
  const dates = { gte: validDate(`${year}-01-01`), lte: validDate(`${year}-12-31`) };
  return { admin, scope, year, base, where: { ...base, leave_date: { lte: dates.lte }, end_date: { gte: dates.gte } } };
}
const groupedRequestCounts = (where: Prisma.LeaveRequestWhereInput) => prisma.leaveRequest.groupBy({ by: ["status"], orderBy: { status: "asc" }, where, _count: { _all: true } });
const requestInclude = { user: { select: { id: true, user_name: true } }, franchise: { select: { franchise_name: true } }, reviewer: { select: { user_name: true } } };
function requestView(row: any, timeZone: string) {
  return {
    id: String(row.id), userId: row.user_id, employee: row.user.user_name, code: `User #${row.user_id}`,
    franchise: row.franchise_id ? String(row.franchise_id) : "company", locationName: row.franchise?.franchise_name || "Head office",
    title: row.title, type: typeLabels[row.type], remark: row.remark, date: row.leave_date.toISOString().slice(0, 10),
    startDate: row.leave_date.toISOString().slice(0, 10), endDate: row.end_date.toISOString().slice(0, 10),
    dayCount: Math.round((row.end_date.getTime() - row.leave_date.getTime()) / 86400000) + 1, status: row.status,
    submittedAt: row.created_at, submittedDate: deriveVendorLocalDate(row.created_at, timeZone).localDateString,
    reviewedDate: row.reviewed_at ? deriveVendorLocalDate(row.reviewed_at, timeZone).localDateString : null, rejectionReason: row.rejection_reason, reviewedBy: row.reviewer?.user_name || null, reviewedAt: row.reviewed_at,
    attachment: row.attachment_key ? { name: row.attachment_name, size: row.attachment_size } : undefined,
  };
}
export async function getLeaveWorkspace(actor: AttendanceActor | undefined, query: Record<string, unknown>) {
  const context = await leaveContext(actor), { admin, scope, year, base, where } = await workspaceScope(context, query);
  const vendorId = context.user.vendor_id;
  const scopes = scope.franchise_id ? ["company", scope.scope_key] : ["company"];
  const [franchises, holidays, policies, grouped, limits] = await prisma.$transaction([
    prisma.franchiseMaster.findMany({ where: { vendor_id: vendorId, ...(!admin ? { id: context.user.franchise_id ?? -1 } : {}) }, select: { id: true, franchise_name: true, Department: true }, orderBy: { franchise_name: "asc" } }),
    prisma.leaveHoliday.findMany({ where: { vendor_id: vendorId, scope_key: { in: scopes }, holiday_date: { gte: validDate(`${year}-01-01`), lte: validDate(`${year}-12-31`) } }, orderBy: { holiday_date: "asc" } }),
    prisma.leaveWeeklyOff.findMany({ where: { vendor_id: vendorId, scope_key: { in: scopes } } }),
    groupedRequestCounts(where),
    prisma.leaveRequest.aggregate({ where: base, _min: { leave_date: true }, _max: { end_date: true } }),
  ]);
  const counts = { PENDING: 0, APPROVED: 0, REJECTED: 0 };
  grouped.forEach(item => { counts[item.status] = item._count._all; });
  const currentYear = Number(context.today.slice(0, 4));
  const min = Math.min(currentYear - 1, year, limits._min.leave_date?.getUTCFullYear() ?? currentYear);
  const max = Math.max(currentYear + 1, year, limits._max.end_date?.getUTCFullYear() ?? currentYear);
  return {
    year, scope: scope.scope_key, today: context.today, time_zone: context.timeZone, company_name: context.user.vendor.vendor_name,
    franchises: franchises.map(row => ({ id: String(row.id), name: row.franchise_name, unit: row.Department })),
    holidays: holidays.map(row => ({ id: String(row.id), date: row.holiday_date.toISOString().slice(0, 10), name: row.name, remark: row.remark, scope: row.scope_key })),
    policies: Object.fromEntries(policies.map(row => [row.scope_key, row.days])),
    summary: { total: counts.PENDING + counts.APPROVED + counts.REJECTED, pending: counts.PENDING, approved: counts.APPROVED, rejected: counts.REJECTED },
    available_years: Array.from({ length: max - min + 1 }, (_, index) => min + index),
  };
}
export async function importLeaveHolidays(actor: AttendanceActor | undefined, input: Record<string, unknown>) {
  const context = await leaveContext(actor, true), scope = await scopeOf(context, input.scope);
  const year = leaveYear(input.year, context.today), rows = holidayRows(input.rows, year);
  if (input.allow_updates !== undefined && typeof input.allow_updates !== "boolean") attendanceError("allow_updates must be a boolean.");
  return prisma.$transaction(async tx => {
    // Serialize calendar writes so conflicts discovered after an Excel preview cannot be overwritten silently.
    await tx.$queryRaw`SELECT id FROM "VendorMaster" WHERE id = ${context.user.vendor_id} FOR UPDATE`;
    const where = { vendor_id: context.user.vendor_id, scope_key: scope.scope_key, holiday_date: { in: rows.map(row => row.holiday_date) } };
    if (!input.allow_updates && await tx.leaveHoliday.count({ where })) attendanceError("Some dates already exist in this scope. Refresh the calendar and confirm updates before importing.", 409);
    for (const row of rows) {
      const { vendor_id, scope_key, holiday_date } = { vendor_id: context.user.vendor_id, scope_key: scope.scope_key, ...row };
      await tx.leaveHoliday.upsert({ where: { vendor_id_scope_key_holiday_date: { vendor_id, scope_key, holiday_date } },
        create: { ...row, ...scope, vendor_id, created_by: context.user.id, updated_by: context.user.id },
        update: { name: row.name, remark: row.remark, updated_by: context.user.id } });
    }
    return { imported: rows.length };
  }, { timeout: 15000 });
}
export async function deleteLeaveHoliday(actor: AttendanceActor | undefined, id: number) {
  const context = await leaveContext(actor, true);
  const result = await prisma.leaveHoliday.deleteMany({ where: { id, vendor_id: context.user.vendor_id } });
  if (!result.count) attendanceError("Holiday not found in your vendor.", 404);
  return { deleted: true };
}
export async function saveLeaveWeeklyOffs(actor: AttendanceActor | undefined, input: Record<string, unknown>) {
  const context = await leaveContext(actor, true), scope = await scopeOf(context, input.scope);
  if (input.inherit !== undefined && typeof input.inherit !== "boolean") attendanceError("inherit must be a boolean.");
  const vendor_id = context.user.vendor_id;
  if (input.inherit === true) {
    if (scope.scope_key === "company") attendanceError("Company settings cannot inherit from a franchise.");
    await prisma.leaveWeeklyOff.deleteMany({ where: { vendor_id, scope_key: scope.scope_key } });
    return { inherited: true };
  }
  const days = weeklyDays(input.days);
  await prisma.leaveWeeklyOff.upsert({ where: { vendor_id_scope_key: { vendor_id, scope_key: scope.scope_key } }, create: { vendor_id, ...scope, days, updated_by: context.user.id }, update: { days, updated_by: context.user.id } });
  return { inherited: false, days };
}
export async function listLeaveRequests(actor: AttendanceActor | undefined, query: Record<string, unknown>) {
  const context = await leaveContext(actor), selection = await workspaceScope(context, query);
  const search = query.search === undefined ? "" : leaveText(query.search, "Search", 100, false);
  const status = query.status === undefined || query.status === "all" ? undefined : query.status;
  if (status !== undefined && !leaveStatuses.includes(status as any)) attendanceError("Invalid leave status.");
  const type = query.type === undefined || query.type === "all" ? undefined : query.type;
  if (type !== undefined && !leaveTypes.includes(type as any)) attendanceError("Invalid leave type.");
  const from = query.from ? validDate(query.from) : null, to = query.to ? validDate(query.to) : null;
  if (from && to && from > to) attendanceError("The start date must be on or before the end date.");
  const page = query.page === undefined ? 1 : positiveId(query.page, "page");
  const pageSize = query.page_size === undefined ? 8 : positiveId(query.page_size, "page size");
  if (pageSize > 100 || page > 1000000) attendanceError("Page size must be at most 100 and page at most 1000000.");
  const where: Prisma.LeaveRequestWhereInput = { ...selection.where, ...(type ? { type: type as LeaveType } : {}),
    ...(from || to ? { AND: [{ ...(from ? { end_date: { gte: from } } : {}), ...(to ? { leave_date: { lte: to } } : {}) }] } : {}),
    ...(search ? { OR: [{ title: { contains: search, mode: "insensitive" } }, { user: { user_name: { contains: search, mode: "insensitive" } } }, ...(/^\d+$/.test(search) && Number.isSafeInteger(Number(search)) && Number(search) < 2147483648 ? [{ id: Number(search) }] : [])] } : {}) };
  return prisma.$transaction(async tx => {
    const grouped = await tx.leaveRequest.groupBy({ by: ["status"], orderBy: { status: "asc" }, where, _count: { _all: true } });
    const counts = { PENDING: 0, APPROVED: 0, REJECTED: 0 }; grouped.forEach(item => { counts[item.status] = item._count._all; });
    const total = status ? counts[status as LeaveRequestStatus] : counts.PENDING + counts.APPROVED + counts.REJECTED;
    const totalPages = Math.max(1, Math.ceil(total / pageSize)), current = Math.min(page, totalPages);
    const items = await tx.leaveRequest.findMany({ where: { ...where, ...(status ? { status: status as LeaveRequestStatus } : {}) }, include: requestInclude, orderBy: [{ created_at: "desc" }, { id: "desc" }], skip: (current - 1) * pageSize, take: pageSize });
    return { items: items.map(row => requestView(row, context.timeZone)), counts: { all: counts.PENDING + counts.APPROVED + counts.REJECTED, ...counts }, total, page: current, page_size: pageSize, total_pages: totalPages };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}
export async function createLeaveRequest(actor: AttendanceActor | undefined, input: Record<string, unknown>, file?: Express.Multer.File) {
  const context = await leaveContext(actor);
  const title = leaveText(input.title, "Leave title", 100), remark = leaveText(input.remark, "Leave remark", 1000);
  const { start, end } = leaveDateRange(input, context.today);
  if (!leaveTypes.includes(input.type as any)) attendanceError("Choose a valid leave type.");
  for (const key of ["vendor_id", "user_id", "franchise_id"]) if (input[key] !== undefined) attendanceError("Employee, vendor and location are taken from your session.");
  validateLeaveAttachment(file);
  const scope = { vendor_id: context.user.vendor_id, user_id: context.user.id, leave_date: { lte: end }, end_date: { gte: start }, status: { in: ["PENDING", "APPROVED"] as LeaveRequestStatus[] } };
  if (await prisma.leaveRequest.findFirst({ where: scope, select: { id: true } })) attendanceError("These dates overlap a pending or approved leave request.", 409);
  let key: string | undefined;
  try {
    if (file) key = await storeLeaveAttachment(file, context.user.vendor_id, context.user.id);
    const result = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "UserMaster" WHERE id = ${context.user.id} FOR UPDATE`;
      if (await tx.leaveRequest.findFirst({ where: scope, select: { id: true } })) attendanceError("These dates overlap a pending or approved leave request.", 409);
      return tx.leaveRequest.create({ data: { vendor_id: context.user.vendor_id, user_id: context.user.id, franchise_id: context.user.franchise_id,
        title, type: input.type as LeaveType, remark, leave_date: start, end_date: end,
        ...(file && key ? { attachment_key: key, attachment_name: file.originalname.replace(/[\r\n\\/]/g, "_").slice(0, 200), attachment_mime: file.mimetype, attachment_size: file.size } : {}) }, include: requestInclude });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
    return requestView(result, context.timeZone);
  } catch (error) {
    if (key) try { await removeLeaveAttachment(key); } catch (cleanupError) { console.error("Could not clean up unlinked leave attachment", cleanupError); }
    throw error;
  }
}
export async function decideLeaveRequest(actor: AttendanceActor | undefined, id: number, input: Record<string, unknown>) {
  const context = await leaveContext(actor, true);
  if (!["APPROVED", "REJECTED"].includes(String(input.status))) attendanceError("Decision must be APPROVED or REJECTED.");
  const rejectionReason = input.status === "REJECTED" ? leaveText(input.rejection_reason, "Rejection reason", 1000) : null;
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "LeaveRequest" WHERE id = ${id} AND vendor_id = ${context.user.vendor_id} FOR UPDATE`;
    const row = await tx.leaveRequest.findFirst({ where: { id, vendor_id: context.user.vendor_id } });
    if (!row) attendanceError("Leave request not found.", 404);
    if (row.user_id === context.user.id) attendanceError("Your own leave request must be reviewed by another super admin.", 403);
    if (row.status !== "PENDING") attendanceError("This leave request has already been reviewed.", 409);
    const result = await tx.leaveRequest.update({ where: { id: row.id }, data: { status: input.status as LeaveRequestStatus, rejection_reason: rejectionReason, reviewed_by: context.user.id, reviewed_at: new Date() }, include: requestInclude });
    return requestView(result, context.timeZone);
  });
}
export async function getLeaveAttachment(actor: AttendanceActor | undefined, id: number) {
  const context = await leaveContext(actor);
  const row = await prisma.leaveRequest.findFirst({ where: { id, vendor_id: context.user.vendor_id, ...(!context.isSuperAdmin ? { user_id: context.user.id } : {}) }, select: { attachment_key: true, attachment_name: true } });
  if (!row?.attachment_key) attendanceError("Attachment not found.", 404);
  return { url: await signedLeaveAttachment(row.attachment_key, row.attachment_name || "attachment"), expires_in: 300 };
}
