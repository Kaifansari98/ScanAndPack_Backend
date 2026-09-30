const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

// Exercise the service without a database or Redis connection.
function setup() {
  let user;
  let mappings = [];
  let failMapping = false;
  let supervisors = [];
  const prisma = {
    franchiseMaster: {
      count: async ({ where }) => where.id.in.filter(id => [10, 20, 30].includes(id) && where.vendor_id === 1).length,
      findMany: async ({ where }) => {
        const direct = where.OR[0].users.some;
        const mapping = where.OR[1].siteSupervisorFranchiseMappings.some;
        assert.equal(mapping.vendor_id, where.vendor_id);
        assert.equal(mapping.supervisor, direct);
        return where.id.in.filter(id => supervisors.some(supervisor =>
          supervisor.vendor_id === direct.vendor_id && supervisor.id !== direct.id?.not &&
          direct.user_type.user_type.in.includes(supervisor.role) &&
          (supervisor.franchise_id === id || supervisor.mappedIds?.includes(id))
        )).map(id => ({ id, franchise_name: `Franchise ${id}` }));
      },
    },
    userTypeMaster: { findUnique: async ({ where }) => ({ user_type: where.id === 99 ? 'sales-executive' : 'site-supervisor' }) },
    userMaster: {
      findUnique: async () => user && ({ ...user, siteSupervisorFranchiseMappings: mappings }),
      create: async ({ data }) => (user = { id: 7, ...data }),
      update: async ({ data }) => (user = { ...user, ...data }),
    },
    siteSupervisorFranchiseMapping: {
      deleteMany: async ({ where }) => { mappings = mappings.filter(m => where.franchise_id?.notIn.includes(m.franchise_id)); },
      upsert: async ({ create, update }) => {
        if (failMapping) throw new Error('mapping failed');
        const existing = mappings.find(m => m.franchise_id === create.franchise_id);
        if (existing) Object.assign(existing, update);
        else mappings.push(create);
      },
    },
    $transaction: async fn => {
      const previousUser = user && { ...user };
      const previousMappings = mappings.map(m => ({ ...m }));
      try { return await fn(prisma); }
      catch (error) { user = previousUser; mappings = previousMappings; throw error; }
    },
  };
  const source = fs.readFileSync(require('node:path').join(__dirname, '../src/services/userServices/user.service.ts'), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports, require: name => {
    if (name.endsWith('/prisma/client')) return { prisma };
    if (name === 'bcryptjs') return { hash: async () => 'hashed' };
    if (name.endsWith('/config/redis')) return { redis: {} };
    throw new Error(`Unexpected import ${name}`);
  } });
  return { ...exports, setSupervisors: value => { supervisors = value; }, state: () => ({ user, mappings }), fail: () => { failMapping = true; } };
}
const payload = { vendor_id: 1, user_type_id: 2, user_name: 'Test', user_email: 'test@example.com', user_contact: '123', user_timezone: 'Asia/Kolkata', password: 'test' };

test('single and legacy selections only populate UserMaster', async () => {
  for (const selection of [{ franchise_ids: [10] }, { franchise_id: 10 }]) {
    const s = setup();
    await s.createUserService({ ...payload, ...selection }, 4);
    assert.equal(s.state().user.franchise_id, 10);
    assert.equal(s.state().mappings.length, 0);
    assert.equal(s.state().user.franchise_ids, undefined);
  }
});

test('multiple selections keep first primary, deduplicate and sync on edit', async () => {
  const s = setup();
  await s.createUserService({ ...payload, franchise_ids: [20, 10, 20] }, 4);
  assert.equal(s.state().user.franchise_id, 20);
  assert.deepEqual(s.state().mappings.map(m => m.franchise_id), [20, 10]);
  await s.updateUserService(7, { franchise_ids: [10, 30] }, 5);
  assert.equal(s.state().user.franchise_id, 10);
  assert.deepEqual(s.state().mappings.map(m => m.franchise_id), [10, 30]);
  assert.equal(s.state().mappings[0].created_by, 4);
  assert.equal(s.state().mappings[0].updated_by, 5);
  await s.updateUserService(7, { user_name: 'Renamed' }, 5);
  assert.equal(s.state().mappings.length, 2);
  await s.updateUserService(7, { franchise_ids: [30] }, 5);
  assert.equal(s.state().user.franchise_id, 30);
  assert.equal(s.state().mappings.length, 0);
});

test('rejects empty, malformed and foreign-vendor franchises before writing', async () => {
  for (const franchise_ids of [[], [999], [10, 999], [null], ['10'], [0], [1.5], '10']) {
    const s = setup();
    await assert.rejects(s.createUserService({ ...payload, franchise_ids }), { statusCode: 400 });
    assert.equal(s.state().user, undefined);
  }
  const s = setup();
  await s.createUserService({ ...payload, franchise_ids: [10, 20] });
  await assert.rejects(s.updateUserService(7, { franchise_ids: [999] }), { statusCode: 400 });
  assert.equal(s.state().user.franchise_id, 10);
  assert.equal(s.state().mappings.length, 2);
});

test('mapping failure rolls back user and mapping changes in the transaction', async () => {
  const s = setup();
  await s.createUserService({ ...payload, franchise_ids: [10, 20] });
  s.fail();
  await assert.rejects(s.updateUserService(7, { franchise_ids: [30, 20] }), /mapping failed/);
  assert.equal(s.state().user.franchise_id, 10);
  assert.deepEqual(s.state().mappings.map(m => m.franchise_id), [10, 20]);
});


test('create requires confirmation for direct or mapped supervisors and writes only after confirmation', async () => {
  for (const assignment of [{ franchise_id: 10 }, { franchise_id: 30, mappedIds: [10] }]) {
    const s = setup();
    s.setSupervisors([{ id: 8, vendor_id: 1, role: 'site-supervisor', ...assignment }]);
    await assert.rejects(s.createUserService({ ...payload, franchise_ids: [10, 20] }), error => {
      assert.equal(error.statusCode, 409);
      assert.equal(error.code, 'SUPERVISOR_CONFIRMATION_REQUIRED');
      assert.equal(error.franchises[0].franchise_name, 'Franchise 10');
      return true;
    });
    assert.equal(s.state().user, undefined);
    assert.equal(s.state().mappings.length, 0);
    await s.createUserService({ ...payload, franchise_ids: [10, 20], confirm_additional_supervisor: true });
    assert.equal(s.state().user.franchise_id, 10);
    assert.equal(s.state().user.confirm_additional_supervisor, undefined);
  }
});

test('update excludes itself but prompts for other supervisors, including unchanged franchises', async () => {
  const s = setup();
  await s.createUserService({ ...payload, franchise_ids: [10, 20] });
  s.setSupervisors([{ id: 7, vendor_id: 1, role: 'site-supervisor', franchise_id: 10, mappedIds: [20] }]);
  await s.updateUserService(7, { user_name: 'First edit' });
  s.setSupervisors([{ id: 8, vendor_id: 1, role: 'site-supervisor', franchise_id: 20 }]);
  await assert.rejects(s.updateUserService(7, { user_name: 'Second edit' }), { code: 'SUPERVISOR_CONFIRMATION_REQUIRED' });
  assert.equal(s.state().user.user_name, 'First edit');
  await s.updateUserService(7, { user_name: 'Second edit', confirm_additional_supervisor: true });
  assert.equal(s.state().user.user_name, 'Second edit');
});

test('ignores other vendors and roles; confirms when changing to site supervisor', async () => {
  const s = setup();
  s.setSupervisors([
    { id: 8, vendor_id: 2, role: 'site-supervisor', franchise_id: 10 },
    { id: 9, vendor_id: 1, role: 'sales-executive', franchise_id: 10 },
  ]);
  await s.createUserService({ ...payload, franchise_ids: [10] });
  s.setSupervisors([{ id: 8, vendor_id: 1, role: 'site-supervisor', franchise_id: 10 }]);
  await s.updateUserService(7, { user_type_id: 99 });
  await assert.rejects(s.updateUserService(7, { user_type_id: 2 }), { code: 'SUPERVISOR_CONFIRMATION_REQUIRED' });
  await s.updateUserService(7, { user_type_id: 2, confirm_additional_supervisor: true });
  assert.equal(s.state().user.user_type_id, 2);
});

test('confirmation must be boolean true and cannot bypass franchise validation', async () => {
  const s = setup();
  s.setSupervisors([{ id: 8, vendor_id: 1, role: 'site-supervisor', franchise_id: 10 }]);
  await assert.rejects(s.createUserService({ ...payload, franchise_ids: [10], confirm_additional_supervisor: 'true' }), { code: 'SUPERVISOR_CONFIRMATION_REQUIRED' });
  await assert.rejects(s.createUserService({ ...payload, franchise_ids: [999], confirm_additional_supervisor: true }), { statusCode: 400 });
});
