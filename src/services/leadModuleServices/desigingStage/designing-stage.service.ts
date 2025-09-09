import { prisma } from "../../../prisma/client";
import { generateSignedUrl, uploadToWasabi, uploadToWasabiMeetingDocs } from "../../../utils/wasabiClient";
import { z } from "zod";

const editDesignMeetingSchema = z.object({
  meetingId: z.number().int().positive(),
  vendorId: z.number().int().positive(),
  userId: z.number().int().positive(),
  date: z.string().datetime().optional(),
  desc: z.string().max(2000).optional(),
  files: z.array(z.any()).optional()
});

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
        siteType: {
          select: {
            id: true,
            type: true,
          },
        },
        source: {
          select: {
            id: true,
            type: true,
          },
        },
        statusType: {
          select: {
            id: true,
            type: true,
          }
        },
        // vendor: true,
        // account: true,
        assignedTo: {
          select: {
            id: true,
            user_name: true,
            user_email: true,
          },
        },

        // ✅ Include Documents
        documents: {
          where: { is_deleted: false },
          select: {
            id: true,
            doc_og_name: true,
            doc_sys_name: true,
            created_at: true,
            doc_type_id: true,
            account_id: true,
            lead_id: true,
            vendor_id: true,
            documentType: {
              select: {
                id: true,
                type: true,
              }
            },
            createdBy: {
              select: {
                id: true,
                user_name: true,
                user_contact: true,
                user_email: true,
              }
            },
          },
        },

        // ✅ Include Payments
        payments: {
          select: {
            id: true,
            amount: true,
            payment_date: true,
            payment_text: true,
            payment_file_id: true,
            created_at: true,
            created_by: true,
            document: true, // payment file
            createdBy: {
              select: {
                id: true,
                user_name: true,
                user_email: true,
                user_type: true,
              }
            },
          }
        },

        // ✅ Include Ledgers
        // ledgers: {
        //   include: {
        //     account: true,
        //     client: true,
        //     createdBy: true,
        //   },
        // },

        // ✅ Include Product Mappings → ProductType
        productMappings: {
          select: {
            productType: {
              select: {
                id: true,
                type: true,
              }
            },
          },
        },

        // ✅ Include ProductStructure Mapping → ProductStructure
        leadProductStructureMapping: {
          select: {
            productStructure: {
              select: {
                id: true,
                type: true,
              }
            },
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

  public static async getLeadById(vendorId: number, leadId: number) {
    // ✅ Fetch lead with relations
    const lead = await prisma.leadMaster.findFirst({
      where: {
        id: leadId,
        vendor_id: vendorId,
        is_deleted: false,
      },
      include: {
        siteType: {
          select: { id: true, type: true },
        },
        source: {
          select: { id: true, type: true },
        },
        statusType: {
          select: { id: true, type: true },
        },
        assignedTo: {
          select: { id: true, user_name: true, user_email: true },
        },
  
        // ✅ Include Documents
        documents: {
          where: { is_deleted: false },
          select: {
            id: true,
            doc_og_name: true,
            doc_sys_name: true,
            created_at: true,
            doc_type_id: true,
            account_id: true,
            lead_id: true,
            vendor_id: true,
            documentType: {
              select: { id: true, type: true },
            },
            createdBy: {
              select: {
                id: true,
                user_name: true,
                user_contact: true,
                user_email: true,
              },
            },
          },
        },
  
        // ✅ Include Payments
        payments: {
          select: {
            id: true,
            amount: true,
            payment_date: true,
            payment_text: true,
            payment_file_id: true,
            created_at: true,
            created_by: true,
            document: true, // payment file
            createdBy: {
              select: {
                id: true,
                user_name: true,
                user_email: true,
                user_type: true,
              },
            },
          },
        },
  
        // ✅ Include Product Mappings → ProductType
        productMappings: {
          select: {
            productType: {
              select: { id: true, type: true },
            },
          },
        },
  
        // ✅ Include ProductStructure Mapping → ProductStructure
        leadProductStructureMapping: {
          select: {
            productStructure: {
              select: { id: true, type: true },
            },
          },
        },
      },
    });
  
    if (!lead) return null;
  
    // ✅ Generate signed URLs for documents
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

    // 2. Fetch correct doc type for "quotation" using tag + vendor
    const quotationDocType = await prisma.documentTypeMaster.findFirst({
      where: {
        vendor_id: data.vendorId,
        tag: "Type 5", // ← quotation doc type tag
      },
    });

    if (!quotationDocType) {
      throw new Error("Document type for quotation not found for this vendor");
    }

    const doc = await prisma.leadDocuments.create({
      data: {
        doc_og_name: data.originalName,
        doc_sys_name: sysName,
        vendor_id: data.vendorId,
        lead_id: data.leadId,
        account_id: data.accountId,
        doc_type_id: quotationDocType.id, // ✅ design quotation type
        created_by: data.userId,
      },
    });

    return doc;
  }

  // Add this method to your DesigingStage service class

public static async getDesignQuotationDocuments(vendorId: number, leadId: number) {
  const logs: any[] = [];

  // 1️⃣ Validate lead exists and belongs to vendor
  const lead = await prisma.leadMaster.findFirst({
    where: { 
      id: leadId, 
      vendor_id: vendorId, 
      is_deleted: false 
    }
  });
  
  if (!lead) {
    throw new Error("Lead not found or access denied");
  }
  logs.push("Lead verified successfully");

  // 2️⃣ Find the document type for "design-quotation"
  const designQuotationDocType = await prisma.documentTypeMaster.findFirst({
    where: {
      vendor_id: vendorId,
      type: "design-quotation"
    }
  });

  if (!designQuotationDocType) {
    throw new Error("Design quotation document type not found for this vendor");
  }
  logs.push("Design quotation document type found");

  // 3️⃣ Fetch all design-quotation documents for the lead
  const documents = await prisma.leadDocuments.findMany({
    where: {
      lead_id: leadId,
      vendor_id: vendorId,
      doc_type_id: designQuotationDocType.id,
      is_deleted: false
    },
    orderBy: { created_at: "desc" },
    include: {
      documentType: {
        select: {
          id: true,
          type: true,
          tag: true
        }
      },
      createdBy: {
        select: {
          id: true,
          user_name: true,
          user_email: true,
          user_contact: true
        }
      },
      deletedBy: {
        select: {
          id: true,
          user_name: true,
          user_email: true
        }
      }
    }
  });

  // 4️⃣ Generate signed URLs for documents
  const documentsWithSignedUrls = await Promise.all(
    documents.map(async (doc) => {
      const signedUrl = await generateSignedUrl(doc.doc_sys_name);
      return {
        ...doc,
        signedUrl
      };
    })
  );

  logs.push(`Found ${documents.length} design quotation documents for lead ${leadId}`);

  return {
    logs,
    lead_id: leadId,
    vendor_id: vendorId,
    document_type: designQuotationDocType.type,
    total_documents: documents.length,
    documents: documentsWithSignedUrls
  };
}

  public static async editDesignMeeting(data: any) {
    // ✅ Validate incoming data
    const parsed = editDesignMeetingSchema.safeParse(data);
    if (!parsed.success) {
      throw new Error(parsed.error.issues.map(i => i.message).join(", "));
    }
    const input = parsed.data;

    const logs: any[] = [];

    // 1️⃣ Verify user belongs to vendor
    const user = await prisma.userMaster.findFirst({
      where: { id: input.userId, vendor_id: input.vendorId }
    });

    if (!user) {
      throw new Error("Unauthorized: User does not belong to this vendor");
    }
    logs.push("User verified");

    // 2️⃣ Check meeting exists and belongs to vendor
    const existingMeeting = await prisma.leadDesignMeeting.findFirst({
      where: {
        id: input.meetingId,
        vendor_id: input.vendorId
      }
    });

    if (!existingMeeting) {
      throw new Error("Design meeting not found or access denied");
    }
    logs.push("Meeting verified");

    // 3️⃣ Prepare update data
    const updateData: any = {
      updated_by: input.userId,
      updated_at: new Date()
    };

    if (input.date) {
      updateData.date = new Date(input.date);
    }

    if (input.desc !== undefined) {
      updateData.desc = input.desc;
    }

    // 4️⃣ Update the meeting
    const updatedMeeting = await prisma.leadDesignMeeting.update({
      where: { id: input.meetingId },
      data: updateData
    });
    logs.push({ meetingUpdated: updatedMeeting });

    const newDocuments: any[] = [];
    const newMappings: any[] = [];

    // 5️⃣ Handle new file uploads
    if (input.files && input.files.length > 0) {
      for (const file of input.files) {
        // Upload to Wasabi
        const sysName = await uploadToWasabiMeetingDocs(
          file.buffer,
          input.vendorId,
          existingMeeting.lead_id,
          file.originalname
        );
        logs.push({ fileUploaded: file.originalname, sysName });

        // Create LeadDocument
        const doc = await prisma.leadDocuments.create({
          data: {
            doc_og_name: file.originalname,
            doc_sys_name: sysName,
            vendor_id: input.vendorId,
            lead_id: existingMeeting.lead_id,
            account_id: existingMeeting.account_id,
            doc_type_id: 5, // design quotation
            created_by: input.userId,
          }
        });
        newDocuments.push(doc);
        logs.push({ documentCreated: doc });

        // Create mapping
        const mapping = await prisma.leadDesignMeetingDocumentsMapping.create({
          data: {
            lead_id: existingMeeting.lead_id,
            account_id: existingMeeting.account_id,
            vendor_id: input.vendorId,
            meeting_id: input.meetingId,
            document_id: doc.id,
            created_at: new Date(),
            created_by: input.userId,
          }
        });
        newMappings.push(mapping);
        logs.push({ mappingCreated: mapping });
      }
    }

    return {
      logs,
      updatedMeeting,
      newDocuments,
      newMappings
    };
  }

  public static async createDesignSelection(data: {
    lead_id: number;
    account_id: number;
    vendor_id: number;
    type: string;
    desc: string;
    created_by: number;
  }) {
    const logs: any[] = [];
  
    // 1️⃣ Validate user belongs to vendor
    const user = await prisma.userMaster.findFirst({
      where: { 
        id: data.created_by, 
        vendor_id: data.vendor_id 
      }
    });
    
    if (!user) {
      throw new Error("Unauthorized: User does not belong to this vendor");
    }
    logs.push("User verified successfully");
  
    // 2️⃣ Validate lead exists and belongs to vendor
    const lead = await prisma.leadMaster.findFirst({
      where: { 
        id: data.lead_id, 
        vendor_id: data.vendor_id, 
        is_deleted: false 
      }
    });
    
    if (!lead) {
      throw new Error("Lead not found or access denied");
    }
    logs.push("Lead verified successfully");
  
    // 3️⃣ Validate account exists
    const account = await prisma.accountMaster.findFirst({
      where: { 
        id: data.account_id,
        vendor_id: data.vendor_id,
        is_deleted: false 
      }
    });
    
    if (!account) {
      throw new Error("Account not found or access denied");
    }
    logs.push("Account verified successfully");
  
    // 4️⃣ Create design selection
    const designSelection = await prisma.leadDesignSelection.create({
      data: {
        lead_id: data.lead_id,
        account_id: data.account_id,
        vendor_id: data.vendor_id,
        type: data.type,
        desc: data.desc,
        created_by: data.created_by,
      },
      include: {
        createdBy: {
          select: {
            id: true,
            user_name: true,
            user_email: true,
          }
        },
        lead: {
          select: {
            id: true,
            firstname: true,
            lastname: true,
            contact_no: true,
          }
        },
        account: {
          select: {
            id: true,
            name: true,
          }
        }
      }
    });
  
    logs.push("Design selection created successfully");
  
    return {
      logs,
      designSelection
    };
  }
  
  public static async getDesignSelections(
    vendorId: number,
    leadId: number,
    page: number,
    limit: number
  ) {
    const logs: any[] = [];
    const skip = (page - 1) * limit;
  
    // 1️⃣ Validate lead exists and belongs to vendor
    const lead = await prisma.leadMaster.findFirst({
      where: { 
        id: leadId, 
        vendor_id: vendorId, 
        is_deleted: false 
      }
    });
    
    if (!lead) {
      throw new Error("Lead not found or access denied");
    }
    logs.push("Lead verified successfully");
  
    // 2️⃣ Fetch design selections with pagination
    const designSelections = await prisma.leadDesignSelection.findMany({
      where: {
        lead_id: leadId,
        vendor_id: vendorId,
      },
      skip,
      take: limit,
      orderBy: { created_at: "desc" },
      include: {
        createdBy: {
          select: {
            id: true,
            user_name: true,
            user_email: true,
          }
        },
        updatedBy: {
          select: {
            id: true,
            user_name: true,
            user_email: true,
          }
        },
        lead: {
          select: {
            id: true,
            firstname: true,
            lastname: true,
            contact_no: true,
            email: true,
          }
        },
        account: {
          select: {
            id: true,
            name: true,
            contact_no: true,
            email: true,
          }
        }
      }
    });
  
    // 3️⃣ Get total count for pagination
    const totalCount = await prisma.leadDesignSelection.count({
      where: {
        lead_id: leadId,
        vendor_id: vendorId,
      }
    });
  
    logs.push(`Fetched ${designSelections.length} design selections for lead ${leadId}`);
  
    const pagination = {
      total: totalCount,
      page,
      limit,
      totalPages: Math.ceil(totalCount / limit),
      hasNext: page < Math.ceil(totalCount / limit),
      hasPrev: page > 1
    };
  
    return {
      logs,
      designSelections,
      pagination
    };
  }
}