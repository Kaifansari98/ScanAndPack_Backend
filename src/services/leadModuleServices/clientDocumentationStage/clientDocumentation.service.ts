import { prisma } from "../../../prisma/client";
import { uploadToWasabClientDocumentation } from "../../../utils/wasabiClient";
import { sanitizeFilename } from "../../../utils/sanitizeFilename";
import { generateSignedUrl } from "../../../utils/wasabiClient";
import { Prisma } from "@prisma/client";
import logger from "../../../utils/logger";
import type { Express } from "express";

export type DocTypeTag = "Type 11" | "Type 12";

export interface CustomMulterFile extends Express.Multer.File {
  docTypeTag: DocTypeTag;
}

export interface ClientDocumentationDto {
  lead_id: number;
  vendor_id: number;
  account_id: number;
  created_by: number;
  documents: CustomMulterFile[];
}

export class ClientDocumentationService {
  public async createClientDocumentationStage(data: ClientDocumentationDto) {
    // ✅ Step 1: Upload files to Wasabi (outside transaction)
    const uploadedDocs: {
      originalname: string;
      sysName: string;
      docTypeTag: "Type 11" | "Type 12";
    }[] = [];

    for (const doc of data.documents) {
      const sanitizedName = sanitizeFilename(doc.originalname);

      // Select folder based on docTypeTag
      let folder = "client_documentations";
      if (doc.docTypeTag === "Type 11") {
        folder = "client_documentations/client_documentations_ppt";
      } else if (doc.docTypeTag === "Type 12") {
        folder = "client_documentations/client_documentations_pytha";
      }

      // Upload to Wasabi
      const sysName = await uploadToWasabClientDocumentation(
        doc.buffer,
        data.vendor_id,
        data.lead_id,
        sanitizedName,
        folder
      );

      uploadedDocs.push({
        originalname: doc.originalname,
        sysName,
        docTypeTag: doc.docTypeTag,
      });
    }

    // ✅ Step 2: Run DB operations inside a short transaction
    return await prisma.$transaction(async (tx) => {
      const response: any = {
        documents: [],
        message: "Client documentation stage completed successfully",
      };

      // Insert lead documents
      for (const uploaded of uploadedDocs) {
        const docType = await tx.documentTypeMaster.findFirst({
          where: { vendor_id: data.vendor_id, tag: uploaded.docTypeTag },
        });

        if (!docType) {
          throw new Error(
            `Document type ${uploaded.docTypeTag} not found for vendor ${data.vendor_id}`
          );
        }

        const docEntry = await tx.leadDocuments.create({
          data: {
            doc_og_name: uploaded.originalname,
            doc_sys_name: uploaded.sysName,
            created_by: data.created_by,
            doc_type_id: docType.id,
            account_id: data.account_id,
            lead_id: data.lead_id,
            vendor_id: data.vendor_id,
          },
        });

        response.documents.push(docEntry);
      }

      // Find Client Approval Status (Type 7)
      const clientApprovalStatus = await tx.statusTypeMaster.findFirst({
        where: {
          vendor_id: data.vendor_id,
          tag: "Type 7",
        },
        select: { id: true },
      });

      if (!clientApprovalStatus) {
        throw new Error(
          `Client Approval status (Type 7) not found for vendor ${data.vendor_id}`
        );
      }

      // Update lead status
      await tx.leadMaster.update({
        where: { id: data.lead_id },
        data: {
          status_id: clientApprovalStatus.id,
          updated_at: new Date(),
          updated_by: data.created_by,
        },
      });

      // Add logs
      const docCount = response.documents.length;
      const plural = docCount > 1 ? "documents have" : "document has";
      const actionMessage = `Client Documentation stage completed successfully — ${docCount} Client Documentation ${plural} been uploaded successfully.`;

      const detailedLog = await tx.leadDetailedLogs.create({
        data: {
          vendor_id: data.vendor_id,
          lead_id: data.lead_id,
          account_id: data.account_id,
          action: actionMessage,
          action_type: "CREATE",
          created_by: data.created_by,
          created_at: new Date(),
        },
      });

      if (response.documents.length > 0) {
        const docLogsData = response.documents.map((doc: any) => ({
          vendor_id: data.vendor_id,
          lead_id: data.lead_id,
          account_id: data.account_id,
          doc_id: doc.id,
          lead_logs_id: detailedLog.id,
          created_by: data.created_by,
          created_at: new Date(),
        }));

        await tx.leadDocumentLogs.createMany({ data: docLogsData });
      }

      await tx.leadDetailedLogs.create({
        data: {
          vendor_id: data.vendor_id,
          lead_id: data.lead_id,
          account_id: data.account_id,
          action: `Lead has been moved to Client Approval stage.`,
          action_type: "UPDATE",
          created_by: data.created_by,
          created_at: new Date(),
        },
      });

      logger.info("✅ Client Documentation Stage completed", {
        lead_id: data.lead_id,
        vendor_id: data.vendor_id,
        document_count: docCount,
        actionMessage,
      });

      return response;
    });
  }

  public async getClientDocumentation(vendorId: number, leadId: number) {
    // 1️⃣ Validate vendor & lead
    if (!vendorId || !leadId) {
      throw new Error("vendorId and leadId are required");
    }

    // 2️⃣ Fetch the lead with all its documents
    const lead = await prisma.leadMaster.findFirst({
      where: {
        id: leadId,
        vendor_id: vendorId,
      },
      include: {
        documents: {
          include: {
            documentType: true, // To easily identify Type 11 / Type 12
          },
        },
      },
    });

    if (!lead) {
      throw new Error("Lead not found or not in Client Documentation stage");
    }

    // 3️⃣ Get document type entries for both PPT and PYTHA
    const [pptDocType, pythaDocType] = await Promise.all([
      prisma.documentTypeMaster.findFirst({
        where: { vendor_id: vendorId, tag: "Type 11" }, // PPT
      }),
      prisma.documentTypeMaster.findFirst({
        where: { vendor_id: vendorId, tag: "Type 12" }, // PYTHA
      }),
    ]);

    if (!pptDocType && !pythaDocType) {
      throw new Error(
        "Document types (Client Documentation PPT / PYTHA) not found for this vendor"
      );
    }

    // 4️⃣ Separate PPT and PYTHA documents by doc_type_id
    const pptDocs = lead.documents.filter(
      (d) => d.doc_type_id === pptDocType?.id
    );
    const pythaDocs = lead.documents.filter(
      (d) => d.doc_type_id === pythaDocType?.id
    );

    // 5️⃣ Generate signed URLs for both sets
    const [pptDocsWithUrls, pythaDocsWithUrls] = await Promise.all([
      Promise.all(
        pptDocs.map(async (doc: any) => ({
          ...doc,
          signed_url: await generateSignedUrl(doc.doc_sys_name, 3600, "inline"),
        }))
      ),
      Promise.all(
        pythaDocs.map(async (doc: any) => ({
          ...doc,
          signed_url: await generateSignedUrl(doc.doc_sys_name, 3600, "inline"),
        }))
      ),
    ]);

    // 6️⃣ Return structured response
    return {
      id: lead.id,
      vendor_id: lead.vendor_id,
      status_id: lead.status_id,
      documents: {
        ppt: pptDocsWithUrls,
        pytha: pythaDocsWithUrls,
      },
    };
  }

  public async addMoreClientDocumentation(data: ClientDocumentationDto) {
    // Upload outside transaction
    const uploadedDocs: {
      originalname: string;
      sysName: string;
      docTypeTag: "Type 11" | "Type 12";
    }[] = [];

    for (const doc of data.documents) {
      const sanitizedName = sanitizeFilename(doc.originalname);

      let folder = "client_documentations";
      if (doc.docTypeTag === "Type 11") {
        folder = "client_documentations/client_documentations_ppt";
      } else if (doc.docTypeTag === "Type 12") {
        folder = "client_documentations/client_documentations_pytha";
      }

      const sysName = await uploadToWasabClientDocumentation(
        doc.buffer,
        data.vendor_id,
        data.lead_id,
        sanitizedName,
        folder
      );

      uploadedDocs.push({
        originalname: doc.originalname,
        sysName,
        docTypeTag: doc.docTypeTag,
      });
    }

    // DB Transaction
    return await prisma.$transaction(async (tx) => {
      const response: any = {
        documents: [],
        message: "Additional client documentation uploaded successfully",
      };

      for (const uploaded of uploadedDocs) {
        const docType = await tx.documentTypeMaster.findFirst({
          where: { vendor_id: data.vendor_id, tag: uploaded.docTypeTag },
        });

        const docEntry = await tx.leadDocuments.create({
          data: {
            doc_og_name: uploaded.originalname,
            doc_sys_name: uploaded.sysName,
            created_by: data.created_by,
            doc_type_id: docType?.id!,
            account_id: data.account_id,
            lead_id: data.lead_id,
            vendor_id: data.vendor_id,
          },
        });

        response.documents.push(docEntry);
      }

      const docCount = response.documents.length;
      const plural = docCount > 1 ? "documents have" : "document has";
      const actionMessage = `${docCount} additional Client Documentation ${plural} been uploaded successfully.`;

      const detailedLog = await tx.leadDetailedLogs.create({
        data: {
          vendor_id: data.vendor_id,
          lead_id: data.lead_id,
          account_id: data.account_id,
          action: actionMessage,
          action_type: "CREATE",
          created_by: data.created_by,
          created_at: new Date(),
        },
      });

      const docLogsData = response.documents.map((doc: any) => ({
        vendor_id: data.vendor_id,
        lead_id: data.lead_id,
        account_id: data.account_id,
        doc_id: doc.id,
        lead_logs_id: detailedLog.id,
        created_by: data.created_by,
        created_at: new Date(),
      }));

      await tx.leadDocumentLogs.createMany({ data: docLogsData });

      logger.info("✅ Additional Client Documentation uploaded", {
        vendor_id: data.vendor_id,
        lead_id: data.lead_id,
        docCount,
        actionMessage,
      });

      return response;
    });
  }

  public async getLeadsWithStatusClientDocumentation(
    vendorId: number,
    userId: number
  ) {
    // 1. Resolve status ID dynamically for Type 6
    const clientDocStatus = await prisma.statusTypeMaster.findFirst({
      where: { vendor_id: vendorId, tag: "Type 6" },
      select: { id: true },
    });

    if (!clientDocStatus) {
      throw new Error(
        `Client Documentation status (Type 6) not found for vendor ${vendorId}`
      );
    }

    // 2. Check if user is admin
    const creator = await prisma.userMaster.findUnique({
      where: { id: userId },
      include: { user_type: true },
    });
    const isAdmin = creator?.user_type?.user_type?.toLowerCase() === "admin";

    // ============= Admin Flow =============
    if (isAdmin) {
      return prisma.leadMaster.findMany({
        where: {
          vendor_id: vendorId,
          is_deleted: false,
          status_id: clientDocStatus.id,
          activity_status: { in: ["onGoing", "lostApproval"] }, // ✅ allow both
        },
        include: this.defaultIncludes(),
        orderBy: { created_at: Prisma.SortOrder.desc },
      });
    }

    // ============= Non-Admin Flow =============
    // Leads via LeadUserMapping
    const mappedLeads = await prisma.leadUserMapping.findMany({
      where: { vendor_id: vendorId, user_id: userId, status: "active" },
      select: { lead_id: true },
    });

    // Leads via UserLeadTask
    const taskLeads = await prisma.userLeadTask.findMany({
      where: {
        vendor_id: vendorId,
        OR: [{ created_by: userId }, { user_id: userId }],
      },
      select: { lead_id: true },
    });

    // ✅ Union
    const leadIds = [
      ...new Set([
        ...mappedLeads.map((m) => m.lead_id),
        ...taskLeads.map((t) => t.lead_id),
      ]),
    ];
    if (!leadIds.length) return [];

    return prisma.leadMaster.findMany({
      where: {
        id: { in: leadIds },
        vendor_id: vendorId,
        is_deleted: false,
        status_id: clientDocStatus.id,
        activity_status: { in: ["onGoing", "lostApproval"] }, // ✅ allow both
      },
      include: this.defaultIncludes(),
      orderBy: { created_at: Prisma.SortOrder.desc },
    });
  }

  // ✅ Common include
  private defaultIncludes() {
    return {
      siteType: true,
      source: true,
      statusType: true,
      createdBy: { select: { id: true, user_name: true } },
      updatedBy: true,
      assignedTo: { select: { id: true, user_name: true } },
      assignedBy: { select: { id: true, user_name: true } },
      productMappings: {
        select: {
          productType: { select: { id: true, type: true, tag: true } },
        },
      },
      leadProductStructureMapping: {
        select: { productStructure: { select: { id: true, type: true } } },
      },
      documents: {
        where: { is_deleted: false },
        include: {
          documentType: { select: { id: true, type: true, tag: true } },
          createdBy: { select: { id: true, user_name: true } },
        },
      },
      tasks: {
        where: { task_type: "Follow Up" },
        select: {
          id: true,
          task_type: true,
          due_date: true,
          remark: true,
          status: true,
          created_at: true,
        },
        orderBy: { created_at: Prisma.SortOrder.desc }, // ✅ fixed typing
      },
    };
  }
}
