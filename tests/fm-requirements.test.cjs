const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { transformSync } = require("@swc/core");
function load(file, mocks = {}) {
  const filename = path.join(__dirname, "../src", file);
  const { code } = transformSync(fs.readFileSync(filename, "utf8"), {
    filename,
    jsc: { parser: { syntax: "typescript" }, target: "es2020" },
    module: { type: "commonjs" },
  });
  const mod = { exports: {} };
  new Function("require", "module", "exports", code)(
    (id) => {
      if (mocks[id]) return mocks[id];
      throw new Error(`Unmocked dependency: ${id}`);
    },
    mod,
    mod.exports,
  );
  return mod.exports;
}
const schema = load("services/fmRequirements/schema.ts");
const fields = () =>
  JSON.parse(
    fs.readFileSync(
      path.join(
        __dirname,
        "../scripts/data/modular-kitchen-fm-test-fields.json",
      ),
      "utf8",
    ),
  );
const fileId = "aabbccdd-1111-4222-a333-444455556666";
const baseAnswers = () => ({ site_photos: [fileId], fm_document: [fileId] });

test("Modular Kitchen test data matches the supplied checklist and keeps unique nested keys", () => {
  const result = schema.validateFields(fields());
  assert.deepEqual(
    result.map((f) => f.label),
    [
      "Site Photos",
      "FM Document",
      "Thiya Marking",
      "L Corner Wall",
      "Wall Punning",
      "Cabinet Markings",
      "Gas Points",
      "Fire Sprinkler",
      "Electrical Connections (If Selected)",
      "Civil Points",
      "Other Observations",
    ],
  );
  assert.equal(
    schema.allFields(result).length,
    new Set(schema.allFields(result).map((f) => f.key)).size,
  );
  assert.deepEqual(
    result.find((f) => f.key === "thiya_marking").options.map((o) => o.label),
    ["Yes", "No", "Not Possible on Site"],
  );
  assert.deepEqual(
    result.find((f) => f.key === "gas_points").options.map((o) => o.label),
    ["MNGL", "Cylinder", "No"],
  );
  assert.equal(
    schema.allFields(result).find((f) => f.key === "thiya_depth_photo")
      .upload_kind,
    "photo",
  );
  assert.equal(
    schema.allFields(result).find((f) => f.key === "civil_entry_width").label,
    "Width Measurement",
  );
});
test("unconfigured product types have no implicit fields or default checklist", async () => {
  const fixture = serviceFixture();
  fixture.setConfigured(false);
  const form = await fixture.api.getFMQuestionnaire(7, 2);
  assert.deepEqual(form.fields, []);
  assert.equal(form.origin, "empty");
  assert.equal(form.revision, "empty");
  assert.deepEqual(schema.validateFields([]), []);
  assert.deepEqual(
    schema.validateFields([
      { key: "note", label: "Note", type: "text", required: false },
    ]),
    [{ key: "note", label: "Note", type: "text", required: false }],
  );
});
test("conditional requirements apply only to the chosen branch; inactive data is discarded", () => {
  const form = fields();
  const marking = form.find((f) => f.key === "thiya_marking");
  marking.options[0].fields.find((f) => f.key === "thiya_elevation").required =
    true;
  assert.throws(
    () =>
      schema.validateAnswers(form, { ...baseAnswers(), thiya_marking: "yes" }),
    /Elevation Side is required/,
  );
  const answers = schema.validateAnswers(form, {
    ...baseAnswers(),
    thiya_marking: "no",
    thiya_marking_no_remark: "No access",
    thiya_elevation: "STALE",
  });
  assert.equal(answers.thiya_marking_no_remark, "No access");
  assert.equal("thiya_elevation" in answers, false);
  assert.equal(
    schema.validateAnswers(form, {
      ...baseAnswers(),
      corner_wall_90: "no",
      l_corner_wall: "yes",
    }).corner_wall_90,
    "no",
  );
});
test("repeatable observations keep title and remark and reject incomplete entries", () => {
  const observations = [
    { title: "Window", remark: "Leave clearance" },
    { title: "Plumbing", remark: "Needs relocation" },
  ];
  assert.deepEqual(
    schema.validateAnswers(fields(), {
      ...baseAnswers(),
      other_observations: observations,
    }).other_observations,
    observations,
  );
  assert.throws(
    () =>
      schema.validateAnswers(fields(), {
        ...baseAnswers(),
        other_observations: [{ title: "", remark: "Missing title" }],
      }),
    /title and remark/,
  );
});
test("drafts allow missing required values; final submission enforces both standard uploads", () => {
  assert.deepEqual(schema.validateAnswers(fields(), {}, true), {});
  assert.throws(
    () => schema.validateAnswers(fields(), {}),
    /Site Photos is required/,
  );
  assert.throws(
    () => schema.validateAnswers(fields(), { site_photos: [fileId] }),
    /FM Document is required/,
  );
});
test("master schema accepts empty checklists and rejects duplicate keys, invalid choices and excessive nesting", () => {
  assert.throws(
    () => schema.validateFields([...fields(), fields()[0]]),
    /unique stable key/,
  );
  assert.doesNotThrow(() => schema.validateFields(fields().slice(1)));
  assert.throws(
    () =>
      schema.validateFields([
        ...fields(),
        { ...fields()[0], key: "second_photos" },
      ]),
    /only once/,
  );
  const one = fields();
  one.find((f) => f.type === "choice").options = [];
  assert.throws(() => schema.validateFields(one), /between 2 and 30/);
  let nested = { key: "deep", label: "Deep", type: "text", required: false };
  for (let i = 0; i < 7; i++)
    nested = {
      key: `group_${i}`,
      label: "Group",
      type: "group",
      required: false,
      fields: [nested],
    };
  assert.throws(
    () => schema.validateFields([...fields(), nested]),
    /nesting levels/,
  );
  assert.throws(
    () =>
      schema.validateAnswers(fields(), {
        ...baseAnswers(),
        unexpected: "value",
      }),
    /unknown fields/,
  );
});
test("uploaded file identities, MIME restrictions and signatures are validated", () => {
  assert.throws(
    () =>
      schema.validateAnswers(fields(), {
        site_photos: ["https://foreign/file"],
        fm_document: [fileId],
      }),
    /uploaded files/,
  );
  assert.equal(
    schema.acceptedTypes({ upload_kind: "photo" }).includes("video/mp4"),
    false,
  );
  assert.equal(
    schema.acceptedTypes({ upload_kind: "media" }).includes("video/mp4"),
    true,
  );
  assert.equal(
    schema.validFMFileSignature(Buffer.from("%PDF-1.7"), "application/pdf"),
    true,
  );
  assert.equal(
    schema.validFMFileSignature(
      Buffer.from("<script>bad</script>"),
      "image/jpeg",
    ),
    false,
  );
  assert.equal(
    schema.validFMFileSignature(Buffer.from([255, 216, 255, 0]), "image/jpeg"),
    true,
  );
});
function serviceFixture() {
  let enabled = true,
    productIds = [2],
    revision = 1,
    stage = "Type 5",
    filesValid = true,
    configured = true,
    overriddenFields = null,
    unconfiguredProducts = new Set();
  const saved = [];
  const reads = [];
  const db = {
    vendorMaster: {
      findUnique: async () => ({ handlesLargeScaleProjects: !enabled }),
    },
    productTypeMaster: {
      findFirst: async ({ where }) => ({
        id: where.id,
        type: "Modular Kitchen",
      }),
    },
    leadMaster: {
      findFirst: async () => ({ id: 42, statusType: { tag: stage } }),
    },
    leadProductMapping: {
      findMany: async () =>
        productIds.map((product_type_id) => ({ product_type_id })),
    },
    fMRequirementMaster: {
      findUnique: async ({ where }) =>
        configured &&
        !unconfiguredProducts.has(
          where.vendor_id_product_type_id.product_type_id,
        )
          ? { id: 8, version: revision, fields: overriddenFields ?? fields() }
          : null,
    },
    fMRequirementUpload: {
      findMany: async (query) => {
        reads.push(query);
        return filesValid
          ? [
              {
                id: fileId,
                original_name: "test.png",
                storage_key: "scoped/key",
                mime_type: "image/png",
                size_bytes: 400,
              },
            ]
          : [];
      },
    },
    fMRequirementResponse: {
      upsert: async (query) => {
        saved.push(query);
        return query.create;
      },
    },
  };
  const api = load("services/fmRequirements/requirements.service.ts", {
    "../../prisma/client": { prisma: db },
    "../leadModuleServices/walkinLeadQuestions/response.service": {
      requireLeadAccess: async () => ({ id: 42 }),
    },
    "./schema": schema,
  });
  const input = {
    vendorId: 7,
    leadId: 42,
    actorId: 9,
    draft: false,
    groups: [
      { product_type_id: 2, revision: "vendor:8:1", answers: baseAnswers() },
    ],
  };
  return {
    api,
    db,
    input,
    saved,
    reads,
    setEnabled: (v) => (enabled = v),
    setConfigured: (v) => (configured = v),
    setFields: (v) => (overriddenFields = v),
    setUnconfiguredProducts: (v) => (unconfiguredProducts = new Set(v)),
    setProducts: (v) => (productIds = v),
    setRevision: (v) => (revision = v),
    setStage: (v) => (stage = v),
    setFiles: (v) => (filesValid = v),
  };
}
test("server restricts vendors and requires every selected product type", async () => {
  const f = serviceFixture();
  f.setEnabled(false);
  await assert.rejects(
    f.api.saveFMAnswers(f.db, f.input),
    (err) => err.statusCode === 403,
  );
  f.setEnabled(true);
  f.setProducts([2, 3]);
  await assert.rejects(
    f.api.saveFMAnswers(f.db, f.input),
    /every product type/,
  );
  assert.equal(f.saved.length, 0);
});
test("stale configuration, moved leads and foreign uploads cannot complete the stage", async () => {
  const f = serviceFixture();
  f.setRevision(2);
  await assert.rejects(
    f.api.saveFMAnswers(f.db, f.input),
    (err) => err.statusCode === 409,
  );
  f.setRevision(1);
  f.setStage("Type 6");
  await assert.rejects(
    f.api.saveFMAnswers(f.db, f.input),
    /no longer in Final Measurement/,
  );
  f.setStage("Type 5");
  f.setFiles(false);
  await assert.rejects(f.api.saveFMAnswers(f.db, f.input), /unavailable/);
  assert.equal(f.saved.length, 0);
});
test("valid responses preserve question snapshots and map uploaded primary files to existing FM document workflow", async () => {
  const f = serviceFixture();
  const files = await f.api.saveFMAnswers(f.db, f.input);
  assert.equal(f.saved.length, 1);
  assert.deepEqual(f.saved[0].create.field_snapshot, fields());
  assert.equal(f.saved[0].create.is_complete, true);
  assert.equal(files.measurementDocs[0].sysName, "scoped/key");
  assert.equal(files.sitePhotos[0].originalName, "test.png");
  assert.ok(
    f.reads.every(
      (read) => read.where.vendor_id === 7 && read.where.lead_id === 42,
    ),
  );
});

test("a later invalid product response causes no earlier snapshot writes", async () => {
  const f = serviceFixture();
  f.setProducts([2, 3]);
  f.input.groups.push({
    product_type_id: 3,
    revision: "stale:revision",
    answers: baseAnswers(),
  });
  await assert.rejects(
    f.api.saveFMAnswers(f.db, f.input),
    (error) => error.statusCode === 409,
  );
  assert.equal(f.saved.length, 0);
});

test("unconfigured selected products do not acquire implicit questionnaires or block configured ones", async () => {
  const f = serviceFixture();
  f.setProducts([2, 3]);
  f.setUnconfiguredProducts([3]);
  await f.api.saveFMAnswers(f.db, f.input);
  assert.equal(f.saved.length, 1);
  assert.equal(f.saved[0].create.product_type_id, 2);
});

test("a text-only saved checklist uses ordinary stage upload IDs without injecting upload questions", async () => {
  const f = serviceFixture();
  f.setFields([{ key: "note", label: "Note", type: "text", required: true }]);
  f.input.groups[0].answers = { note: "Check wall" };
  f.input.primaryUploads = {
    site_photos: [fileId],
    measurement_document: [fileId],
  };
  const files = await f.api.saveFMAnswers(f.db, f.input);
  assert.equal(f.saved[0].create.field_snapshot.length, 1);
  assert.equal(files.measurementDocs.length, 1);
  assert.equal(files.sitePhotos.length, 1);
});

function editFixture() {
  const photoId = "11111111-1111-4111-a111-111111111111";
  const videoId = "22222222-2222-4222-a222-222222222222";
  const docId = "33333333-3333-4333-a333-333333333333";
  const row = {
    id: 51,
    vendor_id: 7,
    lead_id: 42,
    product_type_id: 2,
    revision: "vendor:8:1",
    updated_at: new Date("2026-11-09T10:00:00.000Z"),
    field_snapshot: fields(),
    answers: {
      site_photos: [photoId],
      fm_document: [docId],
      thiya_marking: "no",
      thiya_marking_no_remark: "Before",
    },
    is_complete: true,
  };
  const files = new Map([
    [
      photoId,
      {
        id: photoId,
        original_name: "old.jpg",
        storage_key: "fm/old.jpg",
        mime_type: "image/jpeg",
        size_bytes: 100,
      },
    ],
    [
      videoId,
      {
        id: videoId,
        original_name: "new.mp4",
        storage_key: "fm/new.mp4",
        mime_type: "video/mp4",
        size_bytes: 100,
      },
    ],
    [
      docId,
      {
        id: docId,
        original_name: "fm.pdf",
        storage_key: "fm/fm.pdf",
        mime_type: "application/pdf",
        size_bytes: 100,
      },
    ],
  ]);
  let updateCount = 1;
  let others = [];
  const writes = [],
    deletions = [],
    creations = [],
    reads = [];
  const db = {
    vendorMaster: {
      findUnique: async () => ({ handlesLargeScaleProjects: false }),
    },
    productTypeMaster: {
      findFirst: async () => {
        throw new Error("Historical edits must not load current masters");
      },
    },
    fMRequirementMaster: {
      findUnique: async () => {
        throw new Error("Historical edits must not load current masters");
      },
    },
    fMRequirementResponse: {
      findFirst: async ({ where }) =>
        where.vendor_id === 7 &&
        where.lead_id === 42 &&
        where.product_type_id === 2
          ? row
          : null,
      updateMany: async (args) => {
        writes.push(args);
        return { count: updateCount };
      },
      findMany: async () => others,
    },
    fMRequirementUpload: {
      findMany: async (query) => {
        reads.push(query);
        return query.where.vendor_id === 7 && query.where.lead_id === 42
          ? query.where.id.in.flatMap((id) =>
              files.has(id) ? [files.get(id)] : [],
            )
          : [];
      },
    },
    documentTypeMaster: {
      findFirst: async ({ where }) => ({
        id: where.tag === "Type 10" ? 10 : 9,
      }),
    },
    leadDocuments: {
      updateMany: async (args) => {
        deletions.push(args);
        return { count: 1 };
      },
      findFirst: async () => null,
      create: async (args) => {
        creations.push(args);
        return { id: 100 };
      },
    },
    leadMaster: {
      update: async () => {
        throw new Error("Editing must not move the lead stage");
      },
    },
  };
  db.$transaction = async (fn) => fn(db);
  const api = load("services/fmRequirements/requirements.service.ts", {
    "../../prisma/client": { prisma: db },
    "../leadModuleServices/walkinLeadQuestions/response.service": {
      requireLeadAccess: async () => ({ id: 42, account_id: 4 }),
    },
    "./schema": schema,
  });
  const input = {
    vendorId: 7,
    leadId: 42,
    productTypeId: 2,
    actorId: 9,
    role: "site-supervisor",
    expectedUpdatedAt: row.updated_at.toISOString(),
    answers: { ...row.answers, thiya_marking_no_remark: "Updated" },
  };
  return {
    api,
    input,
    row,
    photoId,
    videoId,
    docId,
    writes,
    deletions,
    creations,
    reads,
    setCount: (value) => (updateCount = value),
    setOthers: (value) => (others = value),
  };
}
test("only the three requested roles may edit saved FM values; admin and custom remain read-only", async () => {
  for (const role of [
    "site-supervisor",
    "super-admin",
    "head-site-supervisor",
  ]) {
    const f = editFixture();
    await f.api.updateSavedFMAnswers({ ...f.input, role });
    assert.equal(f.writes.length, 1);
  }
  for (const role of [
    "admin",
    "custom",
    "sales-executive",
    "auditor",
    "factory",
    "",
    undefined,
  ]) {
    const f = editFixture();
    await assert.rejects(
      f.api.updateSavedFMAnswers({ ...f.input, role }),
      (error) => error.statusCode === 403,
    );
    assert.equal(f.writes.length, 0);
  }
});
test("saved values edit against their captured questions without moving the lead or changing completion status", async () => {
  const f = editFixture();
  await f.api.updateSavedFMAnswers(f.input);
  assert.equal(f.writes[0].data.answers.thiya_marking_no_remark, "Updated");
  assert.equal("field_snapshot" in f.writes[0].data, false);
  assert.equal("is_complete" in f.writes[0].data, false);
  assert.equal(f.writes[0].data.updated_by, 9);
  assert.equal(f.deletions.length, 0);
  assert.equal(f.creations.length, 0);
});
test("stale edits, racing saves, foreign upload IDs and wrong lead/product scope are rejected", async () => {
  const stale = editFixture();
  await assert.rejects(
    stale.api.updateSavedFMAnswers({
      ...stale.input,
      expectedUpdatedAt: "2026-11-08T10:00:00Z",
    }),
    (error) => error.statusCode === 409,
  );
  assert.equal(stale.writes.length, 0);
  const race = editFixture();
  race.setCount(0);
  await assert.rejects(
    race.api.updateSavedFMAnswers(race.input),
    (error) => error.statusCode === 409,
  );
  assert.equal(race.creations.length, 0);
  const foreign = editFixture();
  await assert.rejects(
    foreign.api.updateSavedFMAnswers({
      ...foreign.input,
      answers: {
        ...foreign.input.answers,
        site_photos: ["44444444-4444-4444-a444-444444444444"],
      },
    }),
    /unavailable/,
  );
  assert.equal(foreign.writes.length, 0);
  const wrong = editFixture();
  await assert.rejects(
    wrong.api.updateSavedFMAnswers({ ...wrong.input, productTypeId: 999 }),
    (error) => error.statusCode === 404,
  );
});
test("changing saved primary uploads updates the standard document lists within the same lead and vendor", async () => {
  const f = editFixture();
  f.input.answers = { ...f.input.answers, site_photos: [f.videoId] };
  await f.api.updateSavedFMAnswers(f.input);
  assert.equal(f.deletions.length, 1);
  assert.deepEqual(f.deletions[0].where.doc_sys_name.in, ["fm/old.jpg"]);
  assert.equal(f.deletions[0].where.vendor_id, 7);
  assert.equal(f.deletions[0].where.lead_id, 42);
  assert.equal(f.deletions[0].where.doc_type_id, 10);
  assert.equal(f.creations.length, 1);
  assert.equal(f.creations[0].data.doc_sys_name, "fm/new.mp4");
  assert.ok(
    f.reads.every(
      (query) => query.where.vendor_id === 7 && query.where.lead_id === 42,
    ),
  );
});
test("uploads still referenced by another saved product checklist are retained", async () => {
  const f = editFixture();
  f.setOthers([
    {
      field_snapshot: fields(),
      answers: { site_photos: [f.photoId], fm_document: [f.docId] },
    },
  ]);
  f.input.answers = { ...f.input.answers, site_photos: [f.videoId] };
  await f.api.updateSavedFMAnswers(f.input);
  assert.equal(f.deletions.length, 0);
  assert.equal(f.creations.length, 1);
});

test("tab sections preserve primary uploads and conditional answers and are validated across all tabs", () => {
  const before = fields();
  const tabs = [
    {
      key: "files_tab",
      label: "Files",
      type: "tab",
      required: false,
      fields: before.slice(0, 2),
    },
    {
      key: "site_tab",
      label: "Site checks",
      type: "tab",
      required: false,
      fields: before.slice(2),
    },
  ];
  const parsed = schema.validateFields(tabs);
  assert.deepEqual(
    parsed.map((tab) => tab.key),
    ["files_tab", "site_tab"],
  );
  assert.equal(schema.allFields(parsed).filter((f) => f.purpose).length, 2);
  const answers = schema.validateAnswers(parsed, {
    ...baseAnswers(),
    thiya_marking: "no",
    thiya_marking_no_remark: "No access",
  });
  assert.equal(answers.thiya_marking_no_remark, "No access");
  assert.equal("files_tab" in answers, false);
  assert.throws(
    () => schema.validateAnswers(parsed, { fm_document: [fileId] }),
    (error) => error.fieldKey === "site_photos",
  );
});
test("tabs may not be nested or mixed with flat fields, and do not consume question nesting depth", () => {
  const tab = {
    key: "first_tab",
    label: "First",
    type: "tab",
    required: false,
    fields: [],
  };
  assert.throws(
    () =>
      schema.validateFields([{ ...tab, fields: [{ ...tab, key: "nested" }] }]),
    /top level/,
  );
  assert.throws(
    () =>
      schema.validateFields([
        tab,
        { key: "plain", label: "Plain", type: "text", required: false },
      ]),
    /every top-level/,
  );
  let nested = { key: "leaf", label: "Leaf", type: "text", required: false };
  for (let i = 0; i < 5; i++)
    nested = {
      key: `level_${i}`,
      label: "Group",
      type: "group",
      required: false,
      fields: [nested],
    };
  assert.doesNotThrow(() => schema.validateFields([nested]));
  assert.doesNotThrow(() =>
    schema.validateFields([{ ...tab, fields: [nested] }]),
  );
});
test("saved tab layouts are captured in the response without changing the answer keys", async () => {
  const f = serviceFixture();
  const snapshot = [
    {
      key: "documents_tab",
      label: "Documents",
      type: "tab",
      required: false,
      fields: fields().slice(0, 2),
    },
  ];
  f.setFields(snapshot);
  await f.api.saveFMAnswers(f.db, f.input);
  assert.deepEqual(f.saved[0].create.field_snapshot, snapshot);
  assert.equal(f.saved[0].create.answers.site_photos[0], fileId);
});
