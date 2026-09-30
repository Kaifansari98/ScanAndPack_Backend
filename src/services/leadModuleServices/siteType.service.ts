import { prisma } from '../../prisma/client';
import { SiteType, SiteTypeInput, UpdateSiteTypeInput } from '../../types/leadModule.types';

export const addSiteType = async(payload: SiteTypeInput): Promise<SiteType> => {

    console.log("[SERVICE] addSiteType called", payload);

    // ✅ Check vendor exists
    const vendor = await prisma.vendorMaster.findUnique({
        where: {id: payload.vendor_id},
    });

    if(!vendor){
        console.error("[SERVICE] Vendor not found", { vendor_id: payload.vendor_id });
        throw new Error("Invalid vendor_id");
    }

    // ✅ Create new product type
    const siteType = await prisma.siteTypeMaster.create({
        data: {
            type: payload.type,
            vendor_id: payload.vendor_id,
        }
    });

    console.log("[SERVICE] SiteType created successfully", siteType);

    return siteType as SiteType;
}

export const getAllSiteTypes = async (vendor_id: number): Promise<SiteType[]> => {
    console.log("[SERVICE] getAllSiteTypes called", { vendor_id });

    const vendor = await prisma.vendorMaster.findUnique({
        where: { id: vendor_id },
    });

    if (!vendor) {
        console.error("[SERVICE] Vendor not found", { vendor_id });
        throw new Error("Invalid vendor_id");
    }

    const types = await prisma.siteTypeMaster.findMany({
        where: { vendor_id: vendor_id, status: "active" },
    })

    console.log("[SERVICE] Found site types", { count: types.length });
  return types as SiteType[];
};

export const getAllSiteTypesForMaster = async (vendor_id: number): Promise<SiteType[]> => {
    console.log("[SERVICE] getAllSiteTypesForMaster called", { vendor_id });

    const vendor = await prisma.vendorMaster.findUnique({
        where: { id: vendor_id },
    });

    if (!vendor) {
        console.error("[SERVICE] Vendor not found", { vendor_id });
        throw new Error("Invalid vendor_id");
    }

    const types = await prisma.siteTypeMaster.findMany({
        where: { vendor_id },
        orderBy: { id: "desc" },
    });

    console.log("[SERVICE] Found site type master entries", { count: types.length });
    return types as SiteType[];
};

export const deleteSiteType = async (id: number): Promise<boolean> => {
    console.log("[SERVICE] deleteSiteType called", { id });

    const existing = await prisma.siteTypeMaster.findUnique({ where: { id } });
    if (!existing) {
        console.error("[SERVICE] SiteType not found for deletion", { id });
        throw new Error("SiteType not found");
    }

    await prisma.siteTypeMaster.delete({ where: { id } });
    console.log("[SERVICE] SiteType deleted successfully", { id });

    return true;
};

export const updateSiteTypeStatus = async (
    id: number,
    status: string
): Promise<SiteType> => {
    console.log("[SERVICE] updateSiteTypeStatus called", { id, status });

    const existing = await prisma.siteTypeMaster.findUnique({ where: { id } });
    if (!existing) {
        console.error("[SERVICE] SiteType not found for status update", { id });
        throw new Error("SiteType not found");
    }

    const updated = await prisma.siteTypeMaster.update({
        where: { id },
        data: { status },
    });

    console.log("[SERVICE] SiteType status updated successfully", updated);
    return updated as SiteType;
};

export const updateSiteType = async (
    id: number,
    payload: UpdateSiteTypeInput
): Promise<SiteType> => {
    console.log("[SERVICE] updateSiteType called", { id, payload });

    const existing = await prisma.siteTypeMaster.findUnique({ where: { id } });
    if (!existing) {
        console.error("[SERVICE] SiteType not found for edit", { id });
        throw new Error("SiteType not found");
    }

    const updated = await prisma.siteTypeMaster.update({
        where: { id },
        data: {
            type: payload.type,
        },
    });

    console.log("[SERVICE] SiteType updated successfully", updated);
    return updated as SiteType;
};
