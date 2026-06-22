import { Prisma } from "@prisma/client";
import { prisma } from "../../prisma/client";
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

  mrp?: number | null;

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

    item_group_id: toIntOrNull(payload.item_group_id),

    primary_unit_id: toIntOrNull(payload.primary_unit_id),
    stock_unit_id: toIntOrNull(payload.stock_unit_id),
    consumption_unit_id: toIntOrNull(payload.consumption_unit_id),

    shelf_life_days: toIntOrNull(payload.shelf_life_days),

    costing_method: payload.costing_method || "FIFO",

    mrp: toDecimal(payload.mrp),

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
  };
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
    const [categories, units, itemGroups, hsns] = await Promise.all([
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
    ]);

    return validationResponse(1, "Product masters fetched", {
      categories,
      units,
      itemGroups,
      hsns,
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
      },
    });

    if (!product) return validationResponse(0, "Product not found");

    return validationResponse(1, "Product fetched", product);
  } catch (error) {
    console.error("getProductById error:", error);
    return validationResponse(0, "Failed to fetch product");
  }
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

    const product = await prisma.productMaster.create({
      data: buildProductData(payload) as any,
      include: {
        category: true,
        itemGroup: true,
        primaryUnit: true,
        stockUnit: true,
        consumptionUnit: true,
        hsn: true,
      },
    });

    return validationResponse(1, "Product created successfully", product);
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

    const data = buildProductData(payload);
    delete (data as any).created_by;

    const product = await prisma.productMaster.update({
      where: { id },
      data: data as any,
      include: {
        category: true,
        itemGroup: true,
        primaryUnit: true,
        stockUnit: true,
        consumptionUnit: true,
        hsn: true,
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