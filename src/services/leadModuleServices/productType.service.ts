import { prisma } from "../../prisma/client";
import { ProductType, ProductTypeInput } from "../../types/leadModule.types";

export const addProductType = async (payload: ProductTypeInput): Promise<ProductType> => {
    console.log("[SERVICE] addProductType called", payload);

    // ✅ Check vendor exists
    const vendor = await prisma.vendorMaster.findUnique({
        where: {id: payload.vendor_id},
    })

    if(!vendor){
        console.error("[SERVICE] Vendor not found", { vendor_id: payload.vendor_id });
        throw new Error("Invalid vendor_id");
    }

    // ✅ Create new product type
    const productType = await prisma.productTypeMaster.create({
        data: {
            type: payload.type,
            vendor_id: payload.vendor_id,
        }
    });

    console.log("[SERVICE] ProductType created successfully", productType);

    return productType as ProductType;
}

export const getAllProductTypes = async (vendor_id: number): Promise<ProductType[]> => {
    console.log("[SERVICE] getAllProductTypes called", { vendor_id });

    const vendor = await prisma.vendorMaster.findUnique({
        where: { id: vendor_id },
    });

    if (!vendor) {
        console.error("[SERVICE] Vendor not found", { vendor_id });
        throw new Error("Invalid vendor_id");
    }

    const types = await prisma.productTypeMaster.findMany({
        where: { vendor_id: vendor_id },
    })

    console.log("[SERVICE] Found product types", { count: types.length });
  return types as ProductType[];
};

export const deleteProductType = async (id: number): Promise<boolean> => {
    console.log("[SERVICE] deleteProductType called", { id });

    const existing = await prisma.productTypeMaster.findUnique({ where: { id } });
    if (!existing) {
        console.error("[SERVICE] ProductType not found for deletion", { id });
        throw new Error("ProductType not found");
    }

    await prisma.productTypeMaster.delete({ where: { id } });
    console.log("[SERVICE] ProductType deleted successfully", { id });

    return true;
};