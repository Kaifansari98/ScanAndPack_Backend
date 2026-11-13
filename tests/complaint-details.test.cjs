const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const source = fs.readFileSync(path.join(__dirname, '../src/services/clientComplaints/complaintDetails.service.ts'), 'utf8');
const actor = (role = 'super-admin', actorId = 42, vendorId = 1) => ({ role, actorId, vendorId });
const plain = value => JSON.parse(JSON.stringify(value));
class ComplaintError extends Error { constructor(message, statusCode = 400) { super(message); this.statusCode = statusCode; } }
const permissions = {
  ComplaintError,
  canViewAllComplaints: role => ['super-admin', 'head-site-supervisor'].includes(role),
  canViewComplaints: role => ['super-admin', 'head-site-supervisor', 'site-supervisor'].includes(role),
};
function matches(row, where) {
  return Object.entries(where || {}).every(([key, value]) => {
    if (value === undefined) return true;
    if (key === 'OR') return value.some(clause => matches(row, clause));
    if (key === 'NOT') return value.every(clause => !matches(row, clause));
    if (value && typeof value === 'object') {
      if ('notIn' in value) return !value.notIn.includes(row[key]);
      if ('contains' in value) return String(row[key] || '').toLowerCase().includes(value.contains.toLowerCase());
      return matches(row[key] || {}, value);
    }
    return row[key] === value;
  });
}
function project(row, select) {
  if (!select || !row) return row;
  return Object.fromEntries(Object.entries(select).filter(([, value]) => value).map(([key, value]) => {
    const field = row[key];
    return [key, value === true || !field ? field : Array.isArray(field) ? field.map(child => project(child, value.select)) : project(field, value.select)];
  }));
}
function setup({ missing = false, badStorage = false } = {}) {
  const reads = [], signed = [], warnings = [];
  const row = { id: 7, vendor_id: 1, assigned_ss_id: 42, complaint_code: 'CMP1-TEST', status: 'NEW', current_cycle_id: 12, cycles: [{ id: 12, cycle_number: 2, reopened_reason: 'Same issue' }, { id: 11, cycle_number: 1 }] };
  const parent = { vendor_id: 1, complaint_id: 7 };
  const data = {
    complaintAttachment: [
      { ...parent, id: 1, cycle_id: 11, storage_key: 'private-photo', original_name: 'site.jpg', category: 'REGISTRATION' },
      { ...parent, id: 2, cycle_id: 12, storage_key: 'private-proof', original_name: 'proof.jpg', category: 'PAYMENT_PROOF' },
      { ...parent, id: 3, cycle_id: 12, storage_key: 'private-quotation', original_name: 'quotation.pdf', category: 'QUOTATION' },
      { ...parent, id: 4, vendor_id: 2, storage_key: 'another-vendor', category: 'REGISTRATION' },
    ],
    complaintVisit: [{ ...parent, id: 4, cycle_id: 11, visit_number: 1, standard_fee: '800.00' }, { ...parent, id: 5, cycle_id: 12, visit_number: 2, standard_fee: '0.00' }],
    complaintQuotation: [{ ...parent, id: 8, cycle_id: 12, total_amount: '1000.00', items: [] }],
    complaintPayment: [{ ...parent, id: 9, cycle_id: 12, amount: '800.00', allocations: [] }],
    complaintActivityLog: Array.from({ length: 25 }, (_, i) => ({ ...parent, id: i + 1, cycle_id: i < 3 ? 11 : 12, action: i === 24 ? 'PAYMENT_RECEIVED' : 'COMPLAINT_REGISTERED', remarks: i === 23 ? 'Window hinge issue' : null, payment_id: i === 24 ? 9 : null, quotation_id: null, metadata: { private: 'not for API' }, actor: { id: 42, user_name: 'Supervisor' }, cycle: { cycle_number: i < 3 ? 1 : 2 } })),
  };
  const prisma = new Proxy({}, { get(_, table) {
    return {
      async findFirst(query) { reads.push({ table, ...plain(query) }); return !missing && matches(row, query.where) ? project(row, query.select) : null; },
      async findMany(query) { reads.push({ table, ...plain(query) }); let rows = (data[table] || []).filter(record => matches(record, query.where)); if (query.orderBy?.some?.(order => order.id === 'desc')) rows = [...rows].reverse(); return rows.slice(query.skip || 0, query.take ? (query.skip || 0) + query.take : undefined).map(record => project(record, query.select)); },
      async count(query) { reads.push({ table, count: true, ...plain(query) }); return (data[table] || []).filter(record => matches(record, query.where)).length; },
      async groupBy(query) { reads.push({ table, ...plain(query) }); return []; },
    };
  }});
  const exports = {};
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    exports,
    require(name) {
      if (name.includes('prisma/client')) return { prisma };
      if (name.includes('wasabiClient')) return { generateSignedUrl: async (key, expires, disposition, filename) => { signed.push({ key, expires, disposition, filename }); if (badStorage && key === 'private-photo') throw Error('Storage failed'); return `https://storage.test/${key}`; } };
      if (name.includes('logger')) return { default: { warn: (...args) => warnings.push(args) } };
      if (name.includes('clientComplaints.service')) return permissions;
      throw Error(name);
    },
  });
  return { ...exports, reads, signed, warnings };
}

test('HSS and Super Admin receive both complaint cycles and scoped stage records', async () => {
  for (const role of ['super-admin', 'head-site-supervisor']) {
    const service = setup();
    const result = await service.getComplaintDetail(actor(role), 7);
    assert.equal(result.permissions.can_view_financial, true);
    assert.deepEqual(result.cycles.map(row => row.cycle_number), [2, 1]);
    assert.equal(result.visits.length, 2);
    assert.equal(result.quotations.length, 1);
    assert.equal(result.payments.length, 1);
    assert.equal(result.attachments.length, 3);
    assert.equal(service.signed.length, 3);
    for (const query of service.reads.slice(1)) { assert.equal(query.where.vendor_id, 1); assert.equal(query.where.complaint_id, 7); }
    assert.equal(JSON.stringify(result).includes('storage_key'), false);
    assert.equal(result.inspections.length, 0);
    assert.equal(result.closures.length, 0);
  }
});
test('assigned supervisor can view the complaint but financial records and proof URLs are excluded', async () => {
  const service = setup();
  const result = await service.getComplaintDetail(actor('site-supervisor'), 7);
  assert.equal(result.permissions.can_view_financial, false);
  assert.equal(result.attachments.length, 1);
  assert.equal(result.visits[0].standard_fee, undefined);
  assert.deepEqual(plain(result.quotations), []);
  assert.deepEqual(plain(result.payments), []);
  assert.equal(service.reads.some(query => ['complaintQuotation', 'complaintPayment', 'complaintCharge'].includes(query.table)), false);
  assert.deepEqual(service.signed.map(file => file.key), ['private-photo']);
  assert.equal(service.reads[0].where.assigned_ss_id, 42);
});
test('wrong vendor, unassigned supervisor and missing complaint cannot read children or sign files', async () => {
  for (const user of [actor('super-admin', 42, 2), actor('site-supervisor', 43)]) {
    const service = setup();
    await assert.rejects(() => service.getComplaintDetail(user, 7), { statusCode: 404 });
    assert.equal(service.reads.length, 1); assert.equal(service.signed.length, 0);
  }
  const service = setup({ missing: true });
  await assert.rejects(() => service.getComplaintActivity(actor(), 7, {}), { statusCode: 404 });
  assert.equal(service.reads.length, 1);
});
test('unsupported roles and malformed complaint IDs are rejected before database reads', async () => {
  const service = setup();
  await assert.rejects(() => service.getComplaintDetail(actor('sales-executive'), 7), { statusCode: 403 });
  for (const id of [0, -1, NaN, 1.5]) await assert.rejects(() => service.getComplaintDetail(actor(), id), { statusCode: 400 });
  assert.equal(service.reads.length, 0);
});
test('a failed signed URL does not hide the complaint or other files', async () => {
  const service = setup({ badStorage: true });
  const result = await service.getComplaintDetail(actor(), 7);
  assert.equal(result.attachments[0].url, null);
  assert.ok(result.attachments[1].url);
  assert.equal(service.warnings.length, 1);
  assert.equal(JSON.stringify(result).includes('storage_key'), false);
  assert.equal(service.signed[0].expires, 3600);
  assert.equal(service.signed[0].disposition, 'inline');
});
test('activity pagination is deterministic and returns no raw metadata', async () => {
  const service = setup();
  const result = await service.getComplaintActivity(actor(), 7, { page: 2, limit: 20 });
  assert.equal(result.total, 25); assert.equal(result.rows.length, 5);
  assert.equal(result.rows[0].id, 5); assert.equal(result.rows[4].id, 1);
  assert.equal(JSON.stringify(result).includes('metadata'), false);
  const history = service.reads.find(query => query.table === 'complaintActivityLog' && !query.count);
  assert.deepEqual(history.orderBy, [{ created_at: 'desc' }, { id: 'desc' }]);
});
test('cycle and search filters apply equally to history rows and totals', async () => {
  const service = setup();
  const first = await service.getComplaintActivity(actor(), 7, { cycle_id: '11' });
  assert.equal(first.total, 3); assert.equal(first.rows.length, 3);
  const searched = await service.getComplaintActivity(actor(), 7, { search: 'hinge' });
  assert.equal(searched.total, 1); assert.equal(searched.rows[0].id, 24);
  const queries = service.reads.filter(query => query.table === 'complaintActivityLog').slice(-2);
  assert.deepEqual(queries[0].where, queries[1].where);
});
test('supervisor history omits financial events and linked financial actions', async () => {
  const service = setup();
  const result = await service.getComplaintActivity(actor('site-supervisor'), 7, {});
  assert.equal(result.total, 24);
  assert.equal(result.rows.some(row => row.action === 'PAYMENT_RECEIVED'), false);
  assert.equal(service.reads[0].where.assigned_ss_id, 42);
});
test('invalid pagination and cycle values do not execute a history query', async () => {
  for (const query of [{ page: 0 }, { page: 1.5 }, { limit: 101 }, { limit: 'NaN' }, { page: Number.MAX_SAFE_INTEGER, limit: 100 }, { cycle_id: -1 }, { cycle_id: 1.5 }]) {
    const service = setup();
    await assert.rejects(() => service.getComplaintActivity(actor(), 7, query), { statusCode: 400 });
    assert.equal(service.reads.length, 1);
  }
});

function controllerSetup({ enabled = true } = {}) {
  const called = [], exports = {};
  const controller = fs.readFileSync(path.join(__dirname, '../src/controllers/clientComplaints/clientComplaints.controller.ts'), 'utf8');
  vm.runInNewContext(ts.transpileModule(controller, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    exports,
    require(name) {
      if (name.includes('complaintLeadPicker.service')) return { getComplaintLeadOptions: async () => ({}), getComplaintLeadFranchises: async () => [] };
      if (name.includes('complaintDetails.service')) return { getComplaintDetail: async (...args) => { called.push(args); return { id: 7 }; }, getComplaintActivity: async (...args) => { called.push(args); return { rows: [], total: 0 }; } };
      if (name.includes('clientComplaints.service')) return { ...permissions, requireComplaintsVendor: async id => { called.push(['vendor', id]); if (!enabled) throw new ComplaintError('Complaints are disabled.', 403); } };
      if (name.includes('logger')) return { default: { error() {} } };
      throw Error(name);
    },
  });
  const res = { statusCode: 200, status(value) { this.statusCode = value; return this; }, json(value) { this.body = value; return this; } };
  const request = { user: { vendor_id: 1, id: 42, user_type: 'super-admin' }, params: { vendorId: '1', complaintId: '7' }, query: {} };
  return { ...exports, called, res, request };
}
test('controller rejects a vendor URL that differs from the authenticated employee', async () => {
  for (const method of ['detail', 'activity', 'leadOptions', 'leadFranchises']) {
    const service = controllerSetup(); service.request.params.vendorId = '2';
    await service[method](service.request, service.res);
    assert.equal(service.res.statusCode, 403); assert.equal(service.called.length, 0);
  }
});
test('vendor feature gate denies disabled complaints before reaching detail routes', async () => {
  const service = controllerSetup({ enabled: false }); let continued = false;
  await service.checkComplaintAccess(service.request, service.res, () => { continued = true; });
  assert.equal(service.res.statusCode, 403); assert.equal(continued, false);
});
test('detail and history controllers forward the authenticated actor and validated ID', async () => {
  for (const method of ['detail', 'activity']) {
    const service = controllerSetup(); await service[method](service.request, service.res);
    assert.equal(service.res.body.success, true);
    assert.deepEqual(plain(service.called[0][0]), actor());
    assert.equal(service.called[0][1], 7);
  }
});
