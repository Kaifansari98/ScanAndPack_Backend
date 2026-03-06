import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../../../src/prisma/client";

// ─────────────────────────────────────────────
// Error messages — single source of truth
// ─────────────────────────────────────────────

const ERR = {
  // File
  FILE_MISSING:              "Excel file is required.",
  FILE_INVALID_FORMAT:       "Invalid Excel file format. Please upload a valid Excel sheet.",
  SHEET_NOT_FOUND:           "Excel sheet could not be found. Please upload a valid Excel sheet.",
  SHEET_NO_DATA:             "Excel sheet contains no data rows. Please download the latest Excel sheet.",

  // Column structure
  UNIQUE_CODE_MISSING:       "Unique Code column does not exist in the Excel sheet. Please download the latest Excel sheet.",
  UNIQUE_CODE_DUPLICATE_COL: "Duplicate Unique Code column found in the Excel sheet. Please download the latest Excel sheet.",
  MACHINE_COL_MISSING:       "Machine columns are missing in the Excel sheet. Please download the latest Excel sheet.",
  MACHINE_COL_NOT_IN_DB:     "Machine column does not exist in the system. Please download the latest Excel sheet.",
  MACHINE_COL_DUPLICATE:     "Duplicate machine column found in the Excel sheet. Please download the latest Excel sheet.",
  INVALID_COL_NAME:          "Invalid column name detected in the Excel sheet. Please download the latest Excel sheet.",


  // Unique Code values
  UNIQUE_CODE_EMPTY:         "Unique Code value is empty in the Excel sheet. Please download the latest Excel sheet.",
  UNIQUE_CODE_FORMAT:        "Unique Code format is invalid in the Excel sheet. Please download the latest Excel sheet.",
  UNIQUE_CODE_DUPLICATE_VAL: "Duplicate Unique Code values found in the Excel sheet. Please download the latest Excel sheet.",
  UNIQUE_CODE_INVALID_CHARS: "Unique Code contains invalid characters. Please download the latest Excel sheet.",

  // Machine values
  MACHINE_VAL_EMPTY:         "Machine value is empty in the Excel sheet. Machine value must be 0 or 1. Please download the latest Excel sheet.",
  MACHINE_VAL_INVALID:       "Machine value is invalid in the Excel sheet. Only 0 or 1 is allowed. Please download the latest Excel sheet.",
  MACHINE_VAL_TEXT:          "Machine value must be numeric. Only 0 or 1 is allowed. Please download the latest Excel sheet.",

  // Machine DB
  MACHINE_CODE_NOT_FOUND:    "Machine code does not exist in the system. Please download the latest Excel sheet.",

  ROW_STRUCTURE_INVALID:     "Excel sheet structure is invalid. Please download the latest Excel sheet.",

  // System
  PROJECT_NOT_FOUND:         "Project not found for this vendor.",
  MACHINES_NOT_CONFIGURED:   "No machines are configured for this vendor.",
} as const;

// ─────────────────────────────────────────────
// throwError
// ─────────────────────────────────────────────

const throwError = (message: string): never => {
  const err = new Error("VALIDATION_ERROR");
  (err as any).userMessage = message;
  throw err;
};

// ─────────────────────────────────────────────
// Zod schemas
// ─────────────────────────────────────────────

const UploadInputSchema = z.object({
  vendorId:     z.number().int().positive(),
  projectToken: z.string().min(1),
  createdBy:    z.number().int().positive(),
});

// Valid Unique Code:  <digits>-<uuid>
// e.g.  8-550e8400-e29b-41d4-a716-446655440000
const UNIQUE_CODE_REGEX =
  /^\d+-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Characters allowed in a Unique Code (digits, hyphens, hex letters only)
const UNIQUE_CODE_CHARS_REGEX = /^[0-9a-fA-F-]+$/;

// Valid machine code column name: alphanumeric + optional _ or -
const MACHINE_CODE_NAME_REGEX = /^[A-Za-z0-9_-]+$/;

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

type RawRow = Record<string, unknown>;

interface NormalizedRow {
  "Unique Code": string;
  [machineCode: string]: unknown;
}

export interface UploadResult {
  message: string;
  stats: {
    totalRows:   number;
    skippedRows: number;
    created:     number;
    deleted:     number;
  };
}

// ─────────────────────────────────────────────
// Header helpers
// ─────────────────────────────────────────────

/**
 * Collect every header key that appears in any row.
 * Union across all rows handles XLSX sparse-fill on irregular sheets.
 */
function extractHeaders(rawRows: RawRow[]): string[] {
  const allKeys = new Set<string>();
  for (const row of rawRows) {
    for (const key of Object.keys(row)) allKeys.add(key);
  }
  return [...allKeys];
}

/**
 * XLSX sheet_to_json silently renames duplicate headers to avoid key collisions:
 *
 *   Excel has:       "Unique Code"   "Unique Code"   "CNC1"   "CNC1"
 *   XLSX gives you:  "Unique Code"   "Unique Code_1" "CNC1"   "CNC1_1"
 *
 * We detect the pattern  FOO_N  where N is digits AND  FOO  also exists
 * in the header list — which is the exact fingerprint XLSX leaves.
 *
 * Returns the original (un-suffixed) column name of the first duplicate
 * found, or null if no duplicates exist.
 */
function detectXlsxRenamedDuplicate(trimmedHeaders: string[]): string | null {
  const headerSet    = new Set(trimmedHeaders);
  const suffixRegex  = /^(.+)_(\d+)$/;          // matches "Unique Code_1", "CNC1_2", etc.

  for (const h of trimmedHeaders) {
    const match = h.match(suffixRegex);
    if (match) {
      const base = match[1];                     // "Unique Code" or "CNC1"
      if (headerSet.has(base)) return base;      // original column exists → it was duplicated
    }
  }
  return null;
}

// ─────────────────────────────────────────────
// A — Column-level validation + normalization
//     Throws on the FIRST structural problem found.
// ─────────────────────────────────────────────

function validateColumnsAndNormalize(
  rawRows:    RawRow[],
  machineMap: Map<string, number>,
): NormalizedRow[] {
  const machineCodes   = [...machineMap.keys()];
  const rawHeaders     = extractHeaders(rawRows);
  const trimmedHeaders = rawHeaders.map((h) => h.trim());

  // ── Check 0: XLSX-renamed duplicates ──────────────────────────────────────
  // Must run FIRST because XLSX has already de-duplicated the keys by the time
  // the rows reach this function.  If we skip this, ucCount is always 1 and
  // the duplicate-column error never fires.
  const xlsxDuplicate = detectXlsxRenamedDuplicate(trimmedHeaders);
  if (xlsxDuplicate !== null) {
    if (xlsxDuplicate === "Unique Code") throwError(ERR.UNIQUE_CODE_DUPLICATE_COL);
    throwError(ERR.MACHINE_COL_DUPLICATE);
  }

  // ── Check 1: Blank / whitespace-only column name ──────────────────────────
  if (trimmedHeaders.some((h) => h === "")) throwError(ERR.INVALID_COL_NAME);

  const machineCodeSet = new Set(machineCodes);
  const nonUcHeaders   = trimmedHeaders.filter((h) => h !== "Unique Code");

  // ── Check 2: Duplicate "Unique Code" column (native, belt-and-suspenders) ─
  const ucCount = trimmedHeaders.filter((h) => h === "Unique Code").length;
  if (ucCount > 1) throwError(ERR.UNIQUE_CODE_DUPLICATE_COL);

  // ── Check 3: "Unique Code" column missing ────────────────────────────────
  if (ucCount === 0) throwError(ERR.UNIQUE_CODE_MISSING);


 

  // ── Check 6: Duplicate machine column (native) ───────────────────────────
  const seenHeaders = new Set<string>();
  for (const h of nonUcHeaders) {
    if (seenHeaders.has(h)) throwError(ERR.MACHINE_COL_DUPLICATE);
    seenHeaders.add(h);
  }

  // ── Check 7: Missing machine columns (in DB but absent from Excel) ────────
  const headerSet  = new Set(trimmedHeaders);
  const hasMissing = machineCodes.some((mc) => !headerSet.has(mc));
  if (hasMissing) throwError(ERR.MACHINE_COL_MISSING);

  // ── Normalize rows ────────────────────────────────────────────────────────
  // Keep ONLY "Unique Code" + known machine columns.
  // Pre-fill every expected key with undefined so blank cells (which XLSX
  // drops entirely) are visible to downstream validators.
  const allowedKeys = new Set(["Unique Code", ...machineCodes]);

  return rawRows.map((row) => {
    const normalized: NormalizedRow = { "Unique Code": "" };

    // Default all machine columns to undefined (handles XLSX blank-cell drop)
    for (const mc of machineCodes) {
      (normalized as Record<string, unknown>)[mc] = undefined;
    }

    // Overwrite with actual values; drop any non-allowed column
    for (const [key, value] of Object.entries(row)) {
      const trimmedKey = key.trim();
      if (allowedKeys.has(trimmedKey)) {
        (normalized as Record<string, unknown>)[trimmedKey] = value;
      }
    }

    return normalized;
  });
}

// ─────────────────────────────────────────────
// B — Unique Code row validation  (fail-fast per rule)
// ─────────────────────────────────────────────

function validateUniqueCodes(normalizedRows: NormalizedRow[]): void {
  // Rule 1 — empty value
  for (const row of normalizedRows) {
    const val = String(row["Unique Code"] ?? "").trim();
    if (!val) throwError(ERR.UNIQUE_CODE_EMPTY);
  }

  // Rule 2 — invalid characters (more specific than "bad format")
  // for (const row of normalizedRows) {
  //   const val = String(row["Unique Code"]).trim();
  //   if (!UNIQUE_CODE_CHARS_REGEX.test(val)) throwError(ERR.UNIQUE_CODE_INVALID_CHARS);
  // }

  // Rule 3 — invalid format
  for (const row of normalizedRows) {
    const val = String(row["Unique Code"]).trim();
    if (!UNIQUE_CODE_REGEX.test(val)) throwError(ERR.UNIQUE_CODE_FORMAT);
  }

  // Rule 4 — duplicate values
  const seen = new Set<string>();
  for (const row of normalizedRows) {
    const val = String(row["Unique Code"]).trim();
    if (seen.has(val)) throwError(ERR.UNIQUE_CODE_DUPLICATE_VAL);
    seen.add(val);
  }
}

// ─────────────────────────────────────────────
// C — Machine value validation  (fail-fast: empty → text → invalid)
// ─────────────────────────────────────────────

type MachineValueClass = "valid" | "empty" | "text" | "invalid";

function classifyMachineValue(raw: unknown): MachineValueClass {
  if (raw === undefined || raw === null || raw === "") return "empty";
  if (typeof raw === "string" && isNaN(Number(raw)))   return "text";
  const n = Number(raw);
  if (n === 0 || n === 1)                              return "valid";
  return "invalid";
}

function validateMachineValues(
  normalizedRows: NormalizedRow[],
  machineCodes:   string[],
): void {
  // Each class is fully swept across all rows before moving to the next.
  // Priority order: empty → text → invalid number.
  for (const row of normalizedRows) {
    for (const code of machineCodes) {
      if (classifyMachineValue(row[code]) === "empty")   throwError(ERR.MACHINE_VAL_EMPTY);
    }
  }
  for (const row of normalizedRows) {
    for (const code of machineCodes) {
      if (classifyMachineValue(row[code]) === "text")    throwError(ERR.MACHINE_VAL_TEXT);
    }
  }
  for (const row of normalizedRows) {
    for (const code of machineCodes) {
      if (classifyMachineValue(row[code]) === "invalid") throwError(ERR.MACHINE_VAL_INVALID);
    }
  }
}

// ─────────────────────────────────────────────
// Main service
// ─────────────────────────────────────────────

export const uploadCutListMachineExcel = async (
  vendorId:     number,
  projectToken: string,
  rawRows:      RawRow[],
  createdBy:    number,
): Promise<UploadResult> => {

  // ── STEP 1: Validate inputs ──────────────────────────────
  const inputParse = UploadInputSchema.safeParse({ vendorId, projectToken, createdBy });
  if (!inputParse.success) throwError(ERR.FILE_INVALID_FORMAT);

  // ── STEP 2: Fetch project ────────────────────────────────
  const project = await prisma.projectMaster.findFirst({
    where:  { unique_project_id: projectToken, vendor_id: vendorId },
    select: { id: true },
  });
  if (!project) throwError(ERR.PROJECT_NOT_FOUND);

  const projectId = project!.id;

  // ── STEP 3: Fetch machines ───────────────────────────────
  const machines = await prisma.machineMaster.findMany({
    where:  { vendor_id: vendorId },
    select: { id: true, machine_code: true },
  });
  if (machines.length === 0) throwError(ERR.MACHINES_NOT_CONFIGURED);

  const machineMap   = new Map<string, number>(machines.map((m) => [m.machine_code, m.id]));
  const machineCodes = [...machineMap.keys()];

  // ── STEP 4: Non-empty rows check ────────────────────────
  if (!Array.isArray(rawRows) || rawRows.length === 0) {
    throwError(ERR.SHEET_NO_DATA);
  }

  // ── STEP 5: Column structure validation + normalization ──
  const normalizedRows = validateColumnsAndNormalize(rawRows, machineMap);

  // ── STEP 6: Unique Code validation ──────────────────────
  validateUniqueCodes(normalizedRows);

  // ── STEP 7: Machine value validation ────────────────────
  validateMachineValues(normalizedRows, machineCodes);

  // ── STEP 8: Batch-fetch cutLists ─────────────────────────
  const uniqueCodes = normalizedRows.map((r) => String(r["Unique Code"]).trim());

  const cutLists = await prisma.cutList.findMany({
    where: {
      unique_code: { in: uniqueCodes },
      vendor_id:   vendorId,
      project_id:  projectId,
    },
    select: { id: true, unique_code: true },
  });

  const cutListMap = new Map<string, number>(
    cutLists
      .filter((c) => c.unique_code !== null)
      .map((c)    => [c.unique_code as string, c.id]),
  );

  // ── STEP 9: Batch-fetch existing mappings ────────────────
  const cutListIds = [...cutListMap.values()];

  const existingMappings = await prisma.cutListMachineMapping.findMany({
    where: {
      vendor_id:   vendorId,
      project_id:  projectId,
      cut_list_id: { in: cutListIds },
      machine_id:  { in: [...machineMap.values()] },
    },
    select: { id: true, cut_list_id: true, machine_id: true },
  });

  const existingMappingMap = new Map<string, number>();
  for (const m of existingMappings) {
    existingMappingMap.set(`${m.cut_list_id}:${m.machine_id}`, m.id);
  }

  // ── STEP 10: Build create / delete lists ─────────────────
  const toCreate: Prisma.CutListMachineMappingCreateManyInput[] = [];
  const toDeleteIds: number[] = [];
  let skippedRows = 0;

  for (const row of normalizedRows) {
    const uniqueCode = String(row["Unique Code"]).trim();
    const cutListId  = cutListMap.get(uniqueCode);

    if (!cutListId) {
      skippedRows++;
      continue;
    }

    for (const [machineCode, machineId] of machineMap.entries()) {
      const excelValue = Number(row[machineCode]) as 0 | 1;
      const mappingKey = `${cutListId}:${machineId}`;
      const existingId = existingMappingMap.get(mappingKey);

      if (excelValue === 1 && existingId === undefined) {
        toCreate.push({
          vendor_id:   vendorId,
          project_id:  projectId,
          cut_list_id: cutListId,
          machine_id:  machineId,
          sequence_no: 1,
          status:      "pending",
          created_by:  createdBy,
        });
      } else if (excelValue === 0 && existingId !== undefined) {
        toDeleteIds.push(existingId);
      }
    }
  }

  // ── STEP 11: Transaction (unchanged) ────────────────────
  const [createResult, deleteResult] = await prisma.$transaction([
    prisma.cutListMachineMapping.createMany({
      data:           toCreate,
      skipDuplicates: true,
    }),
    prisma.cutListMachineMapping.deleteMany({
      where: { id: { in: toDeleteIds } },
    }),
  ]);

  return {
    message: "Excel processed successfully.",
    stats: {
      totalRows:   normalizedRows.length,
      skippedRows,
      created:     createResult.count,
      deleted:     deleteResult.count,
    },
  };
};