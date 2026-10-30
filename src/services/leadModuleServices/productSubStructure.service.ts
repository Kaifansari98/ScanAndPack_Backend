import { prisma } from "../../prisma/client";
import {
    ProductSubStructureInput,
    ProductSubStructureType,
} from "../../types/leadModule.types";

export const addProductSubStructure = async (
    payload: ProductSubStructureInput
): Promise<ProductSubStructureType> => {
    console.log("[SERVICE] addProductSubStructure called", payload);

    const vendor = await prisma.vendorMaster.findUnique({
        where: { id: payload.vendor_id },
    });

    if (!vendor) {
        console.error("[SERVICE] Vendor not found", { vendor_id: payload.vendor_id });
        throw new Error("Invalid vendor_id");
    }

    const productStructure = await prisma.productStructure.findFirst({
        where: {
            id: payload.product_structure_id,
            vendor_id: payload.vendor_id,
            status: "active",
            is_deleted: false,
        },
    });

    if (!productStructure) {
        console.error("[SERVICE] ProductStructure not found", {
            product_structure_id: payload.product_structure_id,
            vendor_id: payload.vendor_id,
        });
        throw new Error("Invalid product_structure_id");
    }

    const productSubStructure = await prisma.productSubStructure.create({
        data: {
            type: payload.type,
            vendor_id: payload.vendor_id,
            product_structure_id: payload.product_structure_id,
        },
        include: {
            productStructure: {
                select: {
                    id: true,
                    type: true,
                },
            },
        },
    });

    console.log("[SERVICE] ProductSubStructure created successfully", productSubStructure);
    return productSubStructure as ProductSubStructureType;
};

export const getAllProductSubStructures = async (
    vendor_id: number
): Promise<ProductSubStructureType[]> => {
    console.log("[SERVICE] getAllProductSubStructures called", { vendor_id });

    const vendor = await prisma.vendorMaster.findUnique({
        where: { id: vendor_id },
    });

    if (!vendor) {
        console.error("[SERVICE] Vendor not found", { vendor_id });
        throw new Error("Invalid vendor_id");
    }

    const subStructures = await prisma.productSubStructure.findMany({
        where: {
            vendor_id,
            is_deleted: false,
        },
        include: {
            productStructure: {
                select: {
                    id: true,
                    type: true,
                    status: true,
                    product_type_id: true,
                    productType: {
                        select: {
                            id: true,
                            type: true,
                            status: true,
                        },
                    },
                },
            },
        },
        orderBy: { id: "asc" },
    });

    console.log("[SERVICE] Found product sub structures", {
        count: subStructures.length,
    });

    return subStructures as ProductSubStructureType[];
};

export const updateProductSubStructureStatus = async (
    id: number,
    status: string
): Promise<ProductSubStructureType> => {
    console.log("[SERVICE] updateProductSubStructureStatus called", { id, status });

    const existing = await prisma.productSubStructure.findUnique({ where: { id } });
    if (!existing) {
        console.error("[SERVICE] ProductSubStructure not found for status update", { id });
        throw new Error("ProductSubStructure not found");
    }

    const updated = await prisma.productSubStructure.update({
        where: { id },
        data: { status },
        include: {
            productStructure: {
                select: {
                    id: true,
                    type: true,
                    status: true,
                    product_type_id: true,
                    productType: {
                        select: {
                            id: true,
                            type: true,
                            status: true,
                        },
                    },
                },
            },
        },
    });

    console.log("[SERVICE] ProductSubStructure status updated successfully", updated);
    return updated as ProductSubStructureType;
};
