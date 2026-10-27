const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { transformSync } = require('@swc/core');
const filename = path.join(__dirname, '../src/services/production/pre-production/deletePreProductionFile.ts');
const { code } = transformSync(fs.readFileSync(filename, 'utf8'), { filename, jsc: { parser: { syntax: 'typescript' }, target: 'es2020' }, module: { type: 'commonjs' } });
function matches(row, where) {
  return Object.entries(where).every(([key, value]) => {
    if (key === 'OR') return value.some(condition => matches(row, condition));
    if (value && typeof value === 'object') {
      if ('in' in value) return value.in.includes(row[key]);
      if ('not' in value) return row[key] !== value.not;
      return matches(row[key] ?? {}, value);
    }
    return row[key] === value;
  });
}
const doc = (id, instance = 10, vendor = 1) => ({ id, vendor_id: vendor, lead_id: 2, product_structure_instance_id: instance, is_deleted: false, documentType: { tag: 'Type 38' } });
const project = (id, instance = 10, vendor = 1) => ({ id, vendor_id: vendor, lead_id: 2, instance_id: instance, isDeleted: false });
const row = (id, project_id, source_document_id, fabrication = 'WOODWORK', vendor_id = 1) => ({ id, vendor_id, project_id, source_document_id, fabrication });
function setup(override = {}, failAt) {
  let state = { leadDocuments: [doc(1), doc(2), doc(3, 20), doc(4, null), doc(5, 10, 9)], projectMaster: [project(100), project(200, 20), project(300, null), project(400, 10, 9)], cutList: [row(11, 100, 1), row(12, 100, 2, 'METALWORK'), row(13, 200, 3), row(14, 300, 4), row(15, 400, 5, 'WOODWORK', 9)], cutListMachineMapping: [{ id: 21, cut_list_id: 11, vendor_id: 1 }, { id: 22, cut_list_id: 12, vendor_id: 1 }], defectedItem: [{ id: 31, vendor_id: 1, cut_list_id: 11, cut_list_machine_mapping_id: 21 }], defectedItemImage: [{ id: 41, defected_item_id: 31 }], defectCompletionPhoto: [{ id: 51, vendor_id: 1, cut_list_id: 11, cut_list_machine_mapping_id: 21, defected_item_id: 31 }], ...override };
  const tx = { $queryRaw: async () => [] };
  for (const key of Object.keys(state)) tx[key] = {
    findFirst: async ({ where }) => state[key].find(item => matches(item, where)),
    findMany: async ({ where }) => state[key].filter(item => matches(item, where)),
    count: async ({ where }) => state[key].filter(item => matches(item, where)).length,
    deleteMany: async ({ where }) => { if (failAt === key) throw new Error('Delete failed'); state[key] = state[key].filter(item => !matches(item, where)); },
    update: async ({ where, data }) => { const item = state[key].find(item => matches(item, where)); Object.assign(item, data); return item; },
    updateMany: async ({ where, data }) => { state[key].filter(item => matches(item, where)).forEach(item => Object.assign(item, data)); },
  };
  const prisma = { $transaction: async fn => { const snapshot = structuredClone(state); try { return await fn(tx); } catch (error) { state = snapshot; throw error; } } };
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)(() => ({ prisma }), module, module.exports);
  return { remove: module.exports.deletePreProductionFile, state: () => state };
}
test('deletes only source woodwork rows, mappings and dependent defects while preserving metalwork', async () => {
  const { remove, state } = setup();
  await remove(1, 1, 7);
  assert.deepEqual(state().cutList.map(r => r.id), [12, 13, 14, 15]);
  assert.deepEqual(state().cutListMachineMapping.map(r => r.id), [22]);
  assert.equal(state().defectedItem.length, 0);
  assert.equal(state().defectCompletionPhoto.length, 0);
  assert.equal(state().defectedItemImage.length, 0);
  assert.equal(state().projectMaster[0].isDeleted, false);
  assert.equal(state().leadDocuments[0].is_deleted, true);
});
test('last file deletes only its instance project and remaining cutlist; other instances and lead-level projects survive', async () => {
  const { remove, state } = setup();
  await remove(1, 1, 7);
  await remove(1, 2, 7);
  assert.deepEqual(state().cutList.map(r => r.id), [13, 14, 15]);
  assert.deepEqual(state().projectMaster.map(p => p.isDeleted), [true, false, false, false]);
  assert.equal(state().cutListMachineMapping.length, 0);
});
test('metalwork file deletes only metalwork rows when woodwork file remains', async () => {
  const { remove, state } = setup();
  await remove(1, 2, 7);
  assert.deepEqual(state().cutList.map(r => r.id), [11, 13, 14, 15]);
  assert.equal(state().projectMaster[0].isDeleted, false);
});
test('lead-level file cleanup never selects instance projects', async () => {
  const { remove, state } = setup();
  await remove(1, 4, 7);
  assert.deepEqual(state().projectMaster.map(p => p.isDeleted), [false, false, true, false]);
  assert.ok(state().cutList.some(r => r.id === 11));
});
test('ambiguous legacy files are not guessed; last legacy file can be removed', async () => {
  const blocked = setup({ cutList: [row(11, 100, null)] });
  await assert.rejects(blocked.remove(1, 1, 7), error => error.statusCode === 409);
  assert.equal(blocked.state().leadDocuments[0].is_deleted, false);
  const last = setup({ leadDocuments: [doc(1)], cutList: [row(11, 100, null)] });
  await last.remove(1, 1, 7);
  assert.equal(last.state().cutList.length, 0);
  assert.equal(last.state().projectMaster[0].isDeleted, true);
});
test('failed mapping deletion rolls back file, project and related rows', async () => {
  const { remove, state } = setup({}, 'cutListMachineMapping');
  await assert.rejects(remove(1, 1, 7));
  assert.equal(state().leadDocuments[0].is_deleted, false);
  assert.equal(state().defectedItem.length, 1);
  assert.equal(state().cutList.length, 5);
});
test('wrong vendor and repeated deletion do not touch other records', async () => {
  const { remove, state } = setup();
  await assert.rejects(remove(9, 1, 7));
  await remove(1, 1, 7);
  await assert.rejects(remove(1, 1, 7));
  assert.equal(state().cutList.length, 4);
});
