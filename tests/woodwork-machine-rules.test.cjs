const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { transformSync } = require('@swc/core');
const path = require('node:path');

function load(file, dependencies) {
  const filename = path.join(__dirname, '../src/services/trackTraceServices', file);
  const { code } = transformSync(readFileSync(filename, 'utf8'), {
    filename, jsc: { parser: { syntax: 'typescript' }, target: 'es2020' }, module: { type: 'commonjs' },
  });
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)(id => {
    if (!(id in dependencies)) throw new Error(`Unexpected dependency: ${id}`);
    return dependencies[id];
  }, module, module.exports);
  return module.exports;
}
const machines = [
  { id: 1, machine_type_id: 3, sequence_no: 1 },
  { id: 2, machine_type_id: 7, sequence_no: 2 },
  { id: 3, machine_type_id: 18, sequence_no: 3 },
];
function rule(id, machineId, action, condition = null, value = null) {
  return { id, machine_id: machineId, rule_name: `Rule ${id}`, rule_code: `R${id}`,
    conditionGroups: condition ? [{ conditions: [condition] }] : [],
    actions: [{ actionMaster: { action_code: action }, action_value: value }] };
}
function setup(rules = []) {
  const queries = [];
  const engine = load('cutListRuleEngine.service.ts', { '../../prisma/client': {
    prisma: { cutListRuleMaster: { findMany: async query => { queries.push(query); return rules; } } },
  } });
  const service = load('woodwork-machine-rules.service.ts', { './cutListRuleEngine.service': engine });
  return { ...service, queries };
}
test('default and unset vendors retain existing routing without querying rules', async () => {
  const { loadWoodworkMachineRules, queries } = setup();
  for (const mode of ['default', null, undefined]) assert.equal(await loadWoodworkMachineRules(mode, 7, machines), null);
  assert.equal(queries.length, 0);
});
test('both rule mode spellings load active vendor rules once for the enabled machines', async () => {
  for (const mode of ['rule manage', 'rule_manage']) {
    const { loadWoodworkMachineRules, queries } = setup();
    const assign = await loadWoodworkMachineRules(mode, 7, machines);
    assert.deepEqual(assign({ thickness: 5 }).map(a => a.machine.id), [1, 2, 3]);
    assign({ thickness: 20 });
    assert.equal(queries.length, 1);
    assert.deepEqual(queries[0].where, { vendor_id: 7, machine_id: { in: [1, 2, 3] }, status: 'ACTIVE' });
    assert.deepEqual(queries[0].orderBy, [{ priority: 'asc' }, { id: 'asc' }]);
  }
});
test('conditions exclude matching items; first matching rule wins and provenance is retained', async () => {
  const { loadWoodworkMachineRules } = setup([
    rule(10, 2, 'DO_NOT_SEND_TO_MACHINE', { condition_type: 'COLUMN', field_key: 'thickness', operator: 'LESS_THAN', value: 9 }),
    rule(11, 2, 'SEND_TO_MACHINE'),
  ]);
  const assign = await loadWoodworkMachineRules('rule manage', 7, machines);
  assert.deepEqual(assign({ thickness: 5 }).map(a => a.machine.id), [1, 3]);
  assert.equal(assign({ thickness: 18 }).find(a => a.machine.id === 2).ruleId, 11);
});
test('replacement uses destination sequence and avoids duplicate machine assignments', async () => {
  const { loadWoodworkMachineRules } = setup([rule(10, 1, 'REPLACE_MACHINE', null, { machine_id: 3 })]);
  const assign = await loadWoodworkMachineRules('rule manage', 7, machines);
  const result = assign({});
  assert.equal(result.length, 2);
  assert.deepEqual(result.find(a => a.machine.id === 3), { machine: machines[2], ruleId: 10 });
});
test('replacement cannot target a machine outside the active vendor and enabled workstation set', async () => {
  const { loadWoodworkMachineRules } = setup([rule(10, 1, 'REPLACE_MACHINE', null, 99)]);
  const assign = await loadWoodworkMachineRules('rule manage', 7, machines);
  assert.throws(() => assign({}), /inactive, disabled, or different vendor/);
});
test('category and derived edge banding conditions are evaluated per item', async () => {
  const { loadWoodworkMachineRules } = setup([
    rule(10, 1, 'DO_NOT_SEND_TO_MACHINE', { condition_type: 'CATEGORY', operator: 'EQUALS', value: 4 }),
    rule(11, 2, 'DO_NOT_SEND_TO_MACHINE', { condition_type: 'COLUMN', field_key: 'has_edge_banding', operator: 'EQUALS', value: false }),
  ]);
  const assign = await loadWoodworkMachineRules('rule manage', 7, machines);
  assert.deepEqual(assign({ category_id: 4, has_edge_banding: false }).map(a => a.machine.id), [3]);
  assert.equal(assign({ category_id: 2, has_edge_banding: true }).length, 3);
});
