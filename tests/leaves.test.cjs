const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const path = require('node:path');
const compile = name => ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', name), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
const attendance = {};
vm.runInNewContext(compile('src/services/attendance/attendance.utils.ts'), { exports: attendance, Date, Intl });
const utils = {};
vm.runInNewContext(compile('src/services/leaves/leave.utils.ts'), { exports: utils, Date, Buffer, require: () => attendance });
const plain = value => JSON.parse(JSON.stringify(value));
test('dates and years reject invalid calendar dates and unsupported years', () => {
  for (const value of ['2026-02-30', '04/11/2026', '', null]) assert.throws(() => attendance.validDate(value), { statusCode: 400 });
  for (const year of [1999, 2101, 2026.1, [], null, 'no-year']) assert.throws(() => utils.leaveYear(year, '2026-11-04'), { statusCode: 400 });
  assert.equal(utils.leaveYear(undefined, '2026-11-04'), 2026);
  assert.equal(attendance.validDate('2028-02-29').toISOString().slice(0, 10), '2028-02-29');
});
test('holiday imports reject empty, oversized, duplicate, wrong-year and invalid rows atomically', () => {
  const row = { date: '2026-01-26', name: 'Holiday', remark: '' };
  for (const rows of [[], Array(367).fill(row), [row, row], [{ ...row, date: '2025-01-26' }], [{ ...row, date: '2026-02-30' }], [{ ...row, name: ' ' }], [{ ...row, remark: 'x'.repeat(501) }], [null]]) assert.throws(() => utils.holidayRows(rows, 2026), { statusCode: 400 });
  const result = utils.holidayRows([{ ...row, name: ' Holiday ', remark: undefined }], 2026);
  assert.equal(result[0].name, 'Holiday'); assert.equal(result[0].remark, '');
});
test('weekly offs support zero or multiple days and reject invalid or duplicate day numbers', () => {
  assert.deepEqual(plain(utils.weeklyDays([6, 0])), [0, 6]); assert.deepEqual(plain(utils.weeklyDays([])), []);
  for (const value of [[0, 0], [-1], [7], ['0'], [0.5], null, true]) assert.throws(() => utils.weeklyDays(value), { statusCode: 400 });
});
test('ids and required text reject coercible objects, blanks and oversized values', () => {
  for (const value of [null, [], true, '1.1', '1x', 0, -1]) assert.throws(() => utils.positiveId(value), { statusCode: 400 });
  assert.equal(utils.positiveId('147'), 147);
  assert.throws(() => utils.leaveText(' ', 'Rejection reason', 1000), { statusCode: 400 });
  assert.throws(() => utils.leaveText('x'.repeat(101), 'Leave title', 100), { statusCode: 400 });
});
test('attachments check actual bytes, MIME, extension, empty files and size', () => {
  const file = { originalname: 'medical.pdf', mimetype: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n'), size: 9 };
  assert.doesNotThrow(() => utils.validateLeaveAttachment(file));
  assert.doesNotThrow(() => utils.validateLeaveAttachment(undefined));
  for (const changed of [{ buffer: Buffer.from('<script>') }, { originalname: 'medical.html' }, { mimetype: 'text/html' }, { buffer: Buffer.alloc(0), size: 0 }, { size: 5242881 }]) assert.throws(() => utils.validateLeaveAttachment({ ...file, ...changed }), { statusCode: 400 });
});
function service(role = 'employee', franchiseId = 10, extra = {}) {
  const api = {};
  const context = { user: { id: 7, vendor_id: 1, franchise_id: franchiseId, user_type: { user_type: role }, vendor: { vendor_name: 'Test' } }, timeZone: 'Asia/Kolkata' };
  const prisma = { franchiseMaster: { findFirst: async ({ where }) => where.vendor_id === 1 && where.id === 10 ? { id: 10 } : null }, ...extra };
  const workspace = { attendanceContext: async actor => { if (!actor) attendance.attendanceError('Authentication required', 401); return context; }, normalizeRole: value => value.trim().toLowerCase().replace(/[ _]+/g, '-') };
  vm.runInNewContext(compile('src/services/leaves/leaves.service.ts'), { exports: api, Date, console, require: name => name.endsWith('/prisma/client') ? { prisma } : name.endsWith('attendance-workspace.service') ? workspace : name.endsWith('attendance.utils') ? attendance : name.endsWith('leave.utils') ? utils : name.endsWith('leave-attachment.service') ? {} : { Prisma: { TransactionIsolationLevel: { ReadCommitted: "ReadCommitted" } } } });
  return api;
}
test('company operations require a super admin even when called outside the router', async () => {
  for (const role of ['employee', 'hrms-admin', 'auditor', 'admin']) {
    const api = service(role);
    for (const call of [() => api.importLeaveHolidays({}, {}), () => api.saveLeaveWeeklyOffs({}, {}), () => api.deleteLeaveHoliday({}, 1), () => api.decideLeaveRequest({}, 1, { status: 'APPROVED' }), () => api.getLeaveWorkspace({}, { mode: 'admin' })]) await assert.rejects(call(), { statusCode: 403 });
  }
});
test('authentication and foreign locations are rejected before any leave data is read', async () => {
  await assert.rejects(service().getLeaveWorkspace(undefined, {}), { statusCode: 401 });
  await assert.rejects(service('super-admin', 20).getLeaveWorkspace({}, {}), { statusCode: 403 });
  await assert.rejects(service('super-admin').getLeaveWorkspace({}, { mode: 'admin', scope: '20' }), { statusCode: 404 });
});
test('the server rejects forged ownership and invalid request types before upload', async () => {
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10), api = service();
  const input = { title: 'Personal leave', remark: 'Family event', type: 'CASUAL', date: tomorrow };
  for (const extra of [{ user_id: 9 }, { vendor_id: 2 }, { franchise_id: 20 }, { type: 'OTHER' }]) await assert.rejects(api.createLeaveRequest({}, { ...input, ...extra }), { statusCode: 400 });
});
test('rejections require a non-empty reason and company settings cannot inherit', async () => {
  const api = service('super-admin');
  await assert.rejects(api.decideLeaveRequest({}, 1, { status: 'REJECTED', rejection_reason: ' ' }), { statusCode: 400 });
  await assert.rejects(api.decideLeaveRequest({}, 1, { status: 'PENDING' }), { statusCode: 400 });
  await assert.rejects(api.saveLeaveWeeklyOffs({}, { scope: 'company', inherit: true }), { statusCode: 400 });
});

test('leave ranges count both endpoints, including same-day, month/year boundaries and leap days', () => {
  for (const [start, end, count] of [['2026-11-04','2026-11-04',1], ['2026-11-06','2026-11-09',4], ['2026-12-31','2027-01-02',3], ['2028-02-28','2028-03-01',3], ['2027-03-13','2027-03-15',3]]) {
    const range = utils.leaveDateRange({ start_date: start, end_date: end }, '2026-11-04');
    assert.equal(range.dayCount, count);
    assert.equal(range.start.toISOString().slice(0, 10), start);
    assert.equal(range.end.toISOString().slice(0, 10), end);
  }
  assert.equal(utils.leaveDateRange({ date: '2026-11-04' }, '2026-11-04').dayCount, 1);
});
test('leave ranges require both dates and reject reversed, invalid and mixed legacy input', () => {
  for (const input of [{ start_date:'2026-11-04' }, { end_date:'2026-11-04' }, { start_date:'2026-11-05', end_date:'2026-11-04' }, { start_date:'2026-11-04', end_date:'2027-02-30' }, { start_date:'2026-11-04', end_date:'2101-01-01' }, { date:'2026-11-04', start_date:'2026-11-04', end_date:'2026-11-05' }]) assert.throws(() => utils.leaveDateRange(input, '2026-11-04'), { statusCode:400 });
});


test('super admins can approve or reject their own pending leave and reviewer metadata is retained', async () => {
  for (const status of ['APPROVED', 'REJECTED']) {
    const row = { id: 123, vendor_id: 1, user_id: 7, franchise_id: 10, status: 'PENDING', title: 'Own leave', type: 'CASUAL', remark: 'Personal day', leave_date: new Date('2026-11-06'), end_date: new Date('2026-11-06'), created_at: new Date('2026-11-05'), user: { user_name: 'Super Admin' }, franchise: { franchise_name: 'Test franchise' } };
    const tx = { $queryRaw: async () => [], leaveRequest: {
      findFirst: async ({ where }) => { assert.equal(where.vendor_id, 1); return row; },
      update: async ({ data }) => { Object.assign(row, data); return { ...row, reviewer: { user_name: 'Super Admin' } }; },
    } };
    const api = service('super-admin', 10, { $transaction: async callback => callback(tx) });
    if (status === 'REJECTED') await assert.rejects(api.decideLeaveRequest({}, 123, { status, rejection_reason: ' ' }), { statusCode: 400 });
    const result = await api.decideLeaveRequest({}, 123, { status, rejection_reason: status === 'REJECTED' ? 'Changed my plans' : undefined });
    assert.equal(result.status, status); assert.equal(row.reviewed_by, 7); assert.ok(row.reviewed_at);
    assert.equal(row.rejection_reason, status === 'REJECTED' ? 'Changed my plans' : null);
    await assert.rejects(api.decideLeaveRequest({}, 123, { status: 'APPROVED' }), { statusCode: 409 });
  }
});


test('backdated classification is based on submission day, including ranges extending beyond today', () => {
  assert.equal(utils.leaveDateRange({ start_date: '2026-11-04', end_date: '2026-11-04' }, '2026-11-05').isBackdated, true);
  assert.equal(utils.leaveDateRange({ start_date: '2026-11-04', end_date: '2026-11-06' }, '2026-11-05').isBackdated, true);
  assert.equal(utils.leaveDateRange({ start_date: '2026-11-05', end_date: '2026-11-05' }, '2026-11-05').isBackdated, false);
  assert.equal(utils.leaveDateRange({ start_date: '2026-11-06', end_date: '2026-11-06' }, '2026-11-05').isBackdated, false);
});
test('backdated requests are recorded without a reviewer; current/future requests still require approval', async () => {
  const today = attendance.deriveVendorLocalDate(new Date(), 'Asia/Kolkata').localDateString;
  const shift = amount => { const day = new Date(today+'T12:00:00Z'); day.setUTCDate(day.getUTCDate()+amount); return day.toISOString().slice(0,10); };
  for (const offset of [-1, 0, 1]) {
    let created;
    const findFirst = async ({ where }) => { assert.ok(where.status.in.includes('RECORDED')); return null; };
    const tx = { $queryRaw: async () => [], leaveRequest: { findFirst, create: async ({ data }) => {
      created = data;
      return { ...data, id: 456, reviewed_at: null, reviewed_by: null, created_at: new Date(), user: { user_name: 'Employee' }, franchise: { franchise_name: 'Test franchise' } };
    } } };
    const api = service('employee', 10, { leaveRequest: { findFirst }, $transaction: async callback => callback(tx) });
    const result = await api.createLeaveRequest({}, { title: 'Leave', type: 'CASUAL', remark: 'Personal', start_date: shift(offset), end_date: shift(offset), is_backdated: true, status: 'RECORDED' });
    assert.equal(result.status, offset < 0 ? 'RECORDED' : 'PENDING');
    assert.equal(result.isBackdated, offset < 0); assert.equal(result.approvalRequired, offset >= 0);
    assert.equal(created.reviewed_by, undefined); assert.equal(created.reviewed_at, undefined);
  }
});
test('recorded backdated leave cannot be approved or rejected again', async () => {
  const row = { id: 456, vendor_id: 1, user_id: 7, is_backdated: true, status: 'RECORDED' };
  const api = service('super-admin', 10, { $transaction: async callback => callback({ $queryRaw: async () => [], leaveRequest: { findFirst: async () => row } }) });
  await assert.rejects(api.decideLeaveRequest({}, 456, { status: 'APPROVED' }), { statusCode: 409 });
  await assert.rejects(api.decideLeaveRequest({}, 456, { status: 'REJECTED', rejection_reason: 'No' }), { statusCode: 409 });
});
