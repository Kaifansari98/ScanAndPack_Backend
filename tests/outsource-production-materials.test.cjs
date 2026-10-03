const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function setup() {
  let rows = [1, 2].map(id => ({ id, vendor_id: 1, lead_id: 10, instance_id: 20, name: id === 1 ? 'Oak panel' : 'Handle', order_login_id: null }));
  let cards = [];
  let logs = [];
  let rejectUpdate = false;
  const user = { id: 7, franchise_id: 5, user_type: { user_type: 'admin' } };
  const lead = { id: 10, franchise_id: 5, account_id: 30, vendor: { handlesLargeScaleProjects: true, is_inventory_enabled: true }, statusType: { tag: 'Type 9' } };
  const matches = (record, where) => Object.entries(where).every(([key, value]) => value?.in ? value.in.includes(record[key]) : record[key] === value);
  const prisma = {
    $queryRaw: async () => [],
    leadMaster: { findFirst: async ({ where }) => where.id === 10 && where.vendor_id === 1 ? lead : null },
    userMaster: { findFirst: async () => user },
    userPrivilegeMapping: { count: async () => 0 },
    leadProductStructureInstance: { findFirst: async ({ where }) => where.id === 20 ? { is_tech_check_completed: true, is_order_login_completed: false } : null },
    productsRequiredForProduction: {
      findMany: async ({ where }) => rows.filter(row => matches(row, where)),
      update: async ({ where, data }) => {
        if (rejectUpdate) throw new Error('write failed');
        Object.assign(rows.find(row => row.id === where.id), data);
      },
    },
    orderLoginDetails: {
      findFirst: async ({ where }) => cards.find(card => matches(card, where)) ?? null,
      create: async ({ data }) => { const card = { id: cards.length + 100, ...data }; cards.push(card); return card; },
    },
    $transaction: async fn => {
      const snapshot = structuredClone({ rows, cards, logs });
      try { return await fn(prisma); }
      catch (error) { ({ rows, cards, logs } = snapshot); throw error; }
    },
  };
  const source = fs.readFileSync(path.join(__dirname, '../src/services/production/order-login/outsourceProductionMaterials.service.ts'), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports, require: name => {
    if (name.endsWith('/prisma/client')) return { prisma };
    if (name.endsWith('/utils/leadDetailedLog')) return { createLeadLog: async (_tx, data) => { logs.push(data); } };
    throw new Error(`Unexpected import ${name}`);
  } });
  return {
    run: (overrides = {}) => exports.outsourceProductionMaterials({ vendorId: 1, leadId: 10, userId: 7, instanceId: 20, materialIds: [1, 2], ...overrides }),
    state: () => ({ rows, cards, logs }), user, lead,
    failUpdate: () => { rejectUpdate = true; },
  };
}

test('creates named cards and persists the material links in the same instance', async () => {
  const s = setup();
  await s.run();
  assert.deepEqual(s.state().cards.map(card => card.item_type), ['Oak panel', 'Handle']);
  assert.deepEqual(s.state().rows.map(row => row.order_login_id), [100, 101]);
  assert.ok(s.state().cards.every(card => card.instance_id === 20 && card.account_id === 30 && card.created_by === 7));
  assert.equal(s.state().logs.length, 1);
});

test('retries and duplicate IDs do not create duplicate cards or audit logs', async () => {
  const s = setup();
  await s.run({ materialIds: [1, 1, 2] });
  await s.run();
  assert.equal(s.state().cards.length, 2);
  assert.equal(s.state().logs.length, 1);
});

test('same-name rows reuse a card without changing its vendor or description', async () => {
  const s = setup();
  s.state().rows[1].name = 'Oak panel';
  s.state().cards.push({ id: 80, vendor_id: 1, lead_id: 10, instance_id: 20, item_type: 'Oak panel', item_desc: 'Existing notes', company_vendor_id: 9 });
  await s.run();
  assert.equal(s.state().cards.length, 1);
  assert.equal(s.state().cards[0].item_desc, 'Existing notes');
  assert.equal(s.state().cards[0].company_vendor_id, 9);
  assert.ok(s.state().rows.every(row => row.order_login_id === 80));
});

test('rejects invalid selection and wrong lead or instance without writes', async () => {
  for (const overrides of [{ materialIds: [] }, { materialIds: ['1'] }, { materialIds: [1, 999] }, { instanceId: null }, { instanceId: 99 }, { leadId: 11 }, { vendorId: 2 }]) {
    const s = setup();
    await assert.rejects(s.run(overrides));
    assert.equal(s.state().cards.length, 0);
    assert.ok(s.state().rows.every(row => row.order_login_id === null));
  }
});

test('requires the feature and authorized lead access', async () => {
  for (const change of [
    s => { s.lead.vendor.is_inventory_enabled = false; },
    s => { s.lead.is_blocked = true; },
    s => { s.user.franchise_id = 6; },
    s => { s.user.user_type.user_type = 'auditor'; },
    s => { s.user.user_type.user_type = 'custom'; },
  ]) {
    const s = setup();
    change(s);
    await assert.rejects(s.run());
    assert.equal(s.state().cards.length, 0);
  }
});

test('a failed material update rolls back card creation', async () => {
  const s = setup();
  s.failUpdate();
  await assert.rejects(s.run(), /write failed/);
  assert.equal(s.state().cards.length, 0);
  assert.ok(s.state().rows.every(row => row.order_login_id === null));
});
