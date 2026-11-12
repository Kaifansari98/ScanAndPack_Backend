const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

const root = path.join(__dirname, "../src");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
function execute(source, globals) {
  const exports = {};
  const code = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  vm.runInNewContext(code, { exports, console: { log() {} }, ...globals });
  return exports;
}
function variable(file, name) {
  const ast = ts.createSourceFile(
    file,
    read(file),
    ts.ScriptTarget.Latest,
    true,
  );
  return ast.statements
    .find(
      (node) =>
        ts.isVariableStatement(node) &&
        node.declarationList.declarations.some(
          (d) => d.name.getText(ast) === name,
        ),
    )
    .getText(ast);
}
function method(file, name) {
  const ast = ts.createSourceFile(
    file,
    read(file),
    ts.ScriptTarget.Latest,
    true,
  );
  let result;
  const visit = (node) => {
    if (ts.isMethodDeclaration(node) && node.name.getText(ast) === name)
      result = node.getText(ast);
    ts.forEachChild(node, visit);
  };
  visit(ast);
  return result;
}
function matches(row, where) {
  return Object.entries(where ?? {}).every(([key, value]) => {
    if (value === undefined) return true;
    if (key === "AND")
      return (Array.isArray(value) ? value : [value]).every((clause) =>
        matches(row, clause),
      );
    if (key === "OR") return value.some((clause) => matches(row, clause));
    if (value && typeof value === "object") {
      if ("in" in value) return value.in.includes(row[key]);
      if ("notIn" in value) return !value.notIn.includes(row[key]);
      if ("equals" in value)
        return value.mode === "insensitive"
          ? String(row[key]).toLowerCase() === value.equals.toLowerCase()
          : row[key] === value.equals;
      if ("contains" in value)
        return String(row[key] ?? "")
          .toLowerCase()
          .includes(value.contains.toLowerCase());
      return matches(row[key] ?? {}, value);
    }
    return row[key] === value;
  });
}
function setup({
  role = "admin",
  franchise = 10,
  actorVendor = 1,
  actorActive = true,
} = {}) {
  const queries = [];
  const actor = {
    id: 7,
    vendor_id: actorVendor,
    franchise_id: franchise,
    status: actorActive ? "active" : "inactive",
    user_type: { id: 1, user_type: role },
    is_ho_user: true,
  };
  const leads = [
    { id: 1, franchise_id: 10, firstname: "Own", status_id: 1 },
    { id: 2, franchise_id: 20, firstname: "Other", status_id: 13 },
    { id: 3, franchise_id: null, firstname: "Unassigned", status_id: 8 },
    { id: 4, franchise_id: 10, firstname: "Deleted", is_deleted: true },
    { id: 5, franchise_id: 10, firstname: "Other vendor", vendor_id: 2 },
  ].map((row) => ({
    vendor_id: 1,
    statusType: { vendor_id: 1 },
    activity_status: "onGoing",
    is_deleted: false,
    documents: [],
    ...row,
  }));
  const executives = [
    { id: 1, franchise_id: 10 },
    { id: 2, franchise_id: 20 },
    { id: 3, franchise_id: null },
    { id: 4, franchise_id: 10, vendor_id: 2 },
    { id: 5, franchise_id: 10, status: "inactive" },
    {
      id: 6,
      franchise_id: 10,
      user_type: { id: 3, user_type: "site-supervisor" },
    },
  ].map((row) => ({
    vendor_id: 1,
    status: "active",
    user_name: `Executive ${row.id}`,
    user_type: { id: 2, user_type: "sales-executive" },
    documents: [],
    ...row,
  }));
  const prisma = {
    userMaster: {
      findFirst: async ({ where }) => (matches(actor, where) ? actor : null),
      findUnique: async () => actor,
      findMany: async (query) => {
        queries.push({ type: "executives", ...query });
        return executives.filter((row) => matches(row, query.where));
      },
    },
    leadMaster: {
      findMany: async (query) => {
        queries.push({ type: "leads", ...query });
        return leads
          .filter((row) => matches(row, query.where))
          .slice(query.skip ?? 0, (query.skip ?? 0) + (query.take ?? 100));
      },
      count: async (query) => {
        queries.push({ type: "count", ...query });
        return leads.filter((row) => matches(row, query.where)).length;
      },
    },
    vendorMaster: {
      findUnique: async () => ({
        is_online_lead_feature_enabled: false,
        handlesLargeScaleProjects: false,
      }),
    },
    statusTypeMaster: {
      findMany: async () =>
        Array.from({ length: 17 }, (_, i) => ({ id: i + 1 })),
    },
    fastProductionRequestBatch: { findMany: async () => [] },
  };
  const scope = execute(read("utils/adminFranchiseScope.ts"), {
    require: () => ({ prisma }),
  }).getAdminFranchiseScope;
  const instance = execute(
    read("services/production/stages/instanceStage.ts"),
    { require: () => ({}) },
  );
  const globals = {
    prisma,
    getAdminFranchiseScope: scope,
    ...instance,
    logger: { info() {}, warn() {} },
    Prisma: { SortOrder: { asc: "asc", desc: "desc" } },
  };
  const file = "services/bookingStage/bookingStage.service.ts";
  const service = execute(
    `class BookingStageService { ${method(file, "getVendorLeadsByTag2")} ${method(file, "getUniversalTableData")} } exports.Service = BookingStageService;`,
    globals,
  ).Service;
  service.leadIncludes = () => ({
    productStructureInstances: { select: { id: true } },
  });
  service.draftVisibilityFilter = () => ({});
  service.getResolvedSmallOrderLeadExclusion = async () => null;
  service.attachLinkedSmallOrderRequests = async (rows) => rows;
  service.statusLogSortedStageTags = new Set();
  const sales = execute(
    variable(
      "services/leadModuleServices/leadsGeneration/leadGeneration.service.ts",
      "getSalesExecutivesByVendor",
    ),
    globals,
  ).getSalesExecutivesByVendor;
  const overall = (
    filters = {},
    requestedFranchise,
    requestedFranchises,
    page = 1,
    limit = 10,
  ) =>
    service.getVendorLeadsByTag2(
      1,
      requestedFranchise,
      requestedFranchises,
      "ALL",
      role === "admin" ? 99 : null,
      page,
      limit,
      filters,
      7,
    );
  const alternate = (filters = {}, requestedFranchise, requestedFranchises) =>
    service.getUniversalTableData(
      1,
      99,
      requestedFranchise,
      requestedFranchises,
      "ALL",
      1,
      10,
      filters,
      { requesterUserId: 7 },
    );
  return { overall, alternate, sales, queries, scope };
}
for (const route of ["overall", "alternate"]) {
  test(`${route}: admin sees only their stored franchise, including when assigned to HO`, async () => {
    const s = setup();
    const result = await s[route]();
    assert.deepEqual(
      Array.from(result.leads, (row) => row.id),
      [1],
    );
    assert.equal(result.count, 1);
    assert.equal(
      s.queries.find((q) => q.type === "count").where.franchise_id,
      10,
    );
  });
  test(`${route}: selected franchise, multiselect filters and spoofed userId cannot widen admin access`, async () => {
    const s = setup();
    const result = await s[route](
      { franchises: [20], franchise_ids: [20] },
      20,
      [20],
    );
    assert.deepEqual(
      Array.from(result.leads, (row) => row.id),
      [1],
    );
    assert.equal(result.count, 1);
  });
  test(`${route}: searching another franchise returns zero results and zero count`, async () => {
    const s = setup();
    const result = await s[route]({ global_search: "Other" });
    assert.equal(result.leads.length, 0);
    assert.equal(result.count, 0);
  });
  test(`${route}: admin without an assigned franchise receives no vendor-wide data`, async () => {
    const s = setup({ franchise: null });
    const result = await s[route]({}, 20, [20]);
    assert.equal(result.leads.length + result.count, 0);
    assert.equal(s.queries.length, 0);
  });
  test(`${route}: a user outside the vendor is rejected`, async () => {
    const s = setup({ actorVendor: 2 });
    await assert.rejects(s[route](), { statusCode: 403 });
    assert.equal(s.queries.length, 0);
  });
}
test("Super Admin Overall Leads retains vendor-wide visibility", async () => {
  const s = setup({ role: "super-admin" });
  // Existing admin-wide requests omit userId to disable linked-lead exclusion.
  const result = await s.overall({}, undefined, undefined);
  assert.equal(
    s.queries.find((q) => q.type === "count").where.franchise_id,
    undefined,
  );
  assert.ok(result.count > 1);
});
test("admin executive options exclude other franchises, unassigned users and other roles", async () => {
  const s = setup();
  const result = await s.sales(1, 20, { requesterUserId: 7 });
  assert.deepEqual(
    Array.from(result, (row) => row.id),
    [1],
  );
});
test("admin executive options stay empty when no franchise is attached", async () => {
  const s = setup({ franchise: null });
  assert.equal((await s.sales(1, undefined, { requesterUserId: 7 })).length, 0);
  assert.equal(s.queries.length, 0);
});
test("franchise filtering and the sales-executive role condition both apply for existing callers", async () => {
  const s = setup({ role: "super-admin" });
  const result = await s.sales(1, 10);
  assert.deepEqual(
    Array.from(result, (row) => row.id),
    [1, 3],
  );
});
test("Super Admin executive options retain existing vendor-wide behavior without a franchise filter", async () => {
  const s = setup({ role: "super-admin" });
  const result = await s.sales(1, undefined, { requesterUserId: 7 });
  assert.deepEqual(
    Array.from(result, (row) => row.id),
    [1, 2, 3],
  );
});
test("invalid authenticated identity and inactive users cannot request scoped records", async () => {
  const s = setup({ actorActive: false });
  await assert.rejects(s.scope(1, 7), { statusCode: 403 });
  await assert.rejects(s.scope(1, NaN), { statusCode: 403 });
});
