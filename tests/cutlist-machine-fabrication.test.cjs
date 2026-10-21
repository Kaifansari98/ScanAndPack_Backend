const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { transformSync } = require('@swc/core');

function setup() {
  const machines = [
    { id: 1, vendor_id: 7, fabrication: 'WOODWORK', machine_code: 'SAW', machine_type_id: 3 },
    { id: 2, vendor_id: 7, fabrication: 'METALWORK', machine_code: 'LASER', machine_type_id: 3 },
    { id: 3, vendor_id: 8, fabrication: 'METALWORK', machine_code: 'OTHER', machine_type_id: 3 },
  ];
  const mappings = machines.slice(0, 2).map(m => ({ id: m.id, machine_id: m.id, actual_in_at: null, actual_out_at: null, status: 'Pending' }));
  const prisma = {
    projectMaster: { findFirst: async () => ({ id: 10, packing_type: 'DEFAULT' }) },
    machineMaster: { findMany: async ({ where }) => machines.filter(m => m.vendor_id === where.vendor_id && (!where.fabrication || m.fabrication === where.fabrication)) },
    cutList: { findMany: async () => [
      { id: 11, fabrication: 'WOODWORK', cutListMachineMapping: mappings },
      { id: 12, fabrication: 'METALWORK', cutListMachineMapping: mappings },
    ] },
    cutListMachineMapping: { count: async () => 0 },
  };
  const source = fs.readFileSync(path.join(__dirname, '../src/services/trackTraceServices/trackTrace.service.ts'), 'utf8');
  const start = source.indexOf('export const getCutListMachine =');
  const end = source.indexOf('export const assignMachine', start);
  const { code } = transformSync(source.slice(start, end), { jsc: { parser: { syntax: 'typescript' }, target: 'es2020' }, module: { type: 'commonjs' } });
  const module = { exports: {} };
  new Function('module', 'exports', 'prisma', 'generateSignedUrl', code)(module, module.exports, prisma, async key => key);
  return module.exports.getCutListMachine;
}
for (const [fabrication, included, excluded] of [['WOODWORK', 'SAW', 'LASER'], ['METALWORK', 'LASER', 'SAW']]) {
  test(`${fabrication} exposes only matching vendor machines and preserves rows for fabrication counts`, async () => {
    const result = await setup()(7, 'project', fabrication);
    assert.deepEqual(result.machineColumns, [included]);
    assert.equal(result.data.length, 2);
    for (const row of result.data) {
      assert.equal(row[included].assigned, true);
      assert.equal(row[included].total, 1);
      assert.equal(row[excluded], undefined);
      assert.equal(row.OTHER, undefined);
    }
  });
}
test('callers without a fabrication filter retain all vendor machine columns', async () => {
  assert.deepEqual((await setup()(7, 'project')).machineColumns, ['SAW', 'LASER']);
});
