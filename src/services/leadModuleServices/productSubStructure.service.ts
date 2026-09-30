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
            status: "active",
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

    console.log("[SERVICE] Found product sub structures", {
        count: subStructures.length,
    });

    return subStructures as ProductSubStructureType[];
};
