import { prisma } from "../../prisma/client";
import { ProductActiveFlag } from "@prisma/client";
import { validationResponse } from "../../utils/validationResponse";
import ExcelJS from "exceljs";
import { v4 as uuidv4 } from "uuid";

// ─── DOWNLOAD — generate Excel with current stock ─────────────────────────────

export const downloadStockSheetService = async (
  vendor_id:    number,
  filters: {
    search?:      string;
    category_id?: number;
    brand_id?:    number;
    active?:      string;
    procurement?: string;
  } = {}
) => {
  try {
  const products = await prisma.productMaster.findMany({
      where: {
        vendor_id,
        // When an active filter is explicitly set use it, otherwise default to "Yes"
        active: filters.active === "No" ? ProductActiveFlag.No : ProductActiveFlag.Yes,
        ...(filters.category_id ? { category_id: filters.category_id } : {}),
        ...(filters.brand_id    ? { brand_id:    filters.brand_id    } : {}),
        ...(filters.procurement ? { procurement: { contains: filters.procurement, mode: "insensitive" as const } } : {}),
        ...(filters.search ? {
          OR: [
            { product_name:  { contains: filters.search, mode: "insensitive" as const } },
            { article_code:  { contains: filters.search, mode: "insensitive" as const } },
            { vendor_code:   { contains: filters.search, mode: "insensitive" as const } },
            { group:         { contains: filters.search, mode: "insensitive" as const } },
            { finish:        { contains: filters.search, mode: "insensitive" as const } },
            { core_material: { contains: filters.search, mode: "insensitive" as const } },
          ],
        } : {}),
      },
      orderBy: { product_name: "asc" },
      select: {
        id:               true,
        product_name:     true,
        article_code:     true,
        vendor_code:      true,
        group:            true,
        finish:           true,
        core_material:    true,
        unit_of_measure:  true,
        board_length:     true,
        board_width:      true,
        dimension_1:      true,
        dimension_2:      true,
        dimension_3:      true,
        current_stock:    true,
        stock_updated_at: true,
        procurement:      true,
        category: { select: { category_name: true } },
        brand:    { select: { brand_name:    true } },
      },
    });
 
 



    const wb = new ExcelJS.Workbook();
    wb.creator = "Furnix";
    wb.created = new Date();


    const ws = wb.addWorksheet("Stock", {
      // If filters applied, freeze row 2 (row 1 = filter note, row 2 = header)
      // else freeze row 1 (header only)
      views: [{ state: "frozen", ySplit: 1 }],
    });

    // Define columns
    ws.columns = [
      { header: "ID (Do not edit)",  key: "id",           width: 16 },
      { header: "Product Name",      key: "product_name", width: 36 },
      { header: "Category",          key: "category",     width: 22 },
      { header: "Brand",             key: "brand",        width: 16 },
      { header: "Article Code",      key: "article_code", width: 16 },
      { header: "Vendor Code",       key: "vendor_code",  width: 16 },
      { header: "Group",             key: "group",        width: 16 },
      { header: "Finish",            key: "finish",       width: 16 },
      { header: "Core Material",     key: "core_material",width: 18 },
      { header: "UOM",               key: "uom",          width: 10 },
      { header: "Dimensions",        key: "dimensions",   width: 16 },
      { header: "Current Stock",     key: "current_stock",width: 16 },
      { header: "New Stock",         key: "new_stock",    width: 16 },
      { header: "Stock Last Updated",key: "stock_updated",width: 20 },
    ];

    // ── Filter note row (row 1 when filters applied) ────────────────────────
    // Style header row
    const headerRow = ws.getRow(1);
    headerRow.eachCell(cell => {
      cell.font      = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill      = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4F46E5" } };  // indigo
      cell.alignment = { vertical: "middle", horizontal: "center" };
      cell.border    = {
        bottom: { style: "thin", color: { argb: "FFE5E7EB" } },
      };
    });
    headerRow.height = 28;

    // "New Stock" header highlight (amber) — column 13, on actual header row
    const headerRowNum = 1;
    const newStockHeader = ws.getCell("M1");
    newStockHeader.fill  = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF59E0B" } };
    newStockHeader.font  = { bold: true, color: { argb: "FF000000" } };

    // Add rows
    for (const p of products) {
      let dimensions = "";
      if (p.dimension_1 || p.dimension_2 || p.dimension_3)
        dimensions = `${p.dimension_1}×${p.dimension_2}×${p.dimension_3}`;
      else if (p.board_length || p.board_width)
        dimensions = `${p.board_length}×${p.board_width}`;

      const row = ws.addRow({
        id:            p.id,
        product_name:  p.product_name,
        category:      p.category.category_name,
        brand:         p.brand?.brand_name ?? "",
        article_code:  p.article_code      ?? "",
        vendor_code:   p.vendor_code       ?? "",
        group:         p.group             ?? "",
        finish:        p.finish            ?? "",
        core_material: p.core_material     ?? "",
        uom:           p.unit_of_measure   ?? "",
        dimensions,
        current_stock: p.current_stock ? parseFloat(p.current_stock.toString()) : 0,
        new_stock:     "",   // ← user fills this
        stock_updated: p.stock_updated_at
          ? new Date(p.stock_updated_at).toLocaleDateString("en-IN")
          : "",
      });

      // Style alternating rows
      const isEven = row.number % 2 === 0;
      row.eachCell({ includeEmpty: true }, cell => {
        if (isEven) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF9FAFB" } };
        cell.alignment = { vertical: "middle" };
      });

      // Lock the ID cell (visual indicator — actual protection set below)
      const idCell = row.getCell("A");
      idCell.font = { color: { argb: "FF9CA3AF" }, italic: true };

      // Highlight New Stock column cell (amber tint)
      const newStockCell = row.getCell("M");
      newStockCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEF3C7" } };

      // Number format for stock columns
      row.getCell("L").numFmt = "#,##0.00";
      row.getCell("M").numFmt = "#,##0.00";
    }

    // Protect sheet — allow editing only column M (New Stock)
    ws.protect("", {
      selectLockedCells:   true,
      selectUnlockedCells: true,
      formatCells:         false,
      insertRows:          false,
      deleteRows:          false,
    });

    // Data rows start at row 2 (no filter) or row 3 (filter note + header)
    const dataStartRow = 2;
    const dataEndRow   = dataStartRow + products.length - 1;

    // Unlock only column M (New Stock) data cells — never the note/header rows
    for (let r = dataStartRow; r <= dataEndRow; r++) {
      ws.getCell(`M${r}`).protection = { locked: false };
    }

    // Auto-filter on header row (row 1 no-filter, row 2 with filter note)
    ws.autoFilter = { from: "A1", to: "N1" };

    const buffer = await wb.xlsx.writeBuffer();
    return validationResponse(1, "Sheet generated", { buffer, count: products.length });
  } catch (e) {
    console.error("downloadStockSheetService error:", e);
    return validationResponse(0, "Failed to generate stock sheet");
  }
};

// ─── UPLOAD — parse Excel, update stock, write history ───────────────────────

interface UploadResult {
  total:    number;
  updated:  number;
  skipped:  number;   // "New Stock" was blank / same as current
  errors:   { row: number; id: number; reason: string }[];
}

export const uploadStockSheetService = async (
  vendor_id: number,
  user_id:   number,
  fileBuffer: Buffer
): Promise<ReturnType<typeof validationResponse>> => {
  try {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(fileBuffer);
    const ws = wb.worksheets[0];
    if (!ws) return validationResponse(0, "Could not read worksheet");

    // Convert worksheet to row objects using header row as keys
    const headerRow = ws.getRow(1);
    const headerss: string[] = [];
    headerRow.eachCell({ includeEmpty: true }, (cell, colNum) => {
      headerss[colNum] = String(cell.value ?? "");
    });

    const rows: any[] = [];
    ws.eachRow((row, rowNum) => {
      if (rowNum === 1) return;  // skip header
      const obj: any = {};
      row.eachCell({ includeEmpty: true }, (cell, colNum) => {
        const key = headerss[colNum];
        if (key) obj[key] = cell.value ?? "";
      });
      rows.push(obj);
    });

    if (!rows.length) return validationResponse(0, "Sheet is empty");

    // Validate headers
    const required = ["ID (Do not edit)", "New Stock"];
    const headers  = Object.keys(rows[0]);
    for (const h of required) {
      if (!headers.includes(h))
        return validationResponse(0, `Missing required column: "${h}"`);
    }

    const result: UploadResult = { total: rows.length, updated: 0, skipped: 0, errors: [] };
    const batchId = uuidv4();

    // Collect valid rows first
    const toUpdate: { id: number; newStock: number; rowNum: number }[] = [];

    for (let ri = 0; ri < rows.length; ri++) {
      const row    = rows[ri];
      const rowNum = ri + 2; // 1-indexed + header row
      const id     = Number(row["ID (Do not edit)"]);
      const raw    = row["New Stock"];

      if (!id || isNaN(id)) {
        result.errors.push({ row: rowNum, id: 0, reason: "Invalid or missing ID" });
        continue;
      }
      if (raw === "" || raw === null || raw === undefined) {
        result.skipped++;
        continue;
      }
      const newStock = parseFloat(String(raw));
      if (isNaN(newStock) || newStock < 0) {
        result.errors.push({ row: rowNum, id, reason: `Invalid stock value: "${raw}"` });
        continue;
      }
      toUpdate.push({ id, newStock, rowNum });
    }

    if (!toUpdate.length && !result.errors.length) {
      return validationResponse(1, "No stock values to update (all New Stock cells were blank)", result);
    }

    // Validate all product IDs belong to this vendor in one query
    const ids = toUpdate.map(r => r.id);
    const validProducts = await prisma.productMaster.findMany({
      where:  { id: { in: ids }, vendor_id },
      select: { id: true, current_stock: true },
    });
    const productMap = new Map(validProducts.map(p => [p.id, p]));

    // ── Build update list (pure logic, no DB calls) ──────────────────────────
    // Doing N individual awaits inside an interactive $transaction times out
    // for large sheets (default 5 s). Instead:
    //   1. Compute what changes are needed
    //   2. Batch-update ProductMaster via $transaction([...]) — array form,
    //      no callback, no timeout limit
    //   3. Insert all history rows with createMany — one query

    const now = new Date();
    const productUpdates: { id: number; newStock: number; oldStock: number }[] = [];

    for (const { id, newStock, rowNum } of toUpdate) {
      const product = productMap.get(id);
      if (!product) {
        result.errors.push({ row: rowNum, id, reason: "Product not found for this vendor" });
        continue;
      }
      const oldStock = parseFloat(product.current_stock.toString());
      if (oldStock === newStock) {
        result.skipped++;
        continue;
      }
      productUpdates.push({ id, newStock, oldStock });
      result.updated++;
    }

    if (productUpdates.length > 0) {
      // Array-form $transaction — Prisma batches as a single network round-trip
      await prisma.$transaction(
        productUpdates.map(({ id, newStock }) =>
          prisma.productMaster.update({
            where: { id },
            data:  { current_stock: newStock, stock_updated_at: now },
          })
        )
      );

      // All history rows in one INSERT
      await prisma.productStockHistory.createMany({
        data: productUpdates.map(({ id, newStock, oldStock }) => ({
          vendor_id,
          product_id:      id,
          old_stock:       oldStock,
          new_stock:       newStock,
          change:          newStock - oldStock,
          source:          "ExcelUpload" as const,
          changed_by:      user_id,
          upload_batch_id: batchId,
        })),
      });
    }

    return validationResponse(1, "Stock updated successfully", { ...result, batch_id: batchId });
  } catch (e) {
    console.error("uploadStockSheetService error:", e);
    return validationResponse(0, "Failed to process stock sheet");
  }
};

// ─── GET stock history for a product ─────────────────────────────────────────

export const getProductStockHistoryService = async (
  vendor_id:  number,
  product_id: number,
  page:       number
) => {
  try {
    const PAGE_SIZE = 20;
    const skip      = (page - 1) * PAGE_SIZE;

    const where = { vendor_id, product_id };

    const [total, history] = await Promise.all([
      prisma.productStockHistory.count({ where }),
      prisma.productStockHistory.findMany({
        where,
        skip,
        take:    PAGE_SIZE,
        orderBy: { created_at: "desc" },
        include: {
          changedBy: { select: { id: true, user_name: true } },
        },
      }),
    ]);

    return validationResponse(1, "Stock history fetched", {
      history,
      total,
      page,
      page_size:   PAGE_SIZE,
      total_pages: Math.ceil(total / PAGE_SIZE),
    });
  } catch (e) {
    console.error("getProductStockHistoryService error:", e);
    return validationResponse(0, "Failed to fetch stock history");
  }
};

// ─── GET upload batch history (all products in one upload) ───────────────────

export const getStockUploadBatchesService = async (vendor_id: number, page: number) => {
  try {
    const PAGE_SIZE = 10;
    const skip      = (page - 1) * PAGE_SIZE;

    // Group by batch_id
    const batches = await prisma.productStockHistory.groupBy({
      by:      ["upload_batch_id", "changed_by", "source"],
      where:   { vendor_id, source: "ExcelUpload", upload_batch_id: { not: null } },
      _count:  { id: true },
      _max:    { created_at: true },
      orderBy: { _max: { created_at: "desc" } },
      skip,
      take: PAGE_SIZE,
    });

    const total = await prisma.productStockHistory.groupBy({
      by:    ["upload_batch_id"],
      where: { vendor_id, source: "ExcelUpload", upload_batch_id: { not: null } },
    }).then(r => r.length);

    // Enrich with user names
    const userIds  = [...new Set(batches.map(b => b.changed_by).filter(Boolean))] as number[];
    const users    = await prisma.userMaster.findMany({
      where:  { id: { in: userIds } },
      select: { id: true, user_name: true },
    });
    const userMap  = new Map(users.map(u => [u.id, u.user_name]));

    const enriched = batches.map(b => ({
      batch_id:    b.upload_batch_id,
      uploaded_by: b.changed_by ? userMap.get(b.changed_by) ?? "Unknown" : "System",
      products_updated: b._count.id,
      uploaded_at:      b._max.created_at,
    }));

    return validationResponse(1, "Batches fetched", {
      batches: enriched, total, page,
      page_size: PAGE_SIZE, total_pages: Math.ceil(total / PAGE_SIZE),
    });
  } catch (e) {
    return validationResponse(0, "Failed to fetch batches");
  }
};