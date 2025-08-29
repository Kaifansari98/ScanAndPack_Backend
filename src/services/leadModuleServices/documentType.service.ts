import { prisma } from "../../prisma/client";
import { DocumentTypeValue, DocumentTypeInput } from "../../types/leadModule.types";

export const addDocumentType = async (payload: DocumentTypeInput): Promise<DocumentTypeValue> => {

    console.log("[SERVICE] addDocumentType called", payload);

    // ✅ Check vendor exists
    const vendor = await prisma.vendorMaster.findUnique({
        where: {id: payload.vendor_id},
    })

    if(!vendor) {
        console.error("[SERVICE] Vendor not found", { vendor_id: payload.vendor_id });
        throw new Error("Invalid vendor_id");
    }

    // ✅ Create new document type
    const documentType = await prisma.documentTypeMaster.create({
        data: {
            type: payload.type,
            vendor_id: payload.vendor_id,
        }
    });

    console.log("[SERVICE] DocumentType created successfully", documentType);

    return documentType as DocumentTypeValue;
}

export const getAllDocumentTypes = async (vendor_id: number): Promise<DocumentTypeValue[]> => {
    console.log("[SERVICE] getAllDocumentTypes called", { vendor_id });

    const vendor = await prisma.vendorMaster.findUnique({
        where: { id: vendor_id },
    });

    if (!vendor) {
        console.error("[SERVICE] Vendor not found", { vendor_id });
        throw new Error("Invalid vendor_id");
    }

    const types = await prisma.documentTypeMaster.findMany({
        where: { vendor_id: vendor_id },
    })

    console.log("[SERVICE] Found Document types", { count: types.length });
  return types as DocumentTypeValue[];
};

export const deleteDocumentType = async (id: number): Promise<boolean> => {
    console.log("[SERVICE] deleteDocumentType called", { id });

    const existing = await prisma.documentTypeMaster.findUnique({ where: { id } });
    if (!existing) {
        console.error("[SERVICE] Document Type not found for deletion", { id });
        throw new Error("Document Type not found");
    }

    await prisma.documentTypeMaster.delete({ where: { id } });
    console.log("[SERVICE] Document Type deleted successfully", { id });

    return true;
};