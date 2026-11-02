const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function setup(assignments, legacy, handlesLargeScaleProjects = false) {
  let legacyReads = 0;
  const calls = [];
  const prisma = {
    vendorMaster: { findUnique: async ({ where }) => {
      assert.equal(where.id, 2);
      return handlesLargeScaleProjects === null ? null : { handlesLargeScaleProjects };
    } },
    leadUserMapping: { findFirst: async (query) => {
      calls.push(query);
      return assignments.filter(row => Object.entries(query.where).every(([key, value]) => row[key] === value))
        .sort((a, b) => b.updated_at - a.updated_at || b.id - a.id)[0] ?? null;
    } },
    leadSiteSupervisorMapping: { findFirst: async (query) => {
      legacyReads++;
      calls.push(query);
      return legacy;
    } },
  };
  const source = fs.readFileSync(path.join(__dirname, '../src/services/installation/site-readiness/SiteReadiness.service.ts'), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports, require: name => {
    if (name.endsWith('/prisma/client')) return { prisma };
    if (name.endsWith('/leadSuperAdminApprovalLockIn.service')) return { LeadSuperAdminApprovalLockInService: class {} };
    return {};
  } });
  return { service: new exports.SiteReadinessService(), calls, legacyReads: () => legacyReads };
}

const assignment = (extra = {}) => ({ id: 1, vendor_id: 2, lead_id: 3, type: 'site-supervisor',
  status: 'active', user_id: 9, updated_at: 1, user: { id: 9, user_name: 'New supervisor' }, ...extra });

test('current lead assignment overrides stale installation supervisor and preserves response shape', async () => {
  const s = setup([assignment()], { user_id: 8, supervisor: { id: 8 } });
  const result = await s.service.getAssignedSiteSupervisor(2, 3);
  assert.equal(result.user_id, 9);
  assert.equal(result.supervisor.user_name, 'New supervisor');
  assert.equal(result.user, undefined);
  assert.equal(s.legacyReads(), 0);
});

test('ignores inactive, other-role, other-lead and other-vendor assignments', async () => {
  const s = setup([assignment({ status: 'inactive' }), assignment({ type: 'head-site-supervisor' }),
    assignment({ vendor_id: 4 }), assignment({ lead_id: 5 }), assignment({ id: 10, user_id: 11 })], null);
  assert.equal((await s.service.getAssignedSiteSupervisor(2, 3)).user_id, 11);
  assert.equal(s.legacyReads(), 0);
});

test('uses most recently updated active assignment when old duplicate mappings exist', async () => {
  const s = setup([assignment(), assignment({ id: 2, user_id: 10, updated_at: 2 })], null);
  assert.equal((await s.service.getAssignedSiteSupervisor(2, 3)).user_id, 10);
});

test('legacy leads still resolve using their installation mapping', async () => {
  const legacy = { user_id: 8, supervisor: { id: 8 } };
  const s = setup([], legacy);
  assert.equal(await s.service.getAssignedSiteSupervisor(2, 3), legacy);
  assert.equal(s.legacyReads(), 1);
  assert.equal(s.calls[1].where.vendor_id, 2);
  assert.equal(s.calls[1].where.lead_id, 3);
  assert.equal(s.calls[1].where.status, 'active');
});

test('returns null for unassigned leads and validates required identifiers', async () => {
  const s = setup([], null);
  assert.equal(await s.service.getAssignedSiteSupervisor(2, 3), null);
  await assert.rejects(s.service.getAssignedSiteSupervisor(0, 3), { statusCode: 400 });
  await assert.rejects(s.service.getAssignedSiteSupervisor(2, 0), { statusCode: 400 });
});

test('large-scale and missing vendors retain installation-specific assignment even when lead assignment differs', async () => {
  for (const flag of [true, null]) {
    const legacy = { user_id: 8, supervisor: { id: 8 } };
    const s = setup([assignment()], legacy, flag);
    assert.equal(await s.service.getAssignedSiteSupervisor(2, 3), legacy);
    assert.equal(s.legacyReads(), 1);
    assert.equal(s.calls.length, 1);
  }
});
