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

    let resolvedParent = payload.parent ?? null;
    let resolvedProductTypeId: number | null = payload.product_type_id ?? null;

    if (resolvedProductTypeId) {
        const productType = await prisma.productTypeMaster.findFirst({
            where: {
                id: resolvedProductTypeId,
                vendor_id: payload.vendor_id,
                status: "active",
            },
        });

        if (!productType) {
            console.error("[SERVICE] Product type not found", {
                product_type_id: resolvedProductTypeId,
                vendor_id: payload.vendor_id,
            });
            throw new Error("Invalid product_type_id");
        }

        resolvedParent = productType.type;
        resolvedProductTypeId = productType.id;
    }

    // ✅ Create new product type
    const productStructureType = await prisma.productStructure.create({
        data: {
            type: payload.type,
            parent: resolvedParent,
            vendor_id: payload.vendor_id,
            product_type_id: resolvedProductTypeId,
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
        where: { vendor_id: vendor_id, status: "active" },
        include: {
            productType: {
                select: {
                    id: true,
                    type: true,
                },
            },
        },
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

export const updateProductStructureTypeParent = async (
    id: number,
    parent: string
): Promise<ProductStructureType> => {
    console.log("[SERVICE] updateProductStructureTypeParent called", { id, parent });

    const existing = await prisma.productStructure.findUnique({ where: { id } });
    if (!existing) {
        console.error("[SERVICE] productStructure not found for update", { id });
        throw new Error("productStructure not found");
    }

    const updated = await prisma.productStructure.update({
        where: { id },
        data: { parent },
    });

    console.log("[SERVICE] ProductStructure parent updated successfully", updated);
    return updated as ProductStructureType;
};
