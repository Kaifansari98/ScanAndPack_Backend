const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
function load(file, dependencies = {}) {
  const module = { exports: {} };
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  new Function('require', 'module', 'exports', source)((name) => dependencies[name] ?? require(name), module, module.exports);
  return module.exports;
}
const resolver = load('src/utils/online-lead-executive.ts');
test('uses configured executive, never first executive for ambiguous or stale mappings', () => {
  const users = [{ id: 1 }, { id: 2 }];
  assert.equal(resolver.resolveOnlineLeadExecutive(users, 2), users[1]);
  assert.equal(resolver.resolveOnlineLeadExecutive(users, null), null);
  assert.equal(resolver.resolveOnlineLeadExecutive(users, 99), null);
  assert.equal(resolver.resolveOnlineLeadExecutive([users[1]], null), users[1]);
  assert.equal(resolver.resolveOnlineLeadExecutive([users[1]], 99), users[1]);
  assert.equal(resolver.resolveOnlineLeadExecutive([], 1), null);
});
function setup() {
  const users = [
    { id: 1, vendor_id: 10, franchise_id: 20, status: 'active', user_name: 'A', user_type: { user_type: 'sales executive' } },
    { id: 2, vendor_id: 10, franchise_id: 20, status: 'active', user_name: 'B', user_type: { user_type: 'sales-executive' } },
    { id: 3, vendor_id: 10, franchise_id: 21, status: 'active', user_type: { user_type: 'sales executive' } },
    { id: 4, vendor_id: 10, franchise_id: 20, status: 'inactive', user_type: { user_type: 'sales executive' } },
    { id: 5, vendor_id: 10, franchise_id: 20, status: 'active', user_type: { user_type: 'store admin' } },
    { id: 6, vendor_id: 11, franchise_id: 20, status: 'active', user_type: { user_type: 'sales executive' } },
  ];
  const store = { id: 20, vendor_id: 10, franchise_name: 'Store', online_lead_sales_executive_id: null };
  const matches = (row, where) => Object.entries(where).every(([key, value]) => row[key] === value);
  const prisma = {
    vendorMaster: { findUnique: async () => ({ id: 10 }) },
    franchiseMaster: {
      findFirst: async ({ where }) => matches(store, where) ? store : null,
      update: async ({ data }) => Object.assign(store, data),
      findMany: async () => [{ ...store, users: users.filter(u => u.franchise_id === 20 && u.vendor_id === 10 && u.status === 'active') }],
    },
    userMaster: { findFirst: async ({ where }) => users.find(u => matches(u, where)) ?? null },
  };
  const controller = load('src/controllers/onlineLeadExecutiveMapping.controller.ts', { '../prisma/client': { prisma }, '../utils/online-lead-executive': resolver });
  const req = { params: { vendor_id: '10' }, user: { vendor_id: 10, user_type: 'super-admin' }, body: { franchise_id: 20, sales_executive_id: 2 } };
  const res = { code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
  return { controller, req, res, store };
}
test('saves valid mapping and returns selected executive', async () => {
  const { controller, req, res, store } = setup();
  await controller.saveOnlineLeadExecutiveMapping(req, res);
  assert.equal(res.code, 200);
  assert.equal(store.online_lead_sales_executive_id, 2);
  assert.equal(res.body.data[0].sales_executive_id, 2);
});
test('rejects foreign franchise, inactive, wrong-role, cross-vendor and unknown executives', async () => {
  for (const id of [3, 4, 5, 6, 99]) {
    const { controller, req, res, store } = setup();
    req.body.sales_executive_id = id;
    await controller.saveOnlineLeadExecutiveMapping(req, res);
    assert.equal(res.code, 400);
    assert.equal(store.online_lead_sales_executive_id, null);
  }
});
test('rejects unauthorized writes and cross-vendor reads', async () => {
  for (const [role, vendor, method] of [['sales-executive', 10, 'saveOnlineLeadExecutiveMapping'], ['super-admin', 11, 'getOnlineLeadExecutiveMappings']]) {
    const { controller, req, res } = setup();
    req.user = { user_type: role, vendor_id: vendor };
    await controller[method](req, res);
    assert.equal(res.code, 403);
  }
});
test('lists only active franchise sales executives and leaves ambiguous mapping unselected', async () => {
  const { controller, req, res } = setup();
  await controller.getOnlineLeadExecutiveMappings(req, res);
  assert.deepEqual(res.body.data[0].executives.map(u => u.id), [1, 2]);
  assert.equal(res.body.data[0].sales_executive_id, null);
});
test('rejects malformed input and franchises outside this vendor', async () => {
  for (const body of [{ franchise_id: 20, sales_executive_id: '2' }, { franchise_id: 99, sales_executive_id: 2 }, { franchise_id: 20, sales_executive_id: null }]) {
    const { controller, req, res, store } = setup();
    req.body = body;
    await controller.saveOnlineLeadExecutiveMapping(req, res);
    assert.equal(res.code, 400);
    assert.equal(store.online_lead_sales_executive_id, null);
  }
});
