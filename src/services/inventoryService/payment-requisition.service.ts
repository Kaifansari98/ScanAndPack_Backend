

import { validationResponse } from "../../utils/validationResponse"
import { prisma } from "../../prisma/client";

//const prisma = new PrismaClient();

const toDecimalNumber = (value: any) => {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
};

const addDays = (date: Date, days: number) => {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
};

const resolveDueDate = (
  triggerType: string,
  poApprovedAt: Date,
  dueAfterDays?: number | null,
  specificDate?: Date | null
) => {
  if (triggerType === "SPECIFIC_DATE" && specificDate) {
    return specificDate;
  }

  if (
    triggerType === "ADVANCE" ||
    triggerType === "ON_PO_APPROVAL"
  ) {
    return dueAfterDays ? addDays(poApprovedAt, dueAfterDays) : poApprovedAt;
  }

  if (triggerType === "AFTER_INVOICE_DAYS") {
    return dueAfterDays ? addDays(poApprovedAt, dueAfterDays) : null;
  }

  return dueAfterDays ? addDays(poApprovedAt, dueAfterDays) : null;
};

export const createPaymentSchedulesForPO = async (
  tx: any,
  poId: number,
  vendorId: number,
  userId: number
) => {
  const existingSchedules = await tx.pOPaymentSchedule.count({
    where: {
      vendor_id: vendorId,
      purchase_order_id: poId,
    },
  });

  if (existingSchedules > 0) {
    return;
  }

  const po = await tx.purchaseOrderMaster.findFirst({
    where: {
      id: poId,
      vendor_id: vendorId,
      is_deleted: false,
    },
    select: {
      id: true,
      total_amount: true,
      payment_term_id: true,
      po_no: true,
    },
  });

  if (!po) {
    throw new Error("PO not found for payment schedule");
  }

  if (!po.payment_term_id) {
    return;
  }

  const stages = await tx.paymentTermStage.findMany({
    where: {
      payment_term_id: po.payment_term_id,
    },
    orderBy: {
      stage_no: "asc",
    },
  });

  if (!stages.length) {
    return;
  }

  const poTotal = toDecimalNumber(po.total_amount);
  const now = new Date();

  for (const stage of stages) {
    const percentage = toDecimalNumber(stage.percentage);
    const fixedAmount = toDecimalNumber(stage.fixed_amount);

    const scheduledAmount =
      fixedAmount > 0
        ? fixedAmount
        : percentage > 0
          ? Number(((poTotal * percentage) / 100).toFixed(2))
          : 0;

    if (scheduledAmount <= 0) {
      continue;
    }

    const dueDate = resolveDueDate(
      stage.trigger_type,
      now,
      stage.due_after_days,
      stage.specific_date
    );

    const schedule = await tx.pOPaymentSchedule.create({
      data: {
        vendor_id: vendorId,
        purchase_order_id: poId,
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



export const listPaymentRequisitionsService = async (
  vendorId: number,
  filters: {
    status?: string;
    supplier_id?: number;
    search?: string;
    due?: "today" | "overdue" | "upcoming";
    page?: number;
    page_size?: number;
  }
) => {
  const page = Number(filters.page || 1);
  const pageSize = Number(filters.page_size || 20);
  const skip = (page - 1) * pageSize;

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  const where: any = {
    vendor_id: vendorId,
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.supplier_id
      ? {
          purchaseOrder: {
            company_vendor_id: Number(filters.supplier_id),
          },
        }
      : {}),
  };

  if (filters.due === "today") {
    where.due_date = {
      gte: todayStart,
      lte: todayEnd,
    };
  }

  if (filters.due === "overdue") {
    where.due_date = {
      lt: todayStart,
    };
    where.status = {
      in: ["Pending", "PartiallyPaid", "Overdue"],
    };
  }

  if (filters.due === "upcoming") {
    where.due_date = {
      gt: todayEnd,
    };
  }

  if (filters.search) {
    where.OR = [
      {
        purchaseOrder: {
          po_no: {
            contains: filters.search,
            mode: "insensitive",
          },
        },
      },
      {
        purchaseOrder: {
          companyVendor: {
            company_name: {
              contains: filters.search,
              mode: "insensitive",
            },
          },
        },
      },
      {
        stage_name: {
          contains: filters.search,
          mode: "insensitive",
        },
      },
    ];
  }

  const [rows, total] = await Promise.all([
    prisma.pOPaymentSchedule.findMany({
      where,
      include: {
        purchaseOrder: {
          select: {
            id: true,
            po_no: true,
            total_amount: true,
            status: true,
            companyVendor: {
              select: {
                id: true,
                company_name: true,
                vendor_code: true,
              },
            },
          },
        },
        payments: {
          orderBy: {
            payment_date: "desc",
          },
        },
      },
      orderBy: [
        {
          due_date: "asc",
        },
        {
          id: "desc",
        },
      ],
      skip,
      take: pageSize,
    }),

    prisma.pOPaymentSchedule.count({
      where,
    }),
  ]);

  return validationResponse(1, "Payment requisitions fetched", {
    rows,
    total,
    page,
    page_size: pageSize,
    total_pages: Math.ceil(total / pageSize),
  });
};

export const reschedulePaymentRequisitionService = async (
  scheduleId: number,
  vendorId: number,
  userId: number,
  newDueDate: string,
  remarks?: string
) => {
  const schedule = await prisma.pOPaymentSchedule.findFirst({
    where: {
      id: scheduleId,
      vendor_id: vendorId,
    },
  });

  if (!schedule) {
    return validationResponse(0, "Payment schedule not found");
  }

  if (schedule.status === "Paid" || schedule.status === "Cancelled") {
    return validationResponse(
      0,
      "Cannot reschedule paid or cancelled payment"
    );
  }

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.pOPaymentSchedule.update({
      where: {
        id: scheduleId,
      },
      data: {
        due_date: new Date(newDueDate),
        status: "Pending",
        remarks: remarks || schedule.remarks,
      },
    });

    await tx.pOPaymentScheduleHistory.create({
      data: {
        vendor_id: vendorId,
        po_payment_schedule_id: scheduleId,
        action: "Rescheduled",
        old_due_date: schedule.due_date,
        new_due_date: new Date(newDueDate),
        old_status: schedule.status,
        new_status: "Pending",
        remarks,
        created_by: userId,
      },
    });

    return row;
  });

  return validationResponse(1, "Payment rescheduled", updated);
};


export const markPaymentDoneService = async (
  scheduleId: number,
  vendorId: number,
  userId: number,
  payload: {
    amount: number;
    payment_date: string;
    payment_mode: "Cash" | "BankTransfer" | "Cheque" | "UPI" | "RTGS" | "NEFT";
    reference_no?: string;
    remarks?: string;
  }
) => {
  const schedule = await prisma.pOPaymentSchedule.findFirst({
    where: {
      id: scheduleId,
      vendor_id: vendorId,
    },
  });

  if (!schedule) {
    return validationResponse(0, "Payment schedule not found");
  }

  if (schedule.status === "Paid" || schedule.status === "Cancelled") {
    return validationResponse(0, "Payment already closed");
  }

  const payAmount = Number(payload.amount || 0);

  if (payAmount <= 0) {
    return validationResponse(0, "Invalid payment amount");
  }

  const pending = Number(schedule.pending_amount || 0);

  if (payAmount > pending) {
    return validationResponse(0, "Payment amount cannot exceed pending amount");
  }

  const updated = await prisma.$transaction(async (tx) => {
    const payment = await tx.pOPayment.create({
      data: {
        vendor_id: vendorId,
        po_payment_schedule_id: scheduleId,
        payment_date: new Date(payload.payment_date),
        amount: payAmount,
        payment_mode: payload.payment_mode,
        reference_no: payload.reference_no || null,
        remarks: payload.remarks || null,
        created_by: userId,
      },
    });

    const oldPaid = Number(schedule.paid_amount || 0);
    const oldPending = Number(schedule.pending_amount || 0);

    const newPaid = oldPaid + payAmount;
    const newPending = Math.max(0, oldPending - payAmount);

    const newStatus =
      newPending <= 0 ? "Paid" : "PartiallyPaid";

    const row = await tx.pOPaymentSchedule.update({
      where: {
        id: scheduleId,
      },
      data: {
        paid_amount: newPaid,
        pending_amount: newPending,
        status: newStatus,
      },
    });

    await tx.pOPaymentScheduleHistory.create({
      data: {
        vendor_id: vendorId,
        po_payment_schedule_id: scheduleId,
        action: "PaymentMarked",
        old_status: schedule.status,
        new_status: newStatus,
        paid_amount: payAmount,
        payment_id: payment.id,
        remarks: payload.remarks,
        created_by: userId,
      },
    });

    return row;
  });

  return validationResponse(1, "Payment marked successfully", updated);
};



export const getPaymentRequisitionByIdService = async (
  scheduleId: number,
  vendorId: number
) => {
  const row = await prisma.pOPaymentSchedule.findFirst({
    where: {
      id: scheduleId,
      vendor_id: vendorId,
    },
    include: {
      purchaseOrder: {
        include: {
          companyVendor: true,
          paymentTerm: true,
        },
      },
      payments: {
        orderBy: {
          payment_date: "desc",
        },
      },
      histories: {
        orderBy: {
          created_at: "desc",
        },
        include: {
          createdBy: {
            select: {
              id: true,
              user_name: true,
            },
          },
          payment: true,
        },
      },
    },
  });

  if (!row) {
    return validationResponse(0, "Payment requisition not found");
  }

  return validationResponse(1, "Payment requisition fetched", row);
};