import { z } from "zod";
import fs from "fs";
import ExcelJS from "exceljs";
import { prisma } from "../../../src/prisma/client";
import { randomUUID } from "crypto";
import logger from "../../../src/utils/logger";
import { uploadToWasabiProjectExcel } from "../../../src/utils/wasabiClient";
import { PackingType, BoxStatus } from "../../../generated/prisma_client/enums";
import {
  syncProjectBoxInfoFields,
} from "../../services/trackTraceServices/boxInfoField.service";


/* ------------------ TYPES ------------------ */

type BoxRemovalOption = {
  id: number;
  box_name: string;
  item_count: number;
  can_remove: boolean;
};

export interface CadbidPayload {
  projectName: string;
  lead_id: number;
  items: CadbidItem[];
}

export interface CadbidItem {
  articleCode: string;
  groupName: string;
  categoryName?: string | null;
  procurement?: string | null;

  name: string;
  l1: number;
  l2: number;
  l3: number;
  qty: number;
  weight?: number | string | null;

  barcode1?: string | null;
  barcode2?: string | null;

  el1?: string | null;
  el2?: string | null;
  sl1?: string | null;
  sl2?: string | null;
}

/* ------------------ HELPERS ------------------ */

const cleanText = (value: unknown): string => {
  if (value === null || value === undefined) return "";
  return String(value).trim();
};

const normalizeHeader = (header: string): string => {
  return header
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[_-]/g, " ");
};

const toNullableString = (value: unknown): string | null => {
  const text = cleanText(value);
  return text ? text : null;
};

const toNumberOrRaw = (value: unknown): unknown => {
  if (value === null || value === undefined || value === "") return value;

  const text = String(value).trim();

  if (!text) return null;

  const parsed = Number(text);

  return Number.isNaN(parsed) ? value : parsed;
};

const requiredString = (field: string) =>
  z.string().min(1, `${field} blank`);

const requiredNumber = (field: string) =>
  z.coerce.number({ error: `${field} missing` });

const normalizeNoOfBoxes = (value: unknown): number => {
  if (value === null || value === undefined || value === "") {
    return 0;
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    throw new Error("No of boxes must be a valid number");
  }

  if (!Number.isInteger(parsed)) {
    throw new Error("No of boxes must be an integer");
  }

  if (parsed < 0) {
    throw new Error("No of boxes cannot be negative");
  }

  return parsed;
};

const parseNumberArray = (value: unknown): number[] => {
  if (value === null || value === undefined || value === "") {
    return [];
  }

  let parsedValue = value;

  if (typeof value === "string") {
    try {
      parsedValue = JSON.parse(value);
    } catch {
      parsedValue = value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
    }
  }

  if (!Array.isArray(parsedValue)) {
    return [];
  }

  return Array.from(
    new Set(
      parsedValue
        .map((item) => Number(item))
        .filter((item) => Number.isInteger(item) && item > 0)
    )
  );
};

const getProjectBoxRemovalOptions = async (
  client: any,
  projectId: number,
  vendorId: number
) => {
  const boxes = await client.boxMaster.findMany({
    where: {
      project_id: projectId,
      vendor_id: vendorId,
      is_deleted: false,
    },
    select: {
      id: true,
      box_name: true,
      box_status: true,
      created_date: true,
    },
    orderBy: [
      {
        created_date: "asc",
      },
      {
        id: "asc",
      },
    ],
  });

  if (!boxes.length) {
    return [];
  }

  const mappings = await client.cutListMachineMapping.findMany({
    where: {
      project_id: projectId,
      vendor_id: vendorId,
      box_id: {
        in: boxes.map((box: any) => box.id),
      },
    },
    select: {
      box_id: true,
    },
  });

  const itemCountMap = new Map<number, number>();

  for (const mapping of mappings) {
    if (!mapping.box_id) {
      continue;
    }

    itemCountMap.set(
      mapping.box_id,
      (itemCountMap.get(mapping.box_id) || 0) + 1
    );
  }

  return boxes.map((box: any, index: number) => {
    const itemCount = itemCountMap.get(box.id) || 0;

    return {
      id: box.id,
      box_name: box.box_name,
      sequence_no: index + 1,
      box_status: box.box_status,
      item_count: itemCount,
      can_remove: itemCount === 0,
    };
  });
};

const createProjectBoxes = async ({
  tx,
  projectId,
  vendorId,
  projectDetailsId,
  leadId,
  createdBy,
  startSequence,
  count,
}: {
  tx: any;
  projectId: number;
  vendorId: number;
  projectDetailsId: number;
  leadId: number | null;
  createdBy: number;
  startSequence: number;
  count: number;
}) => {
  if (count <= 0) {
    return;
  }

  await tx.boxMaster.createMany({
    data: Array.from({ length: count }, (_, index) => ({
      project_id: projectId,
      vendor_id: vendorId,
      project_details_id: projectDetailsId,
      lead_id: leadId,
      box_name: String(startSequence + index),
      box_status: BoxStatus.unpacked,
      created_by: createdBy,
    })),
  });
};

const renumberEmptyBoxesOnly = async (
  tx: any,
  projectId: number,
  vendorId: number
) => {
  const activeBoxes = await tx.boxMaster.findMany({
    where: {
      project_id: projectId,
      vendor_id: vendorId,
      is_deleted: false,
    },
    select: {
      id: true,
      box_name: true,
      created_date: true,
    },
    orderBy: [
      { created_date: "asc" },
      { id: "asc" },
    ],
  });

  if (activeBoxes.length === 0) {
    return;
  }

  const boxIds = activeBoxes.map((box: { id: number }) => box.id);

  const itemCounts = await tx.cutListMachineMapping.groupBy({
    by: ["box_id"],
    where: {
      project_id: projectId,
      vendor_id: vendorId,
      box_id: {
        in: boxIds,
      },
    },
    _count: {
      id: true,
    },
  });

  const occupiedBoxIds = new Set<number>(
    itemCounts
      .filter((item: { box_id: number | null; _count: { id: number } }) => {
        return Boolean(item.box_id) && item._count.id > 0;
      })
      .map((item: { box_id: number | null }) => Number(item.box_id))
  );

  /*
  |--------------------------------------------------------------------------
  | Do not change box_name if item is already present in that box
  |--------------------------------------------------------------------------
  */
  const usedOccupiedBoxNames = new Set<string>(
    activeBoxes
      .filter((box: { id: number }) => occupiedBoxIds.has(box.id))
      .map((box: { box_name: string | null }) =>
        String(box.box_name || "").trim()
      )
      .filter(Boolean)
  );

  const emptyBoxes = activeBoxes.filter(
    (box: { id: number }) => !occupiedBoxIds.has(box.id)
  );

  const availableNames: string[] = [];

  for (let i = 1; i <= activeBoxes.length; i++) {
    const name = String(i);

    if (!usedOccupiedBoxNames.has(name)) {
      availableNames.push(name);
    }
  }

  for (const box of emptyBoxes) {
    const nextName = availableNames.shift();

    if (!nextName) {
      continue;
    }

    if (String(box.box_name || "").trim() === nextName) {
      continue;
    }

    await tx.boxMaster.update({
      where: {
        id: box.id,
      },
      data: {
        box_name: nextName,
      },
    });
  }
};

const createAdditionalBoxes = async ({
  tx,
  projectId,
  vendorId,
  projectDetailsId,
  leadId,
  createdBy,
  count,
}: {
  tx: any;
  projectId: number;
  vendorId: number;
  projectDetailsId: number;
  leadId: number | null;
  createdBy: number;
  count: number;
}) => {
  if (count <= 0) {
    return;
  }

  const existingBoxes = await tx.boxMaster.findMany({
    where: {
      project_id: projectId,
      vendor_id: vendorId,
      is_deleted: false,
    },
    select: {
      box_name: true,
    },
  });

  const usedNames = new Set<string>(
    existingBoxes
      .map((box: { box_name: string | null }) =>
        String(box.box_name || "").trim()
      )
      .filter(Boolean)
  );

  const data: any[] = [];
  let nextNumber = 1;

  while (data.length < count) {
    const boxName = String(nextNumber);

    if (!usedNames.has(boxName)) {
      data.push({
        project_id: projectId,
        vendor_id: vendorId,
        project_details_id: projectDetailsId,
        lead_id: leadId,
        box_name: boxName,
        box_status: BoxStatus.unpacked,
        is_deleted: false,
        created_by: createdBy,
      });

      usedNames.add(boxName);
    }

    nextNumber++;
  }

  await tx.boxMaster.createMany({
    data,
  });
};

const buildBoxRemovalSelectionResponse = ({
  requestedBoxCount,
  currentBoxCount,
  removeCount,
  boxes,
  message,
}: {
  requestedBoxCount: number;
  currentBoxCount: number;
  removeCount: number;
  boxes: any[];
  message?: string;
}) => {
  return {
    success: false,
    message:
      message ||
      `Select ${removeCount} empty box${removeCount > 1 ? "es" : ""} to remove`,
    data: {
      requires_box_removal_selection: true,
      requested_no_of_boxes: requestedBoxCount,
      current_no_of_boxes: currentBoxCount,
      remove_count: removeCount,
      boxes,
      removable_boxes: boxes.filter((box) => box.can_remove),
      blocked_boxes: boxes.filter((box) => !box.can_remove),
    },
  };
};


const optionalWeight = z.preprocess((value) => {
  if (value === null || value === undefined || value === "") {
    return 0;
  }

  if (typeof value === "string") {
    return value
      .replace(/,/g, "")
      .replace(/kg/gi, "")
      .trim();
  }

  return value;
}, z.coerce.number().min(0, "weight cannot be negative").default(0));

/**
 * Excel headers supported:
 *
 * Item Name      -> name
 * Article Code   -> articleCode
 * Category Name  -> categoryName
 * Group Name     -> groupName
 * Length         -> l1
 * Width          -> l2
 * Thickness      -> l3
 * Qty            -> qty
 * Weight         -> weight
 * Unique Code    -> barcode1
 * Barcode 1      -> barcode1
 * Barcode 2      -> barcode2
 * Unique Code 2  -> barcode2
 * ELF            -> el1
 * ELB            -> el2
 * ESL            -> sl1
 * ESR            -> sl2
 * Procurement    -> procurement
 * Customer ID    -> customer_id
 */
const HEADER_FIELD_MAP: Record<string, keyof CadbidItem | "customer_id"> = {
  "item name": "name",
  "name": "name",
  "description": "name",

  "article code": "articleCode",
  "articlecode": "articleCode",
  "material details": "articleCode",

  "category name": "categoryName",
  "category": "categoryName",

  "group name": "groupName",
  "group": "groupName",

  "length": "l1",
  "l1": "l1",

  "width": "l2",
  "l2": "l2",

  "thickness": "l3",
  "l3": "l3",

  "qty": "qty",
  "quantity": "qty",
  "weight": "weight",
  "wt": "weight",
  "wt.": "weight",
  "weight kg": "weight",
  "weight (kg)": "weight",
  "total weight": "weight",
  "totalweight": "weight",
  "total_weight": "weight",
  "unique code": "barcode1",
  "barcode1": "barcode1",
  "barcode 1": "barcode1",
  "unique code 1": "barcode1",

  "barcode2": "barcode2",
  "barcode 2": "barcode2",
  "unique code 2": "barcode2",

  "elf": "el1",
  "el1": "el1",

  "elb": "el2",
  "el2": "el2",

  "esl": "sl1",
  "sl1": "sl1",

  "esr": "sl2",
  "sl2": "sl2",

  "procurement": "procurement",

  "customer id": "customer_id",
  "customer_id": "customer_id",
  "customerid": "customer_id",
};

function getCellValue(cell: ExcelJS.Cell): unknown {
  const value = cell.value;

  if (value === null || value === undefined) return null;

  if (typeof value === "object") {
    if ("text" in value && value.text) return value.text;
    if ("result" in value) return value.result;
    if ("richText" in value && Array.isArray(value.richText)) {
      return value.richText.map((r: any) => r.text).join("");
    }
  }

  return cell.text !== "" ? cell.text : value;
}

async function parseProjectExcel(filePath: string): Promise<{
  customerIdFromExcel: number | null;
  items: CadbidItem[];
}> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);

  const sheet = workbook.worksheets[0];

  if (!sheet) {
    throw new Error("Excel sheet not found");
  }

  const headerMap: Record<number, keyof CadbidItem | "customer_id"> = {};
  let customerIdFromExcel: number | null = null;

  const headerRow = sheet.getRow(1);

  headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    const rawHeader = cleanText(getCellValue(cell));
    const normalized = normalizeHeader(rawHeader);

    if (!normalized) return;

    const mappedField = HEADER_FIELD_MAP[normalized];

    /**
     * Your shared Excel has duplicate ELB headers:
     * ELF | ELB | ELB | ESR
     *
     * First ELB should be el2.
     * Second ELB is treated as sl1 fallback.
     */
    if (normalized === "elb") {
      const alreadyHasEl2 = Object.values(headerMap).includes("el2");

      headerMap[colNumber] = alreadyHasEl2 ? "sl1" : "el2";
      return;
    }

    if (mappedField) {
      headerMap[colNumber] = mappedField;
    }
  });

  const items: CadbidItem[] = [];

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;

    const rawRowValues = (row.values as ExcelJS.CellValue[]).slice(1);

    const hasData = rawRowValues.some((value) => {
      return (
        value !== null &&
        value !== undefined &&
        String(value).trim() !== ""
      );
    });

    if (!hasData) return;

    const item: Partial<CadbidItem> = {};

    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const field = headerMap[colNumber];

      if (!field) return;

      const value = getCellValue(cell);

      if (field === "customer_id") {
        const parsedCustomerId = Number(value);

        if (!Number.isNaN(parsedCustomerId) && parsedCustomerId > 0) {
          customerIdFromExcel = parsedCustomerId;
        }

        return;
      }

      if (["l1", "l2", "l3", "qty", "weight"].includes(field)) {
        (item as any)[field] = toNumberOrRaw(value);
      } else {
        (item as any)[field] = toNullableString(value);
      }
    });

    items.push(item as CadbidItem);
  });

  return {
    customerIdFromExcel,
    items: cleanAndDeduplicateRows(items),
  };
}

function cleanAndDeduplicateRows(rows: CadbidItem[]): CadbidItem[] {
  const cleaned: CadbidItem[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    if (!row || typeof row !== "object") continue;

    const isEmptyRow = Object.values(row).every((value) => {
      return value === null || value === undefined || String(value).trim() === "";
    });

    if (isEmptyRow) continue;

    const rowKey = JSON.stringify({
      articleCode: cleanText(row.articleCode),
      groupName: cleanText(row.groupName),
      categoryName: cleanText(row.categoryName),
      name: cleanText(row.name),
      l1: row.l1,
      l2: row.l2,
      l3: row.l3,
      qty: row.qty,
      weight: row.weight,
      barcode1: cleanText(row.barcode1),
      barcode2: cleanText(row.barcode2),
      el1: cleanText(row.el1),
      el2: cleanText(row.el2),
      sl1: cleanText(row.sl1),
      sl2: cleanText(row.sl2),
      procurement: cleanText(row.procurement),
    });

    if (seen.has(rowKey)) {
      logger.warn("Duplicate row detected and removed", { row });
      continue;
    }

    seen.add(rowKey);
    cleaned.push(row);
  }

  return cleaned;
}

/* ------------------ VALIDATION ------------------ */

const itemSchema = z.object({
  articleCode: requiredString("articleCode"),
  groupName: requiredString("groupName"),
  categoryName: z.string().optional().nullable(),
  procurement: z.string().optional().nullable(),

  l1: requiredNumber("l1"),
  l2: requiredNumber("l2"),
  l3: requiredNumber("l3"),

  name: requiredString("name"),

  qty: z.coerce
    .number()
    .int()
    .positive("qty must be greater than 0"),

  weight: optionalWeight,

  barcode1: z.string().optional().nullable(),
  barcode2: z.string().optional().nullable(),

  el1: z.string().optional().nullable(),
  el2: z.string().optional().nullable(),
  sl1: z.string().optional().nullable(),
  sl2: z.string().optional().nullable(),
});

const payloadSchema = z.object({
  projectName: requiredString("projectName"),
  lead_id: z.coerce.number({ error: "lead_id missing" }),
  items: z.array(itemSchema).min(1, "items missing"),
});

type ValidationSuccess = {
  success: true;
  data: z.infer<typeof payloadSchema>;
};

type ValidationFailure = {
  success: false;
  errors: {
    field_name: string;
    message: string;
  }[];
};

type ValidationResult = ValidationSuccess | ValidationFailure;

export const validateCutlistPayload = (payload: unknown): ValidationResult => {
  const result = payloadSchema.safeParse(payload);

  if (!result.success) {
    const errors = result.error.issues.map((issue) => ({
      field_name: issue.path.join("."),
      message:
        issue.code === "invalid_type"
          ? "missing"
          : issue.message.includes("blank")
            ? "blank"
            : issue.message,
    }));

    return {
      success: false,
      errors,
    };
  }

  return {
    success: true,
    data: result.data,
  };
};

/* ------------------ MAIN SERVICE ------------------ */

export type BoxInfoFieldPayload = {
  id?: number;
  field_label: string;
  field_type?: "TEXT" | "NUMBER" | "DATE" | "TEXTAREA";
  is_required?: boolean;
  sort_order?: number;
  active?: boolean;
};


export type CreateProjectServicePayload = {
  projectName: string;
  vendorId: number;
  leadId?: number | null;

  order_no?: string;
  client_name?: string;
  client_address?: string;
  client_contact_no?: string;

  packing_type?: PackingType;

  no_of_boxes?: number | string | null;

  box_info_fields?: BoxInfoFieldPayload[];

  created_by?: number;

  file: Express.Multer.File;
};




export const createProjectService_old = async (
  payloadData: CreateProjectServicePayload
) => {
  const {
    projectName,
    vendorId,
    leadId,
    order_no,
    client_name,
    client_address,
    client_contact_no,
    packing_type,
    no_of_boxes,
    box_info_fields = [],
    created_by,
    file,
  } = payloadData;

  let resolvedVendorId: number | null = null;
  let resolvedProjectId: number | null = null;
  let resolvedVendorToken: string | null = null;

  try {
    logger.info("Project Excel import started", {
      projectName,
      vendorId,
      leadId,
      fileName: file.originalname,
    });

    /*
    |--------------------------------------------------------------------------
    | STEP 0 — Resolve vendor
    |--------------------------------------------------------------------------
    */
    const vendor = await prisma.vendorMaster.findFirst({
      where: {
        id: Number(vendorId),
      },
      select: {
        id: true,
        is_crm_enabled: true,
        is_tracktrace_enabled: true,
        is_scanpack_enabled: true,
        is_available_unique_code: true,
      },
    });

    if (!vendor) {
      throw new Error("Vendor not found");
    }

    const resolvedPackingType:
      PackingType =
      packing_type ===
        PackingType.GROUPWISE
        ? PackingType.GROUPWISE
        : PackingType.DEFAULT;

    const requestedBoxCount = normalizeNoOfBoxes(no_of_boxes);

    resolvedVendorId = vendor.id;

    /*
    |--------------------------------------------------------------------------
    | STEP 0.1 — Get active vendor token
    |--------------------------------------------------------------------------
    */
    const vendorTokenEntry = await prisma.vendorTokens.findFirst({
      where: {
        vendor_id: vendor.id,
        expiry_date: {
          gt: new Date(),
        },
      },
      orderBy: {
        expiry_date: "desc",
      },
    });

    if (!vendorTokenEntry) {
      throw new Error("Vendor token not found or expired");
    }

    resolvedVendorToken = vendorTokenEntry.token;

    /*
    |--------------------------------------------------------------------------
    | STEP 0.2 — Resolve lead/client/order details
    |--------------------------------------------------------------------------
    */
    let lead_id: number | null = null;

    let resolvedOrderNo = order_no?.trim() || null;
    let resolvedClientName = client_name?.trim() || null;
    let resolvedClientAddress = client_address?.trim() || null;
    let resolvedClientContactNo = client_contact_no?.trim() || null;

    if (vendor.is_crm_enabled && leadId && Number(leadId) > 0) {
      const lead = await prisma.leadMaster.findFirst({
        where: {
          id: Number(leadId),
          vendor_id: vendor.id,
        },
        select: {
          id: true,
          lead_code: true,
          firstname: true,
          lastname: true,
          contact_no: true,
          site_address: true,
        },
      });

      if (!lead) {
        throw new Error("Invalid lead_id for this vendor");
      }

      lead_id = lead.id;

      const leadClientName = [lead.firstname, lead.lastname]
        .filter(Boolean)
        .join(" ")
        .trim();

      resolvedOrderNo = resolvedOrderNo || lead.lead_code || null;
      resolvedClientName = leadClientName || resolvedClientName;
      resolvedClientAddress = lead.site_address || resolvedClientAddress;
      resolvedClientContactNo = lead.contact_no || resolvedClientContactNo;
    } else {
      if (!resolvedOrderNo) {
        throw new Error("Order number is required");
      }

      if (!resolvedClientName) {
        throw new Error("Client name is required");
      }

      if (!resolvedClientAddress) {
        throw new Error("Client address is required");
      }

      if (!resolvedClientContactNo) {
        throw new Error("Client contact number is required");
      }
    }

    /*
    |--------------------------------------------------------------------------
    | STEP 0.3 — Initial API log
    |--------------------------------------------------------------------------
    */
    try {
      await prisma.apiRequestLog.create({
        data: {
          endpoint: "createProjectService_excel_upload",
          vendor_token: resolvedVendorToken,
          vendor_id: resolvedVendorId,
          payload: {
            projectName,
            vendorId,
            leadId,
            order_no: resolvedOrderNo,
            client_name: resolvedClientName,
            client_address: resolvedClientAddress,
            client_contact_no: resolvedClientContactNo,
            fileName: file.originalname,
          } as any,
          success: false,
          response: "",
          error: null,
          project_id: resolvedProjectId,
        },
      });
    } catch (logError) {
      logger.warn("Failed to write initial api log", { logError });
    }

    /*
    |--------------------------------------------------------------------------
    | STEP 1 — Parse Excel
    |--------------------------------------------------------------------------
    */
    const parsedExcel = await parseProjectExcel(file.path);
    console.log(parsedExcel);

    logger.info("Excel parsed", {
      totalRows: parsedExcel.items.length,
    });

    if (!parsedExcel.items.length) {
      throw new Error("Excel file is empty or contains only headers");
    }

    /*
    |--------------------------------------------------------------------------
    | STEP 2 — Validate Excel payload
    |--------------------------------------------------------------------------
    */
    const payload = {
      projectName,
      lead_id,
      items: parsedExcel.items,
    };

    const validation = validateCutlistPayload(payload);

    if (!validation.success) {
      const errorMessage = validation.errors
        .map((e) => `${e.field_name}: ${e.message}`)
        .join(", ");

      throw new Error(errorMessage);
    }

    const validPayload = validation.data;

    logger.info("Validation passed", {
      validItemsCount: validPayload.items.length,
      lead_id,
    });

    /*
    |--------------------------------------------------------------------------
    | STEP 3 — Check duplicate barcode1 within Excel
    |--------------------------------------------------------------------------
    */
    const uniqueCodesToInsert = validPayload.items
      .map((item) => cleanText(item.barcode1))
      .filter(Boolean);

    if (vendor.is_available_unique_code) {
      const rowsWithoutUniqueCode = validPayload.items
        .map((item, index) => ({
          rowNumber: index + 2,
          uniqueCode: cleanText(item.barcode1),
        }))
        .filter((item) => !item.uniqueCode)
        .map((item) => item.rowNumber);

      if (rowsWithoutUniqueCode.length > 0) {
        throw new Error(
          `Unique Code is required in Excel row${
            rowsWithoutUniqueCode.length > 1 ? "s" : ""
          }: ${rowsWithoutUniqueCode.join(", ")}`
        );
      }
    }

    const duplicatesInPayload = uniqueCodesToInsert.filter(
      (code, index) => uniqueCodesToInsert.indexOf(code) !== index
    );

    if (duplicatesInPayload.length > 0) {
      throw new Error(
        `Duplicate barcodes found in Excel: ${[
          ...new Set(duplicatesInPayload),
        ].join(", ")}`
      );
    }

    /*
    |--------------------------------------------------------------------------
    | STEP 4 — Check duplicate barcode1 in DB based on vendor configuration
    |--------------------------------------------------------------------------
    |
    | Rules:
    | 1. Duplicate barcode inside the same Excel is already blocked above.
    | 2. If Track & Trace is enabled, barcode must be unique in database.
    | 3. If Track & Trace is disabled and Scan & Pack is enabled,
    |    barcode can already exist in database.
    |
    */
    const shouldAllowDatabaseDuplicateBarcode =
      vendor.is_tracktrace_enabled === false &&
      vendor.is_scanpack_enabled === true;

    const shouldCheckDatabaseBarcodeDuplicate =
      vendor.is_tracktrace_enabled === true ||
      !shouldAllowDatabaseDuplicateBarcode;

    if (shouldCheckDatabaseBarcodeDuplicate && uniqueCodesToInsert.length > 0) {
      const existingCodes = await prisma.cutList.findMany({
        where: {
          vendor_id: vendor.id,
          unique_code: {
            in: uniqueCodesToInsert,
          },
        },
        select: {
          unique_code: true,
        },
      });

      if (existingCodes.length > 0) {
        throw new Error(
          `Duplicate barcodes found in database: ${existingCodes
            .map((c) => c.unique_code)
            .join(", ")}`
        );
      }
    }

    /*
    |--------------------------------------------------------------------------
    | STEP 5 — Resolve admin user
    |--------------------------------------------------------------------------
    */
    const adminUser = await prisma.userMaster.findFirst({
      where: {
        vendor_id: vendor.id,
        user_type_id: 2,
      },
      orderBy: {
        created_at: "asc",
      },
    });

    if (!adminUser) {
      throw new Error("No admin user found for this vendor");
    }

    const createdByUserId = adminUser.id;

    /*
    |--------------------------------------------------------------------------
    | STEP 6 — Pre-fetch category type mappings
    |--------------------------------------------------------------------------
    */
    const categoryMappings = await prisma.projectCategoriesMaster.findMany({
      where: {
        vendor_id: vendor.id,
        status: "Yes",
      },
      select: {
        category_name: true,
        projectCategoriesMasterVendorMapping: {
          select: {
            project_categories_type_master_id: true,
          },
        },
      },
    });

    const categoryTypeMap = new Map<string, number[]>();

    for (const category of categoryMappings) {
      const typeIds = category.projectCategoriesMasterVendorMapping.map(
        (mapping) => mapping.project_categories_type_master_id
      );

      categoryTypeMap.set(category.category_name.trim().toLowerCase(), typeIds);
    }

    /*
    |--------------------------------------------------------------------------
    | STEP 7 — Upload to Wasabi only after validation passes
    |--------------------------------------------------------------------------
    */
    const { key, url } = await uploadToWasabiProjectExcel(
      file.path,
      vendor.id,
      file.originalname,
      file.mimetype
    );

    logger.info("Excel uploaded to Wasabi", { key });

    const unique_project_id = randomUUID();

    /*
    |--------------------------------------------------------------------------
    | STEP 8 — Transaction
    |--------------------------------------------------------------------------
    */
    const result = await prisma.$transaction(
      async (tx) => {
        const project = await tx.projectMaster.create({
          data: {
            project_name: validPayload.projectName,
            unique_project_id,
            vendor_id: vendor.id,
            created_by: createdByUserId,
            project_status: "Initiated",
            is_grouping: false,
            lead_id,
            packing_type,
            order_no: resolvedOrderNo,
            client_name: resolvedClientName,
            client_address: resolvedClientAddress,
            client_contact_no: resolvedClientContactNo,
            no_of_boxes: requestedBoxCount,
          },
        });

        await syncProjectBoxInfoFields({
          tx,

          projectId:
            project.id,

          vendorId:
            vendor.id,

          fields:
            box_info_fields,

          userId:
            created_by ||
            createdByUserId,
        });

        resolvedProjectId = project.id;

        const totalItems = validPayload.items.reduce((sum, item) => {
          return sum + Number(item.qty);
        }, 0);

        const projectDetails = await tx.projectDetails.create({
          data: {
            project_id: project.id,
            vendor_id: vendor.id,
            lead_id,
            room_name: validPayload.projectName,
            total_items: totalItems,
            total_packed: 0,
            total_unpacked: totalItems,
            is_grouping: false,
            start_date: new Date(),
            estimated_completion_date: null,
          },
        });

        await createProjectBoxes({
          tx,
          projectId: project.id,
          vendorId: vendor.id,
          projectDetailsId: projectDetails.id,
          leadId: lead_id,
          createdBy: createdByUserId,
          startSequence: 1,
          count: requestedBoxCount,
        });

        /*
        |--------------------------------------------------------------------------
        | Fetch machines only once
        |--------------------------------------------------------------------------
        */
        const machines = await tx.machineMaster.findMany({
          where: {
            vendor_id: vendor.id,
            status: "ACTIVE",
            machine_type_id: {
              in: [3, 7, 11, 17, 18],
            },
          },
          select: {
            id: true,
            machine_type_id: true,
            sequence_no: true,
            status: true,
          },
          orderBy: {
            id: "asc",
          },
        });

        const getMachine = (
          machineTypeId: number,
          activeOnly: boolean = false
        ) => {
          return machines.find((machine) => {
            if (machine.machine_type_id !== machineTypeId) return false;
            if (activeOnly && machine.status !== "ACTIVE") return false;

            return true;
          });
        };

        const toNumber = (value: any): number => {
          if (value === undefined || value === null || value === "") {
            return 0;
          }

          const numericValue = Number(
            String(value)
              .replace(/,/g, "")
              .replace(/kg/gi, "")
              .trim()
          );

          return Number.isFinite(numericValue) ? numericValue : 0;
        };

        const roundWeight = (value: number): number => {
          return Number(value.toFixed(7));
        };

        const cutListMachineMappingRows: any[] = [];

        const pushMachineMappingRows = ({
          cutListId,
          machine,
          quantity,
          perItemWeight,
        }: {
          cutListId: number;
          machine: {
            id: number;
            machine_type_id: number | null;
            sequence_no: number | null;
          };
          quantity: number;
          perItemWeight: number;
        }) => {
          for (let i = 0; i < quantity; i++) {
            cutListMachineMappingRows.push({
              cut_list_id: cutListId,
              machine_id: machine.id,
              project_id: project.id,
              vendor_id: vendor.id,
              lead_id,
              sequence_no: machine.sequence_no ?? 0,
              status: "Pending",
              created_by: createdByUserId,
              expected_in: true,
              /*
              |--------------------------------------------------------------------------
              | Weight is stored only against packaging machine type 18
              |--------------------------------------------------------------------------
              */
              weight:
                Number(machine.machine_type_id) === 18
                  ? perItemWeight
                  : 0,
            });
          }
        };

        /*
        |--------------------------------------------------------------------------
        | Create cutlist rows and machine mappings
        |--------------------------------------------------------------------------
        */
        for (const item of validPayload.items) {
          const quantity = Number(item.qty);

          /*
          |--------------------------------------------------------------------------
          | Excel weight
          |--------------------------------------------------------------------------
          | Excel weight is per-piece weight.
          | Example: qty = 4 and weight = 6
          | CutList.weight = 24
          | CutListMachineMapping.weight = 6 only for machine type 18
          |--------------------------------------------------------------------------
          */
          const excelRowWeight = roundWeight(
            toNumber((item as any).weight) * quantity
          );
          const perItemWeight =
            quantity > 0 ? roundWeight(excelRowWeight / quantity) : 0;

          const hasEdgeBanding =
            !!item.el1 || !!item.el2 || !!item.sl1 || !!item.sl2;

          const row = await tx.cutList.create({
            data: {
              project_id: project.id,
              vendor_id: vendor.id,
              description: item.name,
              length: Number(item.l1),
              width: Number(item.l2),
              thickness: Number(item.l3),
              qty: quantity,
              material_details: item.articleCode,
              item_name: item.name,
              status: "Active",
              created_by: createdByUserId,
              lead_id,
              elf: item.el1 || "",
              elb: item.el2 || "",
              esl: item.sl1 || "",
              esr: item.sl2 || "",
              unique_code: "",
              unique_code_2: item.barcode2 || null,
              group_name: item.groupName || null,
              category_name: item.categoryName || null,
              procurement: item.procurement || null,
              weight: excelRowWeight,
            },
          });

          const uniqueCode =
            cleanText(item.barcode1) || String(row.id);

          await tx.cutList.update({
            where: {
              id: row.id,
            },
            data: {
              unique_code: uniqueCode,
            },
          });

          const itemCategoryName = (item.categoryName ?? "")
            .trim()
            .toLowerCase();

          const categoryTypeIds = categoryTypeMap.get(itemCategoryName) ?? [];

          const hasType4 = categoryTypeIds.includes(4);
          const hasType3 = categoryTypeIds.includes(3);
          const hasType1Or2 = categoryTypeIds.some(
            (typeId) => typeId === 1 || typeId === 2
          );

          const isNormalFlow = hasType1Or2 || categoryTypeIds.length === 0;

          /*
          |--------------------------------------------------------------------------
          | Type 4 — Skip machine mapping
          |--------------------------------------------------------------------------
          */
          if (hasType4) {
            continue;
          }

          /*
          |--------------------------------------------------------------------------
          | Type 3 — Only Scan/Pack machine types 17 and 18
          |--------------------------------------------------------------------------
          */
          if (hasType3 && !isNormalFlow) {
            const scanMachine = getMachine(17, true);
            const packMachine = getMachine(18, true);

            if (scanMachine) {
              pushMachineMappingRows({
                cutListId: row.id,
                machine: scanMachine,
                quantity,
                perItemWeight,
              });
            }

            if (packMachine) {
              pushMachineMappingRows({
                cutListId: row.id,
                machine: packMachine,
                quantity,
                perItemWeight,
              });
            }

            continue;
          }

          /*
          |--------------------------------------------------------------------------
          | Normal flow
          |--------------------------------------------------------------------------
          */
          if (hasEdgeBanding) {
            const edgeBandingMachine = getMachine(11, true);

            // if (!edgeBandingMachine) {
            //   throw new Error("Edgebanding machine is not configured");
            // }

            if (edgeBandingMachine) {
              pushMachineMappingRows({
                cutListId: row.id,
                machine: edgeBandingMachine,
                quantity,
                perItemWeight,
              });
            }


          }

          const cuttingMachine = getMachine(3, true);

          if (cuttingMachine) {
            pushMachineMappingRows({
              cutListId: row.id,
              machine: cuttingMachine,
              quantity,
              perItemWeight,
            });
          }

          if (Number(item.l3) > 9) {
            const cncMachine = getMachine(7, true);

            if (cncMachine) {
              pushMachineMappingRows({
                cutListId: row.id,
                machine: cncMachine,
                quantity,
                perItemWeight,
              });
            }
          }

          const scanMachine = getMachine(17, true);
          const packMachine = getMachine(18, true);

          if (scanMachine) {
            pushMachineMappingRows({
              cutListId: row.id,
              machine: scanMachine,
              quantity,
              perItemWeight,
            });
          }

          if (packMachine) {
            pushMachineMappingRows({
              cutListId: row.id,
              machine: packMachine,
              quantity,
              perItemWeight,
            });
          }
        }

        /*
        |--------------------------------------------------------------------------
        | Bulk insert machine mappings
        |--------------------------------------------------------------------------
        */
        const chunkSize = 1000;

        for (let i = 0; i < cutListMachineMappingRows.length; i += chunkSize) {
          const chunk = cutListMachineMappingRows.slice(i, i + chunkSize);

          await tx.cutListMachineMapping.createMany({
            data: chunk,
          });
        }

        return project;
      },
      {
        maxWait: 10000,
        timeout: 30000,
      }
    );

    /*
    |--------------------------------------------------------------------------
    | STEP 9 — Success API log
    |--------------------------------------------------------------------------
    */
    try {
      await prisma.apiRequestLog.create({
        data: {
          endpoint: "createProjectService_excel_upload",
          vendor_token: resolvedVendorToken,
          vendor_id: vendor.id,
          payload: {
            ...validPayload,
            order_no: resolvedOrderNo,
            client_name: resolvedClientName,
            client_address: resolvedClientAddress,
            client_contact_no: resolvedClientContactNo,
          } as any,
          success: true,
          response: {
            project_id: result.id,
            unique_project_id,
            excel_url: url,
            storage_key: key,
          } as any,
          error: null,
          project_id: result.id,
        },
      });
    } catch (logError) {
      logger.warn("Failed to write success api log", { logError });
    }

    if (fs.existsSync(file.path)) {
      fs.unlinkSync(file.path);
    }

    logger.info("Project Excel import completed successfully", {
      projectId: result.id,
      projectName: result.project_name,
    });

    return {
      success: true,
      message: "Project created successfully",
      project_id: result.id,
      unique_project_id,
      excel_url: url,
      storage_key: key,
    };
  } catch (error: any) {
    if (file?.path && fs.existsSync(file.path)) {
      fs.unlinkSync(file.path);
      logger.info("Temp file cleaned up after error");
    }

    try {
      await prisma.apiRequestLog.create({
        data: {
          endpoint: "createProjectService_excel_upload",
          vendor_token: resolvedVendorToken,
          vendor_id: resolvedVendorId,
          payload: {
            projectName,
            vendorId,
            leadId,
            order_no,
            client_name,
            client_address,
            client_contact_no,
            fileName: file?.originalname,
          } as any,
          success: false,
          response: "",
          error: error.message,
          project_id: resolvedProjectId,
        },
      });
    } catch (logError) {
      logger.warn("Failed to write failure api log", { logError });
    }

    logger.error("createProjectService failed", {
      error: error.message,
      stack: error.stack,
    });

    throw error;
  }
};

export const createProjectService = async (
  payloadData: CreateProjectServicePayload
) => {
  const {
    projectName,
    vendorId,
    leadId,
    order_no,
    client_name,
    client_address,
    client_contact_no,
    packing_type,
    no_of_boxes,
    box_info_fields = [],
    created_by,
    file,
  } = payloadData;

  let resolvedVendorId: number | null = null;
  let resolvedProjectId: number | null = null;
  let resolvedVendorToken: string | null = null;

  try {
    logger.info("Project Excel import started", {
      projectName,
      vendorId,
      leadId,
      fileName: file.originalname,
    });

    /*
    |--------------------------------------------------------------------------
    | STEP 0 — Resolve vendor
    |--------------------------------------------------------------------------
    */
    const vendor = await prisma.vendorMaster.findFirst({
      where: {
        id: Number(vendorId),
      },
      select: {
        id: true,
        is_crm_enabled: true,
        is_tracktrace_enabled: true,
        is_scanpack_enabled: true,
        is_available_unique_code: true,
      },
    });

    if (!vendor) {
      throw new Error("Vendor not found");
    }

    const resolvedPackingType:
      PackingType =
      packing_type ===
        PackingType.GROUPWISE
        ? PackingType.GROUPWISE
        : PackingType.DEFAULT;

    const requestedBoxCount = normalizeNoOfBoxes(no_of_boxes);

    resolvedVendorId = vendor.id;

    /*
    |--------------------------------------------------------------------------
    | STEP 0.1 — Workstation configuration
    |--------------------------------------------------------------------------
    | Same rules as handelItems:
    |
    | is_tracktrace_enabled = true
    | -> machine types 3, 7, 11
    |
    | is_scanpack_enabled = true
    | -> machine types 17, 18
    |
    | both true
    | -> machine types 3, 7, 11, 17, 18
    |--------------------------------------------------------------------------
    */

    const isTrackTraceEnabled =
      vendor.is_tracktrace_enabled === true;

    const isScanPackEnabled =
      vendor.is_scanpack_enabled === true;

    if (!isTrackTraceEnabled && !isScanPackEnabled) {
      throw new Error("workstation not configured");
    }

    const enabledMachineTypeIds = [
      ...(isTrackTraceEnabled ? [3, 7, 11] : []),
      ...(isScanPackEnabled ? [17, 18] : []),
    ];

    /*
    |--------------------------------------------------------------------------
    | STEP 0.2 — Get active vendor token
    |--------------------------------------------------------------------------
    */
    const vendorTokenEntry = await prisma.vendorTokens.findFirst({
      where: {
        vendor_id: vendor.id,
        expiry_date: {
          gt: new Date(),
        },
      },
      orderBy: {
        expiry_date: "desc",
      },
    });

    if (!vendorTokenEntry) {
      throw new Error("Vendor token not found or expired");
    }

    resolvedVendorToken = vendorTokenEntry.token;

    /*
    |--------------------------------------------------------------------------
    | STEP 0.3 — Resolve lead/client/order details
    |--------------------------------------------------------------------------
    */
    let lead_id: number | null = null;

    let resolvedOrderNo = order_no?.trim() || null;
    let resolvedClientName = client_name?.trim() || null;
    let resolvedClientAddress = client_address?.trim() || null;
    let resolvedClientContactNo = client_contact_no?.trim() || null;

    if (vendor.is_crm_enabled && leadId && Number(leadId) > 0) {
      const lead = await prisma.leadMaster.findFirst({
        where: {
          id: Number(leadId),
          vendor_id: vendor.id,
        },
        select: {
          id: true,
          lead_code: true,
          firstname: true,
          lastname: true,
          contact_no: true,
          site_address: true,
        },
      });

      if (!lead) {
        throw new Error("Invalid lead_id for this vendor");
      }

      lead_id = lead.id;

      const leadClientName = [lead.firstname, lead.lastname]
        .filter(Boolean)
        .join(" ")
        .trim();

      resolvedOrderNo = resolvedOrderNo || lead.lead_code || null;
      resolvedClientName = leadClientName || resolvedClientName;
      resolvedClientAddress = lead.site_address || resolvedClientAddress;
      resolvedClientContactNo = lead.contact_no || resolvedClientContactNo;
    } else {
      if (!resolvedOrderNo) {
        throw new Error("Order number is required");
      }

      if (!resolvedClientName) {
        throw new Error("Client name is required");
      }

      if (!resolvedClientAddress) {
        throw new Error("Client address is required");
      }

      if (!resolvedClientContactNo) {
        throw new Error("Client contact number is required");
      }
    }

    /*
    |--------------------------------------------------------------------------
    | STEP 0.4 — Initial API log
    |--------------------------------------------------------------------------
    */
    try {
      await prisma.apiRequestLog.create({
        data: {
          endpoint: "createProjectService_excel_upload",
          vendor_token: resolvedVendorToken,
          vendor_id: resolvedVendorId,
          payload: {
            projectName,
            vendorId,
            leadId,
            order_no: resolvedOrderNo,
            client_name: resolvedClientName,
            client_address: resolvedClientAddress,
            client_contact_no: resolvedClientContactNo,
            fileName: file.originalname,
          } as any,
          success: false,
          response: "",
          error: null,
          project_id: resolvedProjectId,
        },
      });
    } catch (logError) {
      logger.warn("Failed to write initial api log", { logError });
    }

    /*
    |--------------------------------------------------------------------------
    | STEP 1 — Parse Excel
    |--------------------------------------------------------------------------
    */
    const parsedExcel = await parseProjectExcel(file.path);
    console.log(parsedExcel);

    logger.info("Excel parsed", {
      totalRows: parsedExcel.items.length,
    });

    if (!parsedExcel.items.length) {
      throw new Error("Excel file is empty or contains only headers");
    }

    /*
    |--------------------------------------------------------------------------
    | STEP 2 — Validate Excel payload
    |--------------------------------------------------------------------------
    */
    const payload = {
      projectName,
      lead_id,
      items: parsedExcel.items,
    };

    const validation = validateCutlistPayload(payload);

    if (!validation.success) {
      const errorMessage = validation.errors
        .map((e) => `${e.field_name}: ${e.message}`)
        .join(", ");

      throw new Error(errorMessage);
    }

    const validPayload = validation.data;

    logger.info("Validation passed", {
      validItemsCount: validPayload.items.length,
      lead_id,
    });

    /*
    |--------------------------------------------------------------------------
    | STEP 3 — Check duplicate barcode1 within Excel
    |--------------------------------------------------------------------------
    */
    const uniqueCodesToInsert = validPayload.items
      .map((item) => cleanText(item.barcode1))
      .filter(Boolean);

    if (vendor.is_available_unique_code) {
      const rowsWithoutUniqueCode = validPayload.items
        .map((item, index) => ({
          rowNumber: index + 2,
          uniqueCode: cleanText(item.barcode1),
        }))
        .filter((item) => !item.uniqueCode)
        .map((item) => item.rowNumber);

      if (rowsWithoutUniqueCode.length > 0) {
        throw new Error(
          `Unique Code is required in Excel row${
            rowsWithoutUniqueCode.length > 1 ? "s" : ""
          }: ${rowsWithoutUniqueCode.join(", ")}`
        );
      }
    }

    const duplicatesInPayload = uniqueCodesToInsert.filter(
      (code, index) => uniqueCodesToInsert.indexOf(code) !== index
    );

    if (duplicatesInPayload.length > 0) {
      throw new Error(
        `Duplicate barcodes found in Excel: ${[
          ...new Set(duplicatesInPayload),
        ].join(", ")}`
      );
    }

    /*
    |--------------------------------------------------------------------------
    | STEP 4 — Check duplicate barcode1 in DB based on vendor configuration
    |--------------------------------------------------------------------------
    |
    | Rules:
    | 1. Duplicate barcode inside the same Excel is already blocked above.
    | 2. If Track & Trace is enabled, barcode must be unique in database.
    | 3. If Track & Trace is disabled and Scan & Pack is enabled,
    |    barcode can already exist in database.
    |
    */
    const shouldAllowDatabaseDuplicateBarcode =
      vendor.is_tracktrace_enabled === false &&
      vendor.is_scanpack_enabled === true;

    const shouldCheckDatabaseBarcodeDuplicate =
      vendor.is_tracktrace_enabled === true ||
      !shouldAllowDatabaseDuplicateBarcode;

    if (shouldCheckDatabaseBarcodeDuplicate && uniqueCodesToInsert.length > 0) {
      const existingCodes = await prisma.cutList.findMany({
        where: {
          vendor_id: vendor.id,
          unique_code: {
            in: uniqueCodesToInsert,
          },
        },
        select: {
          unique_code: true,
        },
      });

      if (existingCodes.length > 0) {
        const databaseDuplicates = [
          ...new Set(
            existingCodes
              .map((code) => code.unique_code)
              .filter(
                (code): code is string =>
                  Boolean(code)
              )
          ),
        ];

        throw new Error(
          `Duplicate barcodes found in database: ${databaseDuplicates.join(
            ", "
          )}`
        );
      }
    }

    /*
    |--------------------------------------------------------------------------
    | STEP 5 — Resolve admin user
    |--------------------------------------------------------------------------
    */
    const adminUser = await prisma.userMaster.findFirst({
      where: {
        vendor_id: vendor.id,
        user_type_id: 2,
      },
      orderBy: {
        created_at: "asc",
      },
    });

    if (!adminUser) {
      throw new Error("No admin user found for this vendor");
    }

    const createdByUserId = adminUser.id;

    /*
    |--------------------------------------------------------------------------
    | STEP 6 — Pre-fetch category type mappings
    |--------------------------------------------------------------------------
    */
    const categoryMappingsRaw =
      await prisma.projectCategoriesMaster.findMany({
        where: {
          vendor_id: vendor.id,
          status: "Yes",
        },
        select: {
          id: true,
          category_name: true,
          use_in_assembled_packing: true,
          include_in_packing: true,
          scan_pack_validate: true,
          projectCategoriesMasterVendorMapping: {
            select: {
              project_categories_type_master_id: true,
            },
          },
        },
      });

    const categoryMappings =
      categoryMappingsRaw.map((category) => ({
        ...category,
        category_name: category.category_name.trim(),
      }));

    type CategoryConfig = {
      id: number;
      use_in_assembled_packing: boolean;
      include_in_packing: boolean;
      scan_pack_validate: boolean;
    };

    const categoryTypeMap = new Map<string, number[]>();
    const categoryMasterMap =
      new Map<string, CategoryConfig>();

    for (const category of categoryMappings) {
      const categoryKey =
        category.category_name.trim().toLowerCase();

      const typeIds =
        category.projectCategoriesMasterVendorMapping.map(
          (mapping) =>
            mapping.project_categories_type_master_id
        );

      categoryTypeMap.set(categoryKey, typeIds);

      categoryMasterMap.set(categoryKey, {
        id: category.id,
        use_in_assembled_packing:
          category.use_in_assembled_packing === true,
        include_in_packing:
          category.include_in_packing === true,
        scan_pack_validate:
          category.scan_pack_validate === true,
      });
    }

    /*
    |--------------------------------------------------------------------------
    | STEP 7 — Pre-fetch enabled machines once
    |--------------------------------------------------------------------------
    | Same as handelItems.
    | Do not query machineMaster inside the item loop / transaction.
    |--------------------------------------------------------------------------
    */

    const machines =
      await prisma.machineMaster.findMany({
        where: {
          vendor_id: vendor.id,
          status: "ACTIVE",
          machine_type_id: {
            in: enabledMachineTypeIds,
          },
        },
        select: {
          id: true,
          machine_type_id: true,
          sequence_no: true,
          status: true,
        },
        orderBy: {
          id: "asc",
        },
      });

    const getMachine = (
      machineTypeId: number,
      activeOnly: boolean = false
    ) => {
      return machines.find((machine) => {
        if (machine.machine_type_id !== machineTypeId) {
          return false;
        }

        if (
          activeOnly &&
          machine.status !== "ACTIVE"
        ) {
          return false;
        }

        return true;
      });
    };

    const toNumber = (value: any): number => {
      if (
        value === undefined ||
        value === null ||
        value === ""
      ) {
        return 0;
      }

      const numericValue = Number(
        String(value)
          .replace(/,/g, "")
          .replace(/kg/gi, "")
          .trim()
      );

      return Number.isFinite(numericValue)
        ? numericValue
        : 0;
    };

    const roundWeight = (value: number): number => {
      return Number(value.toFixed(7));
    };

    /*
    |--------------------------------------------------------------------------
    | STEP 8 — Upload to Wasabi only after validation passes
    |--------------------------------------------------------------------------
    */
    const { key, url } = await uploadToWasabiProjectExcel(
      file.path,
      vendor.id,
      file.originalname,
      file.mimetype
    );

    logger.info("Excel uploaded to Wasabi", { key });

    const unique_project_id = randomUUID();

    /*
    |--------------------------------------------------------------------------
    | STEP 9 — Transaction
    |--------------------------------------------------------------------------
    */
    const result = await prisma.$transaction(
      async (tx) => {
        const project = await tx.projectMaster.create({
          data: {
            project_name: validPayload.projectName,
            unique_project_id,
            vendor_id: vendor.id,
            created_by: createdByUserId,
            project_status: "Initiated",
            is_grouping: false,
            lead_id,
            packing_type: resolvedPackingType,
            order_no: resolvedOrderNo,
            client_name: resolvedClientName,
            client_address: resolvedClientAddress,
            client_contact_no: resolvedClientContactNo,
            no_of_boxes: requestedBoxCount,
          },
        });

        await syncProjectBoxInfoFields({
          tx,

          projectId:
            project.id,

          vendorId:
            vendor.id,

          fields:
            box_info_fields,

          userId:
            created_by ||
            createdByUserId,
        });

        resolvedProjectId = project.id;

        const totalItems = validPayload.items.reduce((sum, item) => {
          return sum + Number(item.qty);
        }, 0);

        const projectDetails = await tx.projectDetails.create({
          data: {
            project_id: project.id,
            vendor_id: vendor.id,
            lead_id,
            room_name: validPayload.projectName,
            total_items: totalItems,
            total_packed: 0,
            total_unpacked: totalItems,
            is_grouping: false,
            start_date: new Date(),
            estimated_completion_date: null,
          },
        });

        await createProjectBoxes({
          tx,
          projectId: project.id,
          vendorId: vendor.id,
          projectDetailsId: projectDetails.id,
          leadId: lead_id,
          createdBy: createdByUserId,
          startSequence: 1,
          count: requestedBoxCount,
        });

        /*
        |--------------------------------------------------------------------------
        | Machine mappings are accumulated and inserted in bulk
        |--------------------------------------------------------------------------
        */

        const cutListMachineMappingRows: any[] = [];

        const pushMachineMappingRows = ({
          cutListId,
          machine,
          quantity,
          perItemWeight,
        }: {
          cutListId: number;
          machine: {
            id: number;
            machine_type_id: number | null;
            sequence_no: number | null;
          };
          quantity: number;
          perItemWeight: number;
        }) => {
          for (let i = 0; i < quantity; i++) {
            cutListMachineMappingRows.push({
              cut_list_id: cutListId,
              machine_id: machine.id,
              project_id: project.id,
              vendor_id: vendor.id,
              lead_id,
              sequence_no: machine.sequence_no ?? 0,
              status: "Pending",
              created_by: createdByUserId,
              expected_in: true,
              /*
              |--------------------------------------------------------------------------
              | Weight is stored only against packaging machine type 18
              |--------------------------------------------------------------------------
              */
              weight:
                Number(machine.machine_type_id) === 18
                  ? perItemWeight
                  : 0,
            });
          }
        };

        /*
        |--------------------------------------------------------------------------
        | Create cutlist rows and machine mappings
        |--------------------------------------------------------------------------
        */
        for (const item of validPayload.items) {
          const quantity = Number(item.qty);

          /*
          |--------------------------------------------------------------------------
          | Excel weight
          |--------------------------------------------------------------------------
          | Excel weight is per-piece weight.
          | Example: qty = 4 and weight = 6
          | CutList.weight = 24
          | CutListMachineMapping.weight = 6 only for machine type 18
          |--------------------------------------------------------------------------
          */
          const excelRowWeight = roundWeight(
            toNumber((item as any).weight) * quantity
          );
          const perItemWeight =
            quantity > 0 ? roundWeight(excelRowWeight / quantity) : 0;

          const hasEdgeBanding =
            !!item.el1 || !!item.el2 || !!item.sl1 || !!item.sl2;

          const itemCategoryName = (item.categoryName ?? "")
            .trim()
            .toLowerCase();

          const categoryConfig = categoryMasterMap.get(itemCategoryName) ?? null;

          /*
          |--------------------------------------------------------------------------
          | Packaging machine type 18 category rule
          |--------------------------------------------------------------------------
          | If category does not exist, keep old/default behaviour.
          | If category exists:
          | - include_in_packing = false => do not create packaging machine 18 row.
          | - include_in_packing = true and scan_pack_validate = true => create packaging 18 row.
          | - include_in_packing = true and scan_pack_validate = false => only CutList stores item;
          |   no packaging machine 18 row will be created.
          |--------------------------------------------------------------------------
          */
          const shouldInsertPackagingMachineMapping =
            !categoryConfig ||
            (categoryConfig.include_in_packing === true &&
              categoryConfig.scan_pack_validate === true);

          const row = await tx.cutList.create({
            data: {
              project_id: project.id,
              vendor_id: vendor.id,
              description: item.name,
              length: Number(item.l1),
              width: Number(item.l2),
              thickness: Number(item.l3),
              qty: quantity,
              material_details: item.articleCode,
              item_name: item.name,
              status: "Active",
              created_by: createdByUserId,
              lead_id,
              elf: item.el1 || "",
              elb: item.el2 || "",
              esl: item.sl1 || "",
              esr: item.sl2 || "",
              unique_code: "",
              unique_code_2: item.barcode2 || null,
              group_name: item.groupName || null,
              category_name: item.categoryName || null,
              category_id: categoryConfig?.id ?? null,

              /*
              |--------------------------------------------------------------------------
              | Category snapshot
              |--------------------------------------------------------------------------
              | Same as handelItems.
              | If category is not found these remain null.
              |--------------------------------------------------------------------------
              */
              use_in_assembled_packing:
                categoryConfig?.use_in_assembled_packing ?? null,

              include_in_packing:
                categoryConfig?.include_in_packing ?? null,

              scan_pack_validate:
                categoryConfig?.scan_pack_validate ?? null,

              procurement: item.procurement || null,
              weight: excelRowWeight,
            },
          });

          const uniqueCode =
            cleanText(item.barcode1) || String(row.id);

          await tx.cutList.update({
            where: {
              id: row.id,
            },
            data: {
              unique_code: uniqueCode,
            },
          });

          const categoryTypeIds = categoryTypeMap.get(itemCategoryName) ?? [];

          const hasType4 = categoryTypeIds.includes(4);
          const hasType3 = categoryTypeIds.includes(3);
          const hasType1Or2 = categoryTypeIds.some(
            (typeId) => typeId === 1 || typeId === 2
          );

          const isNormalFlow = hasType1Or2 || categoryTypeIds.length === 0;

          /*
          |--------------------------------------------------------------------------
          | Existing categoryTypeIds logic for non-packaging machines only
          |--------------------------------------------------------------------------
          | IMPORTANT:
          | machine type 18 is NOT controlled by categoryTypeIds.
          |
          | Type 4:
          |   skip non-packaging mappings only.
          |   Packaging type 18 is still evaluated separately below.
          |
          | Type 3:
          |   machine 17 only when Scan & Pack is enabled.
          |
          | Normal:
          |   T&T machines only when Track & Trace is enabled.
          |   machine 17 only when Scan & Pack is enabled.
          |--------------------------------------------------------------------------
          */

          if (!hasType4) {
            /*
            |--------------------------------------------------------------------------
            | Type 3 — Scan validation machine 17 only
            |--------------------------------------------------------------------------
            */

            if (hasType3 && !isNormalFlow) {
              if (isScanPackEnabled) {
                const scanMachine =
                  getMachine(17, true);

                if (scanMachine) {
                  pushMachineMappingRows({
                    cutListId: row.id,
                    machine: scanMachine,
                    quantity,
                    perItemWeight,
                  });
                }
              }
            } else {
              /*
              |--------------------------------------------------------------------------
              | Track & Trace flow — machine types 3, 7, 11
              |--------------------------------------------------------------------------
              */

              if (isTrackTraceEnabled) {
                if (hasEdgeBanding) {
                  const edgeBandingMachine =
                    getMachine(11, true);

                  if (edgeBandingMachine) {
                    pushMachineMappingRows({
                      cutListId: row.id,
                      machine: edgeBandingMachine,
                      quantity,
                      perItemWeight,
                    });
                  }
                }

                const cuttingMachine =
                  getMachine(3, true);

                if (cuttingMachine) {
                  pushMachineMappingRows({
                    cutListId: row.id,
                    machine: cuttingMachine,
                    quantity,
                    perItemWeight,
                  });
                }

                if (Number(item.l3) > 9) {
                  const cncMachine =
                    getMachine(7, true);

                  if (cncMachine) {
                    pushMachineMappingRows({
                      cutListId: row.id,
                      machine: cncMachine,
                      quantity,
                      perItemWeight,
                    });
                  }
                }
              }

              /*
              |--------------------------------------------------------------------------
              | ScanPack validation flow — machine type 17
              |--------------------------------------------------------------------------
              */

              if (isScanPackEnabled) {
                const scanMachine =
                  getMachine(17, true);

                if (scanMachine) {
                  pushMachineMappingRows({
                    cutListId: row.id,
                    machine: scanMachine,
                    quantity,
                    perItemWeight,
                  });
                }
              }
            }
          }

          /*
          |--------------------------------------------------------------------------
          | Packaging machine type 18 — ProjectCategoriesMaster ONLY
          |--------------------------------------------------------------------------
          | categoryTypeIds / hasType4 / hasType3 do NOT control packaging.
          |
          | Category not found:
          |   -> keep default behavior and create type 18 when ScanPack is enabled.
          |
          | Category found:
          |   include_in_packing = false
          |     -> no machine 18 mapping
          |
          |   include_in_packing = true && scan_pack_validate = true
          |     -> create machine 18 mapping
          |
          |   include_in_packing = true && scan_pack_validate = false
          |     -> no machine 18 mapping
          |     -> item remains in CutList for manual packing
          |--------------------------------------------------------------------------
          */

          if (
            isScanPackEnabled &&
            shouldInsertPackagingMachineMapping
          ) {
            const packMachine =
              getMachine(18, true);

            if (packMachine) {
              pushMachineMappingRows({
                cutListId: row.id,
                machine: packMachine,
                quantity,
                perItemWeight,
              });
            }
          }
        }

        /*
        |--------------------------------------------------------------------------
        | Bulk insert machine mappings
        |--------------------------------------------------------------------------
        */
        const chunkSize = 1000;

        for (let i = 0; i < cutListMachineMappingRows.length; i += chunkSize) {
          const chunk = cutListMachineMappingRows.slice(i, i + chunkSize);

          await tx.cutListMachineMapping.createMany({
            data: chunk,
          });
        }

        return project;
      },
      {
        maxWait: 10000,
        timeout: 30000,
      }
    );

    /*
    |--------------------------------------------------------------------------
    | STEP 10 — Success API log
    |--------------------------------------------------------------------------
    */
    try {
      await prisma.apiRequestLog.create({
        data: {
          endpoint: "createProjectService_excel_upload",
          vendor_token: resolvedVendorToken,
          vendor_id: vendor.id,
          payload: {
            ...validPayload,
            order_no: resolvedOrderNo,
            client_name: resolvedClientName,
            client_address: resolvedClientAddress,
            client_contact_no: resolvedClientContactNo,
          } as any,
          success: true,
          response: {
            project_id: result.id,
            unique_project_id,
            excel_url: url,
            storage_key: key,
          } as any,
          error: null,
          project_id: result.id,
        },
      });
    } catch (logError) {
      logger.warn("Failed to write success api log", { logError });
    }

    if (fs.existsSync(file.path)) {
      fs.unlinkSync(file.path);
    }

    logger.info("Project Excel import completed successfully", {
      projectId: result.id,
      projectName: result.project_name,
    });

    return {
      success: true,
      message: "Project created successfully",
      project_id: result.id,
      unique_project_id,
      excel_url: url,
      storage_key: key,
    };
  } catch (error: any) {
    if (file?.path && fs.existsSync(file.path)) {
      fs.unlinkSync(file.path);
      logger.info("Temp file cleaned up after error");
    }

    try {
      await prisma.apiRequestLog.create({
        data: {
          endpoint: "createProjectService_excel_upload",
          vendor_token: resolvedVendorToken,
          vendor_id: resolvedVendorId,
          payload: {
            projectName,
            vendorId,
            leadId,
            order_no,
            client_name,
            client_address,
            client_contact_no,
            fileName: file?.originalname,
          } as any,
          success: false,
          response: "",
          error: error.message,
          project_id: resolvedProjectId,
        },
      });
    } catch (logError) {
      logger.warn("Failed to write failure api log", { logError });
    }

    logger.error("createProjectService failed", {
      error: error.message,
      stack: error.stack,
    });

    throw error;
  }
};





export const searchTrackTraceLeadsService = async (
  vendorId: number,
  search: string
) => {
  try {
    const q = search?.trim() || "";

    const leads = await prisma.leadMaster.findMany({
      where: {
        vendor_id: vendorId,
        is_deleted: false,

        ...(q
          ? {
            OR: [
              {
                firstname: {
                  contains: q,
                  mode: "insensitive",
                },
              },
              {
                email: {
                  contains: q,
                  mode: "insensitive",
                },
              },
              {
                contact_no: {
                  contains: q,
                  mode: "insensitive",
                },
              },
              {
                lead_code: {
                  contains: q,
                  mode: "insensitive",
                },
              },
            ],
          }
          : {}),
      },
      select: {
        id: true,
        firstname: true,
        lead_code: true,
        email: true,
        contact_no: true,
        created_at: true,
      },
      orderBy: {
        created_at: "desc",
      },
      take: 20,
    });

    return {
      success: true,
      message: "Leads fetched successfully",
      data: leads,
    };
  } catch (error: any) {
    console.error("searchTrackTraceLeadsService error:", error);

    return {
      success: false,
      message: error.message || "Failed to fetch leads",
      data: [],
    };
  }
};


export const getTrackTraceVendorConfigService = async (vendorId: number) => {
  try {
    const vendor = await prisma.vendorMaster.findFirst({
      where: {
        id: Number(vendorId),
      },
      select: {
        id: true,
        is_crm_enabled: true,
        is_available_unique_code: true,
      },
    });

    if (!vendor) {
      return {
        success: false,
        message: "Vendor not found",
        data: null,
      };
    }

    return {
      success: true,
      message: "Vendor config fetched successfully",
      data: {
        vendor_id: vendor.id,
        is_crm_enabled: vendor.is_crm_enabled,
      },
    };
  } catch (error: any) {
    console.error("getTrackTraceVendorConfigService error:", error);

    return {
      success: false,
      message: error.message || "Failed to fetch vendor config",
      data: null,
    };
  }
};

export const getTrackTraceProjectService = async (
  uniqueProjectId: string
) => {
  try {
    const project = await prisma.projectMaster.findFirst({
      where: {
        unique_project_id: uniqueProjectId,
      },
      select: {
        id: true,
        unique_project_id: true,
        project_name: true,
        vendor_id: true,
        lead_id: true,

        order_no: true,
        client_name: true,
        client_address: true,
        client_contact_no: true,
        packing_type: true,
        no_of_boxes: true,

        lead: {
          select: {
            id: true,
            lead_code: true,
            firstname: true,
            lastname: true,
            email: true,
            contact_no: true,
            site_address: true,
          },
        },
        box_info_fields: {
          where: {
            active: true,
          },

          orderBy: [
            {
              sort_order: "asc",
            },
            {
              id: "asc",
            },
          ],

          select: {
            id: true,
            field_label: true,
            field_key: true,
            field_type: true,
            is_required: true,
            sort_order: true,
            active: true,
          },
        },
      },
    });

    if (!project) {
      return {
        success: false,
        message: "Project not found",
        data: null,
      };
    }

    return {
      success: true,
      message: "Project fetched successfully",
      data: project,
    };
  } catch (error: any) {
    console.error("getTrackTraceProjectService error:", error);

    return {
      success: false,
      message: error.message || "Failed to fetch project",
      data: null,
    };
  }
};


type UpdateTrackTraceProjectPayload = {
  vendorId: number | string;
  projectName: string;
  lead_id?: number | string | null;

  order_no?: string | null;
  client_name?: string | null;
  client_address?: string | null;
  client_contact_no?: string | null;
  packing_type?: PackingType | string;
  updated_by?: number;

  box_info_fields?: BoxInfoFieldPayload[];
  no_of_boxes?: number | string | null;
  remove_box_ids?: number[] | string | null;


  file?: Express.Multer.File;
};

export const updateTrackTraceProjectService = async (
  uniqueProjectId: string,
  payload: UpdateTrackTraceProjectPayload
) => {
  try {
    const vendorId = Number(payload.vendorId);

    const leadId =
      payload.lead_id !== undefined &&
        payload.lead_id !== null &&
        payload.lead_id !== ""
        ? Number(payload.lead_id)
        : null;

    if (!uniqueProjectId) {
      return {
        success: false,
        message: "unique_project_id is required",
        data: null,
      };
    }

    if (!vendorId || Number.isNaN(vendorId)) {
      return {
        success: false,
        message: "Invalid vendorId",
        data: null,
      };
    }

    if (!payload.projectName?.trim()) {
      return {
        success: false,
        message: "Project name is required",
        data: null,
      };
    }

    const existingProject = await prisma.projectMaster.findFirst({
      where: {
        unique_project_id: uniqueProjectId,
        vendor_id: vendorId,
      },
      select: {
        id: true,
        vendor_id: true,
        lead_id: true,
        created_by: true,
        no_of_boxes: true,
      },
    });

    if (!existingProject) {
      return {
        success: false,
        message: "Project not found",
        data: null,
      };
    }

    const vendor = await prisma.vendorMaster.findFirst({
      where: {
        id: vendorId,
      },
      select: {
        id: true,
        is_crm_enabled: true,
      },
    });

    if (!vendor) {
      return {
        success: false,
        message: "Vendor not found",
        data: null,
      };
    }

    let resolvedLeadId: number | null = null;

    let resolvedOrderNo = payload.order_no?.trim() || null;
    let resolvedClientName = payload.client_name?.trim() || null;
    let resolvedClientAddress = payload.client_address?.trim() || null;
    let resolvedClientContactNo = payload.client_contact_no?.trim() || null;

    /*
    |--------------------------------------------------------------------------
    | If lead selected, fetch client info from LeadMaster
    |--------------------------------------------------------------------------
    */
    if (vendor.is_crm_enabled && leadId && leadId > 0) {
      const lead = await prisma.leadMaster.findFirst({
        where: {
          id: leadId,
          vendor_id: vendorId,
        },
        select: {
          id: true,
          lead_code: true,
          firstname: true,
          lastname: true,
          contact_no: true,
          site_address: true,
        },
      });

      if (!lead) {
        return {
          success: false,
          message: "Invalid lead selected",
          data: null,
        };
      }

      resolvedLeadId = lead.id;

      const leadClientName = [lead.firstname, lead.lastname]
        .filter(Boolean)
        .join(" ")
        .trim();

      resolvedOrderNo = resolvedOrderNo || lead.lead_code || null;
      resolvedClientName = leadClientName || resolvedClientName;
      resolvedClientAddress = lead.site_address || resolvedClientAddress;
      resolvedClientContactNo = lead.contact_no || resolvedClientContactNo;
    } else {
      /*
      |--------------------------------------------------------------------------
      | If no lead selected, manual fields are mandatory
      |--------------------------------------------------------------------------
      */
      if (!resolvedOrderNo) {
        return {
          success: false,
          message: "Order number is required",
          data: null,
        };
      }

      if (!resolvedClientName) {
        return {
          success: false,
          message: "Client name is required",
          data: null,
        };
      }

      if (!resolvedClientAddress) {
        return {
          success: false,
          message: "Client address is required",
          data: null,
        };
      }

      if (!resolvedClientContactNo) {
        return {
          success: false,
          message: "Client contact number is required",
          data: null,
        };
      }
    }
    const resolvedPackingType:
      PackingType =
      payload.packing_type ===
        PackingType.GROUPWISE
        ? PackingType.GROUPWISE
        : PackingType.DEFAULT;

    const requestedBoxCount = normalizeNoOfBoxes(payload.no_of_boxes);
    const selectedRemoveBoxIds = parseNumberArray(payload.remove_box_ids);

    const projectBoxOptions = await getProjectBoxRemovalOptions(
      prisma,
      existingProject.id,
      vendorId
    );

    const currentBoxCount = projectBoxOptions.length;
    const boxCountDifference = currentBoxCount - requestedBoxCount;

    const projectDetails = await prisma.projectDetails.findFirst({
      where: {
        project_id: existingProject.id,
        vendor_id: vendorId,
      },
      select: {
        id: true,
      },
      orderBy: {
        id: "asc",
      },
    });

    if (requestedBoxCount > currentBoxCount && !projectDetails) {
      return {
        success: false,
        message: "Project details not found. Boxes cannot be created.",
        data: null,
      };
    }

    if (boxCountDifference > 0) {
      if (selectedRemoveBoxIds.length !== boxCountDifference) {
        return buildBoxRemovalSelectionResponse({
          requestedBoxCount,
          currentBoxCount,
          removeCount: boxCountDifference,
          boxes: projectBoxOptions,
        });
      }

      const selectedBoxSet = new Set(selectedRemoveBoxIds);
      const invalidSelectedBoxes = projectBoxOptions.filter(
        (box: BoxRemovalOption) => selectedBoxSet.has(box.id) && !box.can_remove
      );

      const notFoundSelectedBoxIds = selectedRemoveBoxIds.filter(
        (boxId) => !projectBoxOptions.some((box: BoxRemovalOption) => box.id === boxId)
      );

      if (invalidSelectedBoxes.length > 0 || notFoundSelectedBoxIds.length > 0) {
        return buildBoxRemovalSelectionResponse({
          requestedBoxCount,
          currentBoxCount,
          removeCount: boxCountDifference,
          boxes: projectBoxOptions,
          message:
            invalidSelectedBoxes.length > 0
              ? "Only empty boxes can be removed"
              : "Selected box is not valid for this project",
        });
      }
    }


    /*
    |--------------------------------------------------------------------------
    | Update project, box fields and box count
    | File replacement is NOT processed here yet.
    |--------------------------------------------------------------------------
    */
    const updatedProject =
      await prisma.$transaction(
        async (
          tx
        ) => {
          const project =
            await tx.projectMaster.update({
              where: {
                id:
                  existingProject.id,
              },

              data: {
                project_name:
                  payload.projectName.trim(),

                lead_id:
                  resolvedLeadId,

                packing_type:
                  resolvedPackingType,

                is_grouping:
                  resolvedPackingType ===
                  PackingType.GROUPWISE,

                order_no:
                  resolvedOrderNo,

                client_name:
                  resolvedClientName,

                client_address:
                  resolvedClientAddress,

                client_contact_no:
                  resolvedClientContactNo,

                no_of_boxes:
                  requestedBoxCount,

                ...(payload.updated_by
                  ? {
                    updated_by:
                      Number(
                        payload.updated_by
                      ),
                  }
                  : {}),
              },
            });

          if (
            Array.isArray(
              payload.box_info_fields
            )
          ) {
            await syncProjectBoxInfoFields({
              tx,

              projectId:
                existingProject.id,

              vendorId,

              fields:
                payload.box_info_fields,

              userId:
                payload.updated_by
                  ? Number(
                    payload.updated_by
                  )
                  : undefined,
            });
          }

          if (requestedBoxCount > currentBoxCount && projectDetails) {
            /*
            |--------------------------------------------------------------------------
            | Increase boxes
            |--------------------------------------------------------------------------
            | 1. First fix sequence only for empty boxes.
            | 2. Never change box_name of boxes that already have items.
            | 3. Create new boxes using first available sequence numbers.
            |--------------------------------------------------------------------------
            */
            await renumberEmptyBoxesOnly(tx, existingProject.id, vendorId);

            await createAdditionalBoxes({
              tx,
              projectId: existingProject.id,
              vendorId,
              projectDetailsId: projectDetails.id,
              leadId: resolvedLeadId,
              createdBy: payload.updated_by
                ? Number(payload.updated_by)
                : existingProject.created_by,
              count: requestedBoxCount - currentBoxCount,
            });
          }

          if (requestedBoxCount < currentBoxCount) {
            await tx.boxMaster.updateMany({
              where: {
                id: {
                  in: selectedRemoveBoxIds,
                },
                project_id: existingProject.id,
                vendor_id: vendorId,
                is_deleted: false,
              },
              data: {
                is_deleted: true,
                deleted_at: new Date(),
                ...(payload.updated_by
                  ? {
                    deleted_by: Number(payload.updated_by),
                  }
                  : {}),
              },
            });

            await renumberEmptyBoxesOnly(tx, existingProject.id, vendorId);
          }

          return project;
        }
      );


    /*
    |--------------------------------------------------------------------------
    | Optional: if file is uploaded during edit
    |--------------------------------------------------------------------------
    | Currently we are not replacing existing cutlist/machine mappings.
    | If required later, we need a separate safe replacement flow.
    |--------------------------------------------------------------------------
    */
    if (payload.file) {
      if (payload.file.path && fs.existsSync(payload.file.path)) {
        fs.unlinkSync(payload.file.path);
      }

      logger.info("Edit project file uploaded but not processed", {
        uniqueProjectId,
        fileName: payload.file.originalname,
      });
    }

    return {
      success: true,
      message: "Project updated successfully",
      data: updatedProject,
    };
  } catch (error: any) {
    if (payload.file?.path && fs.existsSync(payload.file.path)) {
      fs.unlinkSync(payload.file.path);
    }

    logger.error("updateTrackTraceProjectService error", {
      error: error.message,
      stack: error.stack,
    });

    return {
      success: false,
      message: error.message || "Failed to update project",
      data: null,
    };
  }
};
