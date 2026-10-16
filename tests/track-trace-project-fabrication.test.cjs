const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { transformSync } = require('@swc/core');
const path = require('node:path');

const projects = [
  { id: 1, vendor_id: 7, isDeleted: false, parts: ['WOODWORK'] },
  { id: 2, vendor_id: 7, isDeleted: false, parts: ['METALWORK'] },
  { id: 3, vendor_id: 7, isDeleted: false, parts: ['WOODWORK', 'METALWORK'] },
  { id: 4, vendor_id: 7, isDeleted: false, parts: [] },
  { id: 5, vendor_id: 8, isDeleted: false, parts: ['WOODWORK', 'METALWORK'] },
  { id: 6, vendor_id: 7, isDeleted: true, parts: ['WOODWORK', 'METALWORK'] },
];
function setup() {
  const queries = [];
  const matching = where => projects.filter(p => p.vendor_id === where.vendor_id &&
    (where.isDeleted === undefined || p.isDeleted === where.isDeleted) &&
    (!where.CutList || p.parts.includes(where.CutList.some.fabrication)));
  const prisma = {
    projectMaster: {
      count: async ({ where }) => { queries.push(where); return matching(where).length; },
      findMany: async ({ where, skip, take }) => { queries.push(where); return matching(where).slice(skip, skip + take); },
    },
    $transaction: async queries => Promise.all(queries),
  };
  const file = path.join(__dirname, '../src/services/projectServices/project.service.ts');
  const { code } = transformSync(readFileSync(file, 'utf8'), { filename: file, jsc: { parser: { syntax: 'typescript' }, target: 'es2020' }, module: { type: 'commonjs' } });
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)(id => id === '../../prisma/client' ? { prisma } : require(id), module, module.exports);
  return { list: module.exports.getAllProjectsTrackTrace, queries };
}
for (const [fabrication, ids] of [['WOODWORK', [1, 3]], ['METALWORK', [2, 3]]]) {
  test(`${fabrication} includes matching and mixed projects, excludes empty, other-vendor and deleted projects`, async () => {
    const { list, queries } = setup();
    const result = await list(7, { fabrication });
    assert.deepEqual(result.projects.map(p => p.id), ids);
    assert.equal(result.pagination.total, 2);
    assert.deepEqual(queries[0].CutList, { some: { vendor_id: 7, fabrication } });
    assert.deepEqual(queries[0], queries[1]);
  });
}
test('pagination counts matching projects before slicing the page', async () => {
  const { list } = setup();
  const result = await list(7, { fabrication: 'METALWORK', page: 2, limit: 1 });
  assert.deepEqual(result.projects.map(p => p.id), [3]);
  assert.equal(result.pagination.total, 2);
  assert.equal(result.pagination.totalPages, 2);
});
test('unfiltered API callers retain access to all project types', async () => {
  const { list } = setup();
  assert.deepEqual((await list(7)).projects.map(p => p.id), [1, 2, 3, 4]);
});
