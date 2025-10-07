import { prisma } from "../../../prisma/client";
import { uploadToWasabClientDocumentation } from "../../../utils/wasabiClient";
import { sanitizeFilename } from "../../../utils/sanitizeFilename";
import { generateSignedUrl } from "../../../utils/wasabiClient";
import { Prisma } from "@prisma/client";
import logger from "../../../utils/logger";

interface ClientDocumentationDto {
  lead_id: number;
  vendor_id: number;
  account_id: number;
  created_by: number;
  documents: Express.Multer.File[];
}

export class ClientDocumentationService {
  public async createClientDocumentationStage(data: ClientDocumentationDto) {
    return await prisma.$transaction(async (tx: any) => {
      const response: any = {
        documents: [],
        message: "Client documentation stage completed successfully",
      };

      // 1️⃣ Get Document Type (Type 11)
      const docType = await tx.documentTypeMaster.findFirst({
        where: { vendor_id: data.vendor_id, tag: "Type 11" },
      });
      if (!docType) {
        throw new Error(
          "Document type (Client Documentation) not found for this vendor"
        );
      }

      // 2️⃣ Upload each document
      for (const doc of data.documents) {
        const sanitizedName = sanitizeFilename(doc.originalname);
        const sysName = await uploadToWasabClientDocumentation(
          doc.buffer,
          data.vendor_id,
          data.lead_id,
          sanitizedName
        );

        const docEntry = await tx.leadDocuments.create({
          data: {
            doc_og_name: doc.originalname,
            doc_sys_name: sysName,
            created_by: data.created_by,
            doc_type_id: docType.id,
            account_id: data.account_id,
            lead_id: data.lead_id,
            vendor_id: data.vendor_id,
          },
        });

        response.documents.push(docEntry);
      }

      // 3️⃣ Resolve the vendor's Client Approval status ID dynamically
      const clientApprovalStatus = await tx.statusTypeMaster.findFirst({
        where: {
          vendor_id: data.vendor_id,
          tag: "Type 7", // ✅ Client Approval
        },
        select: { id: true },
      });

      if (!clientApprovalStatus) {
        throw new Error(
          `Client Approval status (Type 7) not found for vendor ${data.vendor_id}`
        );
      }

      // 4️⃣ Update lead status (move to Client Approval)
      await tx.leadMaster.update({
        where: { id: data.lead_id },
        data: {
          status_id: clientApprovalStatus.id,
          updated_at: new Date(),
          updated_by: data.created_by,
        },
      });

      // 5️⃣ Action logging
      const docCount = response.documents.length;
      const plural = docCount > 1 ? "documents have" : "document has";
      const actionMessage = `Client Documentation stage completed successfully — ${docCount} Client Documentation ${plural} been uploaded successfully.`;

      // Create LeadDetailedLogs entry
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

      // Create LeadDocumentLogs entries
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

      // 6️⃣ Add second action log for status movement
      const statusAction = `Lead has been moved to Client Approval stage.`;
      await tx.leadDetailedLogs.create({
        data: {
          vendor_id: data.vendor_id,
          lead_id: data.lead_id,
          account_id: data.account_id,
          action: statusAction,
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
    // Resolve the vendor's Open status ID dynamically
    const clientDocumentationStatus = await prisma.statusTypeMaster.findFirst({
      where: {
        vendor_id: vendorId,
        tag: "Type 6", // ✅ Open status
      },
      select: { id: true },
    });

    if (!clientDocumentationStatus) {
      throw new Error(`Open status (Type 1) not found for vendor ${vendorId}`);
    }

    // 1. Get lead
    const lead = await prisma.leadMaster.findFirst({
      where: {
        id: leadId,
        vendor_id: vendorId,
        // status_id: clientDocumentationStatus.id, // ✅ Client Documentation stage
      },
      include: {
        documents: true,
      },
    });

    if (!lead) {
      throw new Error("Lead not found or not in Client Documentation stage");
    }

    // 2. Get doc type for Client Documentation (Type 11)
    const docType = await prisma.documentTypeMaster.findFirst({
      where: {
        vendor_id: vendorId,
        tag: "Type 11",
      },
    });

    if (!docType) {
      throw new Error(
        "Document type (Client Documentation) not found for this vendor"
      );
    }

    // 3. Filter documents of this type
    const clientDocs = lead.documents.filter(
      (doc: any) => doc.doc_type_id === docType.id
    );

    // 4. Attach signed URLs
    const docsWithSignedUrls = await Promise.all(
      clientDocs.map(async (doc: any) => ({
        ...doc,
        signed_url: await generateSignedUrl(doc.doc_sys_name, 3600, "inline"),
      }))
    );

    return {
      id: lead.id,
      vendor_id: lead.vendor_id,
      status_id: lead.status_id,
      documents: docsWithSignedUrls,
    };
  }

  public async addMoreClientDocumentation(data: ClientDocumentationDto) {
    return await prisma.$transaction(async (tx: any) => {
      const response: any = {
        documents: [],
        message: "Additional client documentation uploaded successfully",
      };

      // 1️⃣ Get Document Type (Type 11)
      const docType = await tx.documentTypeMaster.findFirst({
        where: { vendor_id: data.vendor_id, tag: "Type 11" },
      });

      if (!docType) {
        throw new Error(
          "Document type (Client Documentation) not found for this vendor"
        );
      }

      // 2️⃣ Upload documents to Wasabi and create entries
      for (const doc of data.documents) {
        const sanitizedName = sanitizeFilename(doc.originalname);
        const sysName = await uploadToWasabClientDocumentation(
          doc.buffer,
          data.vendor_id,
          data.lead_id,
          sanitizedName
        );

        const document = await tx.leadDocuments.create({
          data: {
            doc_og_name: doc.originalname,
            doc_sys_name: sysName,
            created_by: data.created_by,
            doc_type_id: docType.id,
            account_id: data.account_id,
            lead_id: data.lead_id,
            vendor_id: data.vendor_id,
          },
        });

        response.documents.push(document);
      }

      // 3️⃣ Create Action Log
      const docCount = response.documents.length;
      const plural = docCount > 1 ? "documents have" : "document has";
      const actionMessage = `${docCount} additional Client Documentation ${plural} been uploaded successfully.`;

      // Create LeadDetailedLogs entry
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

      // Create LeadDocumentLogs mapping
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
