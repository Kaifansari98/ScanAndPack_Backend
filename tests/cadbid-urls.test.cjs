const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { transformSync } = require('@swc/core');
const filename = path.join(__dirname, '../src/services/cadbid.service.ts');
const { code } = transformSync(readFileSync(filename, 'utf8'), {
  filename, jsc: { parser: { syntax: 'typescript' }, target: 'es2020' }, module: { type: 'commonjs' },
});
function urls(env) {
  const module = { exports: {} };
  new Function('require', 'module', 'exports', 'process', code)(
    id => { if (id === '../prisma/client') return { prisma: {} }; throw Error(id); },
    module, module.exports, { env },
  );
  return [module.exports.getStudioBaseUrl(), module.exports.getCadbidBaseUrl()];
}
for (const NODE_ENV of ['staging', 'production', undefined]) {
  test(`${NODE_ENV ?? 'unset'} environment uses hosted Studio and Cadbid defaults`, () => {
    assert.deepEqual(urls({ NODE_ENV }), ['https://studio.cadbid.com', 'https://core.cadbid.com']);
  });
}
test('development retains local service defaults', () => {
  assert.deepEqual(urls({ NODE_ENV: 'development' }), ['http://localhost:5174', 'http://localhost:3002']);
});
test('explicit staging URLs take precedence and trailing slashes are removed', () => {
  assert.deepEqual(urls({ NODE_ENV: 'staging', CADX_STUDIO_URL: 'https://studio-staging.example.com/', STUDIO_URL: 'https://unused.example.com', CADBID_API_URL: 'https://api-staging.example.com//' }), ['https://studio-staging.example.com', 'https://api-staging.example.com']);
});
test('legacy Studio and Cadbid URL settings work in staging', () => {
  assert.deepEqual(urls({ NODE_ENV: 'staging', STUDIO_URL: 'https://studio.example.com/', CADBID_URL: 'https://core.example.com/' }), ['https://studio.example.com', 'https://core.example.com']);
});
