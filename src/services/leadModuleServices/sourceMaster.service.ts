import { prisma } from '../../prisma/client';
import { SourceType, SourceTypeInput } from '../../types/leadModule.types';

export const addSourceType = async (payload: SourceTypeInput): Promise<SourceType> => {
    console.log("[SERVICE] addSourceType called", payload);

    // ✅ Check vendor exists
    const vendor = await prisma.vendorMaster.findUnique({
        where: {id: payload.vendor_id},
    });

    if(!vendor) {
        console.error("[SERVICE] Vendor not found", { vendor_id: payload.vendor_id });
        throw new Error("Invalid vendor_id");
    }

    // ✅ Create new source type
    const sourceType = await prisma.sourceMaster.create({
        data: {
            type: payload.type,
            vendor_id: payload.vendor_id,
        }
    });

    console.log("[SERVICE] SourceType created successfully", sourceType);

    return sourceType as SourceType;
}

export const getAllSourceTypes = async (vendor_id: number): Promise<SourceType[]> => {
    console.log("[SERVICE] getAllSourceTypes called", { vendor_id });

    const vendor = await prisma.vendorMaster.findUnique({
        where: { id: vendor_id },
    });

    if (!vendor) {
        console.error("[SERVICE] Vendor not found", { vendor_id });
        throw new Error("Invalid vendor_id");
    }

    const types = await prisma.sourceMaster.findMany({
        where: { vendor_id: vendor_id },
    })

    console.log("[SERVICE] Found source types", { count: types.length });
  return types as SourceType[];
};

export const deleteSourceType = async (id: number): Promise<boolean> => {
    console.log("[SERVICE] deleteSourceType called", { id });

    const existing = await prisma.sourceMaster.findUnique({ where: { id } });
    if (!existing) {
        console.error("[SERVICE] Source not found for deletion", { id });
        throw new Error("Source not found");
    }

    await prisma.sourceMaster.delete({ where: { id } });
    console.log("[SERVICE] Source deleted successfully", { id });

    return true;
};