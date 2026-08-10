import { prisma, Prisma } from '../../prisma/client';
import { validationResponse } from "../../utils/validationResponse";

type ProductPayload = {
  vendor_id: number;
  user_id?: number;

  category_id: number;
  product_name: string;
  article_code: string;

  item_group_id?: number | null;

  primary_unit_id?: number | null;
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
  suppliers?: {
    company_vendor_id: number;
    supplier_item_code?: string | null;
    amount?: number | null;
  }[];

  barcode?: string | null;
  sub_category_id?: number | null;
  core_product_id?: number | null;
  grade_id?: number | null;
  product_type_id?: number | null;
  finish_id?: number | null;
  size_id?: number | null;
  brand_id?: number | null;

  product_as_per_vendor_invoice?: string | null;
  p_code?: string | null;
  color_name?: string | null;
  thickness_mm?: number | null;
  cost_price?: number | null;
  b2c_selling_price?: number | null;
  b2b_selling_price?: number | null;
  mrp?: number | null;

  board_length?: number | null;
  board_width?: number | null;
  dimension_1?: number | null;
  dimension_2?: number | null;
  dimension_3?: number | null;

  vendor_code?: string | null;
};

const toDecimal = (v: any) =>
  v === undefined || v === null || v === "" ? null : new Prisma.Decimal(v);

const toIntOrNull = (v: any) =>
  v === undefined || v === null || v === "" ? null : Number(v);



const buildProductData = (payload: ProductPayload) => {
  return {
    vendor_id: Number(payload.vendor_id),
    category_id: Number(payload.category_id),

    product_name: payload.product_name.trim(),
    article_code: payload.article_code.trim(),
    vendor_code: payload.vendor_code?.trim() || null,

    item_group_id: toIntOrNull(payload.item_group_id),

    primary_unit_id: toIntOrNull(payload.primary_unit_id),
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

    unit_of_measure: payload.primary_unit_id ? undefined : null,

    created_by: payload.user_id || null,
    updated_by: payload.user_id || null,

    // New fields
    barcode: payload.barcode?.trim() || null,
    sub_category_id: toIntOrNull(payload.sub_category_id),
    core_product_id: toIntOrNull(payload.core_product_id),
    grade_id: toIntOrNull(payload.grade_id),
    product_type_id: toIntOrNull(payload.product_type_id),
    finish_id: toIntOrNull(payload.finish_id),
    size_id: toIntOrNull(payload.size_id),
    brand_id: toIntOrNull(payload.brand_id),

    product_as_per_vendor_invoice: payload.product_as_per_vendor_invoice?.trim() || null,
    p_code: payload.p_code?.trim() || null,
    color_name: payload.color_name?.trim() || null,
    thickness_mm: payload.thickness_mm !== undefined && payload.thickness_mm !== null && (payload.thickness_mm as any) !== "" ? Number(payload.thickness_mm) : null,
    cost_price: toDecimal(payload.cost_price),
    b2c_selling_price: toDecimal(payload.b2c_selling_price),
    b2b_selling_price: toDecimal(payload.b2b_selling_price),
    mrp: toDecimal(payload.mrp),

    board_length: payload.board_length !== undefined && payload.board_length !== null && (payload.board_length as any) !== "" ? Number(payload.board_length) : 0,
    board_width: payload.board_width !== undefined && payload.board_width !== null && (payload.board_width as any) !== "" ? Number(payload.board_width) : 0,
    dimension_1: payload.dimension_1 !== undefined && payload.dimension_1 !== null && (payload.dimension_1 as any) !== "" ? Number(payload.dimension_1) : 0,
    dimension_2: payload.dimension_2 !== undefined && payload.dimension_2 !== null && (payload.dimension_2 as any) !== "" ? Number(payload.dimension_2) : 0,
    dimension_3: payload.dimension_3 !== undefined && payload.dimension_3 !== null && (payload.dimension_3 as any) !== "" ? Number(payload.dimension_3) : 0,
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

  // Validate Sub Category
  if (payload.sub_category_id) {
    const subCategory = await prisma.subCategory.findFirst({
      where: {
        id: Number(payload.sub_category_id),
        categoryId: Number(payload.category_id),
      },
      select: { id: true },
    });
    if (!subCategory) return "Invalid sub-category";
  }

  // Validate Core Product
  if (payload.core_product_id) {
    const coreProduct = await prisma.coreProduct.findFirst({
      where: {
        id: Number(payload.core_product_id),
        OR: [{ vendor_id: null }, { vendor_id }],
      },
      select: { id: true },
    });
    if (!coreProduct) return "Invalid core product";
  }

  // Validate Grade
  if (payload.grade_id) {
    const grade = await prisma.grade.findFirst({
      where: {
        id: Number(payload.grade_id),
        OR: [{ vendor_id: null }, { vendor_id }],
      },
      select: { id: true },
    });
    if (!grade) return "Invalid grade";
  }

  // Validate Finish
  if (payload.finish_id) {
    const finish = await prisma.finish.findFirst({
      where: {
        id: Number(payload.finish_id),
        OR: [{ vendor_id: null }, { vendor_id }],
      },
      select: { id: true },
    });
    if (!finish) return "Invalid finish";
  }

  // Validation: If Dimensions has any value, Size must be empty. If Size has any value, Dimensions must be empty.
  const hasDimensions = 
    (payload.board_length !== undefined && Number(payload.board_length) > 0) ||
    (payload.board_width !== undefined && Number(payload.board_width) > 0) ||
    (payload.dimension_1 !== undefined && Number(payload.dimension_1) > 0) ||
    (payload.dimension_2 !== undefined && Number(payload.dimension_2) > 0) ||
    (payload.dimension_3 !== undefined && Number(payload.dimension_3) > 0);

  if (hasDimensions && payload.size_id) {
    return "Product cannot have both Dimensions and Size. Choose either one.";
  }

  // Validate Size
  if (payload.size_id) {
    const size = await prisma.size.findFirst({
      where: {
        id: Number(payload.size_id),
        OR: [{ vendor_id: null }, { vendor_id }],
      },
      select: { id: true },
    });
    if (!size) return "Invalid size";
  }

  // Validate Brand
  if (payload.brand_id) {
    const brand = await prisma.brandMaster.findFirst({
      where: {
        id: Number(payload.brand_id),
        vendor_id,
        active: "Yes",
      },
      select: { id: true },
    });
    if (!brand) return "Invalid brand";
  }

  // Validate Product Type
  if (payload.product_type_id) {
    const productType = await prisma.productTypeMaster.findFirst({
      where: {
        id: Number(payload.product_type_id),
        vendor_id,
        status: "active",
      },
      select: { id: true },
    });
    if (!productType) return "Invalid product type";
  }

  const unitIds = [
    payload.primary_unit_id,
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

  return null;
};

export const getProductMasters = async (vendor_id: number) => {
  try {
    const standardUnits = ['PCS', 'KG', 'LTR', 'SQFT', 'RMT', 'NOS', 'SET', 'BOX', 'ROLL'];
    const existing = await prisma.unitMaster.findMany({
      where: {
        vendor_id,
        unit_name: { in: standardUnits }
      },
      select: { unit_name: true }
    });
    const existingNames = existing.map(u => u.unit_name.toUpperCase());
    const missingNames = standardUnits.filter(name => !existingNames.includes(name.toUpperCase()));
    if (missingNames.length > 0) {
      await prisma.unitMaster.createMany({
        data: missingNames.map(name => ({
          vendor_id,
          unit_name: name,
          unit_class: name,
          is_active: true
        }))
      });
    }

    const [
      categories,
      units,
      itemGroups,
      hsns,
      suppliers,
      subCategories,
      coreProducts,
      grades,
      finishes,
      sizes,
      brands,
      productTypes
    ] = await Promise.all([
      prisma.projectCategoriesMaster.findMany({
        where: {
          vendor_id,
          status: "Yes",
        },
        select: {
          id: true,
          category_name: true,
        },
        orderBy: { category_name: "asc" },
      }),

      prisma.unitMaster.findMany({
        where: {
          vendor_id,
          is_active: true,
        },
        select: {
          id: true,
          unit_name: true,
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

      prisma.subCategory.findMany({
        where: {
          OR: [
            { vendor_id: null },
            { vendor_id },
          ],
        },
        select: {
          id: true,
          categoryId: true,
          name: true,
        },
        orderBy: { name: "asc" },
      }),

      prisma.coreProduct.findMany({
        where: {
          OR: [
            { vendor_id: null },
            { vendor_id },
          ],
        },
        select: {
          id: true,
          name: true,
        },
        orderBy: { name: "asc" },
      }),

      prisma.grade.findMany({
        where: {
          OR: [
            { vendor_id: null },
            { vendor_id },
          ],
        },
        select: {
          id: true,
          name: true,
        },
        orderBy: { name: "asc" },
      }),

      prisma.finish.findMany({
        where: {
          OR: [
            { vendor_id: null },
            { vendor_id },
          ],
        },
        select: {
          id: true,
          name: true,
        },
        orderBy: { name: "asc" },
      }),

      prisma.size.findMany({
        where: {
          OR: [
            { vendor_id: null },
            { vendor_id },
          ],
        },
        select: {
          id: true,
          name: true,
        },
        orderBy: { name: "asc" },
      }),

      prisma.brandMaster.findMany({
        where: {
          vendor_id,
          active: "Yes",
        },
        select: {
          id: true,
          brand_name: true,
          brand_short_name: true,
        },
        orderBy: { brand_name: "asc" },
      }),

      prisma.productTypeMaster.findMany({
        where: {
          vendor_id,
          status: "active",
        },
        select: {
          id: true,
          type: true,
          tag: true,
        },
        orderBy: { type: "asc" },
      }),
    ]);

    return validationResponse(1, "Product masters fetched", {
      categories,
      units,
      itemGroups,
      hsns,
      suppliers,
      subCategories,
      coreProducts,
      grades,
      finishes,
      sizes,
      brands,
      productTypes,
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
          subCategory: true,
          coreProduct: true,
          grade: true,
          productType: true,
          finishMaster: true,
          sizeMaster: true,
          brand: true,
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


    return validationResponse(1, "Products fetched", {
      products,
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
        itemGroup: true,
        primaryUnit: true,
        stockUnit: true,
        consumptionUnit: true,
        minStockUnit: true,
        maxStockUnit: true,
        reorderLevelUnit: true,
        reorderBatchUnit: true,
        hsn: true,
        subCategory: true,
        coreProduct: true,
        grade: true,
        productType: true,
        finishMaster: true,
        sizeMaster: true,
        brand: true,
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

    return validationResponse(1, "Product fetched", product);
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
        itemGroup: true,
        primaryUnit: true,
        stockUnit: true,
        consumptionUnit: true,
        hsn: true,
        subCategory: true,
        coreProduct: true,
        grade: true,
        productType: true,
        finishMaster: true,
        sizeMaster: true,
        brand: true,
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
        itemGroup: true,
        primaryUnit: true,
        stockUnit: true,
        consumptionUnit: true,
        hsn: true,
        subCategory: true,
        coreProduct: true,
        grade: true,
        productType: true,
        finishMaster: true,
        sizeMaster: true,
        brand: true,
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