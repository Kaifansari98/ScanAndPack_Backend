const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { transformSync } = require('@swc/core');
const filename = path.join(__dirname, '../src/utils/designFileRevision.ts');
const { code } = transformSync(fs.readFileSync(filename, 'utf8'), { filename, jsc: { parser: { syntax: 'typescript' }, target: 'es2020' }, module: { type: 'commonjs' } });
const moduleUnderTest = { exports: {} };
new Function('module', 'exports', code)(moduleUnderTest, moduleUnderTest.exports);
const next = moduleUnderTest.exports.nextDesignFileRevision;
const docs = (...names) => names.map(doc_og_name => ({ doc_og_name }));
test('combined designs start at D0 then advance across separate uploads', () => {
  const existing = [];
  for (let i = 0; i < 4; i++) {
    assert.equal(next(existing, '', 'Kitchen'), i);
    existing.push({ doc_og_name: `D${i}_AmitabhBacchan_Kitchen_2026-10-30.pdf` });
  }
});
test('existing duplicate D0 combined names advance to D1', () => {
  assert.equal(next(docs('D0_AmitabhBacchan_Kitchen_2026-10-29.pdf', 'D0_AmitabhBacchan_Kitchen_2026-10-29.pdf'), '', 'Kitchen'), 1);
});
test('2D, 3D and combined designs maintain separate counters', () => {
  const existing = docs('D2_2D_Client_Kitchen_2026-10-29.pdf', 'D5_3D_Client_Kitchen_2026-10-29.zip', 'D1_Client_Kitchen_2026-10-29.dwg');
  assert.equal(next(existing, '2D', 'Kitchen'), 3);
  assert.equal(next(existing, '3D', 'Kitchen'), 6);
  assert.equal(next(existing, '', 'Kitchen'), 2);
});
test('keeps product types separate and handles sanitized multiword names', () => {
  const existing = docs('D9_Client_Bedroom_2026-10-29.pdf', 'D3_Client_Name_Modular_Kitchen_2026-10-29.pdf');
  assert.equal(next(existing, '', 'Kitchen'), 4);
  assert.equal(next(existing, '', 'Modular_Kitchen'), 4);
  assert.equal(next(existing, '', 'Bathroom'), 0);
});
test('uses highest revision and ignores unrelated or missing names', () => {
  const existing = docs(null, 'drawing.pdf', 'D7_Client_Kitchen_2026-10-29.pdf', 'D1_Client_Kitchen_2026-10-30.pdf');
  assert.equal(next(existing, '', 'Kitchen'), 8);
});
