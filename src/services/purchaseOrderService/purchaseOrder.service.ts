import { tr } from "node_modules/zod/v4/locales/index.cjs";
import { prisma } from "../../prisma/client";
import { validationResponse } from "../../utils/validationResponse";

// ─── Generate PO number ───────────────────────────────────────────────────────

async function generatePoNo(vendor_id: number): Promise<string> {
  const last = await prisma.purchaseOrderMaster.findFirst({
    where: { vendor_id },
    orderBy: { id: "desc" },
    select: { po_no: true },
  });
  let next = 1;
  if (last?.po_no) {
    const num = parseInt(last.po_no.replace("PO-", ""), 10);
    if (!isNaN(num)) next = num + 1;
  }
  return `PO-${String(next).padStart(6, "0")}`;
}

// ─── GET PI detail for conversion (prefill) ───────────────────────────────────
// Returns the PI with all items + their vendor mappings so the frontend
// can show the conversion form pre-filled.

export const getPIForConversionService = async (
  vendor_id: number,
  purchase_intent_id: number
) => {
  try {
    const pi = await prisma.purchaseIntentMaster.findFirst({
      where: { id: purchase_intent_id, vendor_id, is_deleted: false },
      include: {
        category: { select: { id: true, category_name: true } },
        items: {
          include: {
            product: {
              select: {
                id: true, product_name: true, article_code: true,
                unit_of_measure: true, moq: true, level1_price: true,
              },
            },
            vendorMappings: {
              include: {
                companyVendor: {
                  select: {
                    id: true, company_name: true, vendor_code: true,
                    contact_no: true, email: true, point_of_contact: true,
                  },
                },
                paymentTerm: {
                  select: {
                    id: true, term_name: true, description: true
                  }
                }
              },
            },
          },
        },
      },
    });

    if (!pi) return validationResponse(0, "Purchase intent not found");
    if (!["Draft", "Approved"].includes(pi.status))
      return validationResponse(0, `Cannot convert PI in ${pi.status} status`);

    return validationResponse(1, "PI fetched for conversion", pi);
  } catch (e) {
    console.error(e);
    return validationResponse(0, "Failed to fetch PI");
  }
};

// ─── POST convert PI → POs ────────────────────────────────────────────────────
// payload.selections = one entry per (supplier × product)
// Creates one PO per unique supplier, with all their products as line items.

interface ConvertPayload {
  vendor_id: number;
  user_id: number;
  purchase_intent_id: number;
  expected_delivery_date?: string;
  remarks?: string;

  selections: {
    pi_item_vendor_mapping_id: number;
    company_vendor_id: number;
    product_id: number;

    payment_term_id?: number | null;

    ordered_qty: number;
    unit_price?: number;
    uom?: string;
    expected_delivery_date?: string;
    remarks?: string;
  }[];
}

export const convertPIToPOService = async (payload: ConvertPayload) => {
  try {
    const {
      vendor_id,
      user_id,
      purchase_intent_id,
      expected_delivery_date,
      remarks,
      selections,
    } = payload;

    if (!selections?.length) {
      return validationResponse(
        0,
        "Select at least one supplier-product combination"
      );
    }

    const pi = await prisma.purchaseIntentMaster.findFirst({
      where: {
        id: purchase_intent_id,
        vendor_id,
        is_deleted: false,
      },
      select: {
        id: true,
        status: true,
      },
    });

    if (!pi) return validationResponse(0, "Purchase intent not found");

    if (!["Draft", "Approved"].includes(pi.status)) {
      return validationResponse(
        0,
        `Cannot convert PI in ${pi.status} status`
      );
    }

    const mappingIds = selections.map(
      (x) => x.pi_item_vendor_mapping_id
    );

    /**
     * Fetch full PI mapping data
     */
    const mappings =
      await prisma.purchaseIntentItemVendorMapping.findMany({
        where: {
          id: {
            in: mappingIds,
          },
          purchaseIntentItem: {
            purchase_intent_id,
          },
        },
        include: {
          purchaseIntentItem: {
            select: {
              id: true,
              product_id: true,
              uom: true,
              remarks: true,
            },
          },
        },
      });

    if (mappings.length !== mappingIds.length) {
      return validationResponse(
        0,
        "Some selections are invalid for this PI"
      );
    }




    const mappingMap = new Map(
      mappings.map((m) => [m.id, m])
    );

    /**
     * Group by supplier
     */
    const bySupplier = new Map<
      string,
      {
        company_vendor_id: number;
        payment_term_id: number | null;
        items: any[];
      }
    >();

    for (const sel of selections) {
      const mapping = mappingMap.get(sel.pi_item_vendor_mapping_id);

      if (!mapping) continue;

      const companyVendorId = mapping.company_vendor_id;

      const finalPaymentTermId =
        sel.payment_term_id ?? mapping.payment_term_id ?? null;

      const groupKey = `${companyVendorId}_${finalPaymentTermId ?? "no-term"}`;

      if (!bySupplier.has(groupKey)) {
        bySupplier.set(groupKey, {
          company_vendor_id: companyVendorId,
          payment_term_id: finalPaymentTermId,
          items: [],
        });
      }

      bySupplier.get(groupKey)!.items.push({
        selection: sel,
        mapping,
      });
    }


    const paymentTermIds = [
      ...new Set(
        selections
          .map((s) => s.payment_term_id)
          .filter((id): id is number => !!id)
      ),
    ];

    if (paymentTermIds.length) {
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

      if (validPaymentTerms.length !== paymentTermIds.length) {
        return validationResponse(0, "One or more payment terms are invalid");
      }
    }


    /**
     * Generate PO numbers
     */
    const supplierCount = bySupplier.size;

    const lastPo =
      await prisma.purchaseOrderMaster.findFirst({
        where: {
          vendor_id,
        },
        orderBy: {
          id: "desc",
        },
        select: {
          po_no: true,
        },
      });

    let nextPoNum = 1;

    if (lastPo?.po_no) {
      const n = parseInt(
        lastPo.po_no.replace("PO-", ""),
        10
      );

      if (!isNaN(n)) nextPoNum = n + 1;
    }

    const poNumbers = Array.from(
      { length: supplierCount },
      (_, i) =>
        `PO-${String(nextPoNum + i).padStart(6, "0")}`
    );




    /**
     * Transaction
     */
    const createdPOs = await prisma.$transaction(
      async (tx) => {
        const pos: any[] = [];
        let poIndex = 0;

        for (const [, group] of bySupplier) {
          const company_vendor_id = group.company_vendor_id;
          const payment_term_id = group.payment_term_id;
          const items = group.items;
          let amount = 0;
          let tax_amount = 0;
          let total_amount = 0;

          items.forEach(({ mapping }) => {
            amount += Number(mapping.amount || 0);
            tax_amount += Number(mapping.tax_amount || 0);
            total_amount += Number(mapping.total_amount || 0);
          });

          /**
           * create PO master
           */
          const po =
            await tx.purchaseOrderMaster.create({
              data: {
                vendor_id,
                po_no: poNumbers[poIndex++],
                purchase_intent_id,
                company_vendor_id,
                payment_term_id,
                remarks,
                expected_delivery_date:
                  expected_delivery_date
                    ? new Date(expected_delivery_date)
                    : null,

                amount,
                tax_amount,
                total_amount,

                status: "Draft",
                created_by: user_id,
                updated_by: user_id,

              },
            });

          /**
           * create PO items
           */
          await tx.purchaseOrderItem.createMany({
            data: items.map(
              ({ selection, mapping }) => ({
                purchase_order_id: po.id,

                product_id:
                  mapping.purchaseIntentItem.product_id,

                pi_item_vendor_mapping_id: mapping.id,

                ordered_qty:
                  selection.ordered_qty ||
                  Number(mapping.required_qty || 0),

                unit_price:
                  selection.unit_price ??
                  Number(mapping.rate || 0),

                uom:
                  selection.uom ??
                  mapping.purchaseIntentItem.uom ??
                  null,

                expected_delivery_date:
                  selection.expected_delivery_date
                    ? new Date(
                      selection.expected_delivery_date
                    )
                    : mapping.required_by_date
                      ? new Date(
                        mapping.required_by_date
                      )
                      : expected_delivery_date
                        ? new Date(
                          expected_delivery_date
                        )
                        : null,

                remarks:
                  selection.remarks ??
                  mapping.remarks ??
                  mapping.purchaseIntentItem.remarks ??
                  null,

                /**
                 * financial carry forward
                 */
                mrp: mapping.mrp,
                discount_pct: mapping.discount_pct,
                rate: mapping.rate,

                tax_pct: mapping.tax_pct,
                cgst_pct: mapping.cgst_pct,
                sgst_pct: mapping.sgst_pct,
                igst_pct: mapping.igst_pct,

                amount: mapping.amount,
                tax_amount: mapping.tax_amount,
                total_amount: mapping.total_amount,

                created_by: user_id,
                updated_by: user_id,
              })
            ),
          });

          pos.push({
            id: po.id,
            po_no: po.po_no,
            amount,
            tax_amount,
            total_amount,
          });
        }

        /**
         * update PI
         */
        await tx.purchaseIntentMaster.update({
          where: {
            id: purchase_intent_id,
          },
          data: {
            status: "ConvertedToPO",
            updated_by: user_id,
          },
        });

        await tx.purchaseIntentStatusLog.create({
          data: {
            purchase_intent_id,
            from_status: pi.status as any,
            to_status: "ConvertedToPO",
            changed_by: user_id,
            remarks: `Converted to ${pos.length
              } PO${pos.length > 1 ? "s" : ""}: ${pos
                .map((x) => x.po_no)
                .join(", ")}`,
          },
        });

        return pos;
      }
    );

    return validationResponse(
      1,
      "Purchase Orders created successfully",
      {
        purchase_orders: createdPOs,
        count: createdPOs.length,
      }
    );
  } catch (e) {
    console.error(
      "convertPIToPOService error:",
      e
    );

    return validationResponse(
      0,
      "Failed to create purchase orders"
    );
  }
};

// ─── GET list of POs ──────────────────────────────────────────────────────────

export const listPurchaseOrdersService = async (
  vendor_id: number,
  page: number,
  status?: string,
  search?: string
) => {
  try {
    const PAGE_SIZE = 20;
    const skip = (page - 1) * PAGE_SIZE;
    const where: any = {
      vendor_id, is_deleted: false,
      ...(status ? { status } : {}),
      ...(search ? { po_no: { contains: search, mode: "insensitive" } } : {}),
    };

    const [total, pos] = await Promise.all([
      prisma.purchaseOrderMaster.count({ where }),
      prisma.purchaseOrderMaster.findMany({
        where, skip, take: PAGE_SIZE,
        orderBy: { created_at: "desc" },
        include: {
          companyVendor: { select: { id: true, company_name: true, vendor_code: true } },
          purchaseIntent: { select: { id: true, intent_no: true } },
          paymentTerm:{select:{id:true, term_name:true, description:true}},
          createdBy: { select: { id: true, user_name: true } },
          _count: { select: { items: true } },
        },
      }),
    ]);

    return validationResponse(1, "POs fetched", {
      purchase_orders: pos,
      total, page, page_size: PAGE_SIZE,
      total_pages: Math.ceil(total / PAGE_SIZE),
    });
  } catch (e) {
    console.error(e);
    return validationResponse(0, "Failed to fetch purchase orders");
  }
};

// ─── GET single PO ────────────────────────────────────────────────────────────

export const getPurchaseOrderByIdService = async (id: number, vendor_id: number) => {
  try {
    const po = await prisma.purchaseOrderMaster.findFirst({
      where: { id, vendor_id, is_deleted: false },
      include: {
        companyVendor: { select: { id: true, company_name: true, vendor_code: true, contact_no: true, email: true } },
        purchaseIntent: { select: { id: true, intent_no: true } },
        createdBy: { select: { id: true, user_name: true } },
        items: {
          include: {
            product: { select: { id: true, product_name: true, article_code: true, unit_of_measure: true } },
          },
        },
        grns: {
          orderBy: { created_at: "asc" },
          include: {
            createdBy: { select: { id: true, user_name: true } },
            confirmedBy: { select: { id: true, user_name: true } },
            items: {
              include: {
                product: { select: { id: true, product_name: true, article_code: true } },
              },
            },
          },
        },
      },
    });
    if (!po) return validationResponse(0, "Purchase order not found");
    return validationResponse(1, "PO fetched", po);
  } catch (e) {
    console.error(e);
    return validationResponse(0, "Failed to fetch purchase order");
  }
};

// ─── PATCH update PO item (qty, unit_price, date, remarks) ───────────────────

export const updatePOItemService = async (
  po_id: number,
  item_id: number,
  vendor_id: number,
  data: {
    ordered_qty?: number;
    unit_price?: number;

    mrp?: number;
    discount_pct?: number;
    rate?: number;

    tax_pct?: number;
    cgst_pct?: number;
    sgst_pct?: number;
    igst_pct?: number;

    amount?: number;
    tax_amount?: number;
    total_amount?: number;

    expected_delivery_date?: string | null;
    remarks?: string;
  }
) => {
  try {
    const item = await prisma.purchaseOrderItem.findFirst({
      where: {
        id: item_id,
        purchase_order_id: po_id,
        purchaseOrder: {
          vendor_id,
          is_deleted: false,
        },
      },
      select: {
        id: true,
      },
    });

    if (!item) {
      return validationResponse(0, "Item not found");
    }

    const updated = await prisma.$transaction(async (tx) => {
      const updatedItem = await tx.purchaseOrderItem.update({
        where: {
          id: item_id,
        },
        data: {
          ...(data.ordered_qty !== undefined
            ? { ordered_qty: data.ordered_qty }
            : {}),

          ...(data.unit_price !== undefined
            ? { unit_price: data.unit_price }
            : {}),

          ...(data.mrp !== undefined
            ? { mrp: data.mrp }
            : {}),

          ...(data.discount_pct !== undefined
            ? { discount_pct: data.discount_pct }
            : {}),

          ...(data.rate !== undefined
            ? { rate: data.rate }
            : {}),

          ...(data.tax_pct !== undefined
            ? { tax_pct: data.tax_pct }
            : {}),

          ...(data.cgst_pct !== undefined
            ? { cgst_pct: data.cgst_pct }
            : {}),

          ...(data.sgst_pct !== undefined
            ? { sgst_pct: data.sgst_pct }
            : {}),

          ...(data.igst_pct !== undefined
            ? { igst_pct: data.igst_pct }
            : {}),

          ...(data.amount !== undefined
            ? { amount: data.amount }
            : {}),

          ...(data.tax_amount !== undefined
            ? { tax_amount: data.tax_amount }
            : {}),

          ...(data.total_amount !== undefined
            ? { total_amount: data.total_amount }
            : {}),

          ...(data.expected_delivery_date !== undefined
            ? {
              expected_delivery_date: data.expected_delivery_date
                ? new Date(data.expected_delivery_date)
                : null,
            }
            : {}),

          ...(data.remarks !== undefined
            ? { remarks: data.remarks }
            : {}),
        },

        include: {
          product: {
            select: {
              id: true,
              product_name: true,
              article_code: true,
            },
          },
        },
      });

      // recalculate PO totals
      const totals = await tx.purchaseOrderItem.aggregate({
        where: {
          purchase_order_id: po_id,
          is_deleted: false,
        },
        _sum: {
          amount: true,
          tax_amount: true,
          total_amount: true,
        },
      });

      await tx.purchaseOrderMaster.update({
        where: {
          id: po_id,
        },
        data: {
          amount: totals._sum.amount || 0,
          tax_amount: totals._sum.tax_amount || 0,
          total_amount: totals._sum.total_amount || 0,
        },
      });

      return updatedItem;
    });

    return validationResponse(1, "Item updated", updated);
  } catch (e) {
    console.error("updatePOItemService error:", e);

    return validationResponse(0, "Failed to update item");
  }
};

// ─── DELETE PO item ───────────────────────────────────────────────────────────

export const deletePOItemService = async (
  po_id: number,
  item_id: number,
  vendor_id: number
) => {
  try {
    const po = await prisma.purchaseOrderMaster.findFirst({
      where: { id: po_id, vendor_id, is_deleted: false },
      select: { id: true, status: true, _count: { select: { items: true } } },
    });
    if (!po) return validationResponse(0, "Purchase order not found");
    if (po.status === "Cancelled") return validationResponse(0, "Cannot modify a cancelled PO");
    if (po._count.items <= 1) return validationResponse(0, "Cannot remove the last item — cancel the PO instead");

    await prisma.purchaseOrderItem.delete({ where: { id: item_id } });
    return validationResponse(1, "Item removed");
  } catch (e) {
    console.error(e);
    return validationResponse(0, "Failed to remove item");
  }
};

// ─── PATCH PO status (approve / cancel / etc.) ────────────────────────────────

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  Draft: ["Approved", "Cancelled"],
  Approved: ["Cancelled"],           // PartiallyReceived/Received set by GRN only
  PartiallyReceived: ["Cancelled"],           // PartiallyReceived/Received set by GRN only
  Received: [],
  Cancelled: [],
};

export const updatePOStatusService = async (
  id: number,
  vendor_id: number,
  user_id: number,
  to_status: string,
  remarks?: string
) => {
  try {
    if (!vendor_id || vendor_id <= 0)
      return validationResponse(0, "Invalid vendor_id");
    if (!user_id || user_id <= 0)
      return validationResponse(0, "Invalid user_id — cannot update status without a valid user");

    const po = await prisma.purchaseOrderMaster.findFirst({
      where: { id, vendor_id, is_deleted: false },
      select: { id: true, status: true },
    });
    if (!po) return validationResponse(0, "Purchase order not found");

    const allowed = ALLOWED_TRANSITIONS[po.status] ?? [];
    if (!allowed.includes(to_status))
      return validationResponse(0, `Cannot move from ${po.status} to ${to_status}`);

    const updated = await prisma.purchaseOrderMaster.update({
      where: { id },
      data: {
        status: to_status as any,
        updated_by: user_id,
        ...(remarks ? { remarks } : {}),
      },
      select: { id: true, po_no: true, status: true },
    });

    return validationResponse(1, "Status updated", updated);
  } catch (e) {
    console.error(e);
    return validationResponse(0, "Failed to update status");
  }
};

// ─── DELETE PO (soft, cancel only) ───────────────────────────────────────────

export const cancelPOService = async (
  id: number, vendor_id: number, user_id: number, remarks?: string
) => {
  try {
    const po = await prisma.purchaseOrderMaster.findFirst({
      where: { id, vendor_id, is_deleted: false },
      select: { id: true, status: true },
    });
    if (!po) return validationResponse(0, "Purchase order not found");
    if (po.status === "Received") return validationResponse(0, "Cannot cancel a received PO");
    if (po.status === "Cancelled") return validationResponse(0, "PO is already cancelled");

    await prisma.purchaseOrderMaster.update({
      where: { id },
      data: {
        status: "Cancelled",
        updated_by: user_id,
        deleted_by: user_id,   // track who cancelled
        ...(remarks ? { remarks } : {}),
      },
    });
    return validationResponse(1, "Purchase order cancelled");
  } catch (e) {
    console.error(e);
    return validationResponse(0, "Failed to cancel PO");
  }
};