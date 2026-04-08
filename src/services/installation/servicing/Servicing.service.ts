import { prisma } from "../../../prisma/client";
import { generateSignedUrl } from "../../../utils/wasabiClient";

export class ServicingService {
  private readonly amcDocType = "AMC-contract-Documents";
  private readonly amcDocTag = "Type 39";

  async uploadAmcContractDocuments(
    vendorId: number,
    leadId: number,
    accountId: number,
    userId: number,
    files: { originalName: string; sysName: string }[],
  ) {
    const docType = await prisma.documentTypeMaster.findFirst({
      where: {
        vendor_id: vendorId,
        OR: [
          { tag: this.amcDocTag },
          { type: this.amcDocType },
        ],
      },
      select: { id: true },
    });

    if (!docType) {
      throw new Error(
        `Document Type ${this.amcDocType} / ${this.amcDocTag} not found for vendor ${vendorId}`,
      );
    }

    const uploadedDocs = [];

    for (const file of files) {
      const saved = await prisma.leadDocuments.create({
        data: {
          vendor_id: vendorId,
          account_id: accountId,
          lead_id: leadId,
          created_by: userId,
          doc_og_name: file.originalName,
          doc_sys_name: file.sysName,
          doc_type_id: docType.id,
        },
      });

      uploadedDocs.push(saved);
    }

    return uploadedDocs;
  }

  async getAmcContractDocuments(vendorId: number, leadId: number) {
    const docType = await prisma.documentTypeMaster.findFirst({
      where: {
        vendor_id: vendorId,
        OR: [
          { tag: this.amcDocTag },
          { type: this.amcDocType },
        ],
      },
      select: { id: true, tag: true },
    });

    if (!docType) {
      throw Object.assign(
        new Error("AMC contract document type not found for vendor"),
        { statusCode: 404 },
      );
    }

    const docs = await prisma.leadDocuments.findMany({
      where: {
        vendor_id: vendorId,
        lead_id: leadId,
        doc_type_id: docType.id,
        is_deleted: false,
      },
      orderBy: { created_at: "desc" },
    });

    return Promise.all(
      docs.map(async (doc) => ({
        ...doc,
        signed_url: await generateSignedUrl(doc.doc_sys_name, 3600, "inline"),
        doc_type_tag: docType.tag,
      })),
    );
  }
}
