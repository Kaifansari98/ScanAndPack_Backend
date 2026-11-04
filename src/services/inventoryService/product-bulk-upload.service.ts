import ExcelJS from "exceljs";
import { prisma, Prisma } from "../../prisma/client";
import { validationResponse } from "../../utils/validationResponse";
import { deriveCategoryPrefix } from "./product-code.service";

const toDecimal = (v: any) =>
  v === undefined || v === null || v === "" ? null : new Prisma.Decimal(v);

const toIntOrNull = (v: any) =>
  v === undefined || v === null || v === "" ? null : Number(v);

const generateAutoBarcode = (vendorId: number, productId: number, customBarcode?: string | null) => {
  if (customBarcode && customBarcode.trim().length > 0) {
    return customBarcode.trim();
  }
  return `BC${String(vendorId).padStart(3, "0")}${String(productId).padStart(6, "0")}`;
};

export const TEMPLATE_COLUMNS = [
  { header: "Product Name*", key: "product_name", width: 25 },
  { header: "Category*", key: "category", width: 20 },
  { header: "Item Code", key: "item_code", width: 20 },
  { header: "Primary Unit*", key: "primary_unit", width: 20 },
  { header: "Sub Category", key: "sub_category", width: 20 },
  { header: "Barcode", key: "barcode", width: 20 },
  { header: "Brand", key: "brand", width: 20 },
  { header: "Item Group", key: "item_group", width: 20 },
  { header: "Stock Unit", key: "stock_unit", width: 15 },
  { header: "Consumption Unit", key: "consumption_unit", width: 15 },
  { header: "Shelf Life (Days)", key: "shelf_life_days", width: 18 },
  { header: "Costing Method (FIFO/MANUAL)", key: "costing_method", width: 25 },
  { header: "Purchase Rate", key: "level1_price", width: 15 },
  { header: "Min Stock Qty", key: "min_stock_qty", width: 15 },
  { header: "Min Stock Unit", key: "min_stock_unit", width: 15 },
  { header: "Max Stock Qty", key: "max_stock_qty", width: 15 },
  { header: "Max Stock Unit", key: "max_stock_unit", width: 15 },
  { header: "Reorder Level Qty", key: "reorder_level_qty", width: 18 },
  { header: "Reorder Level Unit", key: "reorder_level_unit", width: 18 },
  { header: "Reorder Batch Qty", key: "reorder_batch_qty", width: 18 },
  { header: "Reorder Batch Unit", key: "reorder_batch_unit", width: 18 },
  { header: "HSN Code", key: "hsn_code", width: 15 },
  { header: "Item Type (CapitalGoods/Goods/Services)", key: "item_type", width: 30 },
  { header: "Core Product", key: "core_product", width: 20 },
  { header: "Grade", key: "grade", width: 15 },
  { header: "Type", key: "type", width: 15 },
  { header: "Finish", key: "finish", width: 15 },
  { header: "Size", key: "size", width: 15 },
  { header: "Length", key: "length", width: 12 },
  { header: "Height", key: "height", width: 12 },
  { header: "Thickness", key: "thickness", width: 12 },
];

export const generateProductTemplateService = async (): Promise<Buffer> => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Products Template");

  ws.columns = TEMPLATE_COLUMNS;

  // Style header row
  const headerRow = ws.getRow(1);
  headerRow.font = { bold: true, color: { argb: "FFFFFF" } };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "4F46E5" }, // Indigo
  };
  headerRow.alignment = { vertical: "middle", horizontal: "center" };
  headerRow.height = 25;

  // Header styling complete - return blank template sheet with columns only
  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
};

export const processProductBulkUploadService = async (
  vendor_id: number,
  user_id: number,
  fileBuffer: Buffer
) => {
  try {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(fileBuffer as any);
    const ws = wb.worksheets[0];
    if (!ws) return { response: validationResponse(0, "Could not read worksheet") };

    // Extract headers
    const headerRow = ws.getRow(1);
    const headers: { [colNum: number]: string } = {};
    headerRow.eachCell({ includeEmpty: true }, (cell, colNum) => {
      headers[colNum] = String(cell.value ?? "").trim();
    });

    const rows: { rowNum: number; raw: any }[] = [];
    ws.eachRow((row, rowNum) => {
      if (rowNum === 1) return; // Skip header row
      const obj: any = {};
      let hasValue = false;
      row.eachCell({ includeEmpty: true }, (cell, colNum) => {
        const key = headers[colNum];
        if (key) {
          const val = cell.value !== null && cell.value !== undefined ? String(cell.value).trim() : "";
          if (val) hasValue = true;
          obj[key] = cell.value ?? "";
        }
      });
      if (hasValue) {
        rows.push({ rowNum, raw: obj });
      }
    });

    if (!rows.length) {
      return { response: validationResponse(0, "The uploaded Excel sheet contains no data rows.") };
    }

    // Load reference data from DB for lookup
    const [categories, brands, units, itemGroups, hsns, coreProducts, grades, types, finishes] = await Promise.all([
      prisma.projectCategoriesMaster.findMany({
        where: { vendor_id, status: "Yes" },
        select: { id: true, category_name: true, parent_id: true },
      }),
      prisma.brandMaster.findMany({
        where: { vendor_id, is_active: true },
        select: { id: true, brand_name: true },
      }),
      prisma.unitMaster.findMany({
        where: { vendor_id, is_active: true },
        select: { id: true, unit_name: true, short_name: true },
      }),
      prisma.itemGroupMaster.findMany({
        where: { vendor_id, is_active: true },
        select: { id: true, group_name: true },
      }),
      prisma.hsnProductMapping.findMany({
        where: { vendor_id, is_active: true },
        select: { id: true, hsn_code: true },
      }),
      prisma.coreProductMaster.findMany({
        where: { vendor_id, is_active: true },
        select: { id: true, core_product_name: true },
      }),
      prisma.gradeMaster.findMany({
        where: { vendor_id, is_active: true },
        select: { id: true, grade_name: true },
      }),
      prisma.typeMaster.findMany({
        where: { vendor_id, is_active: true },
        select: { id: true, type_name: true },
      }),
      prisma.finishMaster.findMany({
        where: { vendor_id, is_active: true },
        select: { id: true, finish_name: true },
      }),
    ]);

    // Build lookup maps (case-insensitive string keys)
    const mainCatMap = new Map<string, number>();
    const subCatMap = new Map<string, number>();
    categories.forEach((c) => {
      const norm = c.category_name.toLowerCase().trim();
      if (!c.parent_id) {
        mainCatMap.set(norm, c.id);
      } else {
        subCatMap.set(`${c.parent_id}:${norm}`, c.id);
      }
    });

    const brandMap = new Map<string, number>();
    brands.forEach((b) => brandMap.set(b.brand_name.toLowerCase().trim(), b.id));

    const unitMap = new Map<string, number>();
    units.forEach((u) => {
      unitMap.set(u.unit_name.toLowerCase().trim(), u.id);
      if (u.short_name) unitMap.set(u.short_name.toLowerCase().trim(), u.id);
    });

    const groupMap = new Map<string, number>();
    itemGroups.forEach((g) => groupMap.set(g.group_name.toLowerCase().trim(), g.id));

    const hsnMap = new Map<string, number>();
    hsns.forEach((h) => hsnMap.set(h.hsn_code.toLowerCase().trim(), h.id));

    const coreMap = new Map<string, number>();
    coreProducts.forEach((cp) => coreMap.set(cp.core_product_name.toLowerCase().trim(), cp.id));

    const gradeMap = new Map<string, number>();
    grades.forEach((gr) => gradeMap.set(gr.grade_name.toLowerCase().trim(), gr.id));

    const typeMap = new Map<string, number>();
    types.forEach((t) => typeMap.set(t.type_name.toLowerCase().trim(), t.id));

    const finishMap = new Map<string, number>();
    finishes.forEach((f) => finishMap.set(f.finish_name.toLowerCase().trim(), f.id));

    // Fetch existing item codes (article_codes & item_codes) in DB for vendor to prevent duplicates
    const existingProducts = await prisma.productMaster.findMany({
      where: { vendor_id },
      select: { article_code: true, item_code: true, product_name: true, category_id: true },
    });
    const existingItemCodes = new Set<string>();
    const existingProductKeys = new Set<string>();
    existingProducts.forEach((p) => {
      if (p.article_code) existingItemCodes.add(p.article_code.toLowerCase().trim());
      if (p.item_code) existingItemCodes.add(p.item_code.toLowerCase().trim());
      if (p.product_name?.trim()) existingProductKeys.add(`${p.category_id}:${p.product_name.trim().toLowerCase()}`);
    });
    const batchProductKeys = new Set<string>();

    // Helper functions to get or create master entities for this vendor without duplication
    const getOrCreateCategory = async (name: string): Promise<number> => {
      const trimmed = name.trim();
      const key = trimmed.toLowerCase();
      if (mainCatMap.has(key)) return mainCatMap.get(key)!;

      const existing = await prisma.projectCategoriesMaster.findFirst({
        where: {
          vendor_id,
          parent_id: null,
          category_name: { equals: trimmed, mode: "insensitive" },
        },
        select: { id: true },
      });
      if (existing) {
        mainCatMap.set(key, existing.id);
        return existing.id;
      }

      try {
        const derivedPrefix = deriveCategoryPrefix(trimmed) || "PROD";
        const created = await prisma.projectCategoriesMaster.create({
          data: {
            vendor_id,
            category_name: trimmed,
            prefix: derivedPrefix,
            status: "Yes",
            parent_id: null,
            created_by: user_id || null,
            updated_by: user_id || null,
          },
          select: { id: true },
        });
        mainCatMap.set(key, created.id);
        return created.id;
      } catch (err) {
        const fallback = await prisma.projectCategoriesMaster.findFirst({
          where: {
            vendor_id,
            parent_id: null,
            category_name: { equals: trimmed, mode: "insensitive" },
          },
          select: { id: true },
        });
        if (fallback) {
          mainCatMap.set(key, fallback.id);
          return fallback.id;
        }
        throw err;
      }
    };

    const getOrCreateSubCategory = async (catId: number, name: string): Promise<number> => {
      const trimmed = name.trim();
      const subKey = `${catId}:${trimmed.toLowerCase()}`;
      if (subCatMap.has(subKey)) return subCatMap.get(subKey)!;

      const existing = await prisma.projectCategoriesMaster.findFirst({
        where: {
          vendor_id,
          parent_id: catId,
          category_name: { equals: trimmed, mode: "insensitive" },
        },
        select: { id: true },
      });
      if (existing) {
        subCatMap.set(subKey, existing.id);
        return existing.id;
      }

      try {
        const created = await prisma.projectCategoriesMaster.create({
          data: {
            vendor_id,
            parent_id: catId,
            category_name: trimmed,
            status: "Yes",
            created_by: user_id || null,
            updated_by: user_id || null,
          },
          select: { id: true },
        });
        subCatMap.set(subKey, created.id);
        return created.id;
      } catch (err) {
        const fallback = await prisma.projectCategoriesMaster.findFirst({
          where: {
            vendor_id,
            parent_id: catId,
            category_name: { equals: trimmed, mode: "insensitive" },
          },
          select: { id: true },
        });
        if (fallback) {
          subCatMap.set(subKey, fallback.id);
          return fallback.id;
        }
        throw err;
      }
    };

    const getOrCreateBrand = async (name: string): Promise<number> => {
      const trimmed = name.trim();
      const key = trimmed.toLowerCase();
      if (brandMap.has(key)) return brandMap.get(key)!;

      const existing = await prisma.brandMaster.findFirst({
        where: {
          vendor_id,
          brand_name: { equals: trimmed, mode: "insensitive" },
        },
        select: { id: true },
      });
      if (existing) {
        brandMap.set(key, existing.id);
        return existing.id;
      }

      try {
        const created = await prisma.brandMaster.create({
          data: {
            vendor_id,
            brand_name: trimmed,
            is_active: true,
            created_by: user_id || null,
            updated_by: user_id || null,
          },
          select: { id: true },
        });
        brandMap.set(key, created.id);
        return created.id;
      } catch (err) {
        const fallback = await prisma.brandMaster.findFirst({
          where: { vendor_id, brand_name: { equals: trimmed, mode: "insensitive" } },
          select: { id: true },
        });
        if (fallback) {
          brandMap.set(key, fallback.id);
          return fallback.id;
        }
        throw err;
      }
    };

    const getOrCreateCoreProduct = async (name: string): Promise<number> => {
      const trimmed = name.trim();
      const key = trimmed.toLowerCase();
      if (coreMap.has(key)) return coreMap.get(key)!;

      const existing = await prisma.coreProductMaster.findFirst({
        where: {
          vendor_id,
          core_product_name: { equals: trimmed, mode: "insensitive" },
        },
        select: { id: true },
      });
      if (existing) {
        coreMap.set(key, existing.id);
        return existing.id;
      }

      try {
        const created = await prisma.coreProductMaster.create({
          data: {
            vendor_id,
            core_product_name: trimmed,
            is_active: true,
            created_by: user_id || null,
            updated_by: user_id || null,
          },
          select: { id: true },
        });
        coreMap.set(key, created.id);
        return created.id;
      } catch (err) {
        const fallback = await prisma.coreProductMaster.findFirst({
          where: { vendor_id, core_product_name: { equals: trimmed, mode: "insensitive" } },
          select: { id: true },
        });
        if (fallback) {
          coreMap.set(key, fallback.id);
          return fallback.id;
        }
        throw err;
      }
    };

    const getOrCreateGrade = async (name: string): Promise<number> => {
      const trimmed = name.trim();
      const key = trimmed.toLowerCase();
      if (gradeMap.has(key)) return gradeMap.get(key)!;

      const existing = await prisma.gradeMaster.findFirst({
        where: {
          vendor_id,
          grade_name: { equals: trimmed, mode: "insensitive" },
        },
        select: { id: true },
      });
      if (existing) {
        gradeMap.set(key, existing.id);
        return existing.id;
      }

      try {
        const created = await prisma.gradeMaster.create({
          data: {
            vendor_id,
            grade_name: trimmed,
            is_active: true,
            created_by: user_id || null,
            updated_by: user_id || null,
          },
          select: { id: true },
        });
        gradeMap.set(key, created.id);
        return created.id;
      } catch (err) {
        const fallback = await prisma.gradeMaster.findFirst({
          where: { vendor_id, grade_name: { equals: trimmed, mode: "insensitive" } },
          select: { id: true },
        });
        if (fallback) {
          gradeMap.set(key, fallback.id);
          return fallback.id;
        }
        throw err;
      }
    };

    const getOrCreateFinish = async (name: string): Promise<number> => {
      const trimmed = name.trim();
      const key = trimmed.toLowerCase();
      if (finishMap.has(key)) return finishMap.get(key)!;

      const existing = await prisma.finishMaster.findFirst({
        where: {
          vendor_id,
          finish_name: { equals: trimmed, mode: "insensitive" },
        },
        select: { id: true },
      });
      if (existing) {
        finishMap.set(key, existing.id);
        return existing.id;
      }

      try {
        const created = await prisma.finishMaster.create({
          data: {
            vendor_id,
            finish_name: trimmed,
            is_active: true,
            created_by: user_id || null,
            updated_by: user_id || null,
          },
          select: { id: true },
        });
        finishMap.set(key, created.id);
        return created.id;
      } catch (err) {
        const fallback = await prisma.finishMaster.findFirst({
          where: { vendor_id, finish_name: { equals: trimmed, mode: "insensitive" } },
          select: { id: true },
        });
        if (fallback) {
          finishMap.set(key, fallback.id);
          return fallback.id;
        }
        throw err;
      }
    };

    const getOrCreateType = async (name: string): Promise<number> => {
      const trimmed = name.trim();
      const key = trimmed.toLowerCase();
      if (typeMap.has(key)) return typeMap.get(key)!;

      const existing = await prisma.typeMaster.findFirst({
        where: {
          vendor_id,
          type_name: { equals: trimmed, mode: "insensitive" },
        },
        select: { id: true },
      });
      if (existing) {
        typeMap.set(key, existing.id);
        return existing.id;
      }

      try {
        const created = await prisma.typeMaster.create({
          data: {
            vendor_id,
            type_name: trimmed,
            is_active: true,
            created_by: user_id || null,
            updated_by: user_id || null,
          },
          select: { id: true },
        });
        typeMap.set(key, created.id);
        return created.id;
      } catch (err) {
        const fallback = await prisma.typeMaster.findFirst({
          where: { vendor_id, type_name: { equals: trimmed, mode: "insensitive" } },
          select: { id: true },
        });
        if (fallback) {
          typeMap.set(key, fallback.id);
          return fallback.id;
        }
        throw err;
      }
    };

    const getOrCreateItemGroup = async (name: string): Promise<number> => {
      const trimmed = name.trim();
      const key = trimmed.toLowerCase();
      if (groupMap.has(key)) return groupMap.get(key)!;

      const existing = await prisma.itemGroupMaster.findFirst({
        where: {
          vendor_id,
          group_name: { equals: trimmed, mode: "insensitive" },
        },
        select: { id: true },
      });
      if (existing) {
        groupMap.set(key, existing.id);
        return existing.id;
      }

      try {
        const created = await prisma.itemGroupMaster.create({
          data: {
            vendor_id,
            group_name: trimmed,
            is_active: true,
            created_by: user_id || null,
            updated_by: user_id || null,
          },
          select: { id: true },
        });
        groupMap.set(key, created.id);
        return created.id;
      } catch (err) {
        const fallback = await prisma.itemGroupMaster.findFirst({
          where: { vendor_id, group_name: { equals: trimmed, mode: "insensitive" } },
          select: { id: true },
        });
        if (fallback) {
          groupMap.set(key, fallback.id);
          return fallback.id;
        }
        throw err;
      }
    };

    const getOrCreateUnit = async (name: string): Promise<number | null> => {
      const trimmed = name.trim();
      if (!trimmed) return null;
      const key = trimmed.toLowerCase();
      if (unitMap.has(key)) return unitMap.get(key)!;

      const existing = await prisma.unitMaster.findFirst({
        where: {
          vendor_id,
          OR: [
            { unit_name: { equals: trimmed, mode: "insensitive" } },
            { short_name: { equals: trimmed, mode: "insensitive" } },
          ],
        },
        select: { id: true, unit_name: true, short_name: true },
      });
      if (existing) {
        unitMap.set(key, existing.id);
        if (existing.unit_name) unitMap.set(existing.unit_name.toLowerCase().trim(), existing.id);
        if (existing.short_name) unitMap.set(existing.short_name.toLowerCase().trim(), existing.id);
        return existing.id;
      }

      try {
        const created = await prisma.unitMaster.create({
          data: {
            vendor_id,
            unit_name: trimmed,
            unit_class: trimmed,
            short_name: trimmed,
            decimal_allowed: true,
            is_active: true,
            created_by: user_id || null,
            updated_by: user_id || null,
          },
          select: { id: true },
        });
        unitMap.set(key, created.id);
        return created.id;
      } catch (err) {
        const fallback = await prisma.unitMaster.findFirst({
          where: {
            vendor_id,
            OR: [
              { unit_name: { equals: trimmed, mode: "insensitive" } },
              { short_name: { equals: trimmed, mode: "insensitive" } },
            ],
          },
          select: { id: true },
        });
        if (fallback) {
          unitMap.set(key, fallback.id);
          return fallback.id;
        }
        throw err;
      }
    };

    const getOrCreateHSN = async (code: string): Promise<number | null> => {
      const trimmed = code.trim();
      if (!trimmed) return null;
      const key = trimmed.toLowerCase();
      if (hsnMap.has(key)) return hsnMap.get(key)!;

      const existing = await prisma.hsnProductMapping.findFirst({
        where: {
          vendor_id,
          hsn_code: { equals: trimmed, mode: "insensitive" },
        },
        select: { id: true },
      });
      if (existing) {
        hsnMap.set(key, existing.id);
        return existing.id;
      }

      try {
        const created = await prisma.hsnProductMapping.create({
          data: {
            vendor_id,
            hsn_code: trimmed,
            description: trimmed,
            cgst_rate: new Prisma.Decimal(0),
            sgst_rate: new Prisma.Decimal(0),
            igst_rate: new Prisma.Decimal(0),
            cess_rate: new Prisma.Decimal(0),
            is_active: true,
          },
          select: { id: true },
        });
        hsnMap.set(key, created.id);
        return created.id;
      } catch (err) {
        const fallback = await prisma.hsnProductMapping.findFirst({
          where: { vendor_id, hsn_code: { equals: trimmed, mode: "insensitive" } },
          select: { id: true },
        });
        if (fallback) {
          hsnMap.set(key, fallback.id);
          return fallback.id;
        }
        throw err;
      }
    };

    // In-memory tracker for auto-generating unique item codes by Category prefix
    const prefixCounterMap = new Map<string, number>();

    const generateNextItemCodeForCategory = async (catId: number): Promise<string> => {
      const category = await prisma.projectCategoriesMaster.findUnique({
        where: { id: catId },
        select: { category_name: true, prefix: true },
      });
      if (!category) {
        throw new Error("Category not found");
      }

      // Check recent products under this category to detect existing prefix & delimiter pattern
      const recentProducts = await prisma.productMaster.findMany({
        where: {
          vendor_id,
          category_id: catId,
        },
        select: { article_code: true, item_code: true },
        orderBy: { id: "desc" },
        take: 20,
      });

      let detectedPrefix: string | null = null;
      let delimiter = "-";

      for (const p of recentProducts) {
        for (const code of [p.article_code, p.item_code]) {
          if (!code) continue;
          const match = code.trim().match(/^([A-Za-z0-9]+)([-_])(\d+)$/);
          if (match) {
            detectedPrefix = match[1].toUpperCase();
            delimiter = match[2];
            break;
          }
        }
        if (detectedPrefix) break;
      }

      let prefix = category.prefix?.trim()
        ? category.prefix.trim().toUpperCase().replace(/[-_]+$/, "")
        : deriveCategoryPrefix(category.category_name);

      if (!prefix || prefix.length < 2) {
        prefix = "PROD";
      }

      // If category in DB had no prefix set, save the derived prefix so future lookups are consistent
      if (!category.prefix?.trim()) {
        await prisma.projectCategoriesMaster.update({
          where: { id: catId },
          data: { prefix },
        }).catch(() => {});
      }

      const mapKey = `${prefix}${delimiter}`;
      if (!prefixCounterMap.has(mapKey)) {
        const existingProductsWithPrefix = await prisma.productMaster.findMany({
          where: {
            vendor_id,
            OR: [
              { article_code: { startsWith: prefix } },
              { item_code: { startsWith: prefix } },
            ],
          },
          select: { article_code: true, item_code: true },
        });

        let maxNum = 0;
        const regex = new RegExp(`^${prefix}[-_]?(\\d+)$`, "i");

        for (const p of existingProductsWithPrefix) {
          for (const code of [p.article_code, p.item_code]) {
            if (!code) continue;
            const match = code.trim().match(regex);
            if (match) {
              const num = parseInt(match[1], 10);
              if (!isNaN(num) && num > maxNum) {
                maxNum = num;
              }
            }
          }
        }
        prefixCounterMap.set(mapKey, maxNum);
      }

      let nextNum = (prefixCounterMap.get(mapKey) || 0) + 1;
      let candidate = `${prefix}${delimiter}${String(nextNum).padStart(3, "0")}`;
      while (
        existingItemCodes.has(candidate.toLowerCase()) ||
        batchItemCodes.has(candidate.toLowerCase())
      ) {
        nextNum++;
        candidate = `${prefix}${delimiter}${String(nextNum).padStart(3, "0")}`;
      }

      prefixCounterMap.set(mapKey, nextNum);
      return candidate;
    };

    const batchItemCodes = new Set<string>();

    const validPayloads: { rowNum: number; raw: any; payload: any }[] = [];
    const invalidRows: { rowNum: number; raw: any; reason: string }[] = [];
    const categoryPrefixCache = new Map<number, string | null>();
    const getConfiguredCategoryPrefix = async (categoryId: number): Promise<string | null> => {
      if (categoryPrefixCache.has(categoryId)) return categoryPrefixCache.get(categoryId) ?? null;
      const category = await prisma.projectCategoriesMaster.findUnique({
        where: { id: categoryId },
        select: { prefix: true },
      });
      const prefix = category?.prefix?.trim().replace(/[-_]+$/, "").toUpperCase() || null;
      categoryPrefixCache.set(categoryId, prefix);
      return prefix;
    };

    // Helper getter for cell values
    const getVal = (raw: any, possibleKeys: string[]) => {
      for (const k of possibleKeys) {
        for (const rawKey of Object.keys(raw)) {
          if (rawKey.toLowerCase().trim().startsWith(k.toLowerCase().trim())) {
            const v = raw[rawKey];
            if (v !== undefined && v !== null) return String(v).trim();
          }
        }
      }
      return "";
    };

    // Row-by-Row Processing
    for (const item of rows) {
      const { rowNum, raw } = item;
      const errors: string[] = [];

      const productName = getVal(raw, ["Product Name", "product_name"]);
      const categoryName = getVal(raw, ["Category", "category"]);
      const itemCodeRaw = getVal(raw, ["Item Code", "item_code", "article_code"]);
      const subCategoryName = getVal(raw, ["Sub Category", "sub_category"]);
      const barcode = getVal(raw, ["Barcode", "barcode"]);
      const brandName = getVal(raw, ["Brand", "brand"]);
      const itemGroupName = getVal(raw, ["Item Group", "item_group"]);
      const primaryUnitName = getVal(raw, ["Primary Unit", "Primary / Purchase Unit", "UOM", "primary_unit", "uom"]);
      const purchaseUnitName = getVal(raw, ["Purchase Unit", "purchase_unit"]);
      const stockUnitName = getVal(raw, ["Stock Unit", "stock_unit"]);
      const consumptionUnitName = getVal(raw, ["Consumption Unit", "consumption_unit"]);
      const shelfLifeDaysRaw = getVal(raw, ["Shelf Life", "shelf_life_days"]);
      const costingMethodRaw = getVal(raw, ["Costing Method", "costing_method"]);
      const priceRaw = getVal(raw, ["Purchase Rate", "Level 1 Price", "level1_price", "price", "purchase_rate"]);
      const minStockQtyRaw = getVal(raw, ["Min Stock Qty", "min_stock_qty"]);
      const minStockUnitName = getVal(raw, ["Min Stock Unit", "min_stock_unit"]);
      const maxStockQtyRaw = getVal(raw, ["Max Stock Qty", "max_stock_qty"]);
      const maxStockUnitName = getVal(raw, ["Max Stock Unit", "max_stock_unit"]);
      const reorderLevelQtyRaw = getVal(raw, ["Reorder Level Qty", "reorder_level_qty"]);
      const reorderLevelUnitName = getVal(raw, ["Reorder Level Unit", "reorder_level_unit"]);
      const reorderBatchQtyRaw = getVal(raw, ["Reorder Batch Qty", "reorder_batch_qty"]);
      const reorderBatchUnitName = getVal(raw, ["Reorder Batch Unit", "reorder_batch_unit"]);
      const hsnCodeRaw = getVal(raw, ["HSN Code", "hsn_code"]);
      const itemTypeRaw = getVal(raw, ["Item Type", "item_type"]);
      const coreProductName = getVal(raw, ["Core Product", "core_product"]);
      const gradeName = getVal(raw, ["Grade", "grade"]);
      const typeName = getVal(raw, ["Type", "type"]);
      const finishName = getVal(raw, ["Finish", "finish"]);
      const sizeRaw = getVal(raw, ["Size", "size"]);
      const lengthRaw = getVal(raw, ["Length", "length"]);
      const heightRaw = getVal(raw, ["Height", "height"]);
      const thicknessRaw = getVal(raw, ["Thickness", "thickness"]);

      // 1. Mandatory Fields Validation
      if (!productName) errors.push("Product Name is required");
      if (!categoryName) errors.push("Category is required");
      if (!primaryUnitName) errors.push("Primary Unit is required");

      // 2. Category Resolution (get or create if missing)
      let categoryId: number | null = null;
      if (categoryName) {
        try {
          categoryId = await getOrCreateCategory(categoryName);
        } catch (err: any) {
          errors.push(`Failed to find or add Category "${categoryName}": ${err.message}`);
        }
      }

      if (productName && categoryId) {
        const productKey = `${categoryId}:${productName.trim().toLowerCase()}`;
        if (existingProductKeys.has(productKey)) {
          errors.push(`Product "${productName}" already exists in this category`);
        } else if (batchProductKeys.has(productKey)) {
          errors.push(`Product "${productName}" is duplicated in this Excel sheet for this category`);
        } else {
          batchProductKeys.add(productKey);
        }
      }

      // 3. Sub Category Resolution (get or create if missing)
      let subCategoryId: number | null = null;
      if (subCategoryName && categoryId) {
        try {
          subCategoryId = await getOrCreateSubCategory(categoryId, subCategoryName);
        } catch (err: any) {
          errors.push(`Failed to find or add Sub Category "${subCategoryName}": ${err.message}`);
        }
      }

      // 4. Item Code Resolution (use provided or auto-generate)
      let resolvedItemCode = itemCodeRaw;
      if (resolvedItemCode) {
        const lowerCode = resolvedItemCode.toLowerCase();
        let configuredPrefix: string | null = null;
        if (categoryId) {
          try {
            configuredPrefix = await getConfiguredCategoryPrefix(categoryId);
          } catch (err: any) {
            errors.push(`Failed to verify Category prefix: ${err.message}`);
          }
        }
        const normalizedCode = resolvedItemCode.trim().toUpperCase();
        const matchesPrefix = !configuredPrefix || normalizedCode === configuredPrefix ||
          normalizedCode.startsWith(`${configuredPrefix}-`) || normalizedCode.startsWith(`${configuredPrefix}_`);
        if (!matchesPrefix) {
          errors.push(`Item Code "${resolvedItemCode}" does not match Category prefix "${configuredPrefix}"`);
        } else if (existingItemCodes.has(lowerCode)) {
          errors.push(`Item Code "${resolvedItemCode}" already exists in the system`);
        } else if (batchItemCodes.has(lowerCode)) {
          errors.push(`Item Code "${resolvedItemCode}" is duplicated in this Excel sheet`);
        } else {
          batchItemCodes.add(lowerCode);
        }
      } else if (categoryId) {
        try {
          resolvedItemCode = await generateNextItemCodeForCategory(categoryId);
          batchItemCodes.add(resolvedItemCode.toLowerCase());
        } catch (err: any) {
          errors.push(`Failed to auto-generate item code: ${err.message}`);
        }
      }

      // 5. Brand Resolution (get or create if missing)
      let brandId: number | null = null;
      if (brandName) {
        try {
          brandId = await getOrCreateBrand(brandName);
        } catch (err: any) {
          errors.push(`Failed to find or add Brand "${brandName}": ${err.message}`);
        }
      }

      // 6. Item Group Resolution (get or create if missing)
      let itemGroupId: number | null = null;
      if (itemGroupName) {
        try {
          itemGroupId = await getOrCreateItemGroup(itemGroupName);
        } catch (err: any) {
          errors.push(`Failed to find or add Item Group "${itemGroupName}": ${err.message}`);
        }
      }

      // 7. Units Resolution (get or create if missing)
      let primaryUnitId: number | null = null;
      if (primaryUnitName) {
        try {
          primaryUnitId = await getOrCreateUnit(primaryUnitName);
        } catch (err: any) {
          errors.push(`Failed to find or add Primary Unit "${primaryUnitName}": ${err.message}`);
        }
      }

      const resolveUnit = async (name: string): Promise<number | null> => {
        if (!name) return null;
        try {
          return await getOrCreateUnit(name);
        } catch {
          return null;
        }
      };

      const purchaseUnitId = (await resolveUnit(purchaseUnitName)) ?? primaryUnitId;
      const stockUnitId = (await resolveUnit(stockUnitName)) ?? primaryUnitId;
      const consumptionUnitId = (await resolveUnit(consumptionUnitName)) ?? primaryUnitId;
      const minStockUnitId = await resolveUnit(minStockUnitName);
      const maxStockUnitId = await resolveUnit(maxStockUnitName);
      const reorderLevelUnitId = await resolveUnit(reorderLevelUnitName);
      const reorderBatchUnitId = await resolveUnit(reorderBatchUnitName);

      // 8. Costing Method
      let costingMethod: "FIFO" | "MANUAL" = "FIFO";
      if (costingMethodRaw) {
        const cm = costingMethodRaw.toUpperCase();
        if (cm === "FIFO" || cm === "MANUAL") {
          costingMethod = cm;
        } else {
          errors.push(`Costing Method "${costingMethodRaw}" must be FIFO or MANUAL`);
        }
      }

      // 9. Item Type
      let itemType: "CapitalGoods" | "Goods" | "Services" = "Goods";
      if (itemTypeRaw) {
        const cleanType = itemTypeRaw.replace(/\s+/g, "");
        if (["CapitalGoods", "Goods", "Services"].includes(cleanType)) {
          itemType = cleanType as any;
        } else {
          errors.push(`Item Type "${itemTypeRaw}" must be CapitalGoods, Goods, or Services`);
        }
      }

      // 10. HSN Resolution (get or create if missing)
      let hsnId: number | null = null;
      if (hsnCodeRaw) {
        try {
          hsnId = await getOrCreateHSN(hsnCodeRaw);
        } catch (err: any) {
          errors.push(`Failed to find or add HSN Code "${hsnCodeRaw}": ${err.message}`);
        }
      }

      // 11. Core Product Resolution (get or create if missing)
      let coreProductId: number | null = null;
      if (coreProductName) {
        try {
          coreProductId = await getOrCreateCoreProduct(coreProductName);
        } catch (err: any) {
          errors.push(`Failed to find or add Core Product "${coreProductName}": ${err.message}`);
        }
      }

      // 12. Grade Resolution (get or create if missing)
      let gradeId: number | null = null;
      if (gradeName) {
        try {
          gradeId = await getOrCreateGrade(gradeName);
        } catch (err: any) {
          errors.push(`Failed to find or add Grade "${gradeName}": ${err.message}`);
        }
      }

      // 13. Type Resolution (get or create if missing)
      let typeId: number | null = null;
      if (typeName) {
        try {
          typeId = await getOrCreateType(typeName);
        } catch (err: any) {
          errors.push(`Failed to find or add Type "${typeName}": ${err.message}`);
        }
      }

      // 14. Finish Resolution (get or create if missing)
      let finishId: number | null = null;
      if (finishName) {
        try {
          finishId = await getOrCreateFinish(finishName);
        } catch (err: any) {
          errors.push(`Failed to find or add Finish "${finishName}": ${err.message}`);
        }
      }

      // 15. Numeric parse helpers
      const parseNum = (val: string, label: string): number | null => {
        if (!val) return null;
        const n = Number(val);
        if (isNaN(n)) {
          errors.push(`${label} "${val}" is not a valid number`);
          return null;
        }
        return n;
      };

      const level1Price = parseNum(priceRaw, "Purchase Rate");
      const shelfLifeDays = parseNum(shelfLifeDaysRaw, "Shelf Life (Days)");
      const minStockQty = parseNum(minStockQtyRaw, "Min Stock Qty");
      const maxStockQty = parseNum(maxStockQtyRaw, "Max Stock Qty");
      const reorderLevelQty = parseNum(reorderLevelQtyRaw, "Reorder Level Qty");
      const reorderBatchQty = parseNum(reorderBatchQtyRaw, "Reorder Batch Qty");
      const length = parseNum(lengthRaw, "Length");
      const height = parseNum(heightRaw, "Height");
      const thickness = parseNum(thicknessRaw, "Thickness");

      // Check if row has any errors
      if (errors.length > 0) {
        invalidRows.push({
          rowNum,
          raw,
          reason: errors.join("; "),
        });
      } else {
        validPayloads.push({
          rowNum,
          raw,
          payload: {
            vendor_id: Number(vendor_id),
            created_by: user_id || null,
            category_id: categoryId!,
            sub_category_id: subCategoryId,
            product_name: productName,
            article_code: resolvedItemCode,
            item_code: resolvedItemCode,
            barcode: barcode || null,
            brand_id: brandId,
            item_group_id: itemGroupId,
            primary_unit_id: primaryUnitId,
            purchase_unit_id: purchaseUnitId,
            stock_unit_id: stockUnitId,
            consumption_unit_id: consumptionUnitId,
            shelf_life_days: toIntOrNull(shelfLifeDays),
            costing_method: costingMethod,
            level1_price: toDecimal(level1Price),
            min_stock_qty: toDecimal(minStockQty),
            min_stock_unit_id: minStockUnitId,
            max_stock_qty: toDecimal(maxStockQty),
            max_stock_unit_id: maxStockUnitId,
            reorder_level_qty: toDecimal(reorderLevelQty),
            reorder_level_unit_id: reorderLevelUnitId,
            reorder_batch_qty: toDecimal(reorderBatchQty),
            reorder_batch_unit_id: reorderBatchUnitId,
            hsn_id: hsnId,
            hsn_code: hsnCodeRaw || null,
            item_type: itemType,
            core_product_id: coreProductId,
            grade_id: gradeId,
            type_id: typeId,
            finish_id: finishId,
            finish: finishName || null,
            group: itemGroupName || null,
            core_material: coreProductName || null,
            unit_of_measure: primaryUnitName || null,
            size: sizeRaw || null,
            dimension_1: length ?? 0,
            dimension_2: height ?? 0,
            dimension_3: thickness ?? 0,
            length: toDecimal(length),
            height: toDecimal(height),
            thickness: toDecimal(thickness),
            active: "Yes",
          },
        });
      }
    }

    // Insert Valid Rows into Database
    let createdCount = 0;
    for (const item of validPayloads) {
      try {
        await prisma.$transaction(async (tx) => {
          const createdProduct = await tx.productMaster.create({
            data: item.payload,
          });

          // Generate barcode if missing
          const finalBarcode = generateAutoBarcode(
            vendor_id,
            createdProduct.id,
            item.payload.barcode
          );
          if (!item.payload.barcode) {
            await tx.productMaster.update({
              where: { id: createdProduct.id },
              data: { barcode: finalBarcode },
            });
          }
        });
        createdCount++;
      } catch (err: any) {
        console.error(`Failed to insert row ${item.rowNum}:`, err);
        invalidRows.push({
          rowNum: item.rowNum,
          raw: item.raw,
          reason: `Database insertion error: ${err.message || "Unknown error"}`,
        });
      }
    }

    // Generate Error Excel Workbook if there are invalid rows
    let errorFileBuffer: Buffer | null = null;
    if (invalidRows.length > 0) {
      const errWb = new ExcelJS.Workbook();
      const errWs = errWb.addWorksheet("Failed Products");

      const errCols = [
        ...TEMPLATE_COLUMNS,
        { header: "Error Reason", key: "error_reason", width: 40 },
      ];
      errWs.columns = errCols;

      // Header styling
      const errHeaderRow = errWs.getRow(1);
      errHeaderRow.font = { bold: true, color: { argb: "FFFFFF" } };
      errHeaderRow.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "DC2626" }, // Red
      };
      errHeaderRow.alignment = { vertical: "middle", horizontal: "center" };
      errHeaderRow.height = 25;

      for (const inv of invalidRows) {
        const rData: any = {};
        for (const col of TEMPLATE_COLUMNS) {
          rData[col.key] = getVal(inv.raw, [col.header, col.key]);
        }
        rData["error_reason"] = inv.reason;
        const newRow = errWs.addRow(rData);

        // Highlight error reason cell
        const errCell = newRow.getCell(errCols.length);
        errCell.font = { color: { argb: "DC2626" }, bold: true };
      }

      const buf = await errWb.xlsx.writeBuffer();
      errorFileBuffer = Buffer.from(buf);
    }

    return {
      response: validationResponse(1, `Bulk upload completed. ${createdCount} saved, ${invalidRows.length} failed.`, {
        total: rows.length,
        created: createdCount,
        failed: invalidRows.length,
        errors: invalidRows.map((r) => ({ row: r.rowNum, reason: r.reason })),
      }),
      errorFileBuffer,
    };
  } catch (error: any) {
    console.error("processProductBulkUploadService error:", error);
    return { response: validationResponse(0, `Bulk upload failed: ${error.message || "Unknown error"}`) };
  }
};
