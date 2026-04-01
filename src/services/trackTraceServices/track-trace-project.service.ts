import { z } from "zod";
import fs from "fs";
import * as XLSX from "xlsx";
import { Prisma, prisma } from "../../../src/prisma/client";
import { randomUUID } from "crypto";
import logger from "../../../src/utils/logger";
import { uploadToWasabiProjectExcel } from "../../../src/utils/wasabiClient";

/* ------------------ TYPES ------------------ */

export interface CadbidPayload {
  projectName: string;
  items: CadbidItem[];
}

export interface CadbidItem {
  articleCode: string;
  groupName: string;
  name: string;
  l1: number;
  l2: number;
  l3: number;
  qty: number;
  el1?: string | null;
  el2?: string | null;
  sl1?: string | null;
  sl2?: string | null;
  uniqueCode?: string | null;
  uniqueCode2?: string | null;
  rotation?: number | null;
}

/* ------------------ COLUMN REGISTRY ------------------
   REQUIRED  → upload fails if header is missing
   OPTIONAL  → accepted when present; null when absent
               ⚠ Misspelled headers (e.g. "EFL" vs "ELF") are rejected
   IGNORED   → present in download template, never read
----------------------------------------------------- */
const REQUIRED_COLUMNS = [
  "Description",
  "Length",
  "Width",
  "Thickness",
  "Qty",
  "Material Details",
  "Item Name",
] as const;

const OPTIONAL_COLUMNS = [
  "ELF",
  "ELB",
  "ESL",
  "ESR",
  "Unique Code",
  "Unique Code 2",
] as const;

const IGNORED_COLUMNS = ["Machine"] as const;

const ALL_KNOWN_COLUMNS = new Set<string>([
  ...REQUIRED_COLUMNS,
  ...OPTIONAL_COLUMNS,
  ...IGNORED_COLUMNS,
]);

/* ------------------ RAW ROW INTERFACE ------------------ */

interface RawExcelRow {
  Description?: unknown;
  Length?: unknown;
  Width?: unknown;
  Thickness?: unknown;
  Qty?: unknown;
  "Material Details"?: unknown;
  "Item Name"?: unknown;
  ELF?: unknown;
  ELB?: unknown;
  ESL?: unknown;
  ESR?: unknown;
  "Unique Code"?: unknown;
  "Unique Code 2"?: unknown;
  Machine?: unknown;
  [key: string]: unknown;
}

/* ------------------ ZOD HELPERS ------------------ */

const requiredString = (field: string) =>
  z.preprocess(
    (val) => (val === null || val === undefined ? "" : String(val).trim()),
    z.string().min(1, `${field} is required`),
  );

/**
 * Numeric fields (Length, Width, Thickness):
 * - null / empty  → "X is required"
 * - alphabets / non-numeric text → "X must be a number, alphabets are not allowed"
 * - negative value → "X must be 0 or greater"
 */
const requiredNumber = (field: string) =>
  z.preprocess(
    (val) => {
      if (val === null || val === undefined || String(val).trim() === "")
        return undefined; // triggers "required" path
      const str = String(val).trim();
      // Reject any value that contains a letter — pure numeric/decimal only
      if (/[a-zA-Z]/.test(str)) return "ALPHA"; // sentinel → custom error below
      const n = Number(str);
      return isNaN(n) ? "NAN" : n; // sentinel for unparseable non-alpha input
    },
    z
      .union([
        z.undefined().transform(() => {
          throw new Error(`${field} is required`);
        }),
        z.literal("ALPHA").transform(() => {
          throw new Error(
            `${field} must be a number, alphabets are not allowed`,
          );
        }),
        z.literal("NAN").transform(() => {
          throw new Error(`${field} must be a valid number`);
        }),
        z
          .number()
          .nonnegative(`${field} must be 0 or greater`),
      ])
      .pipe(z.number()),
  );

/**
 * Qty — same alphabet guard, but must also be a positive integer.
 */
const requiredQty = z.preprocess(
  (val) => {
    if (val === null || val === undefined || String(val).trim() === "")
      return undefined;
    const str = String(val).trim();
    if (/[a-zA-Z]/.test(str)) return "ALPHA";
    const n = Number(str);
    return isNaN(n) ? "NAN" : n;
  },
  z
    .union([
      z.undefined().transform(() => {
        throw new Error("Qty is required");
      }),
      z.literal("ALPHA").transform(() => {
        throw new Error("Qty must be a number, alphabets are not allowed");
      }),
      z.literal("NAN").transform(() => {
        throw new Error("Qty must be a valid number");
      }),
      z
        .number()
        .int("Qty must be a whole number")
        .positive("Qty must be greater than 0"),
    ])
    .pipe(z.number()),
);

const optionalString = (field: string, maxLen: number) =>
  z.preprocess(
    (val) =>
      val === null || val === undefined || String(val).trim() === ""
        ? null
        : String(val).trim(),
    z
      .string()
      .max(maxLen, `${field} must not exceed ${maxLen} characters`)
      .nullable()
      .optional(),
  );

/**
 * Optional Unique Code fields:
 * - blank / null → null (will be auto-generated or skipped)
 * - provided     → must be at least 4 characters
 */
const optionalUniqueCode = (field: string) =>
  z.preprocess(
    (val) =>
      val === null || val === undefined || String(val).trim() === ""
        ? null
        : String(val).trim(),
    z
      .string()
      .min(4, `${field} must be at least 4 characters`)
      .max(500, `${field} must not exceed 500 characters`)
      .nullable()
      .optional(),
  );

/* ------------------ ZOD SCHEMA ------------------ */

const itemSchema = z.object({
  articleCode: requiredString("Material Details"),
  groupName:   requiredString("Item Name"),
  name: z.preprocess(
    (val) => (val === null || val === undefined ? "" : String(val).trim()),
    z
      .string()
      .min(1, "Description is required")
      .max(1000, "Description must not exceed 1000 characters"),
  ),
  l1:  requiredNumber("Length"),
  l2:  requiredNumber("Width"),
  l3:  requiredNumber("Thickness"),
  qty: requiredQty,
  el1:         optionalString("ELF", 255),
  el2:         optionalString("ELB", 255),
  sl1:         optionalString("ESL", 255),
  sl2:         optionalString("ESR", 255),
  uniqueCode:  optionalUniqueCode("Unique Code"),
  uniqueCode2: optionalUniqueCode("Unique Code 2"),
});

const payloadSchema = z.object({
  projectName: z.preprocess(
    (val) => (val === null || val === undefined ? "" : String(val).trim()),
    z
      .string()
      .min(1, "projectName is required")
      .max(255, "projectName must not exceed 255 characters"),
  ),
  items: z.array(itemSchema).min(1, "At least one item is required"),
});

type ValidationSuccess = { success: true; data: CadbidPayload };
type ValidationFailure = {
  success: false;
  errors: { field: string; message: string }[];
};
type ValidationResult = ValidationSuccess | ValidationFailure;

/* ------------------ ZOD VALIDATION ------------------ */

export const validateCutlistPayload = (payload: unknown): ValidationResult => {
  const result = payloadSchema.safeParse(payload);

  if (!result.success) {
    const seen = new Set<string>();
    const errors: { field: string; message: string }[] = [];

    for (const issue of result.error.issues) {
      const fieldKey = issue.path.join(".");
      const fieldRaw = issue.path[issue.path.length - 1];
      const fieldLabel =
        typeof fieldRaw === "string" ? fieldRaw : String(fieldRaw ?? "unknown");

      if (!seen.has(fieldKey)) {
        seen.add(fieldKey);
        errors.push({ field: fieldLabel, message: issue.message });
      }
    }

    return { success: false, errors };
  }

  return { success: true, data: result.data as CadbidPayload };
};

/* ------------------ COLUMN HEADER VALIDATION ------------------ */

function validateExcelHeaders(rows: unknown[]): void {
  if (!rows.length) return;

  const firstRow       = rows[0] as Record<string, unknown>;
  const presentColumns = Object.keys(firstRow);

  // Rule 1 — xlsx generates __EMPTY when data exists but no header
  const noHeaderCols = presentColumns.filter((col) =>
    col.startsWith("__EMPTY"),
  );
  if (noHeaderCols.length > 0) {
    throw new Error(
      `Excel has ${noHeaderCols.length} column(s) with data but no header name. ` +
        `Please add a header to every column before uploading.`,
    );
  }

  // Rule 2 — required columns must all exist
  const missingColumns = REQUIRED_COLUMNS.filter(
    (col) => !presentColumns.includes(col),
  );
  if (missingColumns.length > 0) {
    const list = missingColumns.map((c) => `'${c}'`).join(", ");
    throw new Error(`Required column(s) missing: ${list}.`);
  }

  // Rule 3 — no unrecognised / misspelled column names
  const unknownColumns = presentColumns.filter(
    (col) => !ALL_KNOWN_COLUMNS.has(col),
  );
  if (unknownColumns.length > 0) {
    const list = unknownColumns.map((c) => `'${c}'`).join(", ");
    throw new Error(
      `Unrecognized column(s) found: ${list}. ` +
        `Please use the Cut List download template for uploads.`,
    );
  }
}

/* ------------------ IN-FILE UNIQUE CODE UNIQUENESS CHECK ------------------ */

function validateUniqueCodeUniqueness(items: CadbidItem[]): void {
  const seenCode1 = new Map<string, number>();
  const seenCode2 = new Map<string, number>();
  const errors: string[] = [];

  items.forEach((item, idx) => {
    const rowNum = idx + 1;

    if (item.uniqueCode) {
      if (seenCode1.has(item.uniqueCode)) {
        errors.push(
          `Unique Code '${item.uniqueCode}' is duplicated (row ${seenCode1.get(item.uniqueCode)} and row ${rowNum}).`,
        );
      } else {
        seenCode1.set(item.uniqueCode, rowNum);
      }
    }

    if (item.uniqueCode2) {
      if (seenCode2.has(item.uniqueCode2)) {
        errors.push(
          `Unique Code 2 '${item.uniqueCode2}' is duplicated (row ${seenCode2.get(item.uniqueCode2)} and row ${rowNum}).`,
        );
      } else {
        seenCode2.set(item.uniqueCode2, rowNum);
      }
    }
  });

  if (errors.length > 0) {
    throw new Error(errors.join(" | "));
  }
}

/* ------------------  DB UNIQUE CODE EXISTENCE CHECK  ------------------
   Checks whether any Unique Code or Unique Code 2 value provided in the
   Excel already exists in the CutList table for this vendor.
   Called AFTER in-file uniqueness check, BEFORE any Wasabi/DB write.
-------------------------------------------------------------------- */
async function validateUniqueCodesNotInDB(
  items: CadbidItem[],
  vendorId: number,
): Promise<void> {
  // Collect distinct non-null/non-empty codes from the upload
  const codes1 = [...new Set(
    items.map((i) => i.uniqueCode).filter((c): c is string => !!c && c.trim() !== ""),
  )];
  const codes2 = [...new Set(
    items.map((i) => i.uniqueCode2).filter((c): c is string => !!c && c.trim() !== ""),
  )];

  // Nothing to check if no explicit codes were provided
  if (!codes1.length && !codes2.length) return;

  // Build OR conditions only for non-empty lists
  const orConditions: Prisma.CutListWhereInput[] = [];
  if (codes1.length) orConditions.push({ unique_code:   { in: codes1 } });
  if (codes2.length) orConditions.push({ unique_code_2: { in: codes2 } });

  // Single DB query — fetch all matching rows for this vendor
  const existing = await prisma.cutList.findMany({
    where: {
      vendor_id: vendorId,
      OR: orConditions,
    },
    select: {
      unique_code:   true,
      unique_code_2: true,
    },
  });

  if (!existing.length) return;

  // Build sets of what actually exists in DB
  const dbCodes1 = new Set(
    existing.map((r) => r.unique_code).filter((c): c is string => !!c),
  );
  const dbCodes2 = new Set(
    existing.map((r) => r.unique_code_2).filter((c): c is string => !!c),
  );

  const conflictCodes1 = codes1.filter((c) => dbCodes1.has(c));
  const conflictCodes2 = codes2.filter((c) => dbCodes2.has(c));

  if (!conflictCodes1.length && !conflictCodes2.length) return;

  const parts: string[] = [];

  if (conflictCodes1.length) {
    const preview = conflictCodes1.slice(0, 3).join(", ");
    const extra   = conflictCodes1.length > 3 ? ` and ${conflictCodes1.length - 3} more` : "";
    parts.push(`${conflictCodes1.length} Unique Code(s) already exist: ${preview}${extra}.`);
  }

  if (conflictCodes2.length) {
    const preview = conflictCodes2.slice(0, 3).join(", ");
    const extra   = conflictCodes2.length > 3 ? ` and ${conflictCodes2.length - 3} more` : "";
    parts.push(`${conflictCodes2.length} Unique Code 2(s) already exist: ${preview}${extra}.`);
  }

  throw new Error(parts.join(" "));
}

/* ------------------ ROW MAPPING ------------------ */

function mapRowToItem(row: RawExcelRow): Record<string, unknown> {
  const getString = (val: unknown): string | null => {
    if (val === null || val === undefined || val === "") return null;
    return String(val).trim();
  };

  return {
    articleCode:  getString(row["Material Details"]),
    groupName:    getString(row["Item Name"]),
    name:         getString(row["Description"]),
    l1:           row["Length"],
    l2:           row["Width"],
    l3:           row["Thickness"],
    qty:          row["Qty"],
    el1:          getString(row["ELF"]),
    el2:          getString(row["ELB"]),
    sl1:          getString(row["ESL"]),
    sl2:          getString(row["ESR"]),
    uniqueCode:   getString(row["Unique Code"]),
    uniqueCode2:  getString(row["Unique Code 2"]),
    // "Machine" intentionally omitted
  };
}

/* ------------------ ROW CLEANING & DEDUPLICATION ------------------ */

function cleanAndDeduplicateRows(rows: unknown[]): unknown[] {
  const cleaned: unknown[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    if (!row || typeof row !== "object") continue;

    const r = row as RawExcelRow;

    const relevantValues = [
      r["Description"],
      r["Length"],
      r["Width"],
      r["Thickness"],
      r["Qty"],
      r["Material Details"],
      r["Item Name"],
    ];

    const isEmptyRow = relevantValues.every(
      (val) => val === null || val === undefined || val === "",
    );
    if (isEmptyRow) continue;

    const rowKey = JSON.stringify({
      description:     r["Description"],
      length:          r["Length"],
      width:           r["Width"],
      thickness:       r["Thickness"],
      qty:             r["Qty"],
      materialDetails: r["Material Details"],
      itemName:        r["Item Name"],
      elf:             r["ELF"],
      elb:             r["ELB"],
      esl:             r["ESL"],
      esr:             r["ESR"],
      uniqueCode:      r["Unique Code"],
      uniqueCode2:     r["Unique Code 2"],
    });

    if (seen.has(rowKey)) {
      logger.warn("Duplicate row detected and removed", { row });
      continue;
    }

    seen.add(rowKey);
    cleaned.push(mapRowToItem(r));
  }

  return cleaned;
}

/* ------------------ MAIN SERVICE ------------------ */

export const createProjectService = async (
  vendorToken: string,
  projectName: string,
  vendorId: number,
  file: Express.Multer.File,
) => {
  try {
    logger.info("Project import started", { projectName });

    /* STEP 1 — Parse Excel */
    const workbook = XLSX.readFile(file.path);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];

    const rawRows: unknown[] = XLSX.utils.sheet_to_json(sheet, {
      defval: null,
      blankrows: false,
      raw: false,
    });

    logger.info("Excel parsed", { totalRows: rawRows.length });

    if (!rawRows.length) {
      throw new Error("Excel file is empty or has no data rows.");
    }

    /* STEP 1.5 — Validate column headers
       • Columns with no header name (data in unnamed columns) → error
       • Required columns missing → error
       • Unrecognised / misspelled column names → error               */
    validateExcelHeaders(rawRows);

    /* STEP 2 — Clean, deduplicate, and map rows */
    const cleanedRows = cleanAndDeduplicateRows(rawRows);

    logger.info("Rows after cleaning", {
      originalRows: rawRows.length,
      cleanedRows:  cleanedRows.length,
      removedRows:  rawRows.length - cleanedRows.length,
    });

    if (!cleanedRows.length) {
      throw new Error("No valid data rows found after cleaning.");
    }

    /* STEP 3 — Validate full payload with Zod
       Catches: missing required fields, alphabets in numeric fields,
       Description > 1000 chars, Unique Code < 4 chars, etc.         */
    const payload = { projectName, items: cleanedRows };
    const validation = validateCutlistPayload(payload);

    if (!validation.success) {
      const errorMessage = validation.errors.map((e) => e.message).join(" | ");
      throw new Error(errorMessage);
    }

    const validItems: CadbidItem[] = validation.data.items;

    logger.info("Validation passed", { validItemsCount: validItems.length });

    /* STEP 3.5 — In-file Unique Code uniqueness check
       Ensures no duplicate codes within this upload itself.          */
    validateUniqueCodeUniqueness(validItems);
    logger.info("In-file unique code check passed");

    /* STEP 3.6 — DB Unique Code existence check
       Ensures codes do not already exist in the system for this vendor.
       Runs before any Wasabi upload or DB write.                     */
    await validateUniqueCodesNotInDB(validItems, vendorId);
    logger.info("DB unique code existence check passed");

    /* STEP 4 — Resolve Vendor Token */
    const vendorTokenEntry = await prisma.vendorTokens.findUnique({
      where: { token: vendorToken },
      include: { vendor: true },
    });

    if (!vendorTokenEntry || new Date() > vendorTokenEntry.expiry_date) {
      throw new Error("Invalid or expired vendor token.");
    }

    const vendor = vendorTokenEntry.vendor;

    /* STEP 5 — Find Admin User */
    const adminUser = await prisma.userMaster.findFirst({
      where: { vendor_id: vendor.id, user_type_id: 2 },
      orderBy: { created_at: "asc" },
    });

    if (!adminUser) {
      throw new Error("No admin user found for this vendor.");
    }

    const createdByUserId = adminUser.id;

    /* STEP 6 — Upload to Wasabi ONLY AFTER ALL VALIDATIONS PASS */
    const { key, url } = await uploadToWasabiProjectExcel(
      file.path,
      vendorId,
      file.originalname,
      file.mimetype,
    );

    logger.info("Excel uploaded to Wasabi", { key });

    /* STEP 7 — DB Transaction */
    const result = await prisma.$transaction(async (tx) => {
      const project = await tx.projectMaster.create({
        data: {
          project_name:      projectName,
          unique_project_id: randomUUID(),
          vendor_id:         vendor.id,
          created_by:        createdByUserId,
          project_status:    "Initiated",
          is_grouping:       false,
        },
      });

      logger.info("Project created", { projectId: project.id });

      const bulkRows: Prisma.CutListCreateManyInput[] = [];
      const processedItems = new Set<string>();

      for (const item of validItems) {
        const itemKey = JSON.stringify({
          name:        item.name,
          l1:          item.l1,
          l2:          item.l2,
          l3:          item.l3,
          articleCode: item.articleCode,
          groupName:   item.groupName,
          uniqueCode:  item.uniqueCode,
          uniqueCode2: item.uniqueCode2,
        });

        if (!processedItems.has(itemKey)) {
          processedItems.add(itemKey);

          bulkRows.push({
            project_id:       project.id,
            vendor_id:        vendor.id,
            lead_id:          null,
            description:      item.name,
            length:           item.l1,
            width:            item.l2,
            thickness:        item.l3,
            qty:              item.qty,
            material_details: item.articleCode,
            item_name:        item.groupName,
            status:           "active",
            created_by:       createdByUserId,
            unique_code:      item.uniqueCode ?? `${project.id}-${randomUUID()}`,
            unique_code_2:    item.uniqueCode2 ?? null,
            elf:              item.el1 ?? null,
            elb:              item.el2 ?? null,
            esl:              item.sl1 ?? null,
            esr:              item.sl2 ?? null,
          });
        }
      }

      logger.info("Bulk rows prepared", { totalEntries: bulkRows.length });

      await tx.cutList.createMany({ data: bulkRows });

      logger.info("Cutlist entries created", { count: bulkRows.length });

      return project;
    });

    /* STEP 8 — Cleanup temp file */
    if (fs.existsSync(file.path)) {
      fs.unlinkSync(file.path);
    }

    logger.info("Project import completed successfully", {
      projectId:   result.id,
      projectName: result.project_name,
    });

    return {
      success:     true,
      project_id:  result.id,
      excel_url:   url,
      storage_key: key,
    };
  } catch (error: any) {
    if (file?.path && fs.existsSync(file.path)) {
      fs.unlinkSync(file.path);
      logger.info("Temp file cleaned up after error");
    }

    logger.error("createProjectService failed", {
      error: error.message,
      stack: error.stack,
    });
    throw error;
  }
};