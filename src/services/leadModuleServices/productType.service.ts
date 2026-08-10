import { prisma } from "../../prisma/client";
import { ProductType, ProductTypeInput } from "../../types/leadModule.types";

const getNextProductTypeTag = async (vendorId: number) => {
    const existingTags = await prisma.productTypeMaster.findMany({
        where: { vendor_id: vendorId },
        select: { tag: true },
    });

    const maxNumber = existingTags.reduce((max, item) => {
        const match = /^Type\s+(\d+)$/i.exec(String(item.tag || "").trim());
        const current = match ? Number(match[1]) : 0;
        return current > max ? current : max;
    }, 0);

    return `Type ${maxNumber + 1}`;
};

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

    let finalTag: string;

    const rawPayload = payload as any;
    if (rawPayload.tag && String(rawPayload.tag).trim() !== "") {
        finalTag = String(rawPayload.tag).trim().toUpperCase();
    } else if (rawPayload.is_b2b) {
        finalTag = String(payload.type).trim().toUpperCase().replace(/\s+/g, "_");
    } else {
        finalTag = await getNextProductTypeTag(payload.vendor_id);
    }

    // ✅ Create new product type
    const productType = await prisma.productTypeMaster.create({
        data: {
            type: payload.type,
            tag: finalTag,
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

export const updateProductTypeStatus = async (
    id: number,
    status: string
): Promise<ProductType> => {
    console.log("[SERVICE] updateProductTypeStatus called", { id, status });

    const existing = await prisma.productTypeMaster.findUnique({ where: { id } });
    if (!existing) {
        console.error("[SERVICE] ProductType not found for status update", { id });
        throw new Error("ProductType not found");
    }

    const updated = await prisma.productTypeMaster.update({
        where: { id },
        data: { status },
    });

    console.log("[SERVICE] ProductType status updated successfully", updated);
    return updated as ProductType;
};
