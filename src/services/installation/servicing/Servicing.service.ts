import { prisma } from "../../../prisma/client";
import { generateSignedUrl } from "../../../utils/wasabiClient";

export class ServicingService {
  private readonly amcDocType = "AMC-contract-Documents";
  private readonly amcDocTag = "Type 39";

  async getServiceSchedules(vendorId: number, leadId: number) {
    if (!vendorId || !leadId) {
      throw Object.assign(new Error("vendorId and leadId are required"), {
        statusCode: 400,
      });
    }

    const schedules = await prisma.leadServiceSchedule.findMany({
      where: {
        vendor_id: vendorId,
        lead_id: leadId,
        service_type: "free",
      },
      orderBy: {
        service_no: "asc",
      },
      select: {
        id: true,
        vendor_id: true,
        lead_id: true,
        account_id: true,
        service_no: true,
        service_type: true,
        scheduled_for: true,
        original_scheduled_for: true,
        status: true,
        rescheduled_once: true,
        rescheduled_from: true,
        completed_at: true,
        completion_remark: true,
        completion_document_id: true,
        rejected_at: true,
        rejection_remark: true,
        closure_reason: true,
        created_by: true,
        created_at: true,
        updated_by: true,
        updated_at: true,
        createdBy: {
          select: {
            id: true,
            user_name: true,
          },
        },
        updatedBy: {
          select: {
            id: true,
            user_name: true,
          },
        },
        completedBy: {
          select: {
            id: true,
            user_name: true,
          },
        },
        rejectedBy: {
          select: {
            id: true,
            user_name: true,
          },
        },
        completionDocument: {
          select: {
            id: true,
            doc_og_name: true,
            doc_sys_name: true,
            created_at: true,
          },
        },
      },
    });

    return Promise.all(
      schedules.map(async (schedule) => ({
        ...schedule,
        completionDocument: schedule.completionDocument
          ? {
              ...schedule.completionDocument,
              signed_url: await generateSignedUrl(
                schedule.completionDocument.doc_sys_name,
                3600,
                "inline",
              ),
            }
          : null,
      })),
    );
  }

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
