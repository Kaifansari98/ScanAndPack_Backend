const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { transformSync } = require('@swc/core');
const path = require('node:path');

function setup() {
  const reads = [];
  const writes = [];
  const drafts = new Map();
  let sheetNames = {};
  const prisma = {
    machineMaster: { findFirst: async ({ where }) => {
      reads.push(['machine', where]);
      return [15, 16].includes(where.id) && where.vendor_id === 1 ? { id: where.id, mcp_sheet_names: sheetNames } : null;
    }, updateMany: async ({ where, data }) => {
      assert.equal(where.vendor_id, 1);
      assert.equal(where.id, 15);
      sheetNames = data.mcp_sheet_names;
      writes.push({ where, data });
      return { count: 1 };
    } },
    machineCostDescription: { findMany: async ({ where }) => {
      reads.push(['descriptions', where]);
      return [{ id: where.machine_id, description: where.machine_id === 15 ? 'Machine Transit Insurance' : 'Workstation 16 cost', sequence_no: 3, amount: '125.50' }];
    },
      updateMany: async ({ where, data }) => {
        if (where.id !== 101 || where.machine_id !== 15 || where.vendor_id !== 1) return { count: 0 };
        writes.push({ where, data });
        return { count: 1 };
      },
      findFirst: async () => ({ sequence_no: 10 }),
      upsert: async ({ where, create, update }) => {
        const key = JSON.stringify(where);
        const row = drafts.has(key) ? { ...drafts.get(key), ...update } : { id: 500, ...create };
        drafts.set(key, row);
        writes.push(row);
        return row;
      },
    },
  };
  const file = path.join(__dirname, '../src/controllers/trackTraceController/machineCost.controller.ts');
  const { code } = transformSync(readFileSync(file, 'utf8'), { filename: file, jsc: { parser: { syntax: 'typescript' }, target: 'es2020' }, module: { type: 'commonjs' } });
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)(id => {
    if (id.endsWith('/enums')) return { MachineCostSheet: { MACHINE_COST: 'MACHINE_COST' } };
    assert.equal(id, '../../prisma/client');
    return { prisma };
  }, module, module.exports);
  const res = { statusCode: 200, status(value) { this.statusCode = value; return this; }, json(value) { this.body = value; return this; } };
  return { names: module.exports.machineCostSheetNames, handler: module.exports.getMachineCostDescriptions, save: module.exports.saveMachineCostAmount, res, reads, writes, drafts };
}

test('reads only session vendor descriptions even when another vendor is supplied', async () => {
  const { handler, res, reads } = setup();
  await handler({ user: { vendor_id: 1 }, params: { machine_id: '15' }, query: { vendor_id: '2' } }, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(reads, [['machine', { id: 15, vendor_id: 1 }], ['descriptions', { vendor_id: 1, machine_id: 15, sheet: 'MACHINE_COST' }]]);
  assert.equal(res.body.data[0].description, 'Machine Transit Insurance');
  assert.equal(res.body.data[0].amount, '125.50');
});

test('another vendor cannot read workstation 15 descriptions', async () => {
  const { handler, res, reads } = setup();
  await handler({ user: { vendor_id: 2 }, params: { machine_id: '15' }, query: {} }, res);
  assert.equal(res.statusCode, 404);
  assert.equal(reads.length, 1);
});

test('requires a valid vendor session before any database reads', async () => {
  const { handler, res, reads } = setup();
  await handler({ params: { machine_id: '15' }, query: {} }, res);
  assert.equal(res.statusCode, 403);
  assert.equal(reads.length, 0);
});

test('rejects invalid workstation IDs before database reads', async () => {
  for (const machine_id of ['abc', '-1', '0', '1.5']) {
    const { handler, res, reads } = setup();
    await handler({ user: { vendor_id: 1 }, params: { machine_id } }, res);
    assert.equal(res.statusCode, 400);
    assert.equal(reads.length, 0);
  }
});

test('workstations within the same vendor load their own independent descriptions', async () => {
  const { handler, res, reads } = setup();
  await handler({ user: { vendor_id: 1 }, params: { machine_id: '16' }, query: {} }, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(reads[1], ['descriptions', { vendor_id: 1, machine_id: 16, sheet: 'MACHINE_COST' }]);
  assert.equal(res.body.data[0].description, 'Workstation 16 cost');
});

const saveRequest = (amount, overrides = {}) => ({ user: { vendor_id: 1 }, params: { machine_id: '15', description_id: '101' }, body: { amount }, ...overrides });

test('saves exact decimal, zero, and clears an amount using null', async () => {
  for (const amount of ['125.50', '0.00', null, '999999999999.99']) {
    const { save, res, writes } = setup();
    await save(saveRequest(amount), res);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(writes, [{ where: { id: 101, vendor_id: 1, machine_id: 15 }, data: { amount, formula: null, text_value: null, value_format: null } }]);
  }
});

test('rejects invalid amounts without writing', async () => {
  for (const amount of [undefined, '', '-1', '1.2345678', '1e3', 'Infinity', 25, {}, '100000000000000.00']) {
    const { save, res, writes } = setup();
    await save(saveRequest(amount), res);
    assert.equal(res.statusCode, 400);
    assert.equal(writes.length, 0);
  }
});

test('cannot save another vendor or workstation cost by changing the URL', async () => {
  for (const overrides of [
    { user: { vendor_id: 2 } },
    { params: { machine_id: '16', description_id: '101' } },
    { params: { machine_id: '15', description_id: '999' } },
  ]) {
    const { save, res, writes } = setup();
    await save(saveRequest('10.00', overrides), res);
    assert.equal(res.statusCode, 404);
    assert.equal(writes.length, 0);
  }
});

test('new row retries reuse the same record', async () => {
  const { save, res, drafts } = setup();
  const request = saveRequest('20.00', {
    params: { machine_id: '15' },
    body: { amount: '20.00', description: 'Custom setup cost', draft_key: 'f5c550b6-c374-4bfb-bd5a-e477d098229e' },
  });
  await save(request, res);
  await save(request, res);
  assert.equal(res.statusCode, 201);
  assert.equal(drafts.size, 1);
  assert.equal(res.body.data.machine_id, 15);
  assert.equal(res.body.data.vendor_id, 1);
});

test('new rows require a description and a valid draft key', async () => {
  for (const body of [{ amount: '10.00' }, { amount: '10.00', description: 'Setup' }]) {
    const { save, res, writes } = setup();
    await save(saveRequest('10.00', { params: { machine_id: '15' }, body }), res);
    assert.equal(res.statusCode, 400);
    assert.equal(writes.length, 0);
  }
});


test('saves edited descriptions on existing rows with their value and formula intact', async () => {
  const { save, res, writes } = setup();
  await save(saveRequest(null, { body: { description: '  Revised machine cost  ', formula: '=[base]*2', amount: null } }), res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(writes[0], {
    where: { id: 101, vendor_id: 1, machine_id: 15 },
    data: { description: 'Revised machine cost', amount: null, formula: '=[base]*2', text_value: null, value_format: null },
  });
  assert.equal(res.body.data.description, 'Revised machine cost');
});

test('rejects invalid description edits without writing', async () => {
  for (const description of ['', '   ', null, 123, 'a'.repeat(2001)]) {
    const { save, res, writes } = setup();
    await save(saveRequest('10', { body: { amount: '10', description } }), res);
    assert.equal(res.statusCode, 400);
    assert.equal(writes.length, 0);
  }
});

test('retrying a new row also persists its latest description', async () => {
  const { save, res, drafts } = setup();
  const request = saveRequest(null, {
    params: { machine_id: '15' },
    body: { amount: null, description: 'Original', draft_key: 'f5c550b6-c374-4bfb-bd5a-e477d098229e' },
  });
  await save(request, res);
  request.body.description = 'Updated';
  await save(request, res);
  assert.equal(res.statusCode, 201);
  assert.equal(drafts.size, 1);
  assert.equal(res.body.data.description, 'Updated');
});


test('sheet rename persists per workstation and returns it on reload', async () => {
  const { names, res, writes } = setup();
  const request = { method: 'PATCH', user: { vendor_id: 1 }, params: { machine_id: '15' }, body: { sheet: 'MACHINE_COST', name: '  Equipment Cost  ' } };
  await names(request, res);
  assert.equal(res.statusCode, 200);
  assert.equal(writes[0].data.mcp_sheet_names.MACHINE_COST, 'Equipment Cost');
  await names({ ...request, method: 'GET' }, res);
  assert.equal(res.body.data.MACHINE_COST, 'Equipment Cost');
  assert.equal(res.body.data.PROCESS_COST, 'Process Cost');
});

test('sheet rename rejects invalid and duplicate names without writing', async () => {
  for (const name of ['', '  ', 'A'.repeat(61), '[Cost]', 'Cost\nSheet', 'machine electricals']) {
    const { names, res, writes } = setup();
    await names({ method: 'PATCH', user: { vendor_id: 1 }, params: { machine_id: '15' }, body: { sheet: 'MACHINE_COST', name } }, res);
    assert.equal(res.statusCode, 400);
    assert.equal(writes.length, 0);
  }
});

test('sheet rename enforces tenant ownership and valid sheet IDs', async () => {
  for (const [vendor, sheet, status] of [[2, 'MACHINE_COST', 404], [1, 'INVALID', 400], [undefined, 'MACHINE_COST', 403]]) {
    const { names, res, writes } = setup();
    await names({ method: 'PATCH', user: { vendor_id: vendor }, params: { machine_id: '15' }, body: { sheet, name: 'Costs' } }, res);
    assert.equal(res.statusCode, status);
    assert.equal(writes.length, 0);
  }
});


const customSheetId = 'CUSTOM_1792750000000_f5c550b6-c374-4bfb-bd5a-e477d098229e';
test('creates an empty custom sheet, reloads it, saves rows and renames it', async () => {
  const { names, handler, save, res, drafts } = setup();
  const request = { method: 'POST', user: { vendor_id: 1 }, params: { machine_id: '15' }, body: { sheet: customSheetId, name: 'Extra Costs' } };
  await names(request, res);
  assert.equal(res.statusCode, 201);
  await names({ ...request, method: 'GET' }, res);
  assert.equal(res.body.data[customSheetId], 'Extra Costs');
  await handler({ ...request, query: { sheet: customSheetId } }, res);
  await save({ ...request, body: { sheet: customSheetId, description: 'Consumables', amount: '25', draft_key: 'f5c550b6-c374-4bfb-bd5a-e477d098229e' } }, res);
  assert.equal(res.statusCode, 201);
  assert.equal([...drafts.values()][0].sheet, customSheetId);
  await names({ ...request, method: 'PATCH', body: { sheet: customSheetId, name: 'Consumable Costs' } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data[customSheetId], 'Consumable Costs');
});

test('custom sheets require a unique name and ID and belong to the workstation', async () => {
  const { names, handler, save, res, drafts } = setup();
  const request = { method: 'POST', user: { vendor_id: 1 }, params: { machine_id: '15' }, body: { sheet: customSheetId, name: 'Machine Cost' } };
  await names(request, res);
  assert.equal(res.statusCode, 400);
  await handler({ ...request, query: { sheet: customSheetId } }, res);
  assert.equal(res.statusCode, 404);
  await save({ ...request, body: { sheet: customSheetId, description: 'Test', amount: null, draft_key: 'f5c550b6-c374-4bfb-bd5a-e477d098229e' } }, res);
  assert.equal(res.statusCode, 404);
  assert.equal(drafts.size, 0);
  request.body.name = 'New Sheet';
  await names(request, res);
  assert.equal(res.statusCode, 201);
  await names(request, res);
  assert.equal(res.statusCode, 400);
});
