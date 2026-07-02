import { prisma } from "../../prisma/client";
import {
    ProductItemCodeInput,
    ProductItemCodeType,
} from "../../types/leadModule.types";

export const addProductItemCode = async (
    payload: ProductItemCodeInput
): Promise<ProductItemCodeType> => {
    console.log("[SERVICE] addProductItemCode called", payload);

    const vendor = await prisma.vendorMaster.findUnique({
        where: { id: payload.vendor_id },
    });

    if (!vendor) {
        console.error("[SERVICE] Vendor not found", { vendor_id: payload.vendor_id });
        throw new Error("Invalid vendor_id");
    }

    const subProductStructure = await prisma.productSubStructure.findFirst({
        where: {
            id: payload.sub_product_structure_id,
            vendor_id: payload.vendor_id,
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

    if (!subProductStructure) {
        console.error("[SERVICE] ProductSubStructure not found", {
            sub_product_structure_id: payload.sub_product_structure_id,
            vendor_id: payload.vendor_id,
        });
        throw new Error("Invalid sub_product_structure_id");
    }

    if (subProductStructure.product_structure_id !== payload.product_structure_id) {
        console.error("[SERVICE] ProductStructure mismatch for ProductSubStructure", {
            product_structure_id: payload.product_structure_id,
            sub_product_structure_id: payload.sub_product_structure_id,
            resolved_product_structure_id: subProductStructure.product_structure_id,
        });
        throw new Error(
            "product_structure_id does not match the selected sub_product_structure_id"
        );
    }

    const existing = await prisma.productItemCode.findFirst({
        where: {
            vendor_id: payload.vendor_id,
            item_code: payload.item_code,
            description: payload.description,
            specification: payload.specification,
        },
    });

    if (existing) {
        console.error("[SERVICE] ProductItemCode already exists", {
            vendor_id: payload.vendor_id,
            item_code: payload.item_code,
        });
        throw new Error(
            "An item code with the same description and specification already exists for this vendor"
        );
    }

    const itemCode = await prisma.productItemCode.create({
        data: {
            vendor_id: payload.vendor_id,
            item_code: payload.item_code,
            product_structure_id: payload.product_structure_id,
            sub_product_structure_id: payload.sub_product_structure_id,
            description: payload.description,
            specification: payload.specification,
        },
        include: {
            productStructure: {
                select: {
                    id: true,
                    type: true,
                },
            },
            subProductStructure: {
                select: {
                    id: true,
                    type: true,
                },
            },
        },
    });

    console.log("[SERVICE] ProductItemCode created successfully", itemCode);
    return itemCode as ProductItemCodeType;
};

export const getAllProductItemCodes = async (
    vendor_id: number
): Promise<ProductItemCodeType[]> => {
    console.log("[SERVICE] getAllProductItemCodes called", { vendor_id });

    const vendor = await prisma.vendorMaster.findUnique({
        where: { id: vendor_id },
    });

    if (!vendor) {
        console.error("[SERVICE] Vendor not found", { vendor_id });
        throw new Error("Invalid vendor_id");
    }

    const itemCodes = await prisma.productItemCode.findMany({
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
            subProductStructure: {
                select: {
                    id: true,
                    type: true,
                },
            },
        },
    });

    console.log("[SERVICE] Found product item codes", {
        count: itemCodes.length,
    });

    return itemCodes as ProductItemCodeType[];
};
