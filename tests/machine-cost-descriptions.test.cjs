const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { transformSync } = require('@swc/core');
const path = require('node:path');

function setup() {
  const reads = [];
  const writes = [];
  const drafts = new Map();
  const prisma = {
    machineMaster: { findFirst: async ({ where }) => {
      reads.push(['machine', where]);
      return [15, 16].includes(where.id) && where.vendor_id === 1 ? { id: where.id } : null;
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
    assert.equal(id, '../../prisma/client');
    return { prisma };
  }, module, module.exports);
  const res = { statusCode: 200, status(value) { this.statusCode = value; return this; }, json(value) { this.body = value; return this; } };
  return { handler: module.exports.getMachineCostDescriptions, save: module.exports.saveMachineCostAmount, res, reads, writes, drafts };
}

test('reads only session vendor descriptions even when another vendor is supplied', async () => {
  const { handler, res, reads } = setup();
  await handler({ user: { vendor_id: 1 }, params: { machine_id: '15' }, query: { vendor_id: '2' } }, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(reads, [['machine', { id: 15, vendor_id: 1 }], ['descriptions', { vendor_id: 1, machine_id: 15 }]]);
  assert.equal(res.body.data[0].description, 'Machine Transit Insurance');
  assert.equal(res.body.data[0].amount, '125.50');
});

test('another vendor cannot read workstation 15 descriptions', async () => {
  const { handler, res, reads } = setup();
  await handler({ user: { vendor_id: 2 }, params: { machine_id: '15' } }, res);
  assert.equal(res.statusCode, 404);
  assert.equal(reads.length, 1);
});

test('requires a valid vendor session before any database reads', async () => {
  const { handler, res, reads } = setup();
  await handler({ params: { machine_id: '15' } }, res);
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
  await handler({ user: { vendor_id: 1 }, params: { machine_id: '16' } }, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(reads[1], ['descriptions', { vendor_id: 1, machine_id: 16 }]);
  assert.equal(res.body.data[0].description, 'Workstation 16 cost');
});

const saveRequest = (amount, overrides = {}) => ({ user: { vendor_id: 1 }, params: { machine_id: '15', description_id: '101' }, body: { amount }, ...overrides });

test('saves exact decimal, zero, and clears an amount using null', async () => {
  for (const amount of ['125.50', '0.00', null, '999999999999.99']) {
    const { save, res, writes } = setup();
    await save(saveRequest(amount), res);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(writes, [{ where: { id: 101, vendor_id: 1, machine_id: 15 }, data: { amount } }]);
  }
});

test('rejects invalid amounts without writing', async () => {
  for (const amount of [undefined, '', '-1', '1.234', '1e3', 'Infinity', 25, {}, '1000000000000.00']) {
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
