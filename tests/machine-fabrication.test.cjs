const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { transformSync } = require('@swc/core');
const path = require('node:path');
function setup() {
  const writes = [];
  const prisma = { machineMaster: {
    findFirst: async ({ where }) => where.id ? { id: where.id, machine_code: 'SAW', status: 'ACTIVE' } : null,
    create: async ({ data }) => { writes.push(data); return { id: 1, fabrication: 'WOODWORK', ...data }; },
    update: async ({ data }) => { writes.push(data); return { id: 1, fabrication: 'METALWORK', ...data }; },
    findMany: async () => [{ id: 1, fabrication: 'METALWORK', image_path: null, machineType: { machine_type: 'Cutting' } }],
  } };
  const file = path.join(__dirname, '../src/services/trackTraceServices/trackTraceMasterService.ts');
  const { code } = transformSync(readFileSync(file, 'utf8'), { filename: file, jsc: { parser: { syntax: 'typescript' }, target: 'es2020' }, module: { type: 'commonjs' } });
  const dependencies = {
    '../../../src/prisma/client': { prisma },
    '../../../src/utils/logger': { info() {}, error() {} },
    '../../../src/utils/wasabiClient': { generateSignedUrl: async key => key },
    '../../../generated/prisma_client/client': { MachineStatus: { ACTIVE: 'ACTIVE' }, ScanType: { IN: 'IN' } },
  };
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)(id => { if (!(id in dependencies)) throw Error(id); return dependencies[id]; }, module, module.exports);
  return { service: module.exports.TrackTraceMasterService, writes };
}
const data = { machine_name: 'Saw', machine_code: 'SAW', machine_type_id: 3, status: 'ACTIVE', scan_type: 'IN', vendor_id: 1, created_by: 1, updated_by: 1, sequence_no: 1, target_per_hour: 10, image_path: 'image' };
test('creates both enum types and leaves legacy creates at the Woodwork database default', async () => {
  const { service } = setup();
  for (const fabrication of ['WOODWORK', 'METALWORK', undefined]) {
    const result = await service.createMachine({ ...data, ...(fabrication && { fabrication }) });
    assert.equal(result.fabrication, fabrication ?? 'WOODWORK');
  }
});
test('updates classification explicitly and preserves it when old clients omit it', async () => {
  const { service, writes } = setup();
  await service.updateMachine(1, 1, { ...data, fabrication: 'WOODWORK' });
  assert.equal(writes[0].fabrication, 'WOODWORK');
  await service.updateMachine(1, 1, data);
  assert.equal(Object.hasOwn(writes[1], 'fabrication'), false);
});
test('rejects invalid enum values before writing', async () => {
  const { service, writes } = setup();
  await assert.rejects(service.createMachine({ ...data, fabrication: 'OTHER' }), /Machine Type/);
  await assert.rejects(service.updateMachine(1, 1, { ...data, fabrication: '' }), /Machine Type/);
  assert.equal(writes.length, 0);
});
test('vendor listing retains fabrication alongside the existing workstation type', async () => {
  const { service } = setup();
  const rows = await service.getMachinesByVendor(1);
  assert.equal(rows[0].fabrication, 'METALWORK');
  assert.equal(rows[0].machine_type, 'Cutting');
});
