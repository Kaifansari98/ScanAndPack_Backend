import { prisma } from "../../../prisma/client";
import { uploadToWasabClientDocumentation } from "../../../utils/wasabiClient";
import { sanitizeFilename } from "../../../utils/sanitizeFilename";
import { generateSignedUrl } from "../../../utils/wasabiClient";

interface ClientDocumentationDto {
  lead_id: number;
  vendor_id: number;
  account_id: number;
  created_by: number;
  documents: Express.Multer.File[];
}

export class ClientDocumentationService {
  public async createClientDocumentationStage(data: ClientDocumentationDto) {
    const response: any = {
      documents: [],
      message: "Client documentation stage completed successfully",
    };

    // 1. Get Document Type (Type 11)
    const docType = await prisma.documentTypeMaster.findFirst({
      where: { vendor_id: data.vendor_id, tag: "Type 11" },
    });
    if (!docType) {
      throw new Error("Document type (Client Documentation) not found for this vendor");
    }

    // 2. Upload each document → outside transaction
    for (const doc of data.documents) {
      const sanitizedName = sanitizeFilename(doc.originalname);
      const sysName = await uploadToWasabClientDocumentation(
        doc.buffer,
        data.vendor_id,
        data.lead_id,
        sanitizedName
      );

      const docEntry = await prisma.leadDocuments.create({
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

    // 3. Update lead stage (Final Measurement → Client Documentation)
    await prisma.leadMaster.update({
      where: { id: data.lead_id },
      data: {
        status_id: 6, // Client Documentation stage
        updated_at: new Date(),
        updated_by: data.created_by,
      },
    });

    return response;
  }

  public async getClientDocumentation(vendorId: number, leadId: number) {
    // 1. Get lead
    const lead = await prisma.leadMaster.findFirst({
      where: {
        id: leadId,
        vendor_id: vendorId,
        status_id: 6, // ✅ Client Documentation stage
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
      throw new Error("Document type (Client Documentation) not found for this vendor");
    }

    // 3. Filter documents of this type
    const clientDocs = lead.documents.filter(
      (doc) => doc.doc_type_id === docType.id
    );

    // 4. Attach signed URLs
    const docsWithSignedUrls = await Promise.all(
      clientDocs.map(async (doc) => ({
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
    const response: any = {
      documents: [],
      message: "Additional client documentation uploaded successfully",
    };
  
    // 1. Get Document Type (Type 11)
    const docType = await prisma.documentTypeMaster.findFirst({
      where: { vendor_id: data.vendor_id, tag: "Type 11" },
    });
    if (!docType) {
      throw new Error("Document type (Client Documentation) not found for this vendor");
    }
  
    // 2. Upload each document → outside transaction
    for (const doc of data.documents) {
      const sanitizedName = sanitizeFilename(doc.originalname);
      const sysName = await uploadToWasabClientDocumentation(
        doc.buffer,
        data.vendor_id,
        data.lead_id,
        sanitizedName
      );
  
      const docEntry = await prisma.leadDocuments.create({
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
  
    // ❌ Do NOT update status_id here
    return response;
  }
  
  public async getLeadsWithStatusClientDocumentation(vendorId: number, userId: number) {
    // ✅ Get user role
    const user = await prisma.userMaster.findUnique({
      where: { id: userId },
      include: { user_type: true },
    });

    if (!user) throw new Error("User not found");

    const role = user.user_type.user_type.toLowerCase();

    // ✅ Base where clause
    const whereClause: any = {
      status_id: 6,
      is_deleted: false,
      vendor_id: vendorId,
    };

    // ✅ Restrict based on role
    if (role === "sales-executive") {
      whereClause.OR = [
        { created_by: userId },
        { assign_to: userId },
      ];
    } else if (role === "site-supervisor") {
      // supervisor mapping table is LeadSiteSupervisorMapping
      whereClause.siteSupervisors = {
        some: { user_id: userId, status: "active" },
      };
    }
    // ✅ Admin can see all → no extra filter

    const leads = await prisma.leadMaster.findMany({
      where: whereClause,
      include: {
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
          select: {
            productStructure: { select: { id: true, type: true } },
          },
        },
      },
      orderBy: { created_at: "desc" },
    });

    return leads;
  }
  
}