import { prisma } from "../../../prisma/client";
import { generateSignedUrl, uploadToWasabi } from "../../../utils/wasabiClient";

export class DesigingStage {

  public static async addToDesigingStage(
    lead_id: number,
    user_id: number,
    vendor_id: number
  ) {
    // 1. Check if user belongs to the same vendor
    const user = await prisma.userMaster.findFirst({
      where: { id: user_id, vendor_id },
    });

    if (!user) {
      throw new Error("Unauthorized: User does not belong to this vendor");
    }

    // 2. Check lead existence and ownership
    const lead = await prisma.leadMaster.findFirst({
      where: { id: lead_id, vendor_id, is_deleted: false },
    });

    if (!lead) {
      throw new Error("Lead not found for this vendor");
    }

    // 3. Update lead status
    const updatedLead = await prisma.leadMaster.update({
      where: { id: lead_id },
      data: { status_id: 3 }, // ✅ Set to status 3
    });

    // 4. Create log in LeadStatusLogs
    const log = await prisma.leadStatusLogs.create({
      data: {
        lead_id,
        account_id: lead.account_id,
        created_by: user_id,
        vendor_id,
        status_id: 3,
      },
    });

    return { updatedLead, log };
  }

  public static async getLeadsByStatus(
    vendorId: number,
    statusId: number,
    page: number,
    limit: number
  ) {
    const skip = (page - 1) * limit;

    // ✅ Fetch leads with relations
    const leads = await prisma.leadMaster.findMany({
      where: {
        vendor_id: vendorId,
        status_id: statusId,
        is_deleted: false,
      },
      skip,
      take: limit,
      orderBy: { created_at: "desc" },
      include: {
        vendor: true,
        siteType: true,
        source: true,
        statusType: true,
        account: true,

        // ✅ Include Documents
        documents: {
          where: { is_deleted: false },
          include: {
            documentType: true,
            createdBy: true,
          },
        },

        // ✅ Include Payments
        payments: {
          include: {
            document: true, // payment file
            createdBy: true,
          },
        },

        // ✅ Include Ledgers
        ledgers: {
          include: {
            account: true,
            client: true,
            createdBy: true,
          },
        },

        // ✅ Include Product Mappings → ProductType
        productMappings: {
          include: {
            productType: true,
          },
        },

        // ✅ Include ProductStructure Mapping → ProductStructure
        leadProductStructureMapping: {
          include: {
            productStructure: true,
          },
        },
      },
    });

    // ✅ Generate signed URLs for documents
    const leadsWithSignedUrls = await Promise.all(
      leads.map(async (lead) => {
        const docsWithUrls = await Promise.all(
          (lead.documents || []).map(async (doc) => {
            return {
              ...doc,
              signedUrl: await generateSignedUrl(doc.doc_sys_name),
            };
          })
        );

        return {
          ...lead,
          documents: docsWithUrls,
        };
      })
    );

    const total = await prisma.leadMaster.count({
      where: { vendor_id: vendorId, status_id: statusId, is_deleted: false },
    });

    return {
      leads: leadsWithSignedUrls,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  public static async uploadQuotation(data: {
    fileBuffer: Buffer;
    originalName: string;
    vendorId: number;
    leadId: number;
    userId: number;
    accountId: number;
  }) {
    const sysName = await uploadToWasabi(
      data.fileBuffer,
      data.vendorId,
      data.leadId,
      data.originalName
    );

    const doc = await prisma.leadDocuments.create({
      data: {
        doc_og_name: data.originalName,
        doc_sys_name: sysName,
        vendor_id: data.vendorId,
        lead_id: data.leadId,
        account_id: data.accountId,
        doc_type_id: 5, // ✅ design quotation type
        created_by: data.userId,
      },
    });

    return doc;
  }



}