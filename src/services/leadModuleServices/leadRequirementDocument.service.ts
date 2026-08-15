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

  // Return all requirement doc types for this vendor
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
  created_by,
  file,
}: {
  lead_id: number;
  vendor_id: number;
  product_type_id?: number;
  b2b_requirement_type_id?: number;
  doc_type_id: number;
  created_by: number;
  file: Express.Multer.File;
}) => {
  const reqTypeId = b2b_requirement_type_id || product_type_id;

  if (!lead_id || !vendor_id || !reqTypeId || !doc_type_id || !file) {
    throw new Error("Missing required parameters or file");
  }

  // Find lead to get account_id if available
  const lead = await prisma.leadMaster.findUnique({
    where: { id: lead_id },
    select: { id: true, account_id: true },
  });
  if (!lead) throw new Error("Lead not found");

  // Find doc type to get tag
  const docType = await prisma.documentTypeMaster.findUnique({
    where: { id: doc_type_id },
  });
  if (!docType) throw new Error("Invalid document type");

  // Upload file to Wasabi / S3
  const s3Key = await uploadToWasabi(
    file.buffer,
    vendor_id,
    lead_id,
    file.originalname
  );

  // Save record in LeadDocuments table
  const newDocument = await prisma.leadDocuments.create({
    data: {
      doc_og_name: file.originalname,
      doc_sys_name: s3Key,
      vendor_id,
      lead_id,
      account_id: lead.account_id ?? undefined,
      b2b_requirement_type_id: reqTypeId,
      doc_type_id,
      created_by,
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

  const signedUrl = await generateSignedUrl(newDocument.doc_sys_name, 3600, "inline");

  return {
    ...newDocument,
    signedUrl,
  };
};

export const getRequirementDocuments = async (
  lead_id: number,
  vendor_id: number,
  product_type_id?: number,
  b2b_requirement_type_id?: number
) => {
  if (!lead_id || !vendor_id) throw new Error("lead_id and vendor_id are required");

  const reqTypeId = b2b_requirement_type_id || product_type_id;

  const whereClause: any = {
    lead_id,
    vendor_id,
    is_deleted: false,
    documentType: {
      tag: { in: ["LAYOUT", "SIZES", "CUTLIST", "DRAWING"] },
    },
  };

  if (reqTypeId) {
    whereClause.b2b_requirement_type_id = reqTypeId;
  }

  const documents = await prisma.leadDocuments.findMany({
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
