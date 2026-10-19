const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { transformSync } = require('@swc/core');
const path = require('node:path');

function setup({ existing = null, inUse = 0, validLead = true, failInsert = false } = {}) {
  const calls = { projects: [], deletes: [], rows: [], committed: false };
  const project = { id: 17, unique_project_id: 'existing', project_name: 'Existing project' };
  const tx = {
    $queryRaw: async () => [],
    projectMaster: {
      findFirst: async () => existing,
      create: async ({ data }) => { calls.projects.push(data); return { ...project, ...data }; },
    },
    cutList: {
      count: async () => inUse,
      deleteMany: async ({ where }) => { calls.deletes.push(where); return { count: 2 }; },
      createManyAndReturn: async ({ data }) => { if (failInsert) throw new Error('insert failed'); calls.rows.push(...data); return [{ id: 100 }]; },
      update: async () => ({}),
    },
  };
  const prisma = {
    userMaster: { findFirst: async () => ({ id: 5 }) },
    leadMaster: { findFirst: async () => validLead ? { id: 414, lead_code: 'L414', firstname: 'Test', lastname: 'Client', contact_no: '123', site_address: 'Site' } : null },
    $transaction: async fn => { const result = await fn(tx); calls.committed = true; return result; },
  };
  const file = path.join(__dirname, '../src/services/production/pre-production/MetalCutlist.service.ts');
  const { code } = transformSync(readFileSync(file, 'utf8'), { filename: file, jsc: { parser: { syntax: 'typescript' }, target: 'es2020' }, module: { type: 'commonjs' } });
  const deps = {
    '../../../prisma/generated': { FabricationType: { METALWORK: 'METALWORK' } },
    '../../../prisma/client': { prisma },
    '../../../utils/logger': { info() {} },
    '../../../utils/wasabiClient': { uploadToWasabiMetalCutlistImage: async () => 'image-key' },
  };
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)(id => deps[id] ?? require(id), module, module.exports);
  return { service: new module.exports.MetalCutlistService(), calls, project };
}
const parts = [{ part_name: 'Bracket', length: 50, width: 25, qty: 3, image_index: 0 }];
const save = service => service.saveMetalCutlist(1, 414, 5, parts, [{ buffer: Buffer.from('image') }]);

test('creates a lead-linked project and saves Metalwork parts in the same transaction', async () => {
  const { service, calls } = setup();
  const result = await save(service);
  assert.equal(result.projectCreated, true);
  assert.equal(calls.projects.length, 1);
  assert.equal(calls.projects[0].lead_id, 414);
  assert.equal(calls.projects[0].vendor_id, 1);
  assert.equal(calls.projects[0].client_name, 'Test Client');
  assert.equal(calls.projects[0].order_no, 'L414');
  assert.ok(calls.projects[0].unique_project_id);
  assert.equal(calls.rows[0].project_id, result.project.id);
  assert.equal(calls.rows[0].fabrication, 'METALWORK');
  assert.equal(calls.rows[0].image_key, 'image-key');
  assert.equal(calls.committed, true);
});
test('reuses an existing project and replaces only Metalwork rows', async () => {
  const existing = { id: 22, unique_project_id: 'woodwork', project_name: 'Woodwork project' };
  const { service, calls } = setup({ existing });
  const result = await save(service);
  assert.equal(result.projectCreated, false);
  assert.deepEqual(result.project, existing);
  assert.equal(calls.projects.length, 0);
  assert.deepEqual(calls.deletes, [{ vendor_id: 1, project_id: 22, fabrication: 'METALWORK' }]);
});
test('rejects replacement of parts already in production', async () => {
  const { service, calls } = setup({ existing: { id: 22 }, inUse: 1 });
  await assert.rejects(save(service), /already in production/);
  assert.equal(calls.deletes.length, 0);
  assert.equal(calls.committed, false);
});
test('rejects a lead belonging to another vendor before creating a project', async () => {
  const { service, calls } = setup({ validLead: false });
  await assert.rejects(save(service), /Invalid lead_id/);
  assert.equal(calls.projects.length, 0);
});
test('propagates failed cutlist insertion without committing project creation', async () => {
  const { service, calls } = setup({ failInsert: true });
  await assert.rejects(save(service), /insert failed/);
  assert.equal(calls.committed, false);
});
