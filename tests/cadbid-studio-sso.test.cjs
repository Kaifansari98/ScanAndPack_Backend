const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { transformSync } = require('@swc/core');
const filename = path.join(__dirname, '../src/controllers/cadbid/cadbid.controller.ts');
const { code } = transformSync(fs.readFileSync(filename, 'utf8'), {
  filename, jsc: { parser: { syntax: 'typescript' }, target: 'es2020' }, module: { type: 'commonjs' },
});
async function launch(body = {}, overrides = {}) {
  let leadWhere;
  let tickets = 0;
  const services = {
    getUserCadbidToken: async () => 'private-key',
    checkStudioAccess: async () => ({ eligible: true }),
    requestStudioSsoTicket: async () => { tickets++; return { ticket: 'ticket&value' }; },
    getStudioBaseUrl: () => 'https://studio.example.test',
    ...overrides.services,
  };
  const prisma = {
    userMaster: { findUnique: async () => ({ vendor_id: 7 }) },
    leadMaster: { findFirst: async ({ where }) => {
      leadWhere = where;
      return Object.hasOwn(overrides, 'lead') ? overrides.lead : { cadbid_customer_id: 91, firstname: 'A & B', lastname: '客户 #1' };
    } },
  };
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)(
    name => name.includes('cadbid.service') ? services : { prisma }, module, module.exports,
  );
  const response = { status(value) { this.statusCode = value; return this; }, json(value) { this.body = value; return this; } };
  await module.exports.getStudioSsoUrlController({ user: { id: 5 }, body }, response);
  return { ...response, leadWhere, tickets };
}
test('dashboard launch keeps SSO ticket and no editor destination', async () => {
  const result = await launch();
  const url = new URL(result.body.data.url);
  assert.equal(result.statusCode, 200);
  assert.equal(url.searchParams.get('ticket'), 'ticket&value');
  assert.equal(url.searchParams.has('next'), false);
  assert.equal(result.leadWhere, undefined);
});
test('design launch uses vendor-scoped Cadbid customer ID with safely nested name', async () => {
  const result = await launch({ leadId: 593 });
  assert.deepEqual(result.leadWhere, { id: 593, vendor_id: 7, is_deleted: false });
  const url = new URL(result.body.data.url);
  const editor = new URL(url.searchParams.get('next'), url.origin);
  assert.equal(url.pathname, '/sso');
  assert.equal(url.searchParams.get('ticket'), 'ticket&value');
  assert.equal(editor.pathname, '/editor');
  assert.equal(editor.searchParams.get('customerId'), '91');
  assert.equal(editor.searchParams.get('customerName'), 'A & B 客户 #1');
});
test('missing customer link does not launch an unrelated project', async () => {
  const result = await launch({ leadId: 593 }, { lead: { cadbid_customer_id: null } });
  assert.equal(result.statusCode, 409);
  assert.equal(result.tickets, 0);
});
test('missing or inaccessible lead and invalid IDs are rejected', async () => {
  assert.equal((await launch({ leadId: 593 }, { lead: null })).statusCode, 404);
  for (const leadId of [0, -1, 'oops', 1.5]) assert.equal((await launch({ leadId })).statusCode, 400);
});
test('disconnected and ineligible accounts cannot launch Studio', async () => {
  assert.equal((await launch({ leadId: 593 }, { services: { getUserCadbidToken: async () => null } })).statusCode, 400);
  assert.equal((await launch({ leadId: 593 }, { services: { checkStudioAccess: async () => ({ eligible: false }) } })).statusCode, 403);
});
