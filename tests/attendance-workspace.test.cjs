const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const compile = file => ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
const utilsCode = compile('src/services/attendance/attendance.utils.ts');
const serviceCode = compile('src/services/attendance/attendance-workspace.service.ts');
const controllerCode = compile('src/controllers/attendance/attendance-workspace.controller.ts');

function setup() {
  let clock = Date.parse('2026-11-04T04:00:00Z');
  class ServerDate extends Date { constructor(...args) { super(...(args.length ? args : [clock])); } static now() { return clock; } }
  const state = { users: [
    { id: 7, vendor_id: 1, franchise_id: 10, status: 'active', user_type: { user_type: 'employee' } },
    { id: 8, vendor_id: 1, franchise_id: 10, status: 'active', user_type: { user_type: 'hrms-admin' } },
    { id: 9, vendor_id: 2, franchise_id: 20, status: 'active', user_type: { user_type: 'employee' } },
    { id: 10, vendor_id: 1, franchise_id: 10, status: 'inactive', user_type: { user_type: 'employee' } },
  ], records: [], breaks: [], logs: [], corrections: [], locks: 0 };
  const vendor = { is_hrms_master_enabled: true, time_zone: 'Asia/Kolkata', time_zone_master: null };
  const value = item => item instanceof Date || item instanceof ServerDate ? item.getTime() : item;
  const matches = (row, where = {}) => Object.entries(where).every(([key, expected]) => {
    if (key === 'OR') return expected.some(condition => matches(row, condition));
    if (key === 'AND') return expected.every(condition => matches(row, condition));
    const actual = value(row[key] ?? null);
    if (expected && typeof expected === 'object' && !(expected instanceof Date) && !(expected instanceof ServerDate)) {
      return Object.entries(expected).every(([op, wanted]) => op === 'not' ? actual !== value(wanted) : op === 'lt' ? actual < value(wanted) : op === 'gt' ? actual > value(wanted) : op === 'gte' ? actual >= value(wanted) : op === 'lte' ? actual <= value(wanted) : op === 'in' ? wanted.includes(actual) : false);
    }
    return actual === value(expected);
  });
  const hydrate = record => record && structuredClone({ ...record, breaks: state.breaks.filter(p => p.attendance_id === record.id), logs: state.logs.filter(l => l.attendance_id === record.id) });
  const findRecord = query => hydrate(state.records.filter(row => matches(row, query.where)).sort((a, b) => Number(!!a.check_out) - Number(!!b.check_out))[0] ?? null);
  const correction = query => structuredClone(state.corrections.find(row => matches(row, query.where)) ?? null);
  const prisma = {
    userMaster: {
      findUnique: async ({ where }) => { const user = state.users.find(row => row.id === where.id); return user ? { ...user, vendor: { ...vendor } } : null; },
      findFirst: async ({ where }) => state.users.find(row => matches(row, where)) ?? null,
    },
    franchiseMaster: { findFirst: async ({ where }) => where.id === (where.vendor_id === 1 ? 10 : 20) ? { id: where.id } : null },
    attendance: {
      findFirst: async query => findRecord(query),
      findMany: async ({ where }) => state.records.filter(row => matches(row, where)).map(hydrate),
      findUniqueOrThrow: async query => { const result = findRecord(query); if (!result) throw Error('not found'); return result; },
      create: async ({ data }) => {
        if (state.records.some(row => row.user_id === data.user_id && (value(row.attendance_date) === value(data.attendance_date) || (!row.check_out && !data.check_out)))) throw { code: 'P2002' };
        const row = { id: state.records.length + 1, check_out: null, work_location: null, ...data, updated_at: new ServerDate(), created_at: new ServerDate() };
        state.records.push(row); return hydrate(row);
      },
      update: async ({ where, data }) => { const row = state.records.find(row => matches(row, where)); Object.assign(row, data, { updated_at: new ServerDate() }); return hydrate(row); },
    },
    attendance_breaks: {
      create: async ({ data }) => { const row = { id: state.breaks.length + 1, ended_at: null, ...data }; state.breaks.push(row); return row; },
      update: async ({ where, data }) => { const row = state.breaks.find(row => matches(row, where)); Object.assign(row, data); return row; },
    },
    attendance_logs: { create: async ({ data }) => { if (state.failAudit && data.action === 'CORRECTED') throw new Error('audit failed'); const row = { id: state.logs.length + 1, ...data }; state.logs.push(row); return row; } },
    attendance_corrections: {
      findFirst: async query => correction(query),
      findUniqueOrThrow: async query => { const row = correction(query); if (!row) throw Error('not found'); return row; },
      findMany: async ({ where, skip = 0, take = 100 }) => state.corrections.filter(row => matches(row, where)).slice(skip, skip + take),
      count: async ({ where }) => state.corrections.filter(row => matches(row, where)).length,
      create: async ({ data }) => { const row = { id: state.corrections.length + 1, attendance_id: null, baseline_updated_at: null, status: 'PENDING', ...Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined)), created_at: new ServerDate() }; state.corrections.push(row); return structuredClone(row); },
      update: async ({ where, data }) => { const row = state.corrections.find(row => matches(row, where)); Object.assign(row, data); return structuredClone(row); },
    },
    $queryRaw: async (strings, id) => { assert.ok(strings.join('').includes('FOR UPDATE')); assert.ok(id > 0); state.locks++; return [{ id }]; },
  };
  let queue = Promise.resolve();
  prisma.$transaction = async fn => {
    if (Array.isArray(fn)) return Promise.all(fn);
    const previous = queue; let release; queue = new Promise(resolve => { release = resolve; }); await previous;
    const before = structuredClone(state);
    try { return await fn(prisma); } catch (error) { Object.assign(state, before); throw error; } finally { release(); }
  };
  const utils = {};
  vm.runInNewContext(utilsCode, { exports: utils, Date: ServerDate, Intl });
  const api = {};
  const enums = { AttendanceWorkLocation: { OFFICE: 'OFFICE', FACTORY: 'FACTORY', SITE: 'SITE', REMOTE: 'REMOTE' }, AttendanceCorrectionStatus: { PENDING: 'PENDING', APPROVED: 'APPROVED', REJECTED: 'REJECTED', CANCELLED: 'CANCELLED' } };
  vm.runInNewContext(serviceCode, { exports: api, Date: ServerDate, require: name => {
    if (name.endsWith('/prisma/client')) return { prisma };
    if (name.endsWith('/timeZone.service')) return { isValidIANATimeZone: zone => { try { new Intl.DateTimeFormat('en', { timeZone: zone }); return true; } catch { return false; } } };
    if (name.endsWith('/attendance.utils')) return utils;
    if (name.endsWith('/client')) return enums;
    throw Error(name);
  } });
  const controllers = {};
  vm.runInNewContext(controllerCode, { exports: controllers, console: { error() {} }, require: name => name.endsWith('/attendance.utils') ? utils : api });
  return { api, utils, controllers, state, vendor, time: value => { clock = Date.parse(value); } };
}
const employee = { id: 7, vendor_id: 1 };
const admin = { id: 8, vendor_id: 1 };
const punch = (s, action, input = {}) => s.api.punchAttendance(employee, { action, work_location: 'OFFICE', ...input });

test('server punches track breaks, net work time, audits and completed status', async () => {
  const s = setup(); await punch(s, 'IN');
  s.time('2026-11-04T05:00:00Z'); await punch(s, 'BREAK_START');
  await assert.rejects(punch(s, 'BREAK_START'), { statusCode: 409 });
  s.time('2026-11-04T05:30:00Z'); await punch(s, 'BREAK_END');
  s.time('2026-11-04T06:00:00Z'); await punch(s, 'BREAK_START');
  s.time('2026-11-04T06:15:00Z'); const result = await punch(s, 'OUT');
  assert.equal(result.attendance.work_seconds, 5400);
  assert.equal(result.attendance.break_seconds, 2700);
  assert.equal(result.attendance.status, 'COMPLETED');
  assert.equal(s.state.breaks.filter(p => !p.ended_at).length, 0);
  assert.equal(s.state.logs.length, 6);
  assert.equal(s.state.logs.every(log => log.actor_id === 7), true);
  assert.equal(result.attendance.time_zone, 'Asia/Kolkata');
  assert.equal(result.attendance.attendance_date_local, '2026-11-04');
});

test('duplicate punches, invalid transitions and supplied client timestamps are rejected', async () => {
  const s = setup();
  await assert.rejects(punch(s, 'OUT'), { statusCode: 409 });
  await assert.rejects(punch(s, 'IN', { action_time: '2000-01-01' }), { statusCode: 400 });
  await assert.rejects(punch(s, 'IN', { action: 'CORRECTED' }), { statusCode: 400 });
  await assert.rejects(punch(s, 'IN', { work_location: 'UNKNOWN' }), { statusCode: 400 });
  await punch(s, 'IN'); await assert.rejects(punch(s, 'IN'), { statusCode: 409 });
  await assert.rejects(punch(s, 'BREAK_END'), { statusCode: 409 });
  s.time('2026-11-04T03:00:00Z'); await assert.rejects(punch(s, 'OUT'), { statusCode: 409 });
  s.time('2026-11-04T05:00:00Z'); await punch(s, 'OUT');
  await assert.rejects(punch(s, 'IN'), { statusCode: 409 });
});

test('simultaneous check-ins serialize on the employee lock', async () => {
  const s = setup(); const results = await Promise.allSettled([punch(s, 'IN'), punch(s, 'IN')]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(s.state.records.length, 1);
  assert.equal(s.state.logs.length, 1);
});

test('overnight open sessions remain available and must close before a new check-in', async () => {
  const s = setup(); s.time('2026-11-04T17:00:00Z'); await punch(s, 'IN');
  s.time('2026-11-04T22:00:00Z');
  await assert.rejects(punch(s, 'IN'), { statusCode: 409 });
  assert.equal((await s.api.getAttendanceWorkspace(employee, '2026-11')).current.attendance_date_local, '2026-11-04');
  await punch(s, 'OUT'); await punch(s, 'IN');
  assert.equal(s.state.records[1].attendance_date.toISOString().slice(0, 10), '2026-11-05');
});

test('authentication, vendor, feature flag, inactive accounts and self scope are enforced', async () => {
  const s = setup();
  await assert.rejects(s.api.getAttendanceWorkspace(undefined), { statusCode: 401 });
  await assert.rejects(s.api.getAttendanceWorkspace({ id: 7, vendor_id: 2 }), { statusCode: 403 });
  await assert.rejects(s.api.getAttendanceWorkspace({ id: 10, vendor_id: 1 }), { statusCode: 403 });
  await assert.rejects(punch(s, 'IN', { user_id: 9 }), { statusCode: 403 });
  await assert.rejects(s.api.punchAttendance(admin, { action: 'IN', user_id: 9, work_location: 'OFFICE' }), { statusCode: 404 });
  s.vendor.is_hrms_master_enabled = false;
  await assert.rejects(punch(s, 'IN'), { statusCode: 403 });
});

test('personal punch controller ignores another supplied employee ID', async () => {
  const s = setup(); let status, body;
  const res = { status(value) { status = value; return this; }, json(value) { body = value; return this; } };
  await s.controllers.attendancePunchController({ user: employee, body: { action: 'IN', user_id: 9, work_location: 'OFFICE' } }, res);
  assert.equal(status, 200); assert.equal(body.data.attendance.user_id, 7);
});

test('corrections validate dates and duplicate pending requests and do not mutate attendance before approval', async () => {
  const s = setup(); await punch(s, 'IN'); const before = JSON.stringify(s.state.records);
  await assert.rejects(s.api.requestAttendanceCorrection(employee, { attendance_date: '2026-02-30', reason: 'Missing check out' }), { statusCode: 400 });
  await assert.rejects(s.api.requestAttendanceCorrection(employee, { attendance_date: '2026-11-05', reason: 'Missing check out' }), { statusCode: 400 });
  const request = await s.api.requestAttendanceCorrection(employee, { attendance_date: '2026-11-04', reason: 'The check-in time is wrong' });
  assert.equal(request.status, 'PENDING'); assert.equal(JSON.stringify(s.state.records), before);
  await assert.rejects(s.api.requestAttendanceCorrection(employee, { attendance_date: '2026-11-04', reason: 'Another request for today' }), { statusCode: 409 });
  await assert.rejects(s.api.decideAttendanceCorrection(employee, request.id, { status: 'APPROVED' }), { statusCode: 403 });
  await s.api.decideAttendanceCorrection(employee, request.id, { status: 'CANCELLED' });
  assert.equal(s.state.corrections[0].status, 'CANCELLED');
  assert.equal(JSON.stringify(s.state.records), before);
});

test('authorized approval changes attendance and stores before/after snapshots and reviewer identity', async () => {
  const s = setup(); await punch(s, 'IN'); s.time('2026-11-04T05:00:00Z'); await punch(s, 'OUT');
  const request = await s.api.requestAttendanceCorrection(employee, { attendance_date: '2026-11-04', reason: 'Check-in should be earlier', requested_check_in: '2026-11-04T09:00' });
  const result = await s.api.decideAttendanceCorrection(admin, request.id, { status: 'APPROVED', review_note: 'Verified' });
  assert.equal(result.status, 'APPROVED'); assert.equal(result.reviewed_by, 8);
  const log = s.state.logs.find(log => log.action === 'CORRECTED');
  assert.equal(log.actor_id, 8); assert.equal(log.correction_id, request.id);
  assert.equal(log.before_values.check_in, '2026-11-04T04:00:00.000Z');
  assert.equal(log.after_values.check_in, '2026-11-04T03:30:00.000Z');
  await assert.rejects(s.api.decideAttendanceCorrection(admin, request.id, { status: 'APPROVED' }), { statusCode: 409 });
});

test('self approval, other-vendor review and cancellation of another employee request are forbidden', async () => {
  const s = setup(); const request = await s.api.requestAttendanceCorrection(employee, { attendance_date: '2026-11-03', reason: 'Forgot both punches yesterday' });
  s.state.users[0].user_type.user_type = 'hrms-admin';
  await assert.rejects(s.api.decideAttendanceCorrection(employee, request.id, { status: 'APPROVED' }), { statusCode: 403 });
  await assert.rejects(s.api.decideAttendanceCorrection(admin, request.id, { status: 'CANCELLED' }), { statusCode: 403 });
  s.state.users[2].user_type.user_type = 'super-admin';
  await assert.rejects(s.api.decideAttendanceCorrection({ id: 9, vendor_id: 2 }, request.id, { status: 'REJECTED', review_note: 'No' }), { statusCode: 404 });
});

test('stale requests are rejected without changing attendance or the pending request', async () => {
  const s = setup(); await punch(s, 'IN');
  const request = await s.api.requestAttendanceCorrection(employee, { attendance_date: '2026-11-04', reason: 'Wrong time in the record' });
  s.time('2026-11-04T05:00:00Z'); await punch(s, 'OUT');
  const before = JSON.stringify(s.state.records);
  await assert.rejects(s.api.decideAttendanceCorrection(admin, request.id, { status: 'APPROVED', requested_check_in: '2026-11-04T09:00', requested_check_out: '2026-11-04T10:00' }), { statusCode: 409 });
  assert.equal(JSON.stringify(s.state.records), before); assert.equal(s.state.corrections[0].status, 'PENDING');
});

test('correction approvals cannot overlap another day or exclude existing breaks', async () => {
  const s = setup(); await punch(s, 'IN');
  s.time('2026-11-04T05:00:00Z'); await punch(s, 'BREAK_START');
  s.time('2026-11-04T05:30:00Z'); await punch(s, 'BREAK_END');
  s.time('2026-11-04T06:00:00Z'); await punch(s, 'OUT');
  const outside = await s.api.requestAttendanceCorrection(employee, { attendance_date: '2026-11-04', reason: 'Please adjust the check-in', requested_check_in: '2026-11-04T10:45' });
  const before = JSON.stringify(s.state.records);
  await assert.rejects(s.api.decideAttendanceCorrection(admin, outside.id, { status: 'APPROVED' }), { statusCode: 409 });
  assert.equal(JSON.stringify(s.state.records), before);
  const overlaps = await s.api.requestAttendanceCorrection(employee, { attendance_date: '2026-11-03', reason: 'My overnight shift was missed', requested_check_in: '2026-11-03T22:00', requested_check_out: '2026-11-04T10:00' });
  await assert.rejects(s.api.decideAttendanceCorrection(admin, overlaps.id, { status: 'APPROVED' }), { statusCode: 409 });
  assert.equal(JSON.stringify(s.state.records), before);
});

test('an audit write failure rolls back the approved attendance change and request status', async () => {
  const s = setup();
  const request = await s.api.requestAttendanceCorrection(employee, { attendance_date: '2026-11-03', reason: 'Forgot both punches yesterday', requested_check_in: '2026-11-03T09:00', requested_check_out: '2026-11-03T17:00' });
  s.state.failAudit = true;
  await assert.rejects(s.api.decideAttendanceCorrection(admin, request.id, { status: 'APPROVED' }), /audit failed/);
  assert.equal(s.state.records.length, 0);
  assert.equal(s.state.logs.length, 0);
  assert.equal(s.state.corrections[0].status, 'PENDING');
});

test('missing-day approvals create one completed record, while rejection only changes request status', async () => {
  const s = setup(); const request = await s.api.requestAttendanceCorrection(employee, { attendance_date: '2026-11-03', reason: 'Forgot to record attendance', requested_check_in: '2026-11-03T09:00', requested_check_out: '2026-11-03T17:00' });
  await s.api.decideAttendanceCorrection(admin, request.id, { status: 'APPROVED' });
  assert.equal(s.state.records.length, 1); assert.ok(s.state.records[0].check_out);
  const next = await s.api.requestAttendanceCorrection(employee, { attendance_date: '2026-11-02', reason: 'Please verify my attendance' });
  await assert.rejects(s.api.decideAttendanceCorrection(admin, next.id, { status: 'REJECTED' }), { statusCode: 400 });
  await s.api.decideAttendanceCorrection(admin, next.id, { status: 'REJECTED', review_note: 'Insufficient details' });
  assert.equal(s.state.records.length, 1); assert.equal(s.state.corrections[1].status, 'REJECTED');
});

test('monthly workspace is self scoped and summaries use the full month, not a page', async () => {
  const s = setup(); await punch(s, 'IN'); s.time('2026-11-04T05:00:00Z'); await punch(s, 'OUT');
  s.state.records.push({ ...structuredClone(s.state.records[0]), id: 2, user_id: 9, vendor_id: 2 });
  const result = await s.api.getAttendanceWorkspace(employee, '2026-11');
  assert.equal(result.entries.length, 1); assert.equal(result.summary.days_recorded, 1);
  assert.equal(result.summary.work_seconds, 3600); assert.equal(result.can_review, false);
  assert.equal((await s.api.getAttendanceWorkspace(employee, '2026-10')).entries.length, 0);
  await assert.rejects(s.api.listAttendanceCorrections(employee, {}), { statusCode: 403 });
});

test('vendor-local correction times reject nonexistent and ambiguous daylight-saving times', () => {
  const { utils } = setup();
  assert.equal(utils.correctionTime('2026-11-04T09:00', 'Asia/Kolkata').toISOString(), '2026-11-04T03:30:00.000Z');
  assert.throws(() => utils.correctionTime('2026-03-08T02:30', 'America/New_York'));
  assert.throws(() => utils.correctionTime('2026-11-01T01:30', 'America/New_York'));
  assert.equal(utils.correctionTime('2026-11-01T01:30:00-04:00', 'America/New_York').toISOString(), '2026-11-01T05:30:00.000Z');
});
