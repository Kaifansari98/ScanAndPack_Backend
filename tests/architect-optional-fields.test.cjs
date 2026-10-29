const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { transformSync } = require('@swc/core');
const filename = path.join(__dirname, '../src/services/architectureMasterServices/architectureMaster.service.ts');
const { code } = transformSync(fs.readFileSync(filename, 'utf8'), { filename, jsc: { parser: { syntax: 'typescript' }, target: 'es2020' }, module: { type: 'commonjs' } });
function setup() {
  const created = [];
  const prisma = { architechuremaster: {
    findMany: async () => [],
    create: async ({ data }) => { created.push(data); return { id: created.length, ...data }; },
  } };
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)(name => name.includes('prisma/client') ? { prisma } : require(name), module, module.exports);
  const service = new module.exports.ArchitectureMasterService();
  return { service, created, upload: csv => service.bulkUploadArchitects(Buffer.from(csv), true, 1, 1) };
}
test('create accepts omitted email and alternate mobile', async () => {
  const { service, created } = setup();
  await service.createArchitectureMaster({ vendorId: 1, name: 'Architect', mobile: '9876543210' });
  assert.equal(created[0].email, '');
  assert.equal(created[0].alt_mobile, null);
});
test('import accepts omitted optional columns and multiple blank emails', async () => {
  const { upload, created } = setup();
  await upload('name,mobile\nFirst,9876543210\nSecond,9876543211\n');
  assert.equal(created.length, 2);
  assert.ok(created.every(row => row.email === '' && row.alt_mobile === null));
});
test('import accepts blank optional cells', async () => {
  const { upload, created } = setup();
  await upload('name,email,contact,alt contact\nFirst,,9876543210,\nSecond,,9876543211,\n');
  assert.equal(created.length, 2);
});
test('alternate mobile column cannot substitute for mandatory primary mobile', async () => {
  const { upload } = setup();
  await assert.rejects(upload('name,alt mobile\nFirst,9876543210\n'), /Required columns/);
});
test('provided invalid optional values still fail validation', async () => {
  for (const csv of ['name,email,mobile\nFirst,invalid,9876543210\n', 'name,mobile,alt contact\nFirst,9876543210,123\n']) {
    const { upload, created } = setup();
    await assert.rejects(upload(csv));
    assert.equal(created.length, 0);
  }
});
