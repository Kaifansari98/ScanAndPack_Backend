import { z } from "zod";
import fs from "fs";
import ExcelJS from "exceljs";
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
  rotation?: number | null;
}

/* ------------------ ZOD SCHEMA ------------------ */

const requiredString = (field: string) =>
  z.string().min(1, `${field} is required`);

const requiredNumber = (field: string) =>
  z.coerce.number({ error: `${field} is required` });

const itemSchema = z.object({
  articleCode: requiredString("articleCode"),
  groupName: requiredString("groupName"),
  name: requiredString("name"),
  l1: requiredNumber("l1"),
  l2: requiredNumber("l2"),
  l3: requiredNumber("l3"),
  qty: z.coerce
    .number({ error: "qty is required" })
    .int("qty must be an integer")
    .positive("qty must be greater than 0"),
  el1: z.string().optional().nullable(),
  el2: z.string().optional().nullable(),
  sl1: z.string().optional().nullable(),
  sl2: z.string().optional().nullable(),
});

const payloadSchema = z.object({
  projectName: requiredString("projectName"),
  items: z.array(itemSchema).min(1, "At least one item is required"),
});


type ValidationSuccess = { success: true; data: CadbidPayload };
type ValidationFailure = {
  success: false;
  errors: { field_name: string; message: string }[];
};
type ValidationResult = ValidationSuccess | ValidationFailure;


export const validateCutlistPayload = (payload: unknown): ValidationResult => {
  const result = payloadSchema.safeParse(payload);

  if (!result.success) {
    const errors = result.error.issues.map((issue) => ({
      field_name: issue.path.join(".") || "unknown",
      message:
        issue.code === "invalid_type"
          ? `${issue.path.join(".") || "field"} is missing or invalid`
          : issue.message,
    }));

    return { success: false, errors };
  }

  return { success: true, data: result.data as CadbidPayload };
};


export const createProjectService = async (
  vendorToken: string,
  projectName: string,
  vendorId: number,
  file: Express.Multer.File,
) => {
  try {
    logger.info("Project import started", { projectName });

    /* STEP 1 — Parse Excel with proper options */
    const _workbook = new ExcelJS.Workbook();
    await _workbook.xlsx.readFile(file.path);
    const _sheet = _workbook.worksheets[0];
    const _headers: string[] = [];
    const rawRows: unknown[] = [];
    _sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) {
        row.eachCell((cell) => { _headers.push(String(cell.value ?? "")); });
      } else {
        const hasData = row.values.slice(1).some((v) => v !== null && v !== undefined && v !== "");
        if (!hasData) return;
        const obj: Record<string, unknown> = {};
        row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
          const val = cell.text !== "" ? cell.text : null;
          obj[_headers[colNumber - 1]] = val;
        });
        rawRows.push(obj);
      }
    });

    logger.info("Excel parsed", { totalRows: rawRows.length });

    if (!rawRows.length) {
      throw new Error("Excel file is empty or contains only headers");
    }

    /* STEP 1.5 — Clean and deduplicate rows */
    const cleanedRows = cleanAndDeduplicateRows(rawRows);
    
    logger.info("Rows after cleaning", { 
      originalRows: rawRows.length, 
      cleanedRows: cleanedRows.length,
      removedRows: rawRows.length - cleanedRows.length 
    });

    if (!cleanedRows.length) {
      throw new Error("No valid data rows found after cleaning");
    }

    /* STEP 2 — Validate BEFORE Upload */
    const payload = { projectName, items: cleanedRows };
    const validation = validateCutlistPayload(payload);

    if (!validation.success) {
      const errorMessage = validation.errors
        .map((e) => `${e.field_name}: ${e.message}`)
        .join(", ");
      throw new Error(errorMessage);
    }

    const validItems: CadbidItem[] = validation.data.items;

    logger.info("Validation passed", { validItemsCount: validItems.length });

    /* STEP 3 — Resolve Vendor */
    const vendorTokenEntry = await prisma.vendorTokens.findUnique({
      where: { token: vendorToken },
      include: { vendor: true },
    });

    if (!vendorTokenEntry || new Date() > vendorTokenEntry.expiry_date) {
      throw new Error("Invalid or expired vendor token");
    }

    const vendor = vendorTokenEntry.vendor;

    /* STEP 4 — Find Admin User */
    const adminUser = await prisma.userMaster.findFirst({
      where: { vendor_id: vendor.id, user_type_id: 2 },
      orderBy: { created_at: "asc" },
    });

    if (!adminUser) {
      throw new Error("No admin user found for this vendor");
    }

    const createdByUserId = adminUser.id;

    /* STEP 5 — Upload to Wasabi ONLY AFTER VALIDATION PASSES */
    const { key, url } = await uploadToWasabiProjectExcel(
      file.path,
      vendorId,
      file.originalname,
      file.mimetype,
    );

    logger.info("Excel uploaded to Wasabi", { key });

    /* STEP 6 — DB Transaction with proper bulk insert */
    const result = await prisma.$transaction(async (tx) => {
      // Create project
      const project = await tx.projectMaster.create({
        data: {
          project_name: projectName,
          unique_project_id: randomUUID(),
          vendor_id: vendor.id,
          created_by: createdByUserId,
          project_status: "Initiated",
          is_grouping: false,
        },
      });

      logger.info("Project created", { projectId: project.id });

      // ✅ Build cutlist entries - FIXED logic to prevent duplicates
      const bulkRows: Prisma.CutListCreateManyInput[] = [];
      const processedItems = new Set<string>(); // Track processed items

      for (const item of validItems) {
        // Create a unique key for deduplication
        const itemKey = JSON.stringify({
          name: item.name,
          l1: item.l1,
          l2: item.l2,
          l3: item.l3,
          articleCode: item.articleCode,
          groupName: item.groupName,
        });

        // ✅ Process each item only ONCE, not qty times
        if (!processedItems.has(itemKey)) {
          processedItems.add(itemKey);

          // Create ONE entry with the original qty
          bulkRows.push({
            project_id: project.id,
            vendor_id: vendor.id,
            lead_id: null,
            description: item.name,
            length: item.l1,
            width: item.l2,
            thickness: item.l3,
            qty: item.qty, // ✅ Use the actual qty from Excel
            material_details: item.articleCode,
            item_name: item.groupName,
            status: "active",
            created_by: createdByUserId,
            unique_code: `${project.id}-${randomUUID()}`,
            elf: item.el1 ?? null,
            elb: item.el2 ?? null,
            esl: item.sl1 ?? null,
            esr: item.sl2 ?? null,
          });
        }
      }

      logger.info("Bulk rows prepared", { totalEntries: bulkRows.length });

      // ✅ Insert all entries at once
      await tx.cutList.createMany({ data: bulkRows });

      logger.info("Cutlist entries created", { count: bulkRows.length });

      return project;
    });

    /* STEP 7 — Cleanup temp file */
    if (fs.existsSync(file.path)) {
      fs.unlinkSync(file.path);
    }

    logger.info("Project import completed successfully", { 
      projectId: result.id,
      projectName: result.project_name 
    });

    return {
      success: true,
      project_id: result.id,
      excel_url: url,
      storage_key: key,
    };
  } catch (error: any) {
    /* ALWAYS cleanup temp file on error */
    if (file?.path && fs.existsSync(file.path)) {
      fs.unlinkSync(file.path);
      logger.info("Temp file cleaned up after error");
    }

    logger.error("createProjectService failed", { 
      error: error.message,
      stack: error.stack 
    });
    throw error;
  }
};


function cleanAndDeduplicateRows(rows: unknown[]): unknown[] {
  const cleaned: unknown[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    // Skip null/undefined rows
    if (!row || typeof row !== "object") {
      continue;
    }

    // Check if row is empty (all values are null/undefined/empty string)
    const isEmptyRow = Object.values(row).every((val) => {
      return val === null || val === undefined || val === "";
    });

    if (isEmptyRow) {
      continue; // Skip empty rows
    }

    // Create a unique key for the row to detect duplicates
    const rowKey = JSON.stringify(row);

    // Skip if we've already seen this exact row
    if (seen.has(rowKey)) {
      logger.warn("Duplicate row detected and removed", { row });
      continue;
    }

    seen.add(rowKey);
    cleaned.push(row);
  }

  return cleaned;
}
