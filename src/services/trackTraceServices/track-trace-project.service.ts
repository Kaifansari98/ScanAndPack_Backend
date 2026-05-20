import { z } from "zod";
import fs from "fs";
import ExcelJS from "exceljs";
import { prisma } from "../../../src/prisma/client";
import { randomUUID } from "crypto";
import logger from "../../../src/utils/logger";
import { uploadToWasabiProjectExcel } from "../../../src/utils/wasabiClient";

/* ------------------ TYPES ------------------ */

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
    const hasData = rawRowValues.some((v) => {
      return v !== null && v !== undefined && String(v).trim() !== "";
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

      if (["l1", "l2", "l3", "qty"].includes(field)) {
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

export const createProjectService = async (
  projectName: string,
  vendorId: number,
  leadId: number,
  file: Express.Multer.File,
) => {
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

    /* STEP 0 — Resolve vendor */
    const vendor = await prisma.vendorMaster.findFirst({
      where: {
        id: Number(vendorId),
      },
    });

    if (!vendor) {
      throw new Error("Vendor not found");
    }

    resolvedVendorId = vendor.id;

    /* STEP 0.1 — Get active vendor token from vendorId */
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

    /* STEP 0.2 — Validate lead_id belongs to this vendor */
    const lead = await prisma.leadMaster.findFirst({
      where: {
        id: Number(leadId),
        vendor_id: vendor.id,
      },
      select: {
        id: true,
      },
    });

    if (!lead) {
      throw new Error("Invalid lead_id for this vendor");
    }

    const lead_id = lead.id;

    /* STEP 0.3 — Initial API log */
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

    /* STEP 1 — Parse Excel */
    const parsedExcel = await parseProjectExcel(file.path);

    logger.info("Excel parsed", {
      totalRows: parsedExcel.items.length,
    });

    if (!parsedExcel.items.length) {
      throw new Error("Excel file is empty or contains only headers");
    }

    /* STEP 2 — Validate Excel payload */
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
      lead_id: lead_id,
    });

    /* STEP 3 — Check duplicate barcode1 within Excel */
    const uniqueCodesToInsert = validPayload.items
      .map((item) => cleanText(item.barcode1))
      .filter(Boolean);

    const duplicatesInPayload = uniqueCodesToInsert.filter(
      (code, index) => uniqueCodesToInsert.indexOf(code) !== index,
    );

    if (duplicatesInPayload.length > 0) {
      throw new Error(
        `Duplicate barcodes found in Excel: ${[
          ...new Set(duplicatesInPayload),
        ].join(", ")}`,
      );
    }
    console.log(uniqueCodesToInsert)

    /* STEP 4 — Check duplicate barcode1 in DB */
    if (uniqueCodesToInsert.length > 0) {
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
            .join(", ")}`,
        );
      }
    }

    /* STEP 5 — Resolve admin user */
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

    /* STEP 6 — Pre-fetch category type mappings */
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
        (mapping) => mapping.project_categories_type_master_id,
      );

      categoryTypeMap.set(
        category.category_name.trim().toLowerCase(),
        typeIds,
      );
    }

    /* STEP 7 — Upload to Wasabi only after validation passes */
    const { key, url } = await uploadToWasabiProjectExcel(
      file.path,
      vendor.id,
      file.originalname,
      file.mimetype,
    );

    logger.info("Excel uploaded to Wasabi", { key });

    const unique_project_id = randomUUID();

    /* STEP 8 — Transaction */
    const result = await prisma.$transaction(async (tx) => {
      const project = await tx.projectMaster.create({
        data: {
          project_name: validPayload.projectName,
          unique_project_id,
          vendor_id: vendor.id,
          created_by: createdByUserId,
          project_status: "Initiated",
          is_grouping: false,
          lead_id,
        },
      });

      resolvedProjectId = project.id;

      const totalItems = validPayload.items.reduce((sum, item) => {
        return sum + Number(item.qty);
      }, 0);

      await tx.projectDetails.create({
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

      for (const item of validPayload.items) {
        const quantity = Number(item.qty);

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
          },
        });

        const uniqueCode = item.barcode1 || `${row.id}-${project.id}`;

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
          (typeId) => typeId === 1 || typeId === 2,
        );

        const isNormalFlow = hasType1Or2 || categoryTypeIds.length === 0;

        /**
         * Type 4:
         * Skip machine mapping entirely.
         */
        if (hasType4) {
          continue;
        }

        /**
         * Type 3:
         * Only scan/pack machine types 17 and 18.
         */
        if (hasType3 && !isNormalFlow) {
          const scanPackMachineTypeIds = [17, 18];

          for (const machineTypeId of scanPackMachineTypeIds) {
            const machine = await tx.machineMaster.findFirst({
              where: {
                vendor_id: vendor.id,
                machine_type_id: machineTypeId,
              },
              select: {
                id: true,
                sequence_no: true,
              },
            });

            if (!machine) continue;

            for (let i = 0; i < quantity; i++) {
              await tx.cutListMachineMapping.create({
                data: {
                  cut_list_id: row.id,
                  machine_id: machine.id,
                  project_id: project.id,
                  vendor_id: vendor.id,
                  lead_id,
                  sequence_no: machine.sequence_no ?? 0,
                  status: "Pending",
                  created_by: createdByUserId,
                  expected_in: true,
                },
              });
            }
          }

          continue;
        }

        /**
         * Normal flow:
         * - Edgebanding machine type 11 if edge banding exists
         * - Cutting machine type 3
         * - CNC machine type 7 if thickness > 9
         * - Default scan/pack machine types 17 and 18
         */

        if (hasEdgeBanding) {
          const edgeBandingMachine = await tx.machineMaster.findFirst({
            where: {
              vendor_id: vendor.id,
              machine_type_id: 11,
            },
            select: {
              id: true,
              sequence_no: true,
            },
          });

          if (!edgeBandingMachine) {
            throw new Error("Edgebanding machine is not configured");
          }

          for (let i = 0; i < quantity; i++) {
            await tx.cutListMachineMapping.create({
              data: {
                cut_list_id: row.id,
                machine_id: edgeBandingMachine.id,
                project_id: project.id,
                vendor_id: vendor.id,
                lead_id,
                sequence_no: edgeBandingMachine.sequence_no ?? 0,
                status: "Pending",
                created_by: createdByUserId,
                expected_in: true,
              },
            });
          }
        }

        const cuttingMachine = await tx.machineMaster.findFirst({
          where: {
            vendor_id: vendor.id,
            machine_type_id: 3,
            status: "ACTIVE",
          },
          select: {
            id: true,
            sequence_no: true,
          },
          orderBy: {
            id: "asc",
          },
        });

        if (cuttingMachine) {
          for (let i = 0; i < quantity; i++) {
            await tx.cutListMachineMapping.create({
              data: {
                cut_list_id: row.id,
                machine_id: cuttingMachine.id,
                project_id: project.id,
                vendor_id: vendor.id,
                lead_id,
                sequence_no: cuttingMachine.sequence_no ?? 0,
                status: "Pending",
                created_by: createdByUserId,
                expected_in: true,
              },
            });
          }
        }

        if (Number(item.l3) > 9) {
          const cncMachine = await tx.machineMaster.findFirst({
            where: {
              vendor_id: vendor.id,
              machine_type_id: 7,
              status: "ACTIVE",
            },
            select: {
              id: true,
              sequence_no: true,
            },
            orderBy: {
              id: "asc",
            },
          });

          if (cncMachine) {
            for (let i = 0; i < quantity; i++) {
              await tx.cutListMachineMapping.create({
                data: {
                  cut_list_id: row.id,
                  machine_id: cncMachine.id,
                  project_id: project.id,
                  vendor_id: vendor.id,
                  lead_id,
                  sequence_no: cncMachine.sequence_no ?? 0,
                  status: "Pending",
                  created_by: createdByUserId,
                  expected_in: true,
                },
              });
            }
          }
        }

        const defaultMachineTypeIds = [17, 18];

        for (const machineTypeId of defaultMachineTypeIds) {
          const machine = await tx.machineMaster.findFirst({
            where: {
              vendor_id: vendor.id,
              machine_type_id: machineTypeId,
            },
            select: {
              id: true,
              sequence_no: true,
            },
          });

          if (!machine) continue;

          for (let i = 0; i < quantity; i++) {
            await tx.cutListMachineMapping.create({
              data: {
                cut_list_id: row.id,
                machine_id: machine.id,
                project_id: project.id,
                vendor_id: vendor.id,
                lead_id,
                sequence_no: machine.sequence_no ?? 0,
                status: "Pending",
                created_by: createdByUserId,
                expected_in: true,
              },
            });
          }
        }
      }

      return project;
    });

    /* STEP 9 — Success API log */
    try {
      await prisma.apiRequestLog.create({
        data: {
          endpoint: "createProjectService_excel_upload",
          vendor_token: resolvedVendorToken,
          vendor_id: vendor.id,
          payload: validPayload as any,
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
        lead_code:true,
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

