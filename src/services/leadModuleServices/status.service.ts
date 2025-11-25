import { prisma } from "../../prisma/client";
import { StatusType, StatusTypeInput } from "../../types/leadModule.types";

export const addStatusType = async (payload: StatusTypeInput): Promise<StatusType> => {

    console.log("[SERVICE] addStatusType called", payload);

    // ✅ Check vendor exists
    const vendor = await prisma.vendorMaster.findUnique({
        where: {id: payload.vendor_id},
    })

    if(!vendor) {
        console.error("[SERVICE] Vendor not found", { vendor_id: payload.vendor_id });
        throw new Error("Invalid vendor_id");
    }

    // ✅ Create new document type
    const statusType = await prisma.statusTypeMaster.create({
        data: {
            type: payload.type,
            tag: payload.tag,
            vendor_id: payload.vendor_id,
        }
    });

    console.log("[SERVICE] StatusType created successfully", statusType);

    return statusType as StatusType;
}

export const getAllStatusTypes = async (vendor_id: number): Promise<StatusType[]> => {
    console.log("[SERVICE] getAllStatusTypes called", { vendor_id });

    const vendor = await prisma.vendorMaster.findUnique({
        where: { id: vendor_id },
    });

    if (!vendor) {
        console.error("[SERVICE] Vendor not found", { vendor_id });
        throw new Error("Invalid vendor_id");
    }

    const types = await prisma.statusTypeMaster.findMany({
        where: { vendor_id: vendor_id },
    })

    console.log("[SERVICE] Found Status types", { count: types.length });
  return types as StatusType[];
};

export const deleteStatusType = async (id: number): Promise<boolean> => {
    console.log("[SERVICE] deleteStatusType called", { id });

    const existing = await prisma.statusTypeMaster.findUnique({ where: { id } });
    if (!existing) {
        console.error("[SERVICE] Status Type not found for deletion", { id });
        throw new Error("Status Type not found");
    }

    await prisma.statusTypeMaster.delete({ where: { id } });
    console.log("[SERVICE] Status Type deleted successfully", { id });

    return true;
};