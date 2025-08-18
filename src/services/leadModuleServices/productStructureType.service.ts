import { prisma } from "../../prisma/client";
import { ProductStructureType, ProductStructureTypeInput } from "../../types/leadModule.types";

export const addProductStructureType = async (payload: ProductStructureTypeInput): Promise<ProductStructureType> => {

    console.log("[SERVICE] addProductStructureType called", payload);

    // ✅ Check vendor exists
    const vendor = await prisma.vendorMaster.findUnique({
        where: {id: payload.vendor_id},
    })

    if(!vendor) {
        console.error("[SERVICE] Vendor not found", { vendor_id: payload.vendor_id });
        throw new Error("Invalid vendor_id");
    }

    // ✅ Create new product type
    const productStructureType = await prisma.productStructure.create({
        data: {
            type: payload.type,
            vendor_id: payload.vendor_id,
        }
    });

    console.log("[SERVICE] ProductStructureType created successfully", productStructureType);

    return productStructureType as ProductStructureType;
}

export const getAllProductStructureTypes = async (vendor_id: number): Promise<ProductStructureType[]> => {
    console.log("[SERVICE] getAllProductStructureTypes called", { vendor_id });

    const vendor = await prisma.vendorMaster.findUnique({
        where: { id: vendor_id },
    });

    if (!vendor) {
        console.error("[SERVICE] Vendor not found", { vendor_id });
        throw new Error("Invalid vendor_id");
    }

    const types = await prisma.productStructure.findMany({
        where: { vendor_id: vendor_id },
    })

    console.log("[SERVICE] Found productStructure types", { count: types.length });
  return types as ProductStructureType[];
};

export const deleteProductStructureType = async (id: number): Promise<boolean> => {
    console.log("[SERVICE] deleteProductStructureType called", { id });

    const existing = await prisma.productStructure.findUnique({ where: { id } });
    if (!existing) {
        console.error("[SERVICE] productStructure not found for deletion", { id });
        throw new Error("productStructure not found");
    }

    await prisma.productStructure.delete({ where: { id } });
    console.log("[SERVICE] productStructure deleted successfully", { id });

    return true;
};