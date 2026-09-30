const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { transformSync } = require("@swc/core");
const path = require("node:path");

// Exercise the production TypeScript without requiring a database or extra test dependencies.
function loadTs(relativePath, dependencies = {}) {
  const file = path.join(__dirname, "..", relativePath);
  const { code } = transformSync(readFileSync(file, "utf8"), {
    filename: file, jsc: { parser: { syntax: "typescript" }, target: "es2020" }, module: { type: "commonjs" },
  });
  const module = { exports: {} };
  new Function("require", "module", "exports", code)((id) => dependencies[id] ?? require(id), module, module.exports);
  return module.exports;
}
const utils = loadTs("src/utils/cutlist-headers.ts");
const { CUTLIST_HEADER_FIELDS: fields, validateHeaderMappings, resolveCutlistColumns } = utils;
const valid = () => fields.filter((field) => field.required).map((field) => ({ source_header: `My ${field.label}`, cutlist_field: field.field }));

test("accepts all required fields, optional fields, and explicitly ignored columns", () => {
  const rows = [...valid(), { source_header: "Notes", cutlist_field: null }];
  assert.deepEqual(validateHeaderMappings(rows), rows);
  assert.deepEqual(validateHeaderMappings([]), []);
});

test("rejects duplicate normalized headers, duplicate targets, missing required and server-owned fields", () => {
  assert.throws(() => validateHeaderMappings([...valid(), { source_header: "my_item-name", cutlist_field: null }]), /Duplicate Excel header/);
  assert.throws(() => validateHeaderMappings([...valid(), { source_header: "Other Name", cutlist_field: "item_name" }]), /only once/);
  assert.throws(() => validateHeaderMappings(valid().slice(1)), /required fields/);
  assert.throws(() => validateHeaderMappings([...valid(), { source_header: "Tenant", cutlist_field: "vendor_id" }]), /Unsupported/);
  assert.throws(() => validateHeaderMappings([{ source_header: "", cutlist_field: null }]), /source header/);
});

test("resolves custom names, default aliases, ignored headers and custom packing groups", () => {
  const mapping = [
    { source_header: "Part", cutlist_field: "item_name" },
    { source_header: "Pack Set", cutlist_field: "custom_packing_group" },
    { source_header: "Weight", cutlist_field: null },
  ];
  const columns = resolveCutlistColumns([
    { column: 1, header: "PART" }, { column: 2, header: "pack_set" },
    { column: 3, header: "Weight" }, { column: 4, header: "Qty" },
  ], mapping, { weight: "weight", qty: "qty" });
  assert.deepEqual(columns, { 1: "name", 2: "customPackingGroup", 4: "qty" });
  assert.throws(() => resolveCutlistColumns([{ column: 1, header: "Part" }, { column: 2, header: "Item Name" }], mapping, { "item name": "name" }), /Multiple Excel columns/);
});

test("preserves standard and legacy duplicated ELB headers when no mappings exist", () => {
  assert.deepEqual(resolveCutlistColumns([
    { column: 1, header: "Item Name" }, { column: 2, header: "ELB" }, { column: 3, header: "ELB" },
  ], [], { "item name": "name", elb: "el2" }), { 1: "name", 2: "el2", 3: "sl1" });
});

function response() {
  return { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
}

test("configuration endpoints scope reads and writes to the requested vendor and validate before replacing", async () => {
  const calls = [];
  const prisma = {
    vendorMaster: { findUnique: async (args) => { calls.push(["vendor", args]); return { id: args.where.id }; } },
    cutlistHeadersMapping: { findMany: async (args) => { calls.push(["read", args]); return []; } },
    $transaction: async (callback) => callback({
      $queryRaw: async () => {},
      cutlistHeadersMapping: {
        deleteMany: async (args) => { calls.push(["delete", args]); },
        createMany: async (args) => { calls.push(["create", args]); },
        findMany: async () => [],
      },
    }),
  };
  const controller = loadTs("src/controllers/cutlistHeaders.controller.ts", { "../prisma/client": { prisma }, "../utils/cutlist-headers": utils });
  const req = { params: { vendor_id: "2" }, user: { vendor_id: 1, user_type: "master-admin" }, body: { mappings: valid() } };
  let res = response();
  await controller.saveCutlistHeaders(req, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(calls.find(([name]) => name === "delete")[1].where, { vendor_id: 2 });
  assert(calls.find(([name]) => name === "create")[1].data.every((row) => row.vendor_id === 2 && row.normalized_header));
  calls.length = 0;
  res = response();
  await controller.getCutlistHeaders({ ...req, user: { vendor_id: 2, user_type: "factory" } }, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(calls.find(([name]) => name === "read")[1].where, { vendor_id: 2 });
  calls.length = 0;
  res = response();
  await controller.saveCutlistHeaders({ ...req, body: { mappings: valid().slice(1) } }, res);
  assert.equal(res.statusCode, 400);
  assert(!calls.some(([name]) => name === "delete"));
  for (const action of ["getCutlistHeaders", "saveCutlistHeaders"]) {
    res = response();
    await controller[action]({ ...req, user: { vendor_id: 1, user_type: "admin" } }, res);
    assert.equal(res.statusCode, 403);
  }
  res = response();
  await controller.saveCutlistHeaders({ ...req, user: { vendor_id: 2, user_type: "factory" } }, res);
  assert.equal(res.statusCode, 403);
});
