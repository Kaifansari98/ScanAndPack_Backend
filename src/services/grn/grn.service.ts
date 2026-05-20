import { prisma } from "../../prisma/client";
import { validationResponse } from "../../utils/validationResponse";

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function genNo(model: "grn" | "dcn", vendor_id: number) {
  const prefix = model === "grn" ? "GRN" : "DCN";
  const last = model === "grn"
    ? await prisma.gRNMaster.findFirst({ where: { vendor_id }, orderBy: { id: "desc" }, select: { grn_no: true } })
    : await prisma.debitCreditNote.findFirst({ where: { vendor_id }, orderBy: { id: "desc" }, select: { note_no: true } });
  const lastNo = model === "grn" ? (last as any)?.grn_no : (last as any)?.note_no;
  let next = 1;
  if (lastNo) { const n = parseInt(lastNo.replace(`${prefix}-`, ""), 10); if (!isNaN(n)) next = n + 1; }
  return `${prefix}-${String(next).padStart(6, "0")}`;
}

const toNum = (value: any): number => {
  if (value === null || value === undefined || value === "") return 0;
  return Number(value);
};

const round2 = (value: number): number => {
  return Math.round((value + Number.EPSILON) * 100) / 100;
};

// ─── GET PO items for GRN pre-fill ────────────────────────────────────────────

export const getPOForGRNService = async (vendor_id: number, po_id: number) => {
  try {
    const po = await prisma.purchaseOrderMaster.findFirst({
      where: { id: po_id, vendor_id, is_deleted: false },
      include: {
        companyVendor: { select: { id: true, company_name: true, vendor_code: true, contact_no: true } },
        items: {
          include: {
            product: { select: { id: true, product_name: true, article_code: true, unit_of_measure: true } },
            grnItems: {
              where: { grn: { status: "Confirmed" } },
              select: { accepted_qty: true, rejected_qty: true },
            },
          },
        },
        grns: {
          select: { id: true, grn_no: true, status: true, received_date: true },
          orderBy: { id: "desc" },
        },
      },
    });
    if (!po) return validationResponse(0, "PO not found");
    if (!["Approved", "PartiallyReceived"].includes(po.status))
      return validationResponse(0, `Cannot create GRN for PO in ${po.status} status`);

    // Compute remaining qty per item
    const enriched = po.items.map(item => {
      const totalAccepted = item.grnItems.reduce((s, g) => s + parseFloat(g.accepted_qty.toString()), 0);
      const remaining = parseFloat(item.ordered_qty.toString()) - totalAccepted;
      return { ...item, total_accepted: totalAccepted, remaining_qty: Math.max(0, remaining) };
    });

    return validationResponse(1, "PO fetched for GRN", { ...po, items: enriched });
  } catch (e) {
    console.error(e);
    return validationResponse(0, "Failed to fetch PO");
  }
};

// ─── CREATE GRN ───────────────────────────────────────────────────────────────

export type CreateGRNItemPayload = {
  purchase_order_item_id?: number;
  po_item_id?: number;

  product_id: number;

  received_qty: number;
  accepted_qty: number;
  rejected_qty: number;

  unit_price?: number;
  uom?: string;
  rejection_reason?: string;

  mrp?: number;
  discount_pct?: number;
  discount_amount?: number;
};

export type CreateGRNPayload = {
  vendor_id: number;
  user_id: number;
  purchase_order_id: number;

  received_date: string;

  vehicle_no?: string;
  gate_entry_no?: string;
  invoice_no?: string;
  invoice_date?: string;
  invoice_amount?: number;

  remarks?: string;

  packing_amount?: number;
  freight_amount?: number;
  other_charges_amount?: number;
  roundoff_amount?: number;

  eway_bill_no?: string;
  transporter_name?: string;
  lr_no?: string;
  lr_date?: string;

  items: CreateGRNItemPayload[];
};


export const createGRNService = async (payload: CreateGRNPayload) => {
  try {
    const {
      vendor_id,
      user_id,
      purchase_order_id,
      items,
    } = payload;

    if (!vendor_id) {
      return validationResponse(0, "Vendor ID is required");
    }

    if (!user_id) {
      return validationResponse(0, "User ID is required");
    }

    if (!purchase_order_id) {
      return validationResponse(0, "Purchase order ID is required");
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return validationResponse(0, "At least one GRN item is required");
    }

    const po = await prisma.purchaseOrderMaster.findFirst({
      where: {
        id: purchase_order_id,
        vendor_id,
        is_deleted: false,
      },
      select: {
        id: true,
        status: true,
        company_vendor_id: true,

        companyVendor: {
          select: {
            id: true,
            state_id: true,
          },
        },

        vendor: {
          select: {
            id: true,
            state_id: true,
          },
        },
      },
    });

    if (!po) {
      return validationResponse(0, "PO not found");
    }

    if (!["Approved", "PartiallyReceived"].includes(po.status)) {
      return validationResponse(0, "Cannot create GRN for this PO status");
    }

    /**
     * Supports both keys:
     * - purchase_order_item_id
     * - po_item_id
     */
    const normalizedItems = items.map((item: any) => ({
      ...item,
      purchase_order_item_id:
        item.purchase_order_item_id ?? item.po_item_id,
    }));

    for (const item of normalizedItems) {
      if (!item.purchase_order_item_id) {
        return validationResponse(
          0,
          `Purchase order item ID is required for product ${item.product_id}`
        );
      }

      if (!item.product_id) {
        return validationResponse(0, "Product ID is required");
      }

      const receivedQty = toNum(item.received_qty);
      const acceptedQty = toNum(item.accepted_qty);
      const rejectedQty = toNum(item.rejected_qty);

      if (receivedQty <= 0) {
        return validationResponse(
          0,
          `Received qty must be greater than 0 for product ${item.product_id}`
        );
      }

      if (acceptedQty < 0 || rejectedQty < 0) {
        return validationResponse(
          0,
          `Accepted / rejected qty cannot be negative for product ${item.product_id}`
        );
      }

      if (round2(acceptedQty + rejectedQty) !== round2(receivedQty)) {
        return validationResponse(
          0,
          `Accepted + Rejected must equal Received qty for item ${item.product_id}`
        );
      }

      if (rejectedQty > 0 && !item.rejection_reason?.trim()) {
        return validationResponse(
          0,
          `Rejection reason is required for rejected item ${item.product_id}`
        );
      }
    }

    const poItemIds = normalizedItems.map(
      (item: any) => item.purchase_order_item_id
    );

    const poItems = await prisma.purchaseOrderItem.findMany({
      where: {
        id: {
          in: poItemIds,
        },
        purchase_order_id,
        is_deleted: false,
      },
      select: {
        id: true,
        product_id: true,
        ordered_qty: true,
        received_qty: true,
        unit_price: true,
        uom: true,

        mrp: true,
        discount_pct: true,
        rate: true,
        tax_pct: true,
        cgst_pct: true,
        sgst_pct: true,
        igst_pct: true,
        tax_amount: true,
        amount: true,
        total_amount: true,
      },
    });

    if (poItems.length !== poItemIds.length) {
      return validationResponse(
        0,
        "Some PO items were not found or do not belong to this PO"
      );
    }

    const poItemMap = new Map(poItems.map((item) => [item.id, item]));

    for (const item of normalizedItems) {
      const poItem = poItemMap.get(item.purchase_order_item_id);

      if (!poItem) {
        return validationResponse(
          0,
          `PO item not found for product ${item.product_id}`
        );
      }

      if (poItem.product_id !== item.product_id) {
        return validationResponse(
          0,
          `Product mismatch for PO item ${item.purchase_order_item_id}`
        );
      }

      const orderedQty = toNum(poItem.ordered_qty);
      const alreadyReceivedQty = toNum(poItem.received_qty);
      const remainingQty = round2(orderedQty - alreadyReceivedQty);
      const currentReceivedQty = toNum(item.received_qty);

      if (currentReceivedQty > remainingQty) {
        return validationResponse(
          0,
          `Received qty cannot be greater than remaining qty for product ${item.product_id}. Remaining qty is ${remainingQty}`
        );
      }
    }

    const productIds = normalizedItems.map((item: any) => item.product_id);

    const products = await prisma.productMaster.findMany({
      where: {
        id: {
          in: productIds,
        },
        vendor_id,
      },
      select: {
        id: true,
        hsn_code: true,

        hsn: {
          select: {
            hsn_code: true,
            cgst_rate: true,
            sgst_rate: true,
            igst_rate: true,
            cess_rate: true,
          },
        },
      },
    });

    const productMap = new Map(products.map((product) => [product.id, product]));

    const sameState =
      po.vendor?.state_id &&
      po.companyVendor?.state_id &&
      po.vendor.state_id === po.companyVendor.state_id;

    let subtotalAmount = 0;
    let taxableAmount = 0;
    let cgstAmount = 0;
    let sgstAmount = 0;
    let igstAmount = 0;
    let cessAmount = 0;
    let taxAmount = 0;
    let discountAmount = 0;
    let itemsTotalAmount = 0;

    const calculatedItems = normalizedItems.map((item: any) => {
      const product = productMap.get(item.product_id);
      const poItem = poItemMap.get(item.purchase_order_item_id);

      const qty = toNum(item.accepted_qty);

      /**
       * Price priority:
       * 1. Frontend unit_price, if sent
       * 2. PO item unit_price
       * 3. PO item rate
       * 4. 0
       */
      const unitPrice = toNum(
        item.unit_price ?? poItem?.unit_price ?? poItem?.rate
      );

      const mrp = toNum(item.mrp ?? poItem?.mrp);
      const discountPct = toNum(
        item.discount_pct ?? poItem?.discount_pct
      );

      const grossAmount = round2(qty * unitPrice);

      const itemDiscountAmount =
        item.discount_amount !== undefined && item.discount_amount !== null
          ? round2(toNum(item.discount_amount))
          : round2((grossAmount * discountPct) / 100);

      const itemTaxableAmount = round2(grossAmount - itemDiscountAmount);

      const cgstPct = sameState ? toNum(product?.hsn?.cgst_rate) : 0;
      const sgstPct = sameState ? toNum(product?.hsn?.sgst_rate) : 0;
      const igstPct = sameState ? 0 : toNum(product?.hsn?.igst_rate);
      const cessPct = toNum(product?.hsn?.cess_rate);

      const itemCgstAmount = round2((itemTaxableAmount * cgstPct) / 100);
      const itemSgstAmount = round2((itemTaxableAmount * sgstPct) / 100);
      const itemIgstAmount = round2((itemTaxableAmount * igstPct) / 100);
      const itemCessAmount = round2((itemTaxableAmount * cessPct) / 100);

      const itemTaxAmount = round2(
        itemCgstAmount +
        itemSgstAmount +
        itemIgstAmount +
        itemCessAmount
      );

      const itemTotalAmount = round2(itemTaxableAmount + itemTaxAmount);

      subtotalAmount += grossAmount;
      taxableAmount += itemTaxableAmount;
      cgstAmount += itemCgstAmount;
      sgstAmount += itemSgstAmount;
      igstAmount += itemIgstAmount;
      cessAmount += itemCessAmount;
      taxAmount += itemTaxAmount;
      discountAmount += itemDiscountAmount;
      itemsTotalAmount += itemTotalAmount;

      return {
        ...item,

        purchase_order_item_id: item.purchase_order_item_id,

        hsn_code: product?.hsn?.hsn_code ?? product?.hsn_code ?? null,

        mrp,
        discount_pct: discountPct,
        discount_amount: itemDiscountAmount,

        unit_price: unitPrice,
        rate: unitPrice,
        amount: grossAmount,
        taxable_amount: itemTaxableAmount,

        tax_pct: round2(cgstPct + sgstPct + igstPct + cessPct),
        cgst_pct: cgstPct,
        sgst_pct: sgstPct,
        igst_pct: igstPct,
        // cess_pct: cessPct,

        cgst_amount: itemCgstAmount,
        sgst_amount: itemSgstAmount,
        igst_amount: itemIgstAmount,
        cess_amount: itemCessAmount,

        tax_amount: itemTaxAmount,
        total_amount: itemTotalAmount,

        uom: item.uom ?? poItem?.uom ?? null,
      };
    });

    subtotalAmount = round2(subtotalAmount);
    taxableAmount = round2(taxableAmount);
    cgstAmount = round2(cgstAmount);
    sgstAmount = round2(sgstAmount);
    igstAmount = round2(igstAmount);
    cessAmount = round2(cessAmount);
    taxAmount = round2(taxAmount);
    discountAmount = round2(discountAmount);
    itemsTotalAmount = round2(itemsTotalAmount);

    const packingAmount = round2(toNum(payload.packing_amount));
    const freightAmount = round2(toNum(payload.freight_amount));
    const otherChargesAmount = round2(toNum(payload.other_charges_amount));
    const roundoffAmount = round2(toNum(payload.roundoff_amount));

    const totalAmount = round2(
      itemsTotalAmount +
      packingAmount +
      freightAmount +
      otherChargesAmount +
      roundoffAmount
    );

    const grn_no = await genNo("grn", vendor_id);

    const grn = await prisma.$transaction(async (tx) => {
      const g = await tx.gRNMaster.create({
        data: {
          grn_no,

          vendor: {
            connect: {
              id: vendor_id,
            },
          },

          purchaseOrder: {
            connect: {
              id: purchase_order_id,
            },
          },

          companyVendor: {
            connect: {
              id: po.company_vendor_id,
            },
          },

          createdBy: {
            connect: {
              id: user_id,
            },
          },

          updatedBy: {
            connect: {
              id: user_id,
            },
          },

          received_date: new Date(payload.received_date),

          vehicle_no: payload.vehicle_no?.trim() || null,
          gate_entry_no: payload.gate_entry_no?.trim() || null,
          invoice_no: payload.invoice_no?.trim() || null,

          invoice_date: payload.invoice_date
            ? new Date(payload.invoice_date)
            : null,

          invoice_amount:
            payload.invoice_amount !== undefined &&
              payload.invoice_amount !== null
              ? toNum(payload.invoice_amount)
              : null,

          subtotal_amount: subtotalAmount,
          taxable_amount: taxableAmount,

          cgst_amount: cgstAmount,
          sgst_amount: sgstAmount,
          igst_amount: igstAmount,
          cess_amount: cessAmount,

          /**
           * IMPORTANT:
           * Do not add tax_amount here.
           * GRNMaster does not have tax_amount in your Prisma schema.
           */

          discount_amount: discountAmount,
          packing_amount: packingAmount,
          freight_amount: freightAmount,
          other_charges_amount: otherChargesAmount,
          roundoff_amount: roundoffAmount,

          total_amount: totalAmount,

          eway_bill_no: payload.eway_bill_no?.trim() || null,
          transporter_name: payload.transporter_name?.trim() || null,
          lr_no: payload.lr_no?.trim() || null,
          lr_date: payload.lr_date ? new Date(payload.lr_date) : null,

          remarks: payload.remarks?.trim() || null,
          status: "Draft",
        },
      });

      for (const item of calculatedItems) {
        const status =
          toNum(item.rejected_qty) === toNum(item.received_qty)
            ? "Rejected"
            : toNum(item.rejected_qty) > 0
              ? "PartiallyAccepted"
              : "Accepted";

        await tx.gRNItem.create({
          data: {
            grn: {
              connect: {
                id: g.id,
              },
            },

            poItem: {
              connect: {
                id: item.purchase_order_item_id,
              },
            },

            product: {
              connect: {
                id: item.product_id,
              },
            },

            received_qty: toNum(item.received_qty),
            accepted_qty: toNum(item.accepted_qty),
            rejected_qty: toNum(item.rejected_qty),

            unit_price: item.unit_price,
            uom: item.uom,
            rejection_reason: item.rejection_reason?.trim() || null,

            hsn_code: item.hsn_code,

            mrp: item.mrp,
            discount_pct: item.discount_pct,
            discount_amount: item.discount_amount,

            rate: item.rate,
            amount: item.amount,
            taxable_amount: item.taxable_amount,

            tax_pct: item.tax_pct,
            cgst_pct: item.cgst_pct,
            sgst_pct: item.sgst_pct,
            igst_pct: item.igst_pct,
            // cess_pct: item.cess_pct,

            cgst_amount: item.cgst_amount,
            sgst_amount: item.sgst_amount,
            igst_amount: item.igst_amount,
            // cess_amount: item.cess_amount,

            /**
             * GRNItem has tax_amount in your schema, so this is okay.
             */
            tax_amount: item.tax_amount,
            total_amount: item.total_amount,

            gst_percentage: item.tax_pct,

            cgst_percentage: item.cgst_pct,
            sgst_percentage: item.sgst_pct,
            igst_percentage: item.igst_pct,

            discount_percentage: item.discount_pct,
            line_total: item.total_amount,

            status,
          },
        });

        await tx.purchaseOrderItem.update({
          where: {
            id: item.purchase_order_item_id,
          },
          data: {
            received_qty: {
              increment: toNum(item.received_qty),
            },
          },
        });
      }

      const poItemsAfterGRN = await tx.purchaseOrderItem.findMany({
        where: {
          purchase_order_id,
          is_deleted: false,
        },
        select: {
          ordered_qty: true,
          received_qty: true,
        },
      });

      const allItemsFullyReceived = poItemsAfterGRN.every((item) => {
        return toNum(item.received_qty) >= toNum(item.ordered_qty);
      });

      const anyItemReceived = poItemsAfterGRN.some((item) => {
        return toNum(item.received_qty) > 0;
      });

      await tx.purchaseOrderMaster.update({
        where: {
          id: purchase_order_id,
        },
        data: {
          status: allItemsFullyReceived
            ? "Received"
            : anyItemReceived
              ? "PartiallyReceived"
              : po.status,
          updated_by: user_id,
        },
      });

      return g;
    });

    return validationResponse(1, "GRN created", {
      id: grn.id,
      grn_no: grn.grn_no,

      subtotal_amount: subtotalAmount,
      taxable_amount: taxableAmount,

      cgst_amount: cgstAmount,
      sgst_amount: sgstAmount,
      igst_amount: igstAmount,
      cess_amount: cessAmount,

      tax_amount: taxAmount,

      discount_amount: discountAmount,
      packing_amount: packingAmount,
      freight_amount: freightAmount,
      other_charges_amount: otherChargesAmount,
      roundoff_amount: roundoffAmount,

      total_amount: totalAmount,
    });
  } catch (e) {
    console.error("createGRNService error:", e);
    return validationResponse(0, "Failed to create GRN");
  }
};

// ─── CONFIRM GRN ─────────────────────────────────────────────────────────────

export const confirmGRNService = async (grn_id: number, vendor_id: number, user_id: number) => {
  try {
    const grn = await prisma.gRNMaster.findFirst({
      where: { id: grn_id, vendor_id },
      include: {
        items: true,
        purchaseOrder: { select: { id: true, items: { select: { id: true, ordered_qty: true } } } },
      },
    });
    if (!grn) return validationResponse(0, "GRN not found");
    if (grn.status !== "Draft") return validationResponse(0, "Only Draft GRNs can be confirmed");

    await prisma.$transaction(async (tx) => {
      // Confirm GRN
      await tx.gRNMaster.update({
        where: { id: grn_id },
        data: { status: "Confirmed", confirmed_by: user_id, confirmed_at: new Date(), updated_by: user_id },
      });

      // Update received_qty on each PO item (only accepted qty counts toward fulfillment)
      // Also increment current_stock on ProductMaster for each accepted qty
      for (const item of grn.items) {
        await tx.purchaseOrderItem.update({
          where: { id: item.po_item_id },
          data: { received_qty: { increment: item.accepted_qty } },
        });

        // Only accepted goods go into stock (rejected are not stocked)
        if (parseFloat(item.accepted_qty.toString()) > 0) {
          // Fetch current stock before update
          const before = await tx.productMaster.findUnique({
            where: { id: item.product_id },
            select: { current_stock: true },
          });
          const oldStock = parseFloat((before?.current_stock ?? 0).toString());
          const newStock = oldStock + parseFloat(item.accepted_qty.toString());

          await tx.productMaster.update({
            where: { id: item.product_id },
            data: { current_stock: newStock, stock_updated_at: new Date() },
          });

          // Write stock history
          await tx.productStockHistory.create({
            data: {
              vendor_id,
              product_id: item.product_id,
              old_stock: oldStock,
              new_stock: newStock,
              change: parseFloat(item.accepted_qty.toString()),
              source: "GRNConfirmation",
              changed_by: user_id,
              remarks: `GRN ${grn.grn_no} confirmed`,
            },
          });
        }
      }

      // Determine new PO status:
      // - "Received" only if accepted qty >= ordered qty for ALL items
      // - "PartiallyReceived" if some accepted but not all
      // Rejected qty does NOT count toward fulfillment — must be redelivered or noted
      const poItems = await tx.purchaseOrderItem.findMany({
        where: { purchase_order_id: grn.purchase_order_id },
        select: { ordered_qty: true, received_qty: true },
      });
      const totalOrdered = poItems.reduce((s, i) => s + parseFloat(i.ordered_qty.toString()), 0);
      const totalAccepted = poItems.reduce((s, i) => s + parseFloat(i.received_qty.toString()), 0);

      // Also count any rejected items from ALL confirmed GRNs for this PO
      const allRejected = await tx.gRNItem.aggregate({
        where: {
          grn: { purchase_order_id: grn.purchase_order_id, status: "Confirmed" },
          rejected_qty: { gt: 0 },
        },
        _sum: { rejected_qty: true },
      });
      const totalRejected = parseFloat((allRejected._sum.rejected_qty ?? 0).toString());

      let newPOStatus: string;
      if (totalAccepted >= totalOrdered) {
        newPOStatus = "Received";            // fully fulfilled via accepted qty
      } else if (totalAccepted > 0) {
        newPOStatus = "PartiallyReceived";   // some accepted, more expected
      } else {
        newPOStatus = "Approved";            // nothing accepted yet (all rejected)
      }

      await tx.purchaseOrderMaster.update({
        where: { id: grn.purchase_order_id },
        data: { status: newPOStatus as any },
      });
    });

    return validationResponse(1, "GRN confirmed");
  } catch (e) {
    console.error(e);
    return validationResponse(0, "Failed to confirm GRN");
  }
};

// ─── LIST GRNs ────────────────────────────────────────────────────────────────

export const listGRNsService = async (
  vendor_id: number, page: number, po_id?: number, search?: string, status?: string
) => {
  const PAGE_SIZE = 20;
  const skip = (page - 1) * PAGE_SIZE;
  const where: any = {
    vendor_id,
    ...(po_id ? { purchase_order_id: po_id } : {}),
    ...(status ? { status } : {}),
    ...(search ? { grn_no: { contains: search, mode: "insensitive" } } : {}),
  };
  const [total, grns] = await Promise.all([
    prisma.gRNMaster.count({ where }),
    prisma.gRNMaster.findMany({
      where, skip, take: PAGE_SIZE, orderBy: { created_at: "desc" },
      include: {
        companyVendor: { select: { id: true, company_name: true, vendor_code: true } },
        purchaseOrder: { select: { id: true, po_no: true } },
        createdBy: { select: { id: true, user_name: true } },
        _count: { select: { items: true } },
      },
    }),
  ]);
  return validationResponse(1, "GRNs fetched", { grns, total, page, page_size: PAGE_SIZE, total_pages: Math.ceil(total / PAGE_SIZE) });
};

// ─── GET single GRN ───────────────────────────────────────────────────────────

export const getGRNByIdService = async (id: number, vendor_id: number) => {
  const grn = await prisma.gRNMaster.findFirst({
    where: { id, vendor_id },
    include: {
      companyVendor: { select: { id: true, company_name: true, vendor_code: true, contact_no: true, email: true } },
      purchaseOrder: { select: { id: true, po_no: true } },
      createdBy: { select: { id: true, user_name: true } },
      confirmedBy: { select: { id: true, user_name: true } },
      items: {
        include: {
          product: {
            select: {
              id: true,
              product_name: true,
              article_code: true,
              unit_of_measure: true,
              hsn_code: true,
              hsn: {
                select: {
                  hsn_code: true,
                  cgst_rate: true,
                  sgst_rate: true,
                  igst_rate: true,
                  cess_rate: true,
                },
              },
            },
          },
          redeliveryRequests: { select: { id: true, status: true, requested_qty: true, expected_date: true } },
        },
      },
      debitCreditNotes: { select: { id: true, note_no: true, type: true, amount: true, status: true } },
    },
  });
  if (!grn) return validationResponse(0, "GRN not found");
  return validationResponse(1, "GRN fetched", grn);
};

// ─── CREATE Debit/Credit Note ─────────────────────────────────────────────────

export const createDCNService = async (payload: {
  vendor_id: number; user_id: number; grn_id: number;
  company_vendor_id: number; type: string; amount: number;
  reason: string; remarks?: string;
}) => {
  try {
    const grn = await prisma.gRNMaster.findFirst({
      where: { id: payload.grn_id, vendor_id: payload.vendor_id },
      select: { id: true },
    });
    if (!grn) return validationResponse(0, "GRN not found");
    const note_no = await genNo("dcn", payload.vendor_id);
    const dcn = await prisma.debitCreditNote.create({
      data: {
        vendor_id: payload.vendor_id, note_no, grn_id: payload.grn_id,
        company_vendor_id: payload.company_vendor_id,
        type: payload.type as any, amount: payload.amount,
        reason: payload.reason, remarks: payload.remarks,
        created_by: payload.user_id,
      },
    });
    return validationResponse(1, "Note created", { id: dcn.id, note_no: dcn.note_no });
  } catch (e) {
    console.error(e);
    return validationResponse(0, "Failed to create note");
  }
};

// ─── CREATE Redelivery Request ────────────────────────────────────────────────

export const createRedeliveryService = async (payload: {
  vendor_id: number; user_id: number; grn_item_id: number;
  company_vendor_id: number; requested_qty: number;
  expected_date?: string; remarks?: string;
}) => {
  try {
    const item = await prisma.gRNItem.findFirst({
      where: { id: payload.grn_item_id, grn: { vendor_id: payload.vendor_id } },
      select: { id: true, rejected_qty: true },
    });
    if (!item) return validationResponse(0, "GRN item not found");
    if (payload.requested_qty > parseFloat(item.rejected_qty.toString()))
      return validationResponse(0, "Requested qty cannot exceed rejected qty");

    const rd = await prisma.redeliveryRequest.create({
      data: {
        vendor_id: payload.vendor_id, grn_item_id: payload.grn_item_id,
        company_vendor_id: payload.company_vendor_id,
        requested_qty: payload.requested_qty,
        expected_date: payload.expected_date ? new Date(payload.expected_date) : null,
        remarks: payload.remarks, created_by: payload.user_id,
      },
    });
    return validationResponse(1, "Redelivery request created", { id: rd.id });
  } catch (e) {
    console.error(e);
    return validationResponse(0, "Failed to create redelivery request");
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// REPORTS
// ─────────────────────────────────────────────────────────────────────────────

// 1. Rejection Report — by vendor + item
export const rejectionReportService = async (vendor_id: number, from: string, to: string) => {
  const items = await prisma.gRNItem.findMany({
    where: {
      grn: {
        vendor_id,
        status: "Confirmed",
        received_date: { gte: new Date(from), lte: new Date(to) },
      },
      rejected_qty: { gt: 0 },
    },
    include: {
      product: { select: { id: true, product_name: true, article_code: true } },
      grn: {
        include: {
          companyVendor: { select: { id: true, company_name: true, vendor_code: true } },
          purchaseOrder: { select: { id: true, po_no: true } },
        },
      },
    },
    orderBy: [{ grn: { company_vendor_id: "asc" } }, { grn: { received_date: "desc" } }],
  });

  // Group by vendor
  const byVendor: Record<number, any> = {};
  for (const item of items) {
    const vid = item.grn.company_vendor_id;
    if (!byVendor[vid]) {
      byVendor[vid] = {
        vendor: item.grn.companyVendor,
        total_rejected: 0,
        total_received: 0,
        items: [],
      };
    }
    byVendor[vid].total_rejected += parseFloat(item.rejected_qty.toString());
    byVendor[vid].total_received += parseFloat(item.received_qty.toString());
    byVendor[vid].items.push({
      grn_no: item.grn.grn_no,
      po_no: item.grn.purchaseOrder.po_no,
      received_date: item.grn.received_date,
      product_name: item.product.product_name,
      article_code: item.product.article_code,
      received_qty: parseFloat(item.received_qty.toString()),
      accepted_qty: parseFloat(item.accepted_qty.toString()),
      rejected_qty: parseFloat(item.rejected_qty.toString()),
      rejection_reason: item.rejection_reason,
      status: item.status,
    });
  }

  const result = Object.values(byVendor).map(v => ({
    ...v,
    rejection_rate: v.total_received > 0
      ? Math.round((v.total_rejected / v.total_received) * 100 * 10) / 10 : 0,
  })).sort((a, b) => b.total_rejected - a.total_rejected);

  return validationResponse(1, "Rejection report", result);
};

// 2. Delay Report — POs where actual receipt > expected delivery date
export const delayReportService = async (vendor_id: number, from: string, to: string) => {
  const pos = await prisma.purchaseOrderMaster.findMany({
    where: {
      vendor_id,
      is_deleted: false,
      expected_delivery_date: { not: null, lte: new Date(to) },
      created_at: { gte: new Date(from) },
    },
    include: {
      companyVendor: { select: { id: true, company_name: true, vendor_code: true } },
      items: {
        select: {
          id: true, ordered_qty: true, received_qty: true, expected_delivery_date: true,
          product: { select: { product_name: true, article_code: true } },
        },
      },
      grns: {
        where: { status: "Confirmed" },
        select: { received_date: true },
        orderBy: { received_date: "asc" },
        take: 1,
      },
    },
  });

  const delayed = pos
    .filter(po => po.expected_delivery_date)
    .map(po => {
      const firstGRN = po.grns[0];
      const expectedDate = po.expected_delivery_date!;
      const actualDate = firstGRN?.received_date ?? null;
      const delayDays = actualDate
        ? Math.max(0, Math.floor((actualDate.getTime() - expectedDate.getTime()) / 86400000)) : null;
      const pendingQty = po.items.reduce((s, i) =>
        s + parseFloat(i.ordered_qty.toString()) - parseFloat(i.received_qty.toString()), 0);

      return {
        po_no: po.po_no,
        supplier: po.companyVendor,
        expected_date: expectedDate,
        actual_first_grn: actualDate,
        delay_days: delayDays,
        still_pending: pendingQty > 0,
        pending_qty: Math.max(0, pendingQty),
        status: po.status,
      };
    })
    .filter(p => p.delay_days === null || p.delay_days > 0 || p.still_pending)
    .sort((a, b) => (b.delay_days ?? 999) - (a.delay_days ?? 999));

  return validationResponse(1, "Delay report", delayed);
};

// 3. Vendor Performance Report — receipt rate, rejection rate, avg delay
export const vendorPerformanceReportService = async (vendor_id: number, from: string, to: string) => {
  const [pos, grns] = await Promise.all([
    prisma.purchaseOrderMaster.findMany({
      where: { vendor_id, is_deleted: false, created_at: { gte: new Date(from), lte: new Date(to) } },
      include: { companyVendor: { select: { id: true, company_name: true, vendor_code: true } } },
    }),
    prisma.gRNMaster.findMany({
      where: { vendor_id, status: "Confirmed", received_date: { gte: new Date(from), lte: new Date(to) } },
      include: {
        items: { select: { received_qty: true, accepted_qty: true, rejected_qty: true } },
        companyVendor: { select: { id: true, company_name: true } },
      },
    }),
  ]);

  const byVendor: Record<number, any> = {};
  for (const po of pos) {
    const vid = po.company_vendor_id;
    if (!byVendor[vid]) byVendor[vid] = { vendor: po.companyVendor, po_count: 0, fully_received: 0, delays: [], total_ordered: 0, total_received: 0, total_rejected: 0 };
    byVendor[vid].po_count++;
    if (po.status === "Received") byVendor[vid].fully_received++;
  }

  for (const grn of grns) {
    const vid = grn.company_vendor_id;
    if (!byVendor[vid]) continue;
    for (const item of grn.items) {
      byVendor[vid].total_received += parseFloat(item.received_qty.toString());
      byVendor[vid].total_accepted += parseFloat(item.accepted_qty.toString());
      byVendor[vid].total_rejected += parseFloat(item.rejected_qty.toString());
    }
  }

  return validationResponse(1, "Vendor performance report", Object.values(byVendor).map(v => ({
    vendor: v.vendor,
    po_count: v.po_count,
    fulfillment_rate: v.po_count > 0 ? Math.round((v.fully_received / v.po_count) * 100) : 0,
    total_received: v.total_received || 0,
    total_rejected: v.total_rejected || 0,
    rejection_rate: (v.total_received || 0) > 0
      ? Math.round(((v.total_rejected || 0) / v.total_received) * 100 * 10) / 10 : 0,
  })).sort((a, b) => b.po_count - a.po_count));
};

// 4. GRN Summary (dashboard stats)
export const grnSummaryService = async (
  vendor_id: number,
  from: string,
  to: string
) => {
  const [
    totalGRNs,
    confirmedGRNs,
    draftGRNs,
    itemQtySummary,
    amountSummary,
    pendingRedeliveries,
    openDCNs,
  ] = await Promise.all([
    prisma.gRNMaster.count({
      where: {
        vendor_id,
        received_date: { gte: new Date(from), lte: new Date(to) },
      },
    }),

    prisma.gRNMaster.count({
      where: {
        vendor_id,
        status: "Confirmed",
        received_date: { gte: new Date(from), lte: new Date(to) },
      },
    }),

    prisma.gRNMaster.count({
      where: {
        vendor_id,
        status: "Draft",
      },
    }),

    prisma.gRNItem.aggregate({
      where: {
        grn: {
          vendor_id,
          status: "Confirmed",
          received_date: { gte: new Date(from), lte: new Date(to) },
        },
      },
      _sum: {
        rejected_qty: true,
        received_qty: true,
        accepted_qty: true,
      },
    }),

    prisma.gRNMaster.aggregate({
      where: {
        vendor_id,
        status: "Confirmed",
        received_date: { gte: new Date(from), lte: new Date(to) },
      },
      _sum: {
        subtotal_amount: true,
        taxable_amount: true,
        cgst_amount: true,
        sgst_amount: true,
        igst_amount: true,
        cess_amount: true,
        discount_amount: true,
        packing_amount: true,
        freight_amount: true,
        other_charges_amount: true,
        roundoff_amount: true,
        total_amount: true,
      },
    }),

    prisma.redeliveryRequest.count({
      where: {
        vendor_id,
        status: { in: ["Requested", "Scheduled"] },
      },
    }),

    prisma.debitCreditNote.count({
      where: {
        vendor_id,
        status: "Open",
      },
    }),
  ]);

  const totalReceived = parseFloat(
    (itemQtySummary._sum.received_qty ?? 0).toString()
  );

  const totalRejected = parseFloat(
    (itemQtySummary._sum.rejected_qty ?? 0).toString()
  );

  const toNumber = (value: { toString(): string } | null | undefined) =>
    parseFloat((value ?? 0).toString());

  const totalTaxAmount =
    toNumber(amountSummary._sum?.cgst_amount) +
    toNumber(amountSummary._sum?.sgst_amount) +
    toNumber(amountSummary._sum?.igst_amount) +
    toNumber(amountSummary._sum?.cess_amount);

  return validationResponse(1, "GRN summary", {
    total_grns: totalGRNs,
    confirmed_grns: confirmedGRNs,
    draft_grns: draftGRNs,

    total_received: totalReceived,
    total_accepted: parseFloat(
      (itemQtySummary._sum.accepted_qty ?? 0).toString()
    ),
    total_rejected: totalRejected,

    rejection_rate:
      totalReceived > 0
        ? Math.round((totalRejected / totalReceived) * 100 * 10) / 10
        : 0,

    pending_redeliveries: pendingRedeliveries,
    open_debit_credit_notes: openDCNs,

    subtotal_amount: toNumber(amountSummary._sum?.subtotal_amount),
    taxable_amount: toNumber(amountSummary._sum?.taxable_amount),

    cgst_amount: toNumber(amountSummary._sum?.cgst_amount),
    sgst_amount: toNumber(amountSummary._sum?.sgst_amount),
    igst_amount: toNumber(amountSummary._sum?.igst_amount),
    cess_amount: toNumber(amountSummary._sum?.cess_amount),
    tax_amount: totalTaxAmount,

    discount_amount: toNumber(amountSummary._sum?.discount_amount),
    packing_amount: toNumber(amountSummary._sum?.packing_amount),
    freight_amount: toNumber(amountSummary._sum?.freight_amount),
    other_charges_amount: toNumber(amountSummary._sum?.other_charges_amount),
    roundoff_amount: toNumber(amountSummary._sum?.roundoff_amount),

    total_amount: toNumber(amountSummary._sum?.total_amount),
  });
};
