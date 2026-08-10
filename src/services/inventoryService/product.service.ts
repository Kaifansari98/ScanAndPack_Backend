import { prisma, Prisma } from '../../prisma/client';
import { validationResponse } from "../../utils/validationResponse";

type ProductPayload = {
  vendor_id: number;
  user_id?: number;

  category_id: number;
  sub_category_id?: number | null;
  product_name: string;
  article_code?: string;
  item_code?: string;
  barcode?: string | null;

  brand_id?: number | null;
  item_group_id?: number | null;

  primary_unit_id?: number | null;
  purchase_unit_id?: number | null;
  stock_unit_id?: number | null;
  consumption_unit_id?: number | null;

  shelf_life_days?: number | null;
  costing_method?: "FIFO" | "MANUAL";

  level1_price?: number | null;

  min_stock_qty?: number | null;
  min_stock_unit_id?: number | null;

  max_stock_qty?: number | null;
  max_stock_unit_id?: number | null;

  reorder_level_qty?: number | null;
  reorder_level_unit_id?: number | null;

  reorder_batch_qty?: number | null;
  reorder_batch_unit_id?: number | null;

  hsn_id?: number | null;
  item_type?: "CapitalGoods" | "Goods" | "Services";
  item_type_master_id?: number | null;

  core_product_id?: number | null;
  grade_id?: number | null;
  type_id?: number | null;
  finish_id?: number | null;

  length?: number | null;
  height?: number | null;
  thickness?: number | null;
  size?: string | null;

  suppliers?: {
    company_vendor_id: number;
    supplier_item_code?: string | null;
    amount?: number | null;
  }[];
};

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

const buildProductData = (payload: ProductPayload) => {
  const itemCode = (payload.item_code || payload.article_code || "").trim();

  return {
    vendor_id: Number(payload.vendor_id),
    category_id: Number(payload.category_id),
    sub_category_id: toIntOrNull(payload.sub_category_id),

    product_name: payload.product_name.trim(),
    article_code: itemCode,
    item_code: itemCode,
    barcode: payload.barcode?.trim() || null,

    brand_id: toIntOrNull(payload.brand_id),
    item_group_id: toIntOrNull(payload.item_group_id),

    primary_unit_id: toIntOrNull(payload.primary_unit_id),
    purchase_unit_id: toIntOrNull(payload.purchase_unit_id),
    stock_unit_id: toIntOrNull(payload.stock_unit_id),
    consumption_unit_id: toIntOrNull(payload.consumption_unit_id),

    shelf_life_days: toIntOrNull(payload.shelf_life_days),

    costing_method: payload.costing_method || "FIFO",

    level1_price: toDecimal(payload.level1_price),

    min_stock_qty: toDecimal(payload.min_stock_qty),
    min_stock_unit_id: toIntOrNull(payload.min_stock_unit_id),

    max_stock_qty: toDecimal(payload.max_stock_qty),
    max_stock_unit_id: toIntOrNull(payload.max_stock_unit_id),

    reorder_level_qty: toDecimal(payload.reorder_level_qty),
    reorder_level_unit_id: toIntOrNull(payload.reorder_level_unit_id),

    reorder_batch_qty: toDecimal(payload.reorder_batch_qty),
    reorder_batch_unit_id: toIntOrNull(payload.reorder_batch_unit_id),

    hsn_id: toIntOrNull(payload.hsn_id),
    item_type: payload.item_type || "Goods",
    item_type_master_id: toIntOrNull(payload.item_type_master_id),

    core_product_id: toIntOrNull(payload.core_product_id),
    grade_id: toIntOrNull(payload.grade_id),
    type_id: toIntOrNull(payload.type_id),
    finish_id: toIntOrNull(payload.finish_id),

    length: toDecimal(payload.length),
    height: toDecimal(payload.height),
    thickness: toDecimal(payload.thickness),
    size: payload.size?.trim() || null,

    unit_of_measure: payload.primary_unit_id ? undefined : null,

    created_by: payload.user_id || null,
    updated_by: payload.user_id || null,
  };
};

const validateProductSuppliers = async (payload: ProductPayload) => {
  const vendor_id = Number(payload.vendor_id);
  const suppliers = payload.suppliers ?? [];

  if (!suppliers.length) return null;

  const supplierIds = suppliers.map((s) => Number(s.company_vendor_id));

  const duplicateSupplierIds = supplierIds.filter(
    (id, index) => supplierIds.indexOf(id) !== index
  );

  if (duplicateSupplierIds.length) {
    return "Duplicate suppliers are not allowed for same product";
  }

  const validSuppliers = await prisma.companyVendorsMaster.findMany({
    where: {
      vendor_id,
      id: {
        in: supplierIds,
      },
      is_deleted: false,
    },
    select: {
      id: true,
    },
  });

  if (validSuppliers.length !== supplierIds.length) {
    return "One or more suppliers are invalid";
  }

  return null;
};

const validateProductReferences = async (payload: ProductPayload) => {
  const vendor_id = Number(payload.vendor_id);

  const category = await prisma.projectCategoriesMaster.findFirst({
    where: {
      id: Number(payload.category_id),
      vendor_id,
    },
    select: { id: true },
  });

  if (!category) return "Invalid item category";

  if (payload.sub_category_id) {
    const subCategory = await prisma.projectCategoriesMaster.findFirst({
      where: {
        id: Number(payload.sub_category_id),
        parent_id: Number(payload.category_id),
        vendor_id,
      },
      select: { id: true },
    });
    if (!subCategory) return "Invalid sub-category for selected category";
  }

  if (payload.brand_id) {
    const brand = await prisma.brandMaster.findFirst({
      where: {
        id: Number(payload.brand_id),
        vendor_id,
        is_active: true,
      },
      select: { id: true },
    });
    if (!brand) return "Invalid brand";
  }

  if (payload.item_group_id) {
    const group = await prisma.itemGroupMaster.findFirst({
      where: {
        id: Number(payload.item_group_id),
        vendor_id,
        is_active: true,
      },
      select: { id: true },
    });

    if (!group) return "Invalid item group";
  }

  const unitIds = [
    payload.primary_unit_id,
    payload.purchase_unit_id,
    payload.stock_unit_id,
    payload.consumption_unit_id,
    payload.min_stock_unit_id,
    payload.max_stock_unit_id,
    payload.reorder_level_unit_id,
    payload.reorder_batch_unit_id,
  ]
    .filter(Boolean)
    .map(Number);

  if (unitIds.length) {
    const uniqueUnitIds = [...new Set(unitIds)];

    const validUnits = await prisma.unitMaster.findMany({
      where: {
        id: { in: uniqueUnitIds },
        vendor_id,
        is_active: true,
      },
      select: { id: true },
    });

    if (validUnits.length !== uniqueUnitIds.length) {
      return "One or more units are invalid";
    }
  }

  if (payload.hsn_id) {
    const hsn = await prisma.hsnProductMapping.findFirst({
      where: {
        id: Number(payload.hsn_id),
        vendor_id,
        is_active: true,
      },
      select: { id: true },
    });

    if (!hsn) return "Invalid HSN";
  }

  if (payload.grade_id) {
    const grade = await prisma.gradeMaster.findFirst({
      where: { id: Number(payload.grade_id), vendor_id, is_active: true },
      select: { id: true },
    });
    if (!grade) return "Invalid grade selection";
  }

  if (payload.finish_id) {
    const finish = await prisma.finishMaster.findFirst({
      where: { id: Number(payload.finish_id), vendor_id, is_active: true },
      select: { id: true },
    });
    if (!finish) return "Invalid finish selection";
  }

  if (payload.type_id) {
    const typeObj = await prisma.typeMaster.findFirst({
      where: { id: Number(payload.type_id), vendor_id, is_active: true },
      select: { id: true },
    });
    if (!typeObj) return "Invalid type selection";
  }

  if (payload.item_type_master_id) {
    const itemTypeObj = await prisma.itemTypeMaster.findFirst({
      where: { id: Number(payload.item_type_master_id), vendor_id, is_active: true },
      select: { id: true },
    });
    if (!itemTypeObj) return "Invalid item type master selection";
  }

  if (payload.core_product_id) {
    const coreProduct = await prisma.coreProductMaster.findFirst({
      where: { id: Number(payload.core_product_id), vendor_id, is_active: true },
      select: { id: true },
    });
    if (!coreProduct) return "Invalid core product selection";
  }

  return null;
};

export const getProductMasters = async (vendor_id: number) => {
  try {
    const [categories, brands, grades, finishes, types, itemTypeMasters, units, itemGroups, hsns, suppliers, coreProducts] = await Promise.all([
      prisma.projectCategoriesMaster.findMany({
        where: {
          vendor_id,
          status: "Yes",
        },
        select: {
          id: true,
          category_name: true,
          parent_id: true,
        },
        orderBy: { category_name: "asc" },
      }),

      prisma.brandMaster.findMany({
        where: {
          vendor_id,
          is_active: true,
        },
        select: {
          id: true,
          brand_name: true,
          brand_short_name: true,
          logo: true,
        },
        orderBy: { brand_name: "asc" },
      }),

      prisma.gradeMaster.findMany({
        where: { vendor_id, is_active: true },
        select: { id: true, grade_name: true },
        orderBy: { grade_name: "asc" },
      }),

      prisma.finishMaster.findMany({
        where: { vendor_id, is_active: true },
        select: { id: true, finish_name: true },
        orderBy: { finish_name: "asc" },
      }),

      prisma.typeMaster.findMany({
        where: { vendor_id, is_active: true },
        select: { id: true, type_name: true },
        orderBy: { type_name: "asc" },
      }),

      prisma.itemTypeMaster.findMany({
        where: { vendor_id, is_active: true },
        select: { id: true, item_type_name: true },
        orderBy: { item_type_name: "asc" },
      }),

      prisma.unitMaster.findMany({
        where: {
          vendor_id,
          is_active: true,
        },
        select: {
          id: true,
          unit_name: true,
          short_name: true,
          decimal_allowed: true,
        },
        orderBy: { unit_name: "asc" },
      }),

      prisma.itemGroupMaster.findMany({
        where: {
          vendor_id,
          is_active: true,
        },
        select: {
          id: true,
          group_name: true,
        },
        orderBy: { group_name: "asc" },
      }),

      prisma.hsnProductMapping.findMany({
        where: {
          vendor_id,
          is_active: true,
        },
        select: {
          id: true,
          hsn_code: true,
          description: true,
          cgst_rate: true,
          sgst_rate: true,
          igst_rate: true,
        },
        orderBy: { hsn_code: "asc" },
      }),
      prisma.companyVendorsMaster.findMany({
        where: {
          vendor_id,
          is_deleted: false,
        },
        select: {
          id: true,
          company_name: true,
          vendor_code: true,
        },
        orderBy: {
          company_name: "asc",
        },
      }),
      prisma.coreProductMaster.findMany({
        where: { vendor_id, is_active: true },
        select: { id: true, core_product_name: true },
        orderBy: { core_product_name: "asc" },
      }),
    ]);

    return validationResponse(1, "Product masters fetched", {
      categories,
      brands,
      grades,
      finishes,
      types,
      itemTypeMasters,
      units,
      itemGroups,
      hsns,
      suppliers,
      coreProducts,
      costingMethods: ["FIFO", "MANUAL"],
      itemTypes: ["CapitalGoods", "Goods", "Services"],
    });
  } catch (error) {
    console.error("getProductMasters error:", error);
    return validationResponse(0, "Failed to fetch product masters");
  }
};

export const listProducts = async (
  vendor_id: number,
  search = "",
  page = 1,
  pageSize = 20
) => {
  try {
    const skip = (page - 1) * pageSize;

    const where: Prisma.ProductMasterWhereInput = {
      vendor_id,
      active: "Yes",
      ...(search
        ? {
          OR: [
            { product_name: { contains: search, mode: "insensitive" } },
            { article_code: { contains: search, mode: "insensitive" } },
            { item_code: { contains: search, mode: "insensitive" } },
            { barcode: { contains: search, mode: "insensitive" } },
            { hsn: { hsn_code: { contains: search, mode: "insensitive" } } },
          ],
        }
        : {}),
    };

    const [products, total] = await Promise.all([
      prisma.productMaster.findMany({
        where,
        skip,
        take: pageSize,
        include: {
          category: {
            select: {
              id: true,
              category_name: true,
            },
          },
          itemGroup: {
            select: {
              id: true,
              group_name: true,
            },
          },
          primaryUnit: {
            select: {
              id: true,
              unit_name: true,
              short_name: true,
            },
          },
          brand: {
            select: {
              id: true,
              brand_name: true,
            },
          },
          finishMaster: {
            select: {
              id: true,
              finish_name: true,
            },
          },
          coreProduct: {
            select: {
              id: true,
              core_product_name: true,
            },
          },
          grade: {
            select: {
              id: true,
              grade_name: true,
            },
          },
          type: {
            select: {
              id: true,
              type_name: true,
            },
          },
          stockUnit: {
            select: {
              id: true,
              unit_name: true,
            },
          },
          consumptionUnit: {
            select: {
              id: true,
              unit_name: true,
            },
          },
          minStockUnit: {
            select: {
              id: true,
              unit_name: true,
            },
          },
          maxStockUnit: {
            select: {
              id: true,
              unit_name: true,
            },
          },
          reorderLevelUnit: {
            select: {
              id: true,
              unit_name: true,
            },
          },
          reorderBatchUnit: {
            select: {
              id: true,
              unit_name: true,
            },
          },
          hsn: {
            select: {
              id: true,
              hsn_code: true,
              description: true,
              cgst_rate: true,
              sgst_rate: true,
              igst_rate: true,
            },
          },
          supplierMappings: {
            where: {
              is_active: true,
            },
            include: {
              companyVendor: {
                select: {
                  id: true,
                  company_name: true,
                  vendor_code: true,
                },
              },
            },
          },
        },
        orderBy: {
          created_at: "desc",
        },
      }),

      prisma.productMaster.count({ where }),
    ]);

    const productIds = products.map((p) => p.id);
    const sizeMap = new Map<number, string | null>();
    if (productIds.length > 0) {
      try {
        const rawSizes: { id: number; size: string | null }[] = await (prisma as any).$queryRawUnsafe(
          `SELECT id, size FROM "ProductMaster" WHERE id = ANY($1)`,
          productIds
        );
        rawSizes.forEach((r) => sizeMap.set(Number(r.id), r.size));
      } catch (err) {
        console.error("Failed to fetch raw sizes:", err);
      }
    }

    const mappedProducts = products.map((product) => ({
      ...product,
      size: sizeMap.get(product.id) ?? (product as any).size ?? null,
      core_material: product.coreProduct?.core_product_name ?? product.core_material,
      finish: product.finishMaster?.finish_name ?? product.finish,
    }));


    return validationResponse(1, "Products fetched", {
      products: mappedProducts,
      total,
      page,
      page_size: pageSize,
      total_pages: Math.ceil(total / pageSize),
    });
  } catch (error) {
    console.error("listProducts error:", error);
    return validationResponse(0, "Failed to fetch products");
  }
};

export const getProductById = async (vendor_id: number, id: number) => {
  try {
    const product = await prisma.productMaster.findFirst({
      where: {
        id,
        vendor_id,
      },
      include: {
        category: true,
        subCategory: true,
        brand: true,
        itemGroup: true,
        primaryUnit: true,
        purchaseUnit: true,
        stockUnit: true,
        consumptionUnit: true,
        minStockUnit: true,
        maxStockUnit: true,
        reorderLevelUnit: true,
        reorderBatchUnit: true,
        itemTypeMaster: true,
        grade: true,
        type: true,
        finishMaster: true,
        coreProduct: true,
        hsn: true,
        supplierMappings: {
          where: {
            is_active: true,
          },
          include: {
            companyVendor: {
              select: {
                id: true,
                company_name: true,
                vendor_code: true,
              },
            },
          },
        },
      },
    });

    if (!product) return validationResponse(0, "Product not found");

    const mappedProduct = {
      ...product,
      core_material: product.coreProduct?.core_product_name ?? product.core_material,
      finish: product.finishMaster?.finish_name ?? product.finish,
    };

    return validationResponse(1, "Product fetched", mappedProduct);
  } catch (error) {
    console.error("getProductById error:", error);
    return validationResponse(0, "Failed to fetch product");
  }
};


const toNum = (value: any) => {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
};

const round2 = (value: number) => Number(value.toFixed(2));

const calculateSupplierMappingAmounts = (s: any) => {
  const amount = round2(toNum(s.amount));

  const procurementExpenseAmount = round2(
    toNum(s.procurement_expense_amount)
  );

  const procurementExpensePct = round2(
    toNum(s.procurement_expense_pct)
  );

  const procurementExpenseByPct = round2(
    (amount * procurementExpensePct) / 100
  );

  const procurementExpenseTotal = round2(
    procurementExpenseAmount + procurementExpenseByPct
  );

  const finalAmount = round2(amount + procurementExpenseTotal);

  return {
    amount,
    procurement_expense_amount: procurementExpenseAmount,
    procurement_expense_pct: procurementExpensePct,
    procurement_expense_total: procurementExpenseTotal,
    final_amount: finalAmount,
  };
};

export const createProduct = async (payload: ProductPayload) => {
  try {
    if (!payload.vendor_id) return validationResponse(0, "vendor_id is required");
    if (!payload.category_id) return validationResponse(0, "Item category is required");
    if (!payload.product_name?.trim()) return validationResponse(0, "Item name is required");
    if (!payload.article_code?.trim()) return validationResponse(0, "Item code is required");

    const duplicate = await prisma.productMaster.findFirst({
      where: {
        vendor_id: Number(payload.vendor_id),
        article_code: payload.article_code.trim(),
      },
      select: { id: true },
    });

    if (duplicate) {
      return validationResponse(0, "Item code already exists");
    }

    const refError = await validateProductReferences(payload);
    if (refError) return validationResponse(0, refError);

    const supplierError = await validateProductSuppliers(payload);
    if (supplierError) return validationResponse(0, supplierError);

    const product = await prisma.$transaction(async (tx) => {
      const createdProduct = await tx.productMaster.create({
        data: buildProductData(payload) as any,
      });

      const finalBarcode = generateAutoBarcode(Number(payload.vendor_id), createdProduct.id, payload.barcode);
      if (!payload.barcode || !payload.barcode.trim()) {
        await tx.productMaster.update({
          where: { id: createdProduct.id },
          data: { barcode: finalBarcode },
        });
      }

      if (payload.suppliers?.length) {
        await tx.productSupplierMapping.createMany({
          data: payload.suppliers.map((s) => {
            const calculated = calculateSupplierMappingAmounts(s);

            return {
              vendor_id: Number(payload.vendor_id),
              product_id: createdProduct.id,
              company_vendor_id: Number(s.company_vendor_id),

              supplier_item_code: s.supplier_item_code?.trim() || null,

              amount: toDecimal(calculated.amount),

              procurement_expense_amount: toDecimal(
                calculated.procurement_expense_amount
              ),

              procurement_expense_pct: toDecimal(
                calculated.procurement_expense_pct
              ),

              procurement_expense_total: toDecimal(
                calculated.procurement_expense_total
              ),

              final_amount: toDecimal(calculated.final_amount),

              created_by: payload.user_id || null,
              updated_by: payload.user_id || null,
            };
          }),
        });
      }

      return createdProduct;
    });

    const full = await prisma.productMaster.findUnique({
      where: {
        id: product.id,
      },
      include: {
        category: true,
        subCategory: true,
        brand: true,
        itemGroup: true,
        primaryUnit: true,
        purchaseUnit: true,
        stockUnit: true,
        consumptionUnit: true,
        itemTypeMaster: true,
        grade: true,
        type: true,
        finishMaster: true,
        coreProduct: true,
        hsn: true,
        supplierMappings: {
          where: {
            is_active: true,
          },
          include: {
            companyVendor: {
              select: {
                id: true,
                company_name: true,
                vendor_code: true,
              },
            },
          },
        },
      },
    });

    return validationResponse(1, "Product created successfully", full);
  } catch (error) {
    console.error("createProduct error:", error);
    return validationResponse(0, "Failed to create product");
  }
};

export const updateProduct = async (id: number, payload: ProductPayload) => {
  try {
    if (!payload.vendor_id) return validationResponse(0, "vendor_id is required");
    if (!payload.category_id) return validationResponse(0, "Item category is required");
    if (!payload.product_name?.trim()) return validationResponse(0, "Item name is required");
    if (!payload.article_code?.trim()) return validationResponse(0, "Item code is required");

    const existing = await prisma.productMaster.findFirst({
      where: {
        id,
        vendor_id: Number(payload.vendor_id),
      },
      select: { id: true },
    });

    if (!existing) {
      return validationResponse(0, "Product not found");
    }

    const duplicate = await prisma.productMaster.findFirst({
      where: {
        vendor_id: Number(payload.vendor_id),
        article_code: payload.article_code.trim(),
        NOT: {
          id,
        },
      },
      select: { id: true },
    });

    if (duplicate) {
      return validationResponse(0, "Item code already exists");
    }

    const refError = await validateProductReferences(payload);
    if (refError) return validationResponse(0, refError);

    const supplierError = await validateProductSuppliers(payload);
    if (supplierError) return validationResponse(0, supplierError);

    const data = buildProductData(payload);
    delete (data as any).created_by;

    await prisma.$transaction(async (tx) => {
      await tx.productMaster.update({
        where: { id },
        data: data as any,
      });

      await tx.productSupplierMapping.deleteMany({
        where: {
          vendor_id: Number(payload.vendor_id),
          product_id: id,
        },
      });

      if (payload.suppliers?.length) {
        await tx.productSupplierMapping.createMany({
          data: payload.suppliers.map((s) => {
            const calculated = calculateSupplierMappingAmounts(s);
            console.log("calculated",calculated);
            return {
              vendor_id: Number(payload.vendor_id),
              product_id: id,
              company_vendor_id: Number(s.company_vendor_id),

              supplier_item_code: s.supplier_item_code?.trim() || null,

              amount: toDecimal(calculated.amount),

              procurement_expense_amount: toDecimal(
                calculated.procurement_expense_amount
              ),

              procurement_expense_pct: toDecimal(
                calculated.procurement_expense_pct
              ),

              procurement_expense_total: toDecimal(
                calculated.procurement_expense_total
              ),

              

              created_by: payload.user_id || null,
              updated_by: payload.user_id || null,
            };
          }),
        });
      }
    });

    const product = await prisma.productMaster.findUnique({
      where: { id },
      include: {
        category: true,
        subCategory: true,
        brand: true,
        itemGroup: true,
        primaryUnit: true,
        purchaseUnit: true,
        stockUnit: true,
        consumptionUnit: true,
        itemTypeMaster: true,
        grade: true,
        type: true,
        finishMaster: true,
        coreProduct: true,
        hsn: true,
        supplierMappings: {
          where: {
            is_active: true,
          },
          include: {
            companyVendor: {
              select: {
                id: true,
                company_name: true,
                vendor_code: true,
              },
            },
          },
        },
      },
    });

    return validationResponse(1, "Product updated successfully", product);
  } catch (error) {
    console.error("updateProduct error:", error);
    return validationResponse(0, "Failed to update product");
  }
};

export const deleteProduct = async (
  id: number,
  vendor_id: number,
  user_id?: number
) => {
  try {
    const product = await prisma.productMaster.findFirst({
      where: {
        id,
        vendor_id,
      },
      select: { id: true },
    });

    if (!product) {
      return validationResponse(0, "Product not found");
    }

    await prisma.productMaster.update({
      where: { id },
      data: {
        active: "No",
        updated_by: user_id || null,
      },
    });

    return validationResponse(1, "Product deleted successfully");
  } catch (error) {
    console.error("deleteProduct error:", error);
    return validationResponse(0, "Failed to delete product");
  }
};