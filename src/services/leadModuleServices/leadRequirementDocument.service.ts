import { prisma } from "../../prisma/client";
import { uploadToWasabi, generateSignedUrl } from "../../utils/wasabiClient";

const DEFAULT_REQUIREMENT_DOC_TYPES = [
  { type: "Layout", tag: "LAYOUT", stage: "Requirement Details", doc_title: "Requirement Layout Document" },
  { type: "Sizes", tag: "SIZES", stage: "Requirement Details", doc_title: "Requirement Sizes Document" },
  { type: "Cutlist", tag: "CUTLIST", stage: "Requirement Details", doc_title: "Requirement Cutlist Document" },
  { type: "Drawing", tag: "DRAWING", stage: "Requirement Details", doc_title: "Requirement Drawing Document" },
];

export const getOrSeedRequirementDocumentTypes = async (vendor_id: number) => {
  if (!vendor_id) throw new Error("vendor_id is required");

  // Ensure vendor exists
  const vendor = await prisma.vendorMaster.findUnique({
    where: { id: vendor_id },
  });
  if (!vendor) throw new Error("Vendor not found");

  const existingTypes = await prisma.documentTypeMaster.findMany({
    where: {
      vendor_id,
    },
  });

  const existingTags = existingTypes.map((t: any) => String(t.tag));
  const missing = DEFAULT_REQUIREMENT_DOC_TYPES.filter((item) => !existingTags.includes(item.tag));

  if (missing.length > 0) {
    for (const item of missing) {
      await (prisma.documentTypeMaster as any).create({
        data: {
          vendor_id,
          type: item.type,
          tag: item.tag,
          stage: item.stage,
          doc_title: item.doc_title,
        },
      });
    }
  }

  // Return document types for this vendor (filtered by Requirement Details stage)
  const allDocTypes = await prisma.documentTypeMaster.findMany({
    where: {
      vendor_id,
      stage: "Requirement Details",
    },
    orderBy: { id: "asc" },
  });

  return allDocTypes;
};

export const uploadRequirementDocument = async ({
  lead_id,
  vendor_id,
  product_type_id,
  b2b_requirement_type_id,
  doc_type_id,
  stage = "Designing",
  created_by,
  file,
}: {
  lead_id: number;
  vendor_id: number;
  product_type_id?: number;
  b2b_requirement_type_id?: number;
  doc_type_id?: number;
  stage?: string;
  created_by: number;
  file: Express.Multer.File;
}) => {
  const vendor = await prisma.vendorMaster.findUnique({
    where: { id: vendor_id },
    select: { handlesLargeScaleProjects: true },
  });

  const isLargeScale = vendor?.handlesLargeScaleProjects === true;

  if (!lead_id || !vendor_id || (!isLargeScale && !product_type_id && !b2b_requirement_type_id) || !file) {
    throw new Error("Missing required parameters (lead_id, vendor_id, requirement_type_id, or file)");
  }

  // Resolve doc_type_id dynamically if stage is provided and doc_type_id is not
  let resolvedDocTypeId = doc_type_id;
  if (!resolvedDocTypeId && stage) {
    if (stage === "Designing" || stage === "stage-1-design") {
      const designDocType = await prisma.documentTypeMaster.findFirst({
        where: { vendor_id, tag: "Type 6" },
      });
      resolvedDocTypeId = designDocType?.id || undefined;
    } else if (stage === "Quotation" || stage === "design-quotation") {
      const quotationDocType = await prisma.documentTypeMaster.findFirst({
        where: { vendor_id, tag: "Type 5" },
      });
      resolvedDocTypeId = quotationDocType?.id || undefined;
    }
  }

  // Count existing non-deleted documents for this lead, requirement type, and stage
  let existingCount = 0;
  if (b2b_requirement_type_id) {
    existingCount = await prisma.leadB2BDocument.count({
      where: {
        lead_id,
        vendor_id,
        b2b_requirement_type_id,
        doc_type_id: resolvedDocTypeId || undefined,
      },
    });
  } else if (product_type_id) {
    existingCount = await prisma.leadDocuments.count({
      where: {
        lead_id,
        vendor_id,
        product_type_id,
      },
    });
  } else {
    existingCount = await prisma.leadDocuments.count({
      where: {
        lead_id,
        vendor_id,
        ...(resolvedDocTypeId ? { doc_type_id: resolvedDocTypeId } : {}),
      },
    });
  }

  // Get requirement type name
  let reqName = "";
  if (b2b_requirement_type_id) {
    const reqType = await prisma.b2BRequirementTypeMaster.findUnique({
      where: { id: b2b_requirement_type_id },
      select: { type: true },
    });
    reqName = reqType?.type?.trim().replace(/\s+/g, "_") || "";
  } else if (product_type_id) {
    const prodType = await prisma.productTypeMaster.findUnique({
      where: { id: product_type_id },
      select: { type: true },
    });
    reqName = prodType?.type?.trim().replace(/\s+/g, "_") || "";
  }

  // Split filename into base and extension
  const lastDotIndex = file.originalname.lastIndexOf(".");
  let baseName = file.originalname;
  let ext = "";
  if (lastDotIndex !== -1) {
    baseName = file.originalname.substring(0, lastDotIndex);
    ext = file.originalname.substring(lastDotIndex);
  }

  // Calculate sequential prefix: D0, D1 for Designing, Q0, Q1 for Quotation
  const stageChar = stage.trim().toUpperCase().startsWith("Q") ? "Q" : "D";
  const stagePrefix = `${stageChar}${existingCount}`;

  // Formatted original name: Q1_filename_kitchen.pdf
  let formattedOgName = file.originalname;
  if (stage && stage.trim().toLowerCase() !== "requirement") {
    formattedOgName = reqName
      ? `${stagePrefix}_${baseName}_${reqName.toLowerCase()}${ext}`
      : `${stagePrefix}_${baseName}${ext}`;
  }

  // Upload file to Wasabi / S3
  const s3Key = await uploadToWasabi(
    file.buffer,
    vendor_id,
    lead_id,
    formattedOgName
  );

  let newDocument: any;

  if (b2b_requirement_type_id) {
    // Save to dedicated LeadB2BDocument table
    newDocument = await prisma.leadB2BDocument.create({
      data: {
        doc_og_name: formattedOgName,
        doc_sys_name: s3Key,
        vendor_id,
        lead_id,
        b2b_requirement_type_id,
        created_by,
        doc_type_id: resolvedDocTypeId || undefined,
      },
      include: {
        createdBy: {
          select: {
            id: true,
            user_name: true,
            user_email: true,
          },
        },
        documentType: true,
      },
    });
  } else {
    // Save to LeadDocuments table
    const lead = await prisma.leadMaster.findUnique({
      where: { id: lead_id },
      select: { id: true, account_id: true },
    });
    newDocument = await prisma.leadDocuments.create({
      data: {
        doc_og_name: formattedOgName,
        doc_sys_name: s3Key,
        vendor_id,
        lead_id,
        account_id: lead?.account_id ?? undefined,
        doc_type_id: resolvedDocTypeId || 1,
        created_by,
        product_type_id: product_type_id || undefined,
      },
      include: {
        documentType: true,
        createdBy: {
          select: {
            id: true,
            user_name: true,
            user_email: true,
          },
        },
      },
    });
  }

  let signedUrl = "";
  try {
    signedUrl = await generateSignedUrl(newDocument.doc_sys_name, 3600, "inline");
  } catch (err) {
    console.error("Failed to generate signed URL for uploaded document", err);
  }

  return {
    ...newDocument,
    signedUrl,
  };
};

export const getRequirementDocuments = async (
  lead_id: number,
  vendor_id: number,
  product_type_id?: number,
  b2b_requirement_type_id?: number,
  stage?: string
) => {
  if (!lead_id || !vendor_id) throw new Error("lead_id and vendor_id are required");

  let documents: any[] = [];

  // Check if lead is B2B
  const lead = await prisma.leadMaster.findUnique({
    where: { id: lead_id },
    include: {
      franchise: true,
    },
  });
  const isB2b = lead?.franchise?.moduled_for_b2b ?? false;

  if (isB2b) {
    const whereClause: any = {
      lead_id,
      vendor_id,
      is_deleted: false,
    };
    if (b2b_requirement_type_id) {
      whereClause.b2b_requirement_type_id = b2b_requirement_type_id;
    }

    if (stage) {
      if (stage === "Requirement" || stage === "Requirement Details") {
        whereClause.documentType = {
          stage: "Requirement Details",
        };
      } else {
        whereClause.documentType = {
          stage: stage,
        };
      }
    } else {
      whereClause.documentType = {
        stage: "Requirement Details",
      };
    }

    documents = await prisma.leadB2BDocument.findMany({
      where: whereClause,
      include: {
        createdBy: {
          select: {
            id: true,
            user_name: true,
            user_email: true,
          },
        },
        documentType: true,
      },
      orderBy: { created_at: "desc" },
    });
  } else {
    const whereClause: any = {
      lead_id,
      vendor_id,
      is_deleted: false,
    };
    if (product_type_id) whereClause.product_type_id = product_type_id;

    if (stage) {
      if (stage === "Requirement" || stage === "Requirement Details") {
        whereClause.documentType = {
          stage: "Requirement Details",
        };
      } else {
        whereClause.documentType = {
          stage: stage,
        };
      }
    } else {
      whereClause.documentType = {
        stage: "Requirement Details",
      };
    }

    documents = await prisma.leadDocuments.findMany({
      where: whereClause,
      include: {
        documentType: true,
        createdBy: {
          select: {
            id: true,
            user_name: true,
            user_email: true,
          },
        },
      },
      orderBy: { created_at: "desc" },
    });
  }

  const docsWithUrls = await Promise.all(
    documents.map(async (doc) => {
      let signedUrl = "";
      try {
        signedUrl = await generateSignedUrl(doc.doc_sys_name, 3600, "inline");
      } catch (err) {
        console.error(`Failed to generate signed URL for document ${doc.id}`, err);
      }
      return {
        ...doc,
        signedUrl,
      };
    })
  );

  return docsWithUrls;
};

export const deleteRequirementDocument = async (document_id: number, deleted_by: number) => {
  if (!document_id) throw new Error("document_id is required");

  // Check LeadB2BDocument first
  const b2bDoc = await prisma.leadB2BDocument.findUnique({
    where: { id: document_id },
    include: {
      lead: {
        include: { franchise: true },
      },
    },
  });

  if (b2bDoc && b2bDoc.lead?.franchise?.moduled_for_b2b) {
    if (!b2bDoc.is_deleted) {
      await prisma.leadB2BDocument.update({
        where: { id: document_id },
        data: {
          is_deleted: true,
          updated_at: new Date(),
        },
      });
      return true;
    }
    throw new Error("Document already deleted");
  }

  // Check LeadDocuments
  const existing = await prisma.leadDocuments.findUnique({
    where: { id: document_id },
  });
  if (!existing || existing.is_deleted) {
    throw new Error("Document not found");
  }

  await prisma.leadDocuments.update({
    where: { id: document_id },
    data: {
      is_deleted: true,
      deleted_by,
      deleted_at: new Date(),
    },
  });

  return true;
};
