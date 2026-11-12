const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const flows = [
  ['Type 4', 'booking_done', 'Booking Done Approval'],
  ['Type 9', 'order_login', 'Order Login Approval'],
  ['Type 13', 'dispatch_planning', 'Dispatch Planning Approval'],
];
function load(relative, requireMock) {
  const source = fs.readFileSync(path.join(__dirname, '../src', relative), 'utf8');
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports, require: requireMock, process, console, Date, setTimeout });
  return exports;
}
function setup({ enabled = true, approved = false, oldTaskStatus, failNotification = false, missingAdmin = false } = {}) {
  const state = { approvals: [], tasks: [], history: [], logs: [], notifications: [], emails: [] };
  const lead = { id: 7, vendor_id: 2, account_id: 77, franchise_id: 4, status_id: 12, firstname: 'Test', lastname: 'Client', lead_code: 'TEST-7' };
  const matches = (row, where) => Object.entries(where).every(([key, value]) =>
    value && typeof value === 'object' && value.in ? value.in.includes(row[key]) : row[key] === value);
  const db = {
    vendorMaster: { findUnique: async () => ({ IsAccountLocInEnabled: enabled }), findFirst: async () => ({ IsAccountLocInEnabled: enabled }) },
    leadMaster: { findUnique: async () => lead, findFirst: async () => lead,
      update: async ({ data }) => Object.assign(lead, data) },
    userMaster: { findFirst: async ({ where } = {}) => missingAdmin || (where?.id && where.id !== 9) ? null : ({ id: 9, user_name: 'Super Admin', user_email: 'admin@example.test' }),
      findUnique: async () => ({ user_name: 'Supervisor' }) },
    statusTypeMaster: { findFirst: async ({ where }) => ({ id: Number(where.tag.split(' ')[1]), tag: where.tag, type: `Stage ${where.tag}` }),
      findUnique: async () => ({ type: 'Order Login' }) },
    leadSuperAdminApprovalLocIns: {
      findFirst: async ({ where }) => state.approvals.find(row => matches(row, where)) ?? null,
      findMany: async ({ where }) => state.approvals.filter(row => matches(row, where)),
      create: async ({ data }) => { const row = { id: state.approvals.length + 1, ...data }; state.approvals.push(row); return row; },
      update: async ({ where, data }) => Object.assign(state.approvals.find(row => row.id === where.id), data),
    },
    userLeadTask: {
      findFirst: async ({ where, include }) => { const row = state.tasks.find(row => matches(row, where)); return row ? { ...row, ...(include?.lead ? { lead } : {}) } : null; },
      findMany: async ({ where }) => state.tasks.filter(row => matches(row, where)).sort((a,b) => b.id-a.id),
      create: async ({ data }) => { const row = { id: state.tasks.length + 1, ...data }; state.tasks.push(row); return row; },
      update: async ({ where, data }) => Object.assign(state.tasks.find(row => row.id === where.id), data),
    },
    leadUserMapping: { findMany: async () => [] },
  };
  db.$transaction = async (callback, options) => {
    state.transactionOptions = options;
    const snapshot = { status: lead.status_id, approvals: state.approvals.map(row => ({...row})), tasks: state.tasks.map(row => ({...row})), logs: [...state.logs] };
    try { return await callback(db); }
    catch (error) { lead.status_id = snapshot.status; Object.assign(state, { approvals: snapshot.approvals, tasks: snapshot.tasks, logs: snapshot.logs }); throw error; }
  };
  const mock = name => {
    if (name.endsWith('/prisma/client')) return { prisma: db };
    if (name.endsWith('/prisma/generated')) return { NotificationType: { TASK_ASSIGNED: 'TASK_ASSIGNED' }, SuperAdminApprovalType: Object.fromEntries(flows.map(([, type]) => [type, type])) };
    if (name.endsWith('/utils/logger')) return { default: { warn() {}, error() {}, info() {} } };
    if (name.endsWith('/taskHistory.service')) return { createTaskHistoryLog: async input => state.history.push(input) };
    if (name.endsWith('/leadDetailedLog')) return { createLeadLog: async (_tx, input) => state.logs.push(input) };
    if (name.endsWith('/utils/cache')) return { cache: { del: async () => {} } };
    if (name.endsWith('/notification.service')) return { NotificationService: { createAndSend: async input => { state.notifications.push(input); if (failNotification) throw Error('Email provider unavailable'); } } };
    if (name.includes('/email/')) return new Proxy({}, { get: (_, key) => async input => state.emails.push({ name: key, input }) });
    if (name === 'joi') return { default: require('joi') };
    if (name === 'fs') return { default: fs };
    return {};
  };
  const { LeadSuperAdminApprovalLockInService: Service } = load('services/leadSuperAdminApprovalLockIn/leadSuperAdminApprovalLockIn.service.ts', mock);
  const service = new Service();
  const input = { vendor_id: 2, lead_id: 7, created_by: 3, base_date: new Date('2026-11-12T10:00:00Z'), clientBaseUrl: 'https://crm.example.test' };
  const seed = type => {
    if (approved || oldTaskStatus) state.approvals.push({ id: 1, vendor_id: 2, lead_id: 7, approval_type: type, is_approved: approved });
    if (oldTaskStatus) state.tasks.push({ id: 1, vendor_id: 2, lead_id: 7, account_id: 77, user_id: 9, task_type: flows.find(row => row[1] === type)[2], status: oldTaskStatus });
  };
  const loadLeadServices = () => load('services/leadModuleServices/leadsGeneration/leadGeneration.service.ts', name =>
    name.endsWith('/leadSuperAdminApprovalLockIn.service') ? { LeadSuperAdminApprovalLockInService: Service } : mock(name));
  const loadStageUpdate = () => loadLeadServices().updateLeadStageService;
  const loadOrderLogin = () => load('services/production/order-login/orderLogin.service.ts', name =>
    name.endsWith('/leadSuperAdminApprovalLockIn.service') ? { LeadSuperAdminApprovalLockInService: Service } : mock(name));
  return { state, db, input, service, seed, lead, loadStageUpdate, loadOrderLogin, loadLeadServices };
}

for (const [stage, type, taskType] of flows) {
  test(`${taskType}: stage entry creates one pending lock-in and a Super Admin task; retry is idempotent`, async () => {
    const s = setup();
    const first = await s.service.createForStage({ ...s.input, stage_tag: stage }, s.db);
    assert.equal(first.task.user_id, 9);
    assert.equal(first.task.franchise_id, 4);
    assert.equal(first.task.task_type, taskType);
    assert.equal(first.task.status, 'open');
    assert.equal(first.approval.approval_type, type);
    assert.equal(first.approval.is_approved, false);
    const again = await s.service.createForStage({ ...s.input, stage_tag: stage }, s.db);
    assert.equal(again.task.id, first.task.id);
    assert.equal(s.state.tasks.length, 1);
    assert.equal(s.state.approvals.length, 1);
    assert.equal(s.state.history.length, 1);
    assert.equal(s.state.notifications.length, 1);
  });
  test(`${taskType}: approved lock-in does not generate another pending task`, async () => {
    const s = setup({ approved: true, oldTaskStatus: 'completed' }); s.seed(type);
    const result = await s.service.createForStage({ ...s.input, stage_tag: stage }, s.db);
    assert.equal(result.task, null);
    assert.equal(s.state.tasks.length, 1);
    assert.equal(s.state.notifications.length, 0);
  });
  test(`${taskType}: a cancelled historical task does not block a still-pending approval`, async () => {
    const s = setup({ oldTaskStatus: 'cancelled' }); s.seed(type);
    const result = await s.service.createForStage({ ...s.input, stage_tag: stage }, s.db);
    assert.equal(result.task.status, 'open');
    assert.equal(s.state.tasks.length, 2);
    assert.equal(s.state.approvals.length, 1);
  });
  test(`${taskType}: disabled account lock-ins generate neither approval nor task`, async () => {
    const s = setup({ enabled: false });
    assert.equal(await s.service.createForStage({ ...s.input, stage_tag: stage }, s.db), null);
    assert.equal(s.state.tasks.length + s.state.approvals.length, 0);
  });
  test(`${taskType}: general stage-update API uses the same transaction for stage and approval`, async () => {
    const s = setup(); const update = s.loadStageUpdate();
    const result = await update(7, 2, 77, stage, 3);
    assert.equal(result.success, true);
    assert.equal(s.lead.status_id, Number(stage.split(' ')[1]));
    assert.equal(s.state.tasks[0].task_type, taskType);
    assert.equal(s.state.transactionOptions.timeout, 15000);
  });
}
test('general stage-update rolls back the stage when no active Super Admin can receive the approval', async () => {
  const s = setup({ missingAdmin: true });
  await assert.rejects(s.loadStageUpdate()(7, 2, 77, 'Type 13', 3), /Active super-admin not found/);
  assert.equal(s.lead.status_id, 12);
  assert.equal(s.state.tasks.length, 0);
});
test('notification failure does not discard the Dispatch Planning approval task', async () => {
  const s = setup({ failNotification: true });
  const result = await s.service.createForStage({ ...s.input, stage_tag: 'Type 13' }, s.db);
  assert.equal(result.task.status, 'open');
  assert.equal(s.state.approvals.length, 1);
});
test('unrelated stage changes do not request approvals', async () => {
  const s = setup();
  assert.equal(await s.service.createForStage({ ...s.input, stage_tag: 'Type 12' }, s.db), null);
  assert.equal(s.state.tasks.length, 0);
});

test('SO-value entry restores a pending Order Login task even when an older task was cancelled', async () => {
  const s = setup({ oldTaskStatus: 'cancelled' }); s.seed('order_login');
  const { OrderLoginService } = s.loadOrderLogin();
  await new OrderLoginService().updateSoValueReceivedStatus(2, 7, true, 3);
  assert.equal(s.state.tasks.length, 2);
  assert.equal(s.state.tasks[1].status, 'open');
  assert.equal(s.state.tasks[1].task_type, 'Order Login Approval');
});

test('SO-value retries after approval never generate another Order Login task', async () => {
  const s = setup({ approved: true, oldTaskStatus: 'completed' }); s.seed('order_login');
  const { OrderLoginService } = s.loadOrderLogin();
  await new OrderLoginService().updateSoValueReceivedStatus(2, 7, true, 3);
  assert.equal(s.state.tasks.length, 1);
  assert.equal(s.state.notifications.length, 0);
});

for (const [, type, taskType] of flows) {
  test(`${taskType}: generic completion updates the approval and task together`, async () => {
    const s = setup({ oldTaskStatus: 'open' }); s.seed(type);
    const completed = await s.loadLeadServices().editTaskISMService({
      lead_id: 7, task_id: 1, status: 'completed', updated_by: 9, closed_by: 9, remark: 'Reviewed and approved',
    });
    assert.equal(completed.status, 'completed');
    assert.equal(s.state.approvals[0].is_approved, true);
    assert.equal(s.state.approvals[0].approved_by, 9);
    assert.equal(s.state.approvals[0].approval_remark, 'Reviewed and approved');
    assert.equal(completed.closed_by, 9);
    assert.ok(completed.closed_at instanceof Date);
    assert.equal(s.state.history.length, 1);
    assert.match(s.state.logs[0].action, /Super Admin approved/);
  });
  test(`${taskType}: a previously completed task can be reviewed to unlock its pending approval`, async () => {
    const s = setup({ oldTaskStatus: 'completed' }); s.seed(type);
    const result = await s.service.approveTaskIfApplicable({ lead_id: 7, task_id: 1, approved_by: 9 });
    assert.equal(result.approval.is_approved, true);
    assert.equal(s.state.tasks.length, 1);
  });
  test(`${taskType}: generic completion cannot approve on behalf of a non-Super-Admin updater`, async () => {
    const s = setup({ oldTaskStatus: 'open' }); s.seed(type);
    await assert.rejects(s.loadLeadServices().editTaskISMService({
      lead_id: 7, task_id: 1, status: 'completed', updated_by: 3, closed_by: 9,
    }), /Only an active Super Admin/);
    assert.equal(s.state.approvals[0].is_approved, false);
    assert.equal(s.state.tasks[0].status, 'open');
  });
}
test('completed task remains visible for explicit approval recovery, but is not reported as pending work', async () => {
  const s = setup({ oldTaskStatus: 'completed' }); s.seed('dispatch_planning');
  const rows = await s.service.getLeadLockIns(2, 7, 'dispatch_planning');
  assert.equal(rows[0].is_approved, false);
  assert.equal(rows[0].pending_tasks.length, 0);
  assert.equal(rows[0].latest_task.id, 1);
  assert.equal(rows[0].latest_task.status, 'completed');
  assert.equal(s.state.approvals[0].is_approved, false);
});
test('missing lock-in rejects generic completion without completing the task', async () => {
  const s = setup({ oldTaskStatus: 'open' }); s.seed('dispatch_planning'); s.state.approvals.length = 0;
  await assert.rejects(s.loadLeadServices().editTaskISMService({lead_id: 7, task_id: 1, status: 'completed', updated_by: 9}), /lock-in entry not found/);
  assert.equal(s.state.tasks[0].status, 'open');
});
test('ordinary follow-up tasks still use normal completion without creating approvals', async () => {
  const s = setup({ oldTaskStatus: 'open' }); s.seed('dispatch_planning');
  s.state.tasks[0].task_type = 'Follow Up'; s.state.approvals.length = 0;
  const task = await s.loadLeadServices().editTaskISMService({lead_id: 7, task_id: 1, status: 'completed', updated_by: 3});
  assert.equal(task.status, 'completed');
  assert.equal(s.state.approvals.length, 0);
  assert.match(s.state.logs[0].action, /marked as Completed/);
});
