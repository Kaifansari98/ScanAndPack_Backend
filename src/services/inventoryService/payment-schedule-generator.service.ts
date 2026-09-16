const PO_APPROVAL_TRIGGERS = [
  "ADVANCE",
  "ON_PO_APPROVAL",
  "SPECIFIC_DATE",
];

const GRN_TRIGGERS = [
  "ON_GRN",
  "ON_DELIVERY",
  "AFTER_INVOICE_DAYS",
];

const toNum = (value: any) => {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
};

const round2 = (value: number) => {
  return Number(value.toFixed(2));
};

const addDays = (date: Date, days: number) => {
  const d = new Date(date);
  d.setDate(d.getDate() + Number(days || 0));
  return d;
};

const resolveDueDate = ({
  triggerType,
  stage,
  poApprovedAt,
  grnReceivedDate,
  grnInvoiceDate,
}: {
  triggerType: string;
  stage: any;
  poApprovedAt?: Date;
  grnReceivedDate?: Date | null;
  grnInvoiceDate?: Date | null;
}) => {
  if (triggerType === "SPECIFIC_DATE") {
    return stage.specific_date || null;
  }

  if (triggerType === "ADVANCE" || triggerType === "ON_PO_APPROVAL") {
    const base = poApprovedAt || new Date();
    return stage.due_after_days ? addDays(base, stage.due_after_days) : base;
  }

  if (triggerType === "ON_GRN" || triggerType === "ON_DELIVERY") {
    const base = grnReceivedDate || new Date();
    return stage.due_after_days ? addDays(base, stage.due_after_days) : base;
  }

  if (triggerType === "AFTER_INVOICE_DAYS") {
    const base = grnInvoiceDate || grnReceivedDate || new Date();
    return stage.due_after_days ? addDays(base, stage.due_after_days) : base;
  }

  return null;
};

const calculateStageAmount = ({
  baseAmount,
  stage,
}: {
  baseAmount: number;
  stage: any;
}) => {
  const fixedAmount = toNum(stage.fixed_amount);
  const percentage = toNum(stage.percentage);

  if (fixedAmount > 0) {
    return round2(fixedAmount);
  }

  if (percentage > 0) {
    return round2((baseAmount * percentage) / 100);
  }

  return 0;
};

/**
 * Creates payment schedules on PO approval.
 * Handles:
 * - ADVANCE
 * - ON_PO_APPROVAL
 * - SPECIFIC_DATE
 */
export const createPOApprovalPaymentSchedules = async (
  tx: any,
  poId: number,
  vendorId: number,
  userId: number
) => {
  const po = await tx.purchaseOrderMaster.findFirst({
    where: {
      id: poId,
      vendor_id: vendorId,
      is_deleted: false,
    },
    select: {
      id: true,
      po_no: true,
      vendor_id: true,
      payment_term_id: true,
      total_amount: true,
    },
  });

  if (!po) {
    throw new Error("PO not found");
  }

  if (!po.payment_term_id) {
    return;
  }

  const stages = await tx.paymentTermStage.findMany({
    where: {
      payment_term_id: po.payment_term_id,
      trigger_type: {
        in: PO_APPROVAL_TRIGGERS,
      },
    },
    orderBy: {
      stage_no: "asc",
    },
  });

  if (!stages.length) {
    return;
  }

  const poTotal = toNum(po.total_amount);
  const now = new Date();

  for (const stage of stages) {
    /**
     * Avoid duplicate schedule if Approve API is retried.
     */
    const exists = await tx.pOPaymentSchedule.findFirst({
      where: {
        vendor_id: vendorId,
        purchase_order_id: poId,
        grn_id: null,
        payment_term_stage_id: stage.id,
      },
      select: {
        id: true,
      },
    });

    if (exists) {
      continue;
    }

    const scheduledAmount = calculateStageAmount({
      baseAmount: poTotal,
      stage,
    });

    if (scheduledAmount <= 0) {
      continue;
    }

    const dueDate = resolveDueDate({
      triggerType: stage.trigger_type,
      stage,
      poApprovedAt: now,
    });

    const schedule = await tx.pOPaymentSchedule.create({
      data: {
        vendor_id: vendorId,
        purchase_order_id: poId,
        grn_id: null,
        payment_term_stage_id: stage.id,

        stage_no: stage.stage_no,
        stage_name: stage.stage_name,
        trigger_type: stage.trigger_type,

        percentage: stage.percentage,
        scheduled_amount: scheduledAmount,
        paid_amount: 0,
        pending_amount: scheduledAmount,

        due_date: dueDate,
        status: "Pending",
        remarks: stage.remarks || null,
      },
    });

    await tx.pOPaymentScheduleHistory.create({
      data: {
        vendor_id: vendorId,
        po_payment_schedule_id: schedule.id,
        action: "Created",

        new_due_date: dueDate,
        new_status: "Pending",
        new_scheduled_amount: scheduledAmount,

        remarks: `Payment schedule generated on PO approval for ${po.po_no}`,
        created_by: userId,
      },
    });
  }
};

/**
 * Creates payment schedules when a GRN is confirmed.
 * Handles:
 * - ON_GRN
 * - ON_DELIVERY
 * - AFTER_INVOICE_DAYS
 *
 * For multiple GRNs, amount is calculated on GRN accepted value.
 */
export const createGRNPaymentSchedules = async (
  tx: any,
  grnId: number,
  vendorId: number,
  userId: number
) => {
  const grn = await tx.gRNMaster.findFirst({
    where: {
      id: grnId,
      vendor_id: vendorId,
    },
    select: {
      id: true,
      grn_no: true,
      purchase_order_id: true,
      received_date: true,
      invoice_date: true,
      total_amount: true,
      taxable_amount: true,
      purchaseOrder: {
        select: {
          id: true,
          po_no: true,
          payment_term_id: true,
          total_amount: true,
        },
      },
      items: {
        select: {
          accepted_qty: true,
          amount: true,
          taxable_amount: true,
          total_amount: true,
        },
      },
    },
  });

  if (!grn) {
    throw new Error("GRN not found");
  }

  const po = grn.purchaseOrder;

  if (!po?.payment_term_id) {
    return;
  }

  const stages = await tx.paymentTermStage.findMany({
    where: {
      payment_term_id: po.payment_term_id,
      trigger_type: {
        in: GRN_TRIGGERS,
      },
    },
    orderBy: {
      stage_no: "asc",
    },
  });

  if (!stages.length) {
    return;
  }

  /**
   * Prefer GRN total_amount.
   * If not present, calculate from accepted item totals.
   */
  const grnTotal =
    toNum(grn.total_amount) > 0
      ? toNum(grn.total_amount)
      : grn.items.reduce((sum: number, item: any) => {
          if (toNum(item.total_amount) > 0) return sum + toNum(item.total_amount);
          if (toNum(item.taxable_amount) > 0) return sum + toNum(item.taxable_amount);
          return sum + toNum(item.amount);
        }, 0);

  if (grnTotal <= 0) {
    return;
  }

  for (const stage of stages) {
    /**
     * Avoid duplicate schedule if Confirm GRN API is retried.
     */
    const exists = await tx.pOPaymentSchedule.findFirst({
      where: {
        vendor_id: vendorId,
        purchase_order_id: grn.purchase_order_id,
        grn_id: grn.id,
        payment_term_stage_id: stage.id,
      },
      select: {
        id: true,
      },
    });

    if (exists) {
      continue;
    }

    const scheduledAmount = calculateStageAmount({
      baseAmount: grnTotal,
      stage,
    });

    if (scheduledAmount <= 0) {
      continue;
    }

    const dueDate = resolveDueDate({
      triggerType: stage.trigger_type,
      stage,
      grnReceivedDate: grn.received_date,
      grnInvoiceDate: grn.invoice_date,
    });

    const schedule = await tx.pOPaymentSchedule.create({
      data: {
        vendor_id: vendorId,
        purchase_order_id: grn.purchase_order_id,
        grn_id: grn.id,
        payment_term_stage_id: stage.id,

        stage_no: stage.stage_no,
        stage_name: `${stage.stage_name} - ${grn.grn_no}`,
        trigger_type: stage.trigger_type,

        percentage: stage.percentage,
        scheduled_amount: scheduledAmount,
        paid_amount: 0,
        pending_amount: scheduledAmount,

        due_date: dueDate,
        status: "Pending",
        remarks: stage.remarks || null,
      },
    });

    await tx.pOPaymentScheduleHistory.create({
      data: {
        vendor_id: vendorId,
        po_payment_schedule_id: schedule.id,
        action: "Created",

        new_due_date: dueDate,
        new_status: "Pending",
        new_scheduled_amount: scheduledAmount,

        remarks: `Payment schedule generated on GRN confirmation for ${grn.grn_no}`,
        created_by: userId,
      },
    });
  }
};