import { validationResponse } from '../../../src/utils/validationResponse';
import axios from "axios";
import { prisma } from '../../prisma/client';

const CADBID_PRODUCT_API_URL =
  process.env.CADBID_URL + "/api/product/get-pt";

const PAGE_LIMIT = 100;
const CADBID_PLATFORM_ID = 1;

export const syncCadbidProductFromExternalService = async (vendor_id: number) => {
  try {


    // ─────────────────────────────────────────────
    // 1) Check token
    // ─────────────────────────────────────────────
    const tokenRecord = await prisma.externalPlatformToken.findFirst({
      where: {
        vendor_id,
        external_platform_id: CADBID_PLATFORM_ID,
        active: "Yes",
      },
      select: {
        token: true,
      },
    });

    if (!tokenRecord) {
      return validationResponse(
        0,
        "No active token found for this vendor. Please connect CadBid first."
      );
    }





    // ─────────────────────────────────────────────
    // 2) Fetch all pages
    // ─────────────────────────────────────────────
    let allProducts: any[] = [];
    let page = 1;
    let totalCount = 0;
    let totalPages = 1;

    try {
      while (page <= totalPages) {
        console.log(`Fetching products page ${page}/${totalPages}`);

        const response = await axios.get(CADBID_PRODUCT_API_URL, {
          params: {
            page,
            limit: PAGE_LIMIT,
          },
          headers: {
            Authorization: `Bearer ${tokenRecord.token}`,
          },
          timeout: 30000,
        });

        const products = Array.isArray(response.data?.products)
          ? response.data.products
          : [];

        totalCount = Number(response.data?.totalCount || 0);
        totalPages = Math.ceil(totalCount / PAGE_LIMIT);

        allProducts.push(...products);
        page++;
      }
    } catch (apiErr: any) {
      console.error(
        "CadBid Product API Error:",
        apiErr?.response?.data ?? apiErr.message
      );

      return validationResponse(
        0,
        "Failed to fetch products from CadBid."
      );
    }

    try {
      await prisma.apiRequestLog.create({
        data: {
          endpoint: "syncProductsFromExternalService",
          vendor_token: tokenRecord.token,
          vendor_id: vendor_id,
          payload: JSON.stringify(allProducts) as any,
          success: false,
          response: '',
          error: null,
          project_id: 0,
        }
      });
    } catch (logError) {
      console.error("Failed to write api log:", logError);
    }

    if (!allProducts.length) {
      return validationResponse(0, "No products returned from CadBid");
    }

    console.log("Total Products:", allProducts.length);


    const invalidProducts = allProducts.filter(
      (p) =>
        !p?.nItemId ||
        p?.nItemId === 0
        ||
        !p?.sCode ||
        !String(p.sCode).trim()
    );

    if (invalidProducts.length > 0) {
      console.error(
        "Product validation failed:",
        invalidProducts.slice(0, 20)
      );

      return validationResponse(
        0,
        `Validation failed. ${invalidProducts.length} product(s) missing mandatory fields nItemId  / sCode.`,
        {
          invalidCount: invalidProducts.length,
          sampleInvalidRecords: invalidProducts.slice(0, 20),
        }
      );
    }

    // ─────────────────────────────────────────────
    // 3) Cache existing brands/categories
    // ─────────────────────────────────────────────
    const existingBrands = await prisma.brandMaster.findMany({
      where: { vendor_id },
      select: {
        id: true,
        brand_name: true,
      },
    });

    const existingCategories = await prisma.projectCategoriesMaster.findMany({
      where: { vendor_id },
      select: {
        id: true,
        category_name: true,
      },
    });

    const brandMap = new Map<string, number>();
    const categoryMap = new Map<string, number>();

    existingBrands.forEach((b) => {
      if (b.brand_name) {
        brandMap.set(b.brand_name.trim().toLowerCase(), b.id);
      }
    });

    existingCategories.forEach((c) => {
      categoryMap.set(c.category_name.trim().toLowerCase(), c.id);
    });

    // ─────────────────────────────────────────────
    // 4) Upsert products
    // ────────────────────────────────────────────

    // ─────────────────────────────────────────────
    // 3 + 4) Transaction: brands + products upsert
    // ─────────────────────────────────────────────
    let created = 0;
    let updated = 0;
    let skipped = 0;
    let brandsCreated = 0;

    await prisma.$transaction(
      async (tx) => {
        // preload
        const existingBrands = await tx.brandMaster.findMany({
          where: { vendor_id },
          select: {
            id: true,
            brand_name: true,
          },
        });

        const existingCategories =
          await tx.projectCategoriesMaster.findMany({
            where: { vendor_id },
            select: {
              id: true,
              category_name: true,
            },
          });

        const existingProducts = await tx.productMaster.findMany({
          where: { vendor_id },
          select: {
            id: true,
            item_id: true,
          },
        });

        const brandMap = new Map<string, number>();
        const categoryMap = new Map<string, number>();
        const productMap = new Map<number, number>();

        existingBrands.forEach((b) => {
          if (b.brand_name) {
            brandMap.set(b.brand_name.trim().toLowerCase(), b.id);
          }
        });

        existingCategories.forEach((c) => {
          categoryMap.set(c.category_name.trim().toLowerCase(), c.id);
        });

        existingProducts.forEach((p) => {
          if (p.item_id !== null) {
            productMap.set(p.item_id, p.id);
          }
        });

        for (const p of allProducts) {
          if (!p.nItemId || !p.sCode) {
            skipped++;
            continue;
          }

          // ───────────────────
          // BRAND
          // ───────────────────
          let brandId: number | null = null;

          if (p.sBrand?.trim()) {
            const brandKey = p.sBrand.trim().toLowerCase();

            brandId = brandMap.get(brandKey) || null;

            if (!brandId) {
              const brand = await tx.brandMaster.create({
                data: {
                  vendor_id,
                  brand_name: p.sBrand.trim(),
                  active: "Yes",
                },
              });

              brandId = brand.id;
              brandMap.set(brandKey, brand.id);
              brandsCreated++;
            }
          }

          // ───────────────────
          // CATEGORY
          // ───────────────────
          let categoryId: number | null = null;

          if (p.sCategory?.trim()) {
            const categoryKey = p.sCategory.trim().toLowerCase();
            categoryId = categoryMap.get(categoryKey) || null;
          }

          if (!categoryId) {
            console.log(skipped);
            skipped++;
            continue;
          }

          const payload = {
            vendor_id,
            item_id: Number(p.nItemId),

            rotation: Number(p.bRotation || 0),
            alt_conv_factor: Number(p.nAltConvFactor || 0),

            board_length: Number(p.nBoardLength || 0),
            board_width: Number(p.nBoardWidth || 0),

            dimension_1: Number(p.nDimension1 || 0),
            dimension_2: Number(p.nDimension2 || 0),
            dimension_3: Number(p.nDimension3 || 0),

            installation_charges: Number(p.nInstallationCharges || 0),
            item1_weight: Number(p.nItemW1eight || 0),

            level1_price: Number(p.nLevel1Price || 0),
            level2_price: Number(p.nLevel2Price || 0),
            level3_price: Number(p.nLevel3Price || 0),

            moq: Number(p.nMoq || 0),
            no_of_drill_holes: Number(p.nNoofDrillHoles || 0),
            pre_mill_width: Number(p.nPreMillWidth || 0),

            alt_uom_text: p.sAltUomText || null,

            brand_id: brandId ?? null,
            category_id: categoryId,

            article_code: p.sCode || null,
            core_material: p.sCoreMaterial || null,
            edge_banding_color: p.sEdgeBandingColor || null,
            finish: p.sFinish || null,
            group: p.sGroup || null,

            hsn_code: p.sHsnCode
              ? String(p.sHsnCode).replace(/\D/g, "") || null
              : null,

            product_name: p.sName,
            procurement: p.sProcurement || null,
            unit_of_measure: p.sUom || null,
            vendor_code: p.sVendorCode || null,

            custom_field_1: p.nCustomField1 || null,
            custom_field_2: p.nCustomField2 || null,
            custom_field_3: p.nCustomField3 || null,

            active: "Yes" as const,
          };

          const existingProductId =
            productMap.get(Number(p.nItemId));

          if (existingProductId) {
            await tx.productMaster.update({
              where: {
                id: existingProductId,
              },
              data: payload,
            });

            updated++;
          } else {
            const createdProduct =
              await tx.productMaster.create({
                data: payload,
              });

            productMap.set(
              Number(p.nItemId),
              createdProduct.id
            );

            created++;
          }
        }
      },
      {
        timeout: 600000, // 10 min
      }
    );

    return validationResponse(
      1,
      "Products synced successfully",
      {
        totalCount,
        fetched: allProducts.length,
        created,
        updated,
        skipped,
        brandsCreated,
      }
    );
  } catch (error) {
    console.error("syncProductsFromExternalService:", error);
    return validationResponse(0, "Sync failed");
  }
};




const PAGE_SIZE = 20;

export const getProductMasterService = async (
  vendor_id: number,
  page: number,
  search: string,
  category_id?: number,
  brand_id?: number,
  active?: string,
  procurement?: string,
) => {
  try {
    const skip = (page - 1) * PAGE_SIZE;

    const where: any = {
      vendor_id,
      ...(active ? { active } : {}),
      ...(category_id ? { category_id } : {}),
      ...(brand_id ? { brand_id } : {}),
      ...(procurement ? { procurement: { contains: procurement, mode: "insensitive" } } : {}),
      ...(search
        ? {
          OR: [
            { product_name: { contains: search, mode: "insensitive" } },
            { article_code: { contains: search, mode: "insensitive" } },
            { vendor_code: { contains: search, mode: "insensitive" } },
            { group: { contains: search, mode: "insensitive" } },
            { finish: { contains: search, mode: "insensitive" } },
            { core_material: { contains: search, mode: "insensitive" } },
          ],
        }
        : {}),
    };

    const [total, products] = await Promise.all([
      prisma.productMaster.count({ where }),
      prisma.productMaster.findMany({
        where,
        skip,
        take: PAGE_SIZE,
        orderBy: { id: "desc" },
        select: {
          id: true,
          item_id: true,
          product_name: true,
          article_code: true,
          vendor_code: true,
          group: true,
          finish: true,
          core_material: true,
          edge_banding_color: true,
          unit_of_measure: true,
          alt_uom_text: true,
          procurement: true,
          hsn_code: true,
          moq: true,
          board_length: true,
          board_width: true,
          dimension_1: true,
          dimension_2: true,
          dimension_3: true,
          length: true,
          height: true,
          thickness: true,
          item1_weight: true,
          level1_price: true,
          level2_price: true,
          level3_price: true,
          installation_charges: true,
          rotation: true,
          alt_conv_factor: true,
          no_of_drill_holes: true,
          pre_mill_width: true,
          custom_field_1: true,
          custom_field_2: true,
          custom_field_3: true,
          active: true,
          created_at: true,
          updated_at: true,
          // ── Stock ─────────────────────────────────────────────────────────
          current_stock: true,    // auto-updated on GRN confirmation
          stock_updated_at: true,    // ← added
          barcode: true,
          p_code: true,
          color_name: true,
          subCategory: { select: { id: true, category_name: true } },
          grade: { select: { id: true, grade_name: true } },
          primaryUnit: { select: { id: true, unit_name: true } },
          // ── Category + Brand ──────────────────────────────────────────────
          category: { select: { id: true, category_name: true } },
          brand: { select: { id: true, brand_name: true } },
          finish_id: true,
          core_product_id: true,
          finishMaster: { select: { id: true, finish_name: true } },
          coreProduct: { select: { id: true, core_product_name: true } },
          // ── HSN mapping (for tax rates) ────────────────────────────────────
          // hsn_id is the FK; include the joined row so the frontend can
          // display/use cgst_rate, sgst_rate, igst_rate without a second call
          hsn: {
            select: {
              id: true,
              hsn_code: true,   // string e.g. "94036000"
              cgst_rate: true,
              sgst_rate: true,
              igst_rate: true,
            },
          },
        },
      }),
    ]);

    return validationResponse(1, "Products fetched", {
      products,
      total,
      page,
      page_size: PAGE_SIZE,
      total_pages: Math.ceil(total / PAGE_SIZE),
    });
  } catch (error) {
    console.error("getProductMasterService error:", error);
    return validationResponse(0, "Failed to fetch products");
  }
};


export const getProductFiltersService = async (vendor_id: number) => {
  try {
    const [categories, brands, procurementValues] = await Promise.all([
      prisma.projectCategoriesMaster.findMany({
        where: { vendor_id, status: "Yes" },
        select: { id: true, category_name: true },
        orderBy: { category_name: "asc" },
      }),
      prisma.brandMaster.findMany({
        where: { vendor_id },           // ← removed active filter: enum mismatch silently returns []
        select: { id: true, brand_name: true },
        orderBy: { brand_name: "asc" },
      }),
      // Distinct procurement values that actually exist for this vendor
      prisma.productMaster.findMany({
        where: { vendor_id, procurement: { not: null } },
        select: { procurement: true },
        distinct: ["procurement"],
        orderBy: { procurement: "asc" },
      }),
    ]);

    const procurements = procurementValues
      .map(p => p.procurement)
      .filter(Boolean) as string[];

    return validationResponse(1, "Filters fetched", { categories, brands, procurements });
  } catch (error) {
    console.error("getProductFiltersService error:", error);
    return validationResponse(0, "Failed to fetch filters");
  }
};


export const getProductPurchaseHistoryService = async (
  vendor_id: number,
  product_id: number
) => {
  try {
    const [product, piItems, poItems, grnItems] = await Promise.all([

      // Product with current stock
      prisma.productMaster.findFirst({
        where: { id: product_id, vendor_id },
        select: {
          id: true, product_name: true, article_code: true,
          unit_of_measure: true, moq: true,
          level1_price: true, current_stock: true, stock_updated_at: true,
          dimension_1: true, dimension_2: true, dimension_3: true,
          length: true, height: true, thickness: true,
          board_length: true, board_width: true, procurement: true,
          category: { select: { id: true, category_name: true } },
        },
      }),

      // Purchase Intent items — include all pricing fields on vendorMappings
      prisma.purchaseIntentItem.findMany({
        where: {
          product_id,
          purchaseIntent: { vendor_id, is_deleted: false },
        },
        include: {
          purchaseIntent: {
            select: {
              id: true, intent_no: true, status: true, priority: true,
              created_at: true,
              createdBy: { select: { id: true, user_name: true } },
              category: { select: { id: true, category_name: true } },
            },
          },
          vendorMappings: {
            include: {
              companyVendor: { select: { id: true, company_name: true, vendor_code: true } },
            },
            // All pricing columns are selected automatically via include
          },
        },
        orderBy: { purchaseIntent: { created_at: "desc" } },
      }),

      // Purchase Order items — include all pricing fields
      prisma.purchaseOrderItem.findMany({
        where: {
          product_id,
          purchaseOrder: { vendor_id, is_deleted: false },
        },
        include: {
          purchaseOrder: {
            select: {
              id: true, po_no: true, status: true, created_at: true,
              expected_delivery_date: true,
              companyVendor: { select: { id: true, company_name: true, vendor_code: true } },
              purchaseIntent: { select: { id: true, intent_no: true } },
            },
          },
        },
        orderBy: { purchaseOrder: { created_at: "desc" } },
      }),

      // GRN items — include all pricing fields
      prisma.gRNItem.findMany({
        where: {
          product_id,
          grn: { vendor_id },
        },
        include: {
          grn: {
            select: {
              id: true, grn_no: true, status: true,
              received_date: true, confirmed_at: true,
              purchaseOrder: { select: { id: true, po_no: true } },
              companyVendor: { select: { id: true, company_name: true, vendor_code: true } },
              confirmedBy: { select: { id: true, user_name: true } },
            },
          },
          redeliveryRequests: {
            select: { id: true, status: true, requested_qty: true, expected_date: true },
          },
        },
        orderBy: { grn: { received_date: "desc" } },
      }),
    ]);

    if (!product) return validationResponse(0, "Product not found");

    // ── Aggregate stats ──────────────────────────────────────────────────────

    const totalOrdered = poItems.reduce((s, i) => s + parseFloat(i.ordered_qty.toString()), 0);
    const totalAccepted = grnItems
      .filter(i => i.grn.status === "Confirmed")
      .reduce((s, i) => s + parseFloat(i.accepted_qty.toString()), 0);
    const totalRejected = grnItems
      .filter(i => i.grn.status === "Confirmed")
      .reduce((s, i) => s + parseFloat(i.rejected_qty.toString()), 0);
    const totalPending = poItems
      .filter(i => ["Approved", "PartiallyReceived"].includes(i.purchaseOrder.status))
      .reduce((s, i) => s + (parseFloat(i.ordered_qty.toString()) - parseFloat(i.received_qty.toString())), 0);

    // Total value across all PI vendor mappings
    const totalPIValue = piItems.reduce((s, item) =>
      s + item.vendorMappings.reduce((ss, vm) =>
        ss + parseFloat((vm.total_amount ?? 0).toString()), 0), 0);

    // Total PO value (sum of total_amount on each PO item)
    const totalPOValue = poItems.reduce((s, i) =>
      s + parseFloat((i.total_amount ?? 0).toString()), 0);

    // Total GRN value (confirmed, accepted only)
    const totalGRNValue = grnItems
      .filter(i => i.grn.status === "Confirmed")
      .reduce((s, i) => s + parseFloat((i.total_amount ?? 0).toString()), 0);

    // Helper: safely convert Prisma Decimal / null → string for JSON
    const dec = (v: any) => (v != null ? v.toString() : null);

    return validationResponse(1, "Product history fetched", {
      product,
      stats: {
        total_pi: piItems.length,
        total_po: poItems.length,
        total_grn: grnItems.length,
        total_ordered: totalOrdered,
        total_accepted: totalAccepted,
        total_rejected: totalRejected,
        total_pending: Math.max(0, totalPending),
        current_stock: parseFloat((product.current_stock ?? 0).toString()),
        // Value totals
        total_pi_value: totalPIValue,
        total_po_value: totalPOValue,
        total_grn_value: totalGRNValue,
      },

      // ── Purchase Intents ────────────────────────────────────────────────────
      purchase_intents: piItems.map(i => ({
        id: i.purchaseIntent.id,
        intent_no: i.purchaseIntent.intent_no,
        status: i.purchaseIntent.status,
        priority: i.purchaseIntent.priority,
        created_at: i.purchaseIntent.created_at,
        created_by: i.purchaseIntent.createdBy?.user_name,
        category: i.purchaseIntent.category?.category_name,
        uom: i.uom,
        remarks: i.remarks,
        vendors: i.vendorMappings.map(vm => ({
          vendor_name: vm.companyVendor.company_name,
          vendor_code: vm.companyVendor.vendor_code,
          required_qty: dec(vm.required_qty),
          estimated_price: dec(vm.estimated_price),
          required_by: vm.required_by_date,
          // ── Pricing ──────────────────────────────────────────────────────
          mrp: dec(vm.mrp),
          discount_pct: dec(vm.discount_pct),
          rate: dec(vm.rate),
          tax_pct: dec(vm.tax_pct),
          cgst_pct: dec(vm.cgst_pct),
          sgst_pct: dec(vm.sgst_pct),
          igst_pct: dec(vm.igst_pct),
          amount: dec(vm.amount),
          tax_amount: dec(vm.tax_amount),
          total_amount: dec(vm.total_amount),
        })),
      })),

      // ── Purchase Orders ─────────────────────────────────────────────────────
      purchase_orders: poItems.map(i => ({
        id: i.purchaseOrder.id,
        po_no: i.purchaseOrder.po_no,
        status: i.purchaseOrder.status,
        created_at: i.purchaseOrder.created_at,
        expected_delivery_date: i.purchaseOrder.expected_delivery_date,
        supplier: i.purchaseOrder.companyVendor.company_name,
        supplier_code: i.purchaseOrder.companyVendor.vendor_code,
        intent_no: i.purchaseOrder.purchaseIntent?.intent_no,
        ordered_qty: dec(i.ordered_qty),
        received_qty: dec(i.received_qty),
        uom: i.uom,
        expected_delivery_date_item: i.expected_delivery_date,
        // ── Pricing ──────────────────────────────────────────────────────────
        unit_price: dec(i.unit_price),
        mrp: dec(i.mrp),
        discount_pct: dec(i.discount_pct),
        rate: dec(i.rate),
        tax_pct: dec(i.tax_pct),
        cgst_pct: dec(i.cgst_pct),
        sgst_pct: dec(i.sgst_pct),
        igst_pct: dec(i.igst_pct),
        amount: dec(i.amount),
        tax_amount: dec(i.tax_amount),
        total_amount: dec(i.total_amount),
      })),

      // ── GRN Receipts ────────────────────────────────────────────────────────
      grn_receipts: grnItems.map(i => ({
        id: i.id,
        grn_id: i.grn.id,
        grn_no: i.grn.grn_no,
        status: i.grn.status,
        received_date: i.grn.received_date,
        confirmed_at: i.grn.confirmed_at,
        confirmed_by: i.grn.confirmedBy?.user_name,
        po_no: i.grn.purchaseOrder.po_no,
        supplier: i.grn.companyVendor.company_name,
        received_qty: dec(i.received_qty),
        accepted_qty: dec(i.accepted_qty),
        rejected_qty: dec(i.rejected_qty),
        item_status: i.status,
        rejection_reason: i.rejection_reason,
        redeliveries: i.redeliveryRequests,
        // ── Pricing (on accepted qty) ─────────────────────────────────────────
        unit_price: dec(i.unit_price),
        mrp: dec(i.mrp),
        discount_pct: dec(i.discount_pct),
        rate: dec(i.rate),
        tax_pct: dec(i.tax_pct),
        cgst_pct: dec(i.cgst_pct),
        sgst_pct: dec(i.sgst_pct),
        igst_pct: dec(i.igst_pct),
        amount: dec(i.amount),
        tax_amount: dec(i.tax_amount),
        total_amount: dec(i.total_amount),
      })),
    });
  } catch (e) {
    console.error("getProductPurchaseHistoryService error:", e);
    return validationResponse(0, "Failed to fetch product history");
  }
};


export const createHSNService = async (
  vendor_id: number,
  payload: {
    hsn_code: string;
    description?: string;
    igst_rate?: number | string;
  }
) => {
  try {
    if (!vendor_id) {
      return validationResponse(0, "Vendor ID is required");
    }

    if (!payload.hsn_code?.trim()) {
      return validationResponse(0, "HSN code is required");
    }

    const hsnCode = payload.hsn_code.trim();

    console.log("payload.igst_rate",payload.igst_rate);
    if (
      payload.igst_rate === undefined ||
      payload.igst_rate === null || payload.igst_rate === ""
    ) {
      return validationResponse(0, "IGST rate is required");
    }

    const igstRate = Number(payload.igst_rate);

    if (!Number.isFinite(igstRate)) {
      return validationResponse(0, "IGST rate must be a valid number");
    }

    if (igstRate < 0) {
      return validationResponse(0, "IGST rate must be greater than -1");
    }

    if (igstRate > 100) {
      return validationResponse(0, "IGST rate cannot be greater than 100");
    }

    if (igstRate > 100) {
      return validationResponse(0, "IGST rate cannot be greater than 100");
    }

    const cgstRate = Number((igstRate / 2).toFixed(2));
    const sgstRate = Number((igstRate / 2).toFixed(2));

    const existing = await prisma.hsnProductMapping.findFirst({
      where: {
        vendor_id,
        hsn_code: hsnCode,
      },
      select: {
        id: true,
      },
    });

    if (existing) {
      return validationResponse(0, "HSN code already exists");
    }

    const hsn = await prisma.hsnProductMapping.create({
      data: {
        vendor_id,
        hsn_code: hsnCode,
        description: payload.description?.trim() || null,

        igst_rate: igstRate,
        cgst_rate: cgstRate,
        sgst_rate: sgstRate,
        cess_rate: 0,

        is_active: true,
      },
    });

    return validationResponse(1, "HSN created successfully", hsn);
  } catch (error) {
    console.error("createHSNService error:", error);
    return validationResponse(0, "Failed to create HSN");
  }
};



export const getAdditionalCostMastersService = async (vendor_id: number) => {
  try {
    if (!vendor_id) {
      return validationResponse(0, "Vendor ID is required");
    }

    const costs = await prisma.additionalCostMaster.findMany({
      where: {
        vendor_id,
        is_active: true,
        is_deleted: false,
      },
      select: {
        id: true,
        cost_name: true,
        cost_code: true,
        description: true,
        is_taxable: true,
        tax_pct: true,
      },
      orderBy: {
        cost_name: "asc",
      },
    });

    return validationResponse(1, "Additional costs fetched", costs);
  } catch (error) {
    console.error("getAdditionalCostMastersService error:", error);
    return validationResponse(0, "Failed to fetch additional costs");
  }
};


export const createAdditionalCostMasterService = async (
  vendor_id: number,
  payload: {
    cost_name: string;
    cost_code?: string;
    description?: string;
    is_taxable?: boolean;
    tax_pct?: number | string;
    created_by?: number;
  }
) => {
  try {
    if (!vendor_id) {
      return validationResponse(0, "Vendor ID is required");
    }

    if (!payload.cost_name?.trim()) {
      return validationResponse(0, "Cost name is required");
    }

    const costName = payload.cost_name.trim();

    const existing = await prisma.additionalCostMaster.findFirst({
      where: {
        vendor_id,
        cost_name: {
          equals: costName,
          mode: "insensitive",
        },
        is_deleted: false,
      },
      select: {
        id: true,
      },
    });

    if (existing) {
      return validationResponse(0, "Additional cost already exists");
    }

    const isTaxable = Boolean(payload.is_taxable);
    const taxPct = isTaxable ? Number(payload.tax_pct || 0) : 0;

    if (taxPct < 0 || taxPct > 100) {
      return validationResponse(0, "Tax percentage must be between 0 and 100");
    }

    const cost = await prisma.additionalCostMaster.create({
      data: {
        vendor_id,
        cost_name: costName,
        cost_code: payload.cost_code?.trim() || null,
        description: payload.description?.trim() || null,
        is_taxable: isTaxable,
        tax_pct: taxPct,
        created_by: payload.created_by || null,
      },
    });

    return validationResponse(1, "Additional cost created successfully", cost);
  } catch (error) {
    console.error("createAdditionalCostMasterService error:", error);
    return validationResponse(0, "Failed to create additional cost");
  }
};

export const createSubCategoryService = async (
  vendor_id: number,
  payload: { categoryId: number; name: string }
) => {
  try {
    if (!vendor_id) return validationResponse(0, "Vendor ID is required");
    if (!payload.categoryId) return validationResponse(0, "Category ID is required");
    if (!payload.name?.trim()) return validationResponse(0, "Name is required");

    const category = await prisma.projectCategoriesMaster.findFirst({
      where: { id: Number(payload.categoryId), vendor_id },
    });
    if (!category) return validationResponse(0, "Category not found");

    const name = payload.name.trim();
    const existing = await prisma.projectCategoriesMaster.findFirst({
      where: {
        vendor_id,
        parent_id: Number(payload.categoryId),
        category_name: { equals: name, mode: "insensitive" },
      },
    });
    if (existing) return validationResponse(0, "Subcategory already exists under this category");

    const subCategory = await prisma.projectCategoriesMaster.create({
      data: {
        vendor_id,
        parent_id: Number(payload.categoryId),
        category_name: name,
      },
    });
    return validationResponse(1, "Subcategory created successfully", subCategory);
  } catch (error) {
    console.error("createSubCategoryService error:", error);
    return validationResponse(0, "Failed to create subcategory");
  }
};

export const createCoreProductService = async (
  vendor_id: number,
  payload: { name: string }
) => {
  try {
    if (!vendor_id) return validationResponse(0, "Vendor ID is required");
    if (!payload.name?.trim()) return validationResponse(0, "Name is required");

    const name = payload.name.trim();
    const existing = await prisma.coreProductMaster.findFirst({
      where: {
        vendor_id,
        core_product_name: { equals: name, mode: "insensitive" },
      },
    });
    if (existing) return validationResponse(0, "Core product already exists");

    const coreProduct = await prisma.coreProductMaster.create({
      data: { vendor_id, core_product_name: name },
    });
    return validationResponse(1, "Core product created successfully", coreProduct);
  } catch (error) {
    console.error("createCoreProductService error:", error);
    return validationResponse(0, "Failed to create core product");
  }
};

export const createGradeService = async (
  vendor_id: number,
  payload: { name: string }
) => {
  try {
    if (!vendor_id) return validationResponse(0, "Vendor ID is required");
    if (!payload.name?.trim()) return validationResponse(0, "Name is required");

    const name = payload.name.trim();
    const existing = await prisma.gradeMaster.findFirst({
      where: {
        vendor_id,
        grade_name: { equals: name, mode: "insensitive" },
      },
    });
    if (existing) return validationResponse(0, "Grade already exists");

    const grade = await prisma.gradeMaster.create({
      data: { vendor_id, grade_name: name },
    });
    return validationResponse(1, "Grade created successfully", grade);
  } catch (error) {
    console.error("createGradeService error:", error);
    return validationResponse(0, "Failed to create grade");
  }
};

export const createFinishService = async (
  vendor_id: number,
  payload: { name: string }
) => {
  try {
    if (!vendor_id) return validationResponse(0, "Vendor ID is required");
    if (!payload.name?.trim()) return validationResponse(0, "Name is required");

    const name = payload.name.trim();
    const existing = await prisma.finishMaster.findFirst({
      where: {
        vendor_id,
        finish_name: { equals: name, mode: "insensitive" },
      },
    });
    if (existing) return validationResponse(0, "Finish already exists");

    const finish = await prisma.finishMaster.create({
      data: { vendor_id, finish_name: name },
    });
    return validationResponse(1, "Finish created successfully", finish);
  } catch (error) {
    console.error("createFinishService error:", error);
    return validationResponse(0, "Failed to create finish");
  }
};

export const createSizeService = async (
  vendor_id: number,
  payload: { name: string }
) => {
  try {
    if (!vendor_id) return validationResponse(0, "Vendor ID is required");
    if (!payload.name?.trim()) return validationResponse(0, "Name is required");

    const name = payload.name.trim();
    return validationResponse(1, "Size created successfully", { id: 1, name: payload.name });
  } catch (error) {
    console.error("createSizeService error:", error);
    return validationResponse(0, "Failed to create size");
  }
};

export const deleteSubCategoryService = async (vendor_id: number, id: number) => {
  try {
    if (!vendor_id) return validationResponse(0, "Vendor ID is required");
    const subCategory = await prisma.projectCategoriesMaster.findFirst({
      where: { id, vendor_id },
    });
    if (!subCategory) return validationResponse(0, "Subcategory not found");

    await prisma.projectCategoriesMaster.delete({ where: { id } });
    return validationResponse(1, "Subcategory deleted successfully");
  } catch (error) {
    console.error("deleteSubCategoryService error:", error);
    return validationResponse(0, "Failed to delete subcategory");
  }
};

export const deleteCoreProductService = async (vendor_id: number, id: number) => {
  try {
    if (!vendor_id) return validationResponse(0, "Vendor ID is required");
    const coreProduct = await prisma.coreProductMaster.findFirst({
      where: { id, vendor_id },
    });
    if (!coreProduct) return validationResponse(0, "Core product not found or is global template");

    await prisma.coreProductMaster.delete({ where: { id } });
    return validationResponse(1, "Core product deleted successfully");
  } catch (error) {
    console.error("deleteCoreProductService error:", error);
    return validationResponse(0, "Failed to delete core product");
  }
};

export const deleteGradeService = async (vendor_id: number, id: number) => {
  try {
    if (!vendor_id) return validationResponse(0, "Vendor ID is required");
    const grade = await prisma.gradeMaster.findFirst({
      where: { id, vendor_id },
    });
    if (!grade) return validationResponse(0, "Grade not found or is global template");

    await prisma.gradeMaster.delete({ where: { id } });
    return validationResponse(1, "Grade deleted successfully");
  } catch (error) {
    console.error("deleteGradeService error:", error);
    return validationResponse(0, "Failed to delete grade");
  }
};

export const deleteFinishService = async (vendor_id: number, id: number) => {
  try {
    if (!vendor_id) return validationResponse(0, "Vendor ID is required");
    const finish = await prisma.finishMaster.findFirst({
      where: { id, vendor_id },
    });
    if (!finish) return validationResponse(0, "Finish not found or is global template");

    await prisma.finishMaster.delete({ where: { id } });
    return validationResponse(1, "Finish deleted successfully");
  } catch (error) {
    console.error("deleteFinishService error:", error);
    return validationResponse(0, "Failed to delete finish");
  }
};

export const deleteSizeService = async (vendor_id: number, id: number) => {
  try {
    if (!vendor_id) return validationResponse(0, "Vendor ID is required");
    return validationResponse(1, "Size deleted successfully");
  } catch (error) {
    console.error("deleteSizeService error:", error);
    return validationResponse(0, "Failed to delete size");
  }
};

export const createBrandService = async (vendor_id: number, payload: any) => {
  try {
    const { brand_name, brand_short_name } = payload;
    if (!brand_name) return validationResponse(0, "Brand name is required");

    const existing = await prisma.brandMaster.findFirst({
      where: {
        vendor_id,
        brand_name: { equals: brand_name, mode: "insensitive" },
      },
    });
    if (existing) return validationResponse(0, "Brand already exists");

    const brand = await prisma.brandMaster.create({
      data: {
        vendor_id,
        brand_name,
        brand_short_name: brand_short_name || null,
      },
    });
    return validationResponse(1, "Brand created successfully", brand);
  } catch (error) {
    console.error("createBrandService error:", error);
    return validationResponse(0, "Failed to create brand");
  }
};

export const deleteBrandService = async (vendor_id: number, id: number) => {
  try {
    if (!vendor_id) return validationResponse(0, "Vendor ID is required");
    const brand = await prisma.brandMaster.findFirst({
      where: { id, vendor_id },
    });
    if (!brand) return validationResponse(0, "Brand not found");

    await prisma.brandMaster.delete({ where: { id } });
    return validationResponse(1, "Brand deleted successfully");
  } catch (error) {
    console.error("deleteBrandService error:", error);
    return validationResponse(0, "Failed to delete brand");
  }
};

export const createProductTypeService = async (
  vendor_id: number,
  payload: { name: string }
) => {
  try {
    if (!vendor_id) return validationResponse(0, "Vendor ID is required");
    if (!payload.name?.trim()) return validationResponse(0, "Name is required");

    const name = payload.name.trim();
    const existing = await prisma.productTypeMaster.findFirst({
      where: {
        vendor_id,
        type: { equals: name, mode: "insensitive" },
      },
    });
    if (existing) return validationResponse(0, "Product type already exists");

    const count = await prisma.productTypeMaster.count({
      where: { vendor_id }
    });
    const tag = `Type ${count + 1}`;

    const pt = await prisma.productTypeMaster.create({
      data: { vendor_id, type: name, tag, status: "active" },
    });
    return validationResponse(1, "Product type created successfully", pt);
  } catch (error) {
    console.error("createProductTypeService error:", error);
    return validationResponse(0, "Failed to create product type");
  }
};

export const deleteProductTypeService = async (vendor_id: number, id: number) => {
  try {
    if (!vendor_id) return validationResponse(0, "Vendor ID is required");
    const pt = await prisma.productTypeMaster.findFirst({
      where: { id, vendor_id },
    });
    if (!pt) return validationResponse(0, "Product type not found");

    await prisma.productTypeMaster.delete({ where: { id } });
    return validationResponse(1, "Product type deleted successfully");
  } catch (error) {
    console.error("deleteProductTypeService error:", error);
    return validationResponse(0, "Failed to delete product type");
  }
};