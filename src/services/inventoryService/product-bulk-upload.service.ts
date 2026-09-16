import ExcelJS from "exceljs";
import { prisma, Prisma } from "../../prisma/client";
import { validationResponse } from "../../utils/validationResponse";

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
  { header: "Item Code*", key: "item_code", width: 20 },
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
    const catMap = new Map<string, { id: number; parent_id: number | null }>();
    categories.forEach((c) => catMap.set(c.category_name.toLowerCase().trim(), { id: c.id, parent_id: c.parent_id }));

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

    // Fetch existing item codes (article_codes) in DB for vendor to prevent duplicates
    const existingProducts = await prisma.productMaster.findMany({
      where: { vendor_id },
      select: { article_code: true },
    });
    const existingItemCodes = new Set(
      existingProducts.map((p) => (p.article_code || "").toLowerCase().trim()).filter(Boolean)
    );

    const batchItemCodes = new Set<string>();

    const validPayloads: { rowNum: number; payload: any }[] = [];
    const invalidRows: { rowNum: number; raw: any; reason: string }[] = [];

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

    // Row-by-Row Validation
    for (const item of rows) {
      const { rowNum, raw } = item;
      const errors: string[] = [];

      const productName = getVal(raw, ["Product Name", "product_name"]);
      const categoryName = getVal(raw, ["Category", "category"]);
      const itemCode = getVal(raw, ["Item Code", "item_code", "article_code"]);
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
      const lengthRaw = getVal(raw, ["Length", "length"]);
      const heightRaw = getVal(raw, ["Height", "height"]);
      const thicknessRaw = getVal(raw, ["Thickness", "thickness"]);

      // 1. Mandatory Fields Validation
      if (!productName) errors.push("Product Name is required");
      if (!categoryName) errors.push("Category is required");
      if (!itemCode) errors.push("Item Code is required");
      if (!primaryUnitName) errors.push("Primary Unit is required");

      // 2. Item Code Uniqueness Validation
      if (itemCode) {
        const lowerCode = itemCode.toLowerCase();
        if (existingItemCodes.has(lowerCode)) {
          errors.push(`Item Code "${itemCode}" already exists in the system`);
        } else if (batchItemCodes.has(lowerCode)) {
          errors.push(`Item Code "${itemCode}" is duplicated in this Excel sheet`);
        }
      }

      // 3. Category Validation & Resolution
      let categoryId: number | null = null;
      if (categoryName) {
        const cat = catMap.get(categoryName.toLowerCase());
        if (!cat) {
          errors.push(`Category "${categoryName}" not found in master`);
        } else {
          categoryId = cat.id;
        }
      }

      // 4. Sub Category Validation
      let subCategoryId: number | null = null;
      if (subCategoryName && categoryId) {
        const subCat = catMap.get(subCategoryName.toLowerCase());
        if (!subCat || subCat.parent_id !== categoryId) {
          errors.push(`Sub Category "${subCategoryName}" is invalid for Category "${categoryName}"`);
        } else {
          subCategoryId = subCat.id;
        }
      } else if (subCategoryName && !categoryId) {
        errors.push(`Sub Category "${subCategoryName}" provided but Category is invalid`);
      }

      // 5. Brand Validation
      let brandId: number | null = null;
      if (brandName) {
        const bId = brandMap.get(brandName.toLowerCase());
        if (!bId) {
          errors.push(`Brand "${brandName}" not found in master`);
        } else {
          brandId = bId;
        }
      }

      // 6. Item Group Validation
      let itemGroupId: number | null = null;
      if (itemGroupName) {
        const gId = groupMap.get(itemGroupName.toLowerCase());
        if (!gId) {
          errors.push(`Item Group "${itemGroupName}" not found in master`);
        } else {
          itemGroupId = gId;
        }
      }

      // 7. Units Validation
      const resolveUnit = (name: string, label: string): number | null => {
        if (!name) return null;
        const uId = unitMap.get(name.toLowerCase());
        if (!uId) {
          errors.push(`${label} "${name}" not found in master`);
          return null;
        }
        return uId;
      };

      const primaryUnitId = resolveUnit(primaryUnitName, "Primary Unit");
      const purchaseUnitId = resolveUnit(purchaseUnitName, "Purchase Unit") ?? primaryUnitId;
      const stockUnitId = resolveUnit(stockUnitName, "Stock Unit") ?? primaryUnitId;
      const consumptionUnitId = resolveUnit(consumptionUnitName, "Consumption Unit") ?? primaryUnitId;
      const minStockUnitId = resolveUnit(minStockUnitName, "Min Stock Unit");
      const maxStockUnitId = resolveUnit(maxStockUnitName, "Max Stock Unit");
      const reorderLevelUnitId = resolveUnit(reorderLevelUnitName, "Reorder Level Unit");
      const reorderBatchUnitId = resolveUnit(reorderBatchUnitName, "Reorder Batch Unit");

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

      // 10. HSN
      let hsnId: number | null = null;
      if (hsnCodeRaw) {
        const hId = hsnMap.get(hsnCodeRaw.toLowerCase());
        if (!hId) {
          errors.push(`HSN Code "${hsnCodeRaw}" not found in master`);
        } else {
          hsnId = hId;
        }
      }

      // 11. Core Product
      let coreProductId: number | null = null;
      if (coreProductName) {
        const cpId = coreMap.get(coreProductName.toLowerCase());
        if (!cpId) {
          errors.push(`Core Product "${coreProductName}" not found in master`);
        } else {
          coreProductId = cpId;
        }
      }

      // 12. Grade
      let gradeId: number | null = null;
      if (gradeName) {
        const grId = gradeMap.get(gradeName.toLowerCase());
        if (!grId) {
          errors.push(`Grade "${gradeName}" not found in master`);
        } else {
          gradeId = grId;
        }
      }

      // 13. Type
      let typeId: number | null = null;
      if (typeName) {
        const tId = typeMap.get(typeName.toLowerCase());
        if (!tId) {
          errors.push(`Type "${typeName}" not found in master`);
        } else {
          typeId = tId;
        }
      }

      // 14. Finish
      let finishId: number | null = null;
      if (finishName) {
        const fId = finishMap.get(finishName.toLowerCase());
        if (!fId) {
          errors.push(`Finish "${finishName}" not found in master`);
        } else {
          finishId = fId;
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
        batchItemCodes.add(itemCode.toLowerCase());
        validPayloads.push({
          rowNum,
          payload: {
            vendor_id: Number(vendor_id),
            created_by: user_id,
            category_id: categoryId!,
            sub_category_id: subCategoryId,
            product_name: productName,
            article_code: itemCode,
            item_code: itemCode,
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
            item_type: itemType,
            core_product_id: coreProductId,
            grade_id: gradeId,
            type_id: typeId,
            finish_id: finishId,
            dimension_1: length ?? 0,
            dimension_2: height ?? 0,
            dimension_3: thickness ?? 0,
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
          raw: item.payload,
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
