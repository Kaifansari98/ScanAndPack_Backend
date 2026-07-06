import { prisma } from "../../prisma/client";
import { validationResponse } from "../../utils/validationResponse";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const generateIntentNo = async (vendor_id: number): Promise<string> => {
  const last = await prisma.purchaseIntentMaster.findFirst({
    where: { vendor_id }, orderBy: { id: "desc" }, select: { intent_no: true },
  });
  let next = 1;
  if (last?.intent_no) {
    const n = parseInt(last.intent_no.replace("PI-", ""), 10);
    if (!isNaN(n)) next = n + 1;
  }
  return `PI-${String(next).padStart(6, "0")}`;
};

// ─── GET categories ───────────────────────────────────────────────────────────

export const getPICategories = async (vendor_id: number) => {
  try {
    const cats = await prisma.projectCategoriesMaster.findMany({
      where: { vendor_id },
      select: { id: true, category_name: true },
      orderBy: { category_name: "asc" },
    });
    return validationResponse(1, "Categories fetched", cats);
  } catch (e) {
    return validationResponse(0, "Failed to fetch categories");
  }
};

// ─── GET products — now includes HSN tax rates ────────────────────────────────

export const getPIProducts = async (
  vendor_id: number,
  category_id: number,
  search: string
) => {
  try {
    const products = await prisma.productMaster.findMany({
      where: {
        vendor_id,
        active: "Yes",
        ...(category_id ? { category_id: Number(category_id) } : {}),
        ...(search
          ? {
            OR: [
              { product_name: { contains: search, mode: "insensitive" } },
              { article_code: { contains: search, mode: "insensitive" } },
            ],
          }
          : {}),
      },
      select: {
        id: true,
        product_name: true,
        article_code: true,
        vendor_code: true,
        unit_of_measure: true,
        moq: true,
        procurement: true,
        hsn_id: true,
        // Include HSN mapping for auto-fill on PI form
        hsn: {
          select: {
            hsn_code: true,
            cgst_rate: true,
            sgst_rate: true,
            igst_rate: true,
          },
        },
      },
      orderBy: { product_name: "asc" },
      take: 100,
    });

    // Flatten HSN rates into product row for frontend convenience
    const enriched = products.map(p => ({
      ...p,
      hsn_code: p.hsn?.hsn_code ?? null,
      cgst_rate: p.hsn?.cgst_rate ? String(p.hsn.cgst_rate) : null,
      sgst_rate: p.hsn?.sgst_rate ? String(p.hsn.sgst_rate) : null,
      igst_rate: p.hsn?.igst_rate ? String(p.hsn.igst_rate) : null,
      // tax_pct = CGST + SGST for intra-state
      tax_pct: p.hsn
        ? String(parseFloat(p.hsn.cgst_rate.toString()) + parseFloat(p.hsn.sgst_rate.toString()))
        : null,
      hsn: undefined,  // strip nested object
    }));

    return validationResponse(1, "Products fetched", enriched);
  } catch (e) {
    console.error(e);
    return validationResponse(0, "Failed to fetch products");
  }
};

// ─── GET company vendors ──────────────────────────────────────────────────────

export const getPICompanyVendors = async (vendor_id: number, search: string = "") => {
  try {
    const vendors = await prisma.companyVendorsMaster.findMany({
      where: {
        vendor_id,
        is_deleted: false,
        ...(search
          ? {
            OR: [
              { company_name: { contains: search, mode: "insensitive" } },
              { vendor_code: { contains: search, mode: "insensitive" } },
              { point_of_contact: { contains: search, mode: "insensitive" } },
            ],
          }
          : {}),
      },
      select: {
        id: true,
        company_name: true,
        vendor_code: true,
        point_of_contact: true,
        contact_no: true,
        email: true,
      },
      orderBy: { company_name: "asc" },
      take: 100,
    });
    return validationResponse(1, "Company vendors fetched", vendors);
  } catch (e) {
    console.error(e);
    return validationResponse(0, "Failed to fetch company vendors");
  }
};

export const getPIPaymentTerms = async (vendor_id: number) => {

  try {
    const paymentTerms = await prisma.paymentTermMaster.findMany({
      where: {
        vendor_id,
        is_active: true,
      },
      select: {
        id: true,
        vendor_id: true,
        company_vendor_id: true,
        term_name: true,
        description: true,
        is_active: true,

        companyVendor: {
          select: {
            id: true,
            company_name: true,
            vendor_code: true,
          },
        },

        stages: {
          select: {
            id: true,
            stage_no: true,
            stage_name: true,
            trigger_type: true,
            percentage: true,
            fixed_amount: true,
            due_after_days: true,
            specific_date: true,
            requires_approval: true,
            remarks: true,
          },
          orderBy: {
            stage_no: "asc",
          },
        },
      },
      orderBy: [
        {
          company_vendor_id: "asc",
        },
        {
          term_name: "asc",
        },
      ],
    });

    return validationResponse(1, "Payment terms fetched", paymentTerms);
  } catch (e) {
    console.error(e);
    return validationResponse(0, "Failed to fetch payment terms");
  }
};


export const getVendorStateIdService = async (vendor_id: number) => {
  try {

    const vendors = await prisma.vendorMaster.findFirst({
      where: { id: vendor_id },
      select: { state_id: true },
    });

    return validationResponse(1, "Company vendors fetched", vendors);
  } catch (e) {
    return validationResponse(0, "Failed to fetch suppliers");
  }
};

// ─── Vendor payload type (shared) ─────────────────────────────────────────────

interface VendorPayload {
  company_vendor_id: number;
  payment_term_id?: number | null;

  required_qty: number;
  required_by_date?: string;
  estimated_price?: number;
  remarks?: string;

  // Pricing
  mrp?: number | null;
  discount_pct?: number | null;
  rate?: number | null;
  tax_pct?: number | null;
  cgst_pct?: number | null;
  sgst_pct?: number | null;
  igst_pct?: number | null;
  tax_amount?: number | null;
  amount?: number | null;
  total_amount?: number | null;
}

/** Build the DB row object for createMany */
function buildVendorMappingData(piItemId: number, v: VendorPayload) {
  return {
    purchase_intent_item_id: piItemId,
    company_vendor_id: v.company_vendor_id,

    payment_term_id: v.payment_term_id ?? null,

    required_qty: v.required_qty,
    required_by_date: v.required_by_date
      ? new Date(v.required_by_date)
      : null,

    estimated_price: v.rate ?? v.estimated_price ?? null,
    remarks: v.remarks ?? null,

    // Pricing
    mrp: v.mrp ?? null,
    discount_pct: v.discount_pct ?? null,
    rate: v.rate ?? null,
    tax_pct: v.tax_pct ?? null,
    cgst_pct: v.cgst_pct ?? null,
    sgst_pct: v.sgst_pct ?? null,
    igst_pct: v.igst_pct ?? null,
    tax_amount: v.tax_amount ?? null,
    amount: v.amount ?? null,
    total_amount: v.total_amount ?? null,
  };
}

// ─── Include block for returning PI detail ─────────────────────────────────────

const PI_DETAIL_INCLUDE = {
  category: {
    select: {
      id: true,
      category_name: true,
    },
  },

  createdBy: {
    select: {
      id: true,
      user_name: true,
    },
  },

  items: {
    include: {
      product: {
        select: {
          id: true,
          product_name: true,
          article_code: true,
          unit_of_measure: true,
          moq: true,
          level1_price: true,
          procurement: true,
          hsn_id: true,
        },
      },

      vendorMappings: {
        include: {
          companyVendor: {
            select: {
              id: true,
              company_name: true,
              vendor_code: true,
              contact_no: true,
              email: true,
              state_id: true,
              default_payment_term_id: true,
            },
          },

          paymentTerm: {
            select: {
              id: true,
              term_name: true,
              description: true,
              company_vendor_id: true,
            },
          },
        },
      },
    },
  },

  statusLogs: {
    include: {
      changedBy: {
        select: {
          id: true,
          user_name: true,
        },
      },
    },
    orderBy: {
      created_at: "asc" as const,
    },
  },
} as const;



// ─── CREATE ───────────────────────────────────────────────────────────────────

interface CreatePIPayload {
  vendor_id: number;
  user_id: number;
  category_id: number;
  priority?: string;
  remarks?: string;
  items: {
    product_id: number;
    uom?: string;
    remarks?: string;
    vendors: VendorPayload[];
  }[];
}


async function validatePaymentTerms(
  vendor_id: number,
  items: {
    vendors: VendorPayload[];
  }[]
) {
  const paymentTermIds = [
    ...new Set(
      items
        .flatMap((item) => item.vendors.map((v) => v.payment_term_id))
        .filter((id): id is number => !!id)
    ),
  ];

  if (!paymentTermIds.length) {
    return true;
  }

  const validPaymentTerms = await prisma.paymentTermMaster.findMany({
    where: {
      id: {
        in: paymentTermIds,
      },
      vendor_id,
      is_active: true,
    },
    select: {
      id: true,
    },
  });

  return validPaymentTerms.length === paymentTermIds.length;
}

export const createPurchaseIntent = async (
  payload: CreatePIPayload
) => {
  try {
    const {
      vendor_id,
      user_id,
      category_id,
      priority,
      remarks,
      items,
    } = payload;

    if (!user_id || user_id <= 0) {
      return validationResponse(0, "Invalid user_id");
    }

    if (!items?.length) {
      return validationResponse(0, "At least one product is required");
    }


    const category =
      await prisma.projectCategoriesMaster.findFirst({
        where: {
          id: category_id,
          vendor_id,
        },
        select: {
          id: true,
        },
      });

    if (!category) {
      return validationResponse(0, "Invalid category");
    }

    /**
     * validate products
     */
    const productIds = items.map((i) => i.product_id);

    const validProducts =
      await prisma.productMaster.findMany({
        where: {
          id: {
            in: productIds,
          },
          vendor_id,
          category_id,
        },
        select: {
          id: true,
        },
      });

    if (validProducts.length !== productIds.length) {
      return validationResponse(
        0,
        "One or more products are invalid"
      );
    }

    /**
     * validate suppliers
     */
    const allVendorIds = [
      ...new Set(
        items.flatMap((i) =>
          i.vendors.map((v) => v.company_vendor_id)
        )
      ),
    ];

    const validVendors =
      await prisma.companyVendorsMaster.findMany({
        where: {
          id: {
            in: allVendorIds,
          },
          vendor_id,
          is_deleted: false,
        },
        select: {
          id: true,
        },
      });


    if (validVendors.length !== allVendorIds.length) {
      return validationResponse(
        0,
        "One or more suppliers are invalid"
      );
    }
    const isPaymentTermValid = await validatePaymentTerms(vendor_id, items);

    if (!isPaymentTermValid) {
      return validationResponse(0, "One or more payment terms are invalid");
    }

    /**
     * calculate master totals
     */
    let amount = 0;
    let tax_amount = 0;
    let total_amount = 0;

    for (const item of items) {
      for (const v of item.vendors) {
        amount += Number(v.amount || 0);
        tax_amount += Number(v.tax_amount || 0);
        total_amount += Number(v.total_amount || 0);
      }
    }

    const intent_no = await generateIntentNo(vendor_id);

    const intent = await prisma.$transaction(async (tx) => {
      /**
       * create PI master
       */
      const pi = await tx.purchaseIntentMaster.create({
        data: {
          vendor_id,
          intent_no,
          category_id,

          priority: priority as any,
          remarks,

          amount,
          tax_amount,
          total_amount,

          status: "Draft",

          created_by: user_id,
          updated_by: user_id,
        },
      });

      /**
       * create items
       */
      for (const item of items) {
        const piItem =
          await tx.purchaseIntentItem.create({
            data: {
              purchase_intent_id: pi.id,
              product_id: item.product_id,
              uom: item.uom,
              remarks: item.remarks,
            },
          });

        /**
         * create supplier mappings
         */
        if (item.vendors?.length) {
          await tx.purchaseIntentItemVendorMapping.createMany({
            data: item.vendors.map((v) =>
              buildVendorMappingData(piItem.id, v)
            ),
          });
        }
      }

      /**
       * log
       */
      await tx.purchaseIntentStatusLog.create({
        data: {
          purchase_intent_id: pi.id,
          from_status: null,
          to_status: "Draft",
          changed_by: user_id,
          remarks: "Created",
        },
      });

      return pi;
    });

    const full =
      await prisma.purchaseIntentMaster.findUnique({
        where: {
          id: intent.id,
        },
        include: PI_DETAIL_INCLUDE,
      });

    return validationResponse(
      1,
      "Purchase Intent created",
      full
    );
  } catch (e) {
    console.error(
      "createPurchaseIntent error:",
      e
    );

    return validationResponse(
      0,
      "Failed to create purchase intent"
    );
  }
};

// ─── LIST ─────────────────────────────────────────────────────────────────────

export const listPurchaseIntents = async (
  vendor_id: number,
  page: number,
  status?: string,
  search?: string
) => {
  try {
    const PAGE_SIZE = 20;
    const skip = (page - 1) * PAGE_SIZE;

    const where: any = {
      vendor_id,
      is_deleted: false,
      ...(status ? { status } : {}),
      ...(search
        ? {
          intent_no: {
            contains: search,
            mode: "insensitive",
          },
        }
        : {}),
    };

    const [total, intents] = await Promise.all([
      prisma.purchaseIntentMaster.count({ where }),

      prisma.purchaseIntentMaster.findMany({
        where,
        skip,
        take: PAGE_SIZE,
        orderBy: {
          created_at: "desc",
        },
        include: {
          category: {
            select: {
              id: true,
              category_name: true,
            },
          },

          createdBy: {
            select: {
              id: true,
              user_name: true,
            },
          },

          _count: {
            select: {
              items: true,
            },
          },

          items: {
            select: {
              id: true,

              vendorMappings: {
                select: {
                  id: true,
                  amount: true,
                  tax_amount: true,
                  total_amount: true,
                },
              },
            },
          },
        },
      }),
    ]);

    const formattedIntents = intents.map((intent) => {
      const vendorMappings = intent.items.flatMap(
        (item) => item.vendorMappings || []
      );

      const amount = vendorMappings.reduce(
        (sum, v) => sum + Number(v.amount || 0),
        0
      );

      const tax_amount = vendorMappings.reduce(
        (sum, v) => sum + Number(v.tax_amount || 0),
        0
      );

      const grand_total = vendorMappings.reduce(
        (sum, v) => sum + Number(v.total_amount || 0),
        0
      );

      const supplier_count = vendorMappings.length;

      return {
        ...intent,
        amount,
        tax_amount,
        grand_total,
        supplier_count,
      };
    });

    return validationResponse(1, "Intents fetched", {
      intents: formattedIntents,
      total,
      page,
      page_size: PAGE_SIZE,
      total_pages: Math.ceil(total / PAGE_SIZE),
    });
  } catch (e) {
    console.log(e);
    return validationResponse(0, "Failed to fetch intents");
  }
};
// ─── GET BY ID ────────────────────────────────────────────────────────────────

export const getPurchaseIntentById = async (id: number, vendor_id: number) => {
  try {
    const intent = await prisma.purchaseIntentMaster.findFirst({
      where: { id, vendor_id, is_deleted: false },
      include: PI_DETAIL_INCLUDE,
    });
    if (!intent) return validationResponse(0, "Purchase intent not found");
    return validationResponse(1, "Intent fetched", intent);
  } catch (e) {
    return validationResponse(0, "Failed to fetch intent");
  }
};

// ─── UPDATE STATUS ────────────────────────────────────────────────────────────

export const updatePIStatus = async (
  id: number, vendor_id: number, user_id: number, status: string, remarks?: string
) => {
  try {
    const pi = await prisma.purchaseIntentMaster.findFirst({
      where: { id, vendor_id, is_deleted: false }, select: { id: true, status: true },
    });
    if (!pi) return validationResponse(0, "Not found");

    const data: any = { status, updated_by: user_id };
    if (status === "Approved") { data.approved_by = user_id; data.approved_at = new Date(); }
    if (status === "Rejected") { data.rejected_by = user_id; data.rejected_at = new Date(); if (remarks) data.rejection_reason = remarks; }

    await prisma.$transaction([
      prisma.purchaseIntentMaster.update({ where: { id }, data }),
      prisma.purchaseIntentStatusLog.create({
        data: { purchase_intent_id: id, from_status: pi.status as any, to_status: status as any, changed_by: user_id, remarks },
      }),
    ]);

    return validationResponse(1, "Status updated", { id, status });
  } catch (e) {
    return validationResponse(0, "Failed to update status");
  }
};

// ─── DELETE ───────────────────────────────────────────────────────────────────

export const deletePurchaseIntent = async (id: number, vendor_id: number, user_id: number) => {
  try {
    const pi = await prisma.purchaseIntentMaster.findFirst({
      where: { id, vendor_id, is_deleted: false }, select: { id: true, status: true },
    });
    if (!pi) return validationResponse(0, "Not found");
    if (!["Draft", "Cancelled", "Rejected"].includes(pi.status as string))
      return validationResponse(0, `Cannot delete a ${pi.status} intent`);

    await prisma.purchaseIntentMaster.update({
      where: { id },
      data: { is_deleted: true, deleted_at: new Date(), deleted_by: user_id },
    });
    return validationResponse(1, "Deleted");
  } catch (e) {
    return validationResponse(0, "Failed to delete");
  }
};

// ─── UPDATE (Draft only) ──────────────────────────────────────────────────────

export const updatePurchaseIntentService = async (
  id: number,
  vendor_id: number,
  user_id: number,
  payload: {
    category_id?: number;
    priority?: string;
    remarks?: string;
    items: {
      product_id: number;
      uom?: string;
      remarks?: string;
      vendors: VendorPayload[];
    }[];
  }
) => {
  try {
    const intent = await prisma.purchaseIntentMaster.findFirst({
      where: {
        id,
        vendor_id,
        is_deleted: false,
      },
      select: {
        id: true,
        status: true,
      },
    });

    if (!intent) {
      return validationResponse(0, "Purchase intent not found");
    }

    if (intent.status !== "Draft") {
      return validationResponse(
        0,
        `Only Draft intents can be edited. Current: ${intent.status}`
      );
    }

    if (!payload.items?.length) {
      return validationResponse(
        0,
        "At least one product is required"
      );
    }

    /**
     * category validation
     */
    if (payload.category_id) {
      const category =
        await prisma.projectCategoriesMaster.findFirst({
          where: {
            id: payload.category_id,
            vendor_id,
          },
          select: {
            id: true,
          },
        });

      if (!category) {
        return validationResponse(0, "Invalid category");
      }
    }

    const finalCategoryId =
      payload.category_id ??
      (
        await prisma.purchaseIntentMaster.findUnique({
          where: { id },
          select: { category_id: true },
        })
      )?.category_id;

    /**
     * validate products
     */
    const productIds = payload.items.map(
      (x) => x.product_id
    );

    // const validProducts =
    //   await prisma.productMaster.findMany({
    //     where: {
    //       id: {
    //         in: productIds,
    //       },
    //       vendor_id,
    //       category_id: finalCategoryId,
    //     },
    //     select: {
    //       id: true,
    //     },
    //   });

    // if (validProducts.length !== productIds.length) {
    //   return validationResponse(
    //     0,
    //     "One or more products are invalid"
    //   );
    // }

    /**
     * validate suppliers
     */
    const vendorIds = [
      ...new Set(
        payload.items.flatMap((item) =>
          item.vendors.map(
            (v) => v.company_vendor_id
          )
        )
      ),
    ];

    const validVendors =
      await prisma.companyVendorsMaster.findMany({
        where: {
          id: {
            in: vendorIds,
          },
          vendor_id,
          is_deleted: false,
        },
        select: {
          id: true,
        },
      });

    if (validVendors.length !== vendorIds.length) {
      return validationResponse(
        0,
        "One or more suppliers are invalid"
      );
    }
    const isPaymentTermValid = await validatePaymentTerms(vendor_id, payload.items);

    if (!isPaymentTermValid) {
      return validationResponse(0, "One or more payment terms are invalid");
    }

    /**
     * recalculate totals
     */
    let amount = 0;
    let tax_amount = 0;
    let total_amount = 0;

    for (const item of payload.items) {
      for (const v of item.vendors) {
        amount += Number(v.amount || 0);
        tax_amount += Number(v.tax_amount || 0);
        total_amount += Number(v.total_amount || 0);
      }
    }

    await prisma.$transaction(async (tx) => {
      /**
       * update master
       */
      await tx.purchaseIntentMaster.update({
        where: {
          id,
        },
        data: {
          ...(payload.category_id
            ? {
              category_id:
                payload.category_id,
            }
            : {}),

          ...(payload.priority
            ? {
              priority:
                payload.priority as any,
            }
            : {}),

          ...(payload.remarks !== undefined
            ? {
              remarks: payload.remarks,
            }
            : {}),

          amount,
          tax_amount,
          total_amount,

          updated_by: user_id,
        },
      });

      /**
       * delete old items
       */
      await tx.purchaseIntentItem.deleteMany({
        where: {
          purchase_intent_id: id,
        },
      });

      /**
       * recreate items
       */
      for (const item of payload.items) {
        const piItem =
          await tx.purchaseIntentItem.create({
            data: {
              purchase_intent_id: id,
              product_id: item.product_id,
              uom: item.uom,
              remarks: item.remarks,
            },
          });

        if (item.vendors?.length) {
          await tx.purchaseIntentItemVendorMapping.createMany({
            data: item.vendors.map((v) =>
              buildVendorMappingData(
                piItem.id,
                v
              )
            ),
          });
        }
      }

      /**
       * status log
       */
      await tx.purchaseIntentStatusLog.create({
        data: {
          purchase_intent_id: id,
          from_status: "Draft",
          to_status: "Draft",
          changed_by: user_id,
          remarks: "Purchase intent updated",
        },
      });
    });

    const updated =
      await prisma.purchaseIntentMaster.findUnique({
        where: {
          id,
        },
        include: PI_DETAIL_INCLUDE,
      });

    return validationResponse(
      1,
      "Purchase Intent updated",
      updated
    );
  } catch (e) {
    console.error(
      "updatePurchaseIntentService error:",
      e
    );

    return validationResponse(
      0,
      "Failed to update purchase intent"
    );
  }
};