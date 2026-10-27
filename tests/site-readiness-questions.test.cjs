const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { transformSync } = require('@swc/core');
const path = require('node:path');
function load(file, requireMock) {
  const filename = path.join(__dirname, '../src', file);
  const { code } = transformSync(readFileSync(filename, 'utf8'), { filename, jsc: { parser: { syntax: 'typescript' }, target: 'es2020' }, module: { type: 'commonjs' } });
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)(requireMock, module, module.exports);
  return module.exports;
}
function setup() {
  const vendors = new Map([[1, null], [2, null]]);
  const prisma = { vendorMaster: {
    findUnique: async ({ where }) => vendors.has(where.id) ? { site_readiness_questions: vendors.get(where.id) } : null,
    update: async ({ where, data }) => { vendors.set(where.id, data.site_readiness_questions); },
  } };
  const questions = load('services/installation/site-readiness/questions.ts', () => ({ prisma }));
  const controller = load('controllers/installation/site-readiness/questions.controller.ts', (id) => id.endsWith('/questions') ? questions : id.endsWith('/generated') ? { Prisma: { DbNull: null } } : { prisma });
  const request = async (method, body, vendorId = 1, role = 'admin', sessionVendor = vendorId) => {
    const res = { code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
    await controller.readinessQuestionMaster({ method, body, params: { vendorId: String(vendorId) }, user: { vendor_id: sessionVendor, user_type: role } }, res);
    return res;
  };
  return { ...questions, request };
}
test('existing six keys are defaults and preserve old answers', async () => {
  const api = setup();
  const { questions, origin } = (await api.request('GET')).body.data;
  assert.equal(origin, 'default');
  assert.equal(questions.length, 6);
  assert.equal(questions[0].key, '1st_layer_paint');
  assert.equal(api.readinessAnswersComplete(questions, questions.map(q => ({ type: q.key, value: false }))), true);
});
test('add, edit, reorder and delete persist independently for each vendor', async () => {
  const api = setup();
  const original = (await api.request('GET')).body.data.questions;
  const added = { key: 'question_unique', label: 'Power supply ready?', sort_order: 99 };
  let next = [added, ...original.slice().reverse()];
  assert.equal((await api.request('PUT', { questions: next })).code, 200);
  let saved = (await api.request('GET')).body.data;
  assert.equal(saved.origin, 'vendor');
  assert.deepEqual(saved.questions.map(q => q.key), next.map(q => q.key));
  assert.deepEqual(saved.questions.map(q => q.sort_order), [1, 2, 3, 4, 5, 6, 7]);
  assert.equal((await api.request('GET', undefined, 2)).body.data.questions.length, 6);
  next = saved.questions.slice(0, 2).map(q => q.key === added.key ? { ...q, label: 'Electrical supply ready?' } : q);
  await api.request('PUT', { questions: next });
  saved = (await api.request('GET')).body.data;
  assert.equal(saved.questions[0].key, added.key);
  assert.equal(saved.questions[0].label, 'Electrical supply ready?');
  assert.equal(saved.questions.length, 2);
});
test('completion uses current keys, accepts No, ignores removed rows and rejects missing answers', () => {
  const api = setup();
  const questions = [{ key: 'a', label: 'A', sort_order: 1 }, { key: 'b', label: 'B', sort_order: 2 }];
  assert.equal(api.readinessAnswersComplete(questions, [{ type: 'a', value: false }, { type: 'b', value: true }, { type: 'removed', value: null }]), true);
  assert.equal(api.readinessAnswersComplete(questions, [{ type: 'a', value: true }, { type: 'a', value: true }]), false);
  assert.equal(api.readinessAnswersComplete(questions, [{ type: 'a', value: null }, { type: 'a', value: true }, { type: 'b', value: true }]), false);
  assert.equal(api.readinessAnswersComplete([], []), false);
});
test('master rejects empty, duplicate and malformed questions', async () => {
  const api = setup();
  for (const questions of [[], [{ key: 'a', label: '' }], [{ key: 'a', label: 'A' }, { key: 'a', label: 'B' }], [{ key: 'a', label: 'A' }, { key: 'b', label: ' a ' }], [{ key: '../x', label: 'A' }]]) {
    assert.equal((await api.request('PUT', { questions })).code, 400);
  }
});
test('master enforces vendor ownership and admin writes, but allows checklist readers', async () => {
  const api = setup();
  assert.equal((await api.request('GET', undefined, 1, 'admin', 2)).code, 403);
  assert.equal((await api.request('PUT', { questions: api.defaultReadinessQuestions }, 1, 'site-supervisor')).code, 403);
  assert.equal((await api.request('GET', undefined, 1, 'site-supervisor')).code, 200);
  assert.equal((await api.request('DELETE', undefined, 1, 'site-supervisor')).code, 403);
});
test('reset restores original keys and order', async () => {
  const api = setup();
  await api.request('PUT', { questions: [{ key: 'new', label: 'New' }] });
  const reset = await api.request('DELETE');
  assert.equal(reset.body.data.origin, 'default');
  assert.deepEqual(reset.body.data.questions, api.defaultReadinessQuestions);
});
