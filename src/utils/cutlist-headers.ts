// Only spreadsheet-importable fields belong here; IDs and audit fields are server-owned.
// `field` must match a RuleFieldMaster.field_key row - that table is the source of truth
// for the id/label shown in the UI, this list is just the import-time metadata for it.
export const CUTLIST_HEADER_FIELDS = [
  { field: "item_name", label: "Item Name", importField: "name", required: true, aliases: ["name", "description"] },
  { field: "material_details", label: "Article Code", importField: "articleCode", required: true, aliases: ["material details", "articlecode"] },
  { field: "category_name", label: "Category Name", importField: "categoryName", required: false, aliases: ["category"] },
  { field: "group_name", label: "Group Name", importField: "groupName", required: true, aliases: ["group"] },
  { field: "length", label: "Length", importField: "l1", required: true, aliases: ["l1"] },
  { field: "width", label: "Width", importField: "l2", required: true, aliases: ["l2"] },
  { field: "thickness", label: "Thickness", importField: "l3", required: true, aliases: ["l3"] },
  { field: "qty", label: "Qty", importField: "qty", required: true, aliases: ["quantity"] },
  { field: "unique_code", label: "Unique Code", importField: "barcode1", required: false, aliases: ["barcode1", "barcode 1", "unique code 1"] },
  { field: "elf", label: "EL1 / ELF", importField: "el1", required: false, aliases: ["el1", "elf"] },
  { field: "elb", label: "EL2 / ELB", importField: "el2", required: false, aliases: ["el2", "elb"] },
  { field: "esl", label: "SL1 / ESL", importField: "sl1", required: false, aliases: ["sl1", "esl"] },
  { field: "esr", label: "SL2 / ESR", importField: "sl2", required: false, aliases: ["sl2", "esr"] },
  { field: "weight", label: "Weight", importField: "weight", required: false, aliases: ["wt", "wt.", "weight kg", "weight (kg)", "total weight", "totalweight"] },
  { field: "custom_packing_group", label: "Custom Packing Group", importField: "customPackingGroup", required: false, aliases: [] },
] as const;

export const normalizeCutlistHeader = (value: string) => value.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");

// Internal, import-time shape keyed by RuleFieldMaster.field_key.
export type HeaderMapping = { source_header: string; cutlist_field: string | null };
// API/DB-facing shape: the target is a RuleFieldMaster row id.
export type RuleFieldHeaderMapping = { source_header: string; rule_field_id: number | null };
export type AllowedRuleField = { id: number; field_key: string };

export function validateHeaderMappings(value: unknown, allowedFields: AllowedRuleField[]): RuleFieldHeaderMapping[] {
  const fail = (message: string): never => { throw Object.assign(new Error(message), { statusCode: 400 }); };
  if (!Array.isArray(value) || value.length > 200) return fail("Provide at most 200 header mappings.");
  const allowedById = new Map(allowedFields.map((field) => [field.id, field.field_key]));
  const headers = new Set<string>();
  const usedFieldKeys = new Set<string>();
  const result: RuleFieldHeaderMapping[] = [];
  for (const row of value) {
    if (!row || typeof row.source_header !== "string" || !row.source_header.trim() || row.source_header.trim().length > 255) return fail("Each source header must contain between 1 and 255 characters.");
    const header = normalizeCutlistHeader(row.source_header);
    if (headers.has(header)) return fail(`Duplicate Excel header: ${row.source_header}`);
    headers.add(header);
    let rule_field_id: number | null = null;
    if (row.rule_field_id !== null && row.rule_field_id !== undefined) {
      rule_field_id = Number(row.rule_field_id);
      const fieldKey = Number.isInteger(rule_field_id) ? allowedById.get(rule_field_id) : undefined;
      if (!fieldKey) return fail("Unsupported CutList field.");
      if (usedFieldKeys.has(fieldKey)) return fail(`Map ${fieldKey} only once.`);
      usedFieldKeys.add(fieldKey);
    }
    result.push({ source_header: row.source_header.trim(), rule_field_id });
  }
  if (result.length) {
    const missing = CUTLIST_HEADER_FIELDS.filter((field) => field.required && !usedFieldKeys.has(field.field));
    if (missing.length) return fail(`Map all required fields: ${missing.map((field) => field.label).join(", ")}.`);
  }
  return result;
}

export function customImportHeaders(mappings: HeaderMapping[]) {
  return new Map(mappings.map((mapping) => [
    normalizeCutlistHeader(mapping.source_header),
    CUTLIST_HEADER_FIELDS.find((field) => field.field === mapping.cutlist_field)?.importField ?? null,
  ]));
}

export function resolveCutlistColumns<T extends string>(
  headers: { column: number; header: string }[],
  mappings: HeaderMapping[],
  defaults: Record<string, T>,
) {
  type ImportField = typeof CUTLIST_HEADER_FIELDS[number]["importField"];
  const customHeaders = customImportHeaders(mappings);
  const columns: Record<number, T | ImportField> = {};
  for (const { column, header } of headers) {
    const normalized = normalizeCutlistHeader(header);
    if (!normalized) continue;
    const isCustom = customHeaders.has(normalized);
    let field: T | ImportField | null | undefined = isCustom ? customHeaders.get(normalized) : defaults[normalized];
    // Preserve the legacy template's duplicated ELB fallback only without an explicit mapping.
    if (normalized === "elb" && !isCustom) {
      field = Object.values(columns).includes("el2") ? "sl1" : "el2";
    }
    if (!field) continue;
    if (mappings.length && Object.values(columns).includes(field)) {
      throw Object.assign(new Error(`Multiple Excel columns map to ${field}. Keep only one column for each mapped field.`), { statusCode: 400 });
    }
    columns[column] = field;
  }
  return columns;
}
