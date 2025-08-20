import { prisma } from '../../prisma/client';
import { SiteType, SiteTypeInput } from '../../types/leadModule.types';

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
        where: { vendor_id: vendor_id },
    })

    console.log("[SERVICE] Found site types", { count: types.length });
  return types as SiteType[];
};

export const deleteSiteType = async (id: number): Promise<boolean> => {
    console.log("[SERVICE] deleteSiteType called", { id });

    const existing = await prisma.siteTypeMaster.findUnique({ where: { id } });
    if (!existing) {
        console.error("[SERVICE] SiteType not found for deletion", { id });
        throw new Error("ProductType not found");
    }

    await prisma.siteTypeMaster.delete({ where: { id } });
    console.log("[SERVICE] SiteType deleted successfully", { id });

    return true;
};