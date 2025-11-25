import { prisma } from "../../prisma/client";
import { PaymentTypeValue, PaymentTypeInput } from "../../types/leadModule.types";

export const addPaymentType = async (payload: PaymentTypeInput): Promise<PaymentTypeValue> => {
    console.log("[SERVICE] addPaymentType called", payload);

    // ✅ Check vendor exists
    const vendor = await prisma.vendorMaster.findUnique({
        where: { id: payload.vendor_id },
    });

    if (!vendor) {
        console.error("[SERVICE] Vendor not found", { vendor_id: payload.vendor_id });
        throw new Error("Invalid vendor_id");
    }

    // ✅ Optional: Check if tag already exists for this vendor
    const existing = await prisma.paymentTypeMaster.findFirst({
        where: {
            vendor_id: payload.vendor_id,
            tag: payload.tag,
        },
    });

    if (existing) {
        console.warn("[SERVICE] PaymentType with this tag already exists for vendor", existing);
        throw new Error("PaymentType with this tag already exists for this vendor");
    }

    // ✅ Create new document type
    const paymentType = await prisma.paymentTypeMaster.create({
        data: {
            type: payload.type,
            vendor_id: payload.vendor_id,
            tag: payload.tag,
        },
    });

    console.log("[SERVICE] PaymentType created successfully", paymentType);

    return paymentType as PaymentTypeValue;
};

export const getAllPaymentTypes = async (vendor_id: number): Promise<PaymentTypeValue[]> => {
    console.log("[SERVICE] getAllPaymentTypes called", { vendor_id });

    const vendor = await prisma.vendorMaster.findUnique({
        where: { id: vendor_id },
    });

    if (!vendor) {
        console.error("[SERVICE] Vendor not found", { vendor_id });
        throw new Error("Invalid vendor_id");
    }

    const types = await prisma.paymentTypeMaster.findMany({
        where: { vendor_id: vendor_id },
    })

    console.log("[SERVICE] Found Payment types", { count: types.length });
  return types as PaymentTypeValue[];
};

export const deletePaymentType = async (id: number): Promise<boolean> => {
    console.log("[SERVICE] deletePaymentType called", { id });

    const existing = await prisma.paymentTypeMaster.findUnique({ where: { id } });
    if (!existing) {
        console.error("[SERVICE] Payment Type not found for deletion", { id });
        throw new Error("Payment Type not found");
    }

    await prisma.paymentTypeMaster.delete({ where: { id } });
    console.log("[SERVICE] Payment Type deleted successfully", { id });

    return true;
};