import { prisma } from "../../../prisma/client";
import { ClientApprovalDto } from "../../../types/clientApproval.dto";
import { BackendData } from "../../../types/leadModule.types";
import { sanitizeFilename } from "../../../utils/sanitizeFilename";
import {
  uploadToWasabClientApprovalDocumentation,
} from "../../../utils/wasabiClient";
import { Prisma } from "@prisma/client";

export class ClientApprovalService {
  public async submitClientApproval(data: ClientApprovalDto) {
    const response: any = { screenshots: [], paymentInfo: null, ledger: null };

    // Step 1. Get DocType for approval screenshots (Type 12)
    const approvalDocType = await prisma.documentTypeMaster.findFirst({
      where: { vendor_id: data.vendor_id, tag: "Type 12" },
    });
    if (!approvalDocType)
      throw new Error(
        "Document type (Client Approval Documents) not found for this vendor"
      );

    // Upload Approval Screenshots
    for (const doc of data.approvalScreenshots) {
      const sanitized = sanitizeFilename(doc.originalname);
      const sysName = await uploadToWasabClientApprovalDocumentation(
        doc.buffer,
        data.vendor_id,
        data.lead_id,
        sanitized
      );
      const docEntry = await prisma.leadDocuments.create({
        data: {
          doc_og_name: doc.originalname,
          doc_sys_name: sysName,
          created_by: data.created_by,
          doc_type_id: approvalDocType.id,
          account_id: data.account_id,
          lead_id: data.lead_id,
          vendor_id: data.vendor_id,
        },
      });
      response.screenshots.push(docEntry);
    }

    // Step 2. Resolve status IDs
    const clientApprovalDoneStatus = await prisma.statusTypeMaster.findFirst({
      where: { vendor_id: data.vendor_id, tag: "Type 8" },
      select: { id: true },
    });
    if (!clientApprovalDoneStatus) {
      throw new Error(
        `Tech Check Status (Type 8) not found for vendor ${data.vendor_id}`
      );
    }

    // Step 3. Update lead with advance payment date + move to Type 8
    await prisma.leadMaster.update({
      where: { id: data.lead_id },
      data: {
        advance_payment_date: new Date(data.advance_payment_date),
        status_id: clientApprovalDoneStatus.id, // ✅ Move to Type 8
        updated_at: new Date(),
        updated_by: data.created_by,
      },
    });

    // Step 4. Handle Payment Info
    const paymentType = await prisma.paymentTypeMaster.findFirst({
      where: { vendor_id: data.vendor_id, tag: "Type 3" },
    });
    if (!paymentType)
      throw new Error(
        "Payment Type :- client_approval_payment (Type 3) not found for this vendor"
      );

    let paymentFileId: number | null = null;

    if (data.payment_files && data.payment_files.length > 0) {
      const uploadedDocs = [];
      for (const doc of data.payment_files) {
        const sanitized = sanitizeFilename(doc.originalname);
        const sysName = await uploadToWasabClientApprovalDocumentation(
          doc.buffer,
          data.vendor_id,
          data.lead_id,
          sanitized
        );
        const docEntry = await prisma.leadDocuments.create({
          data: {
            doc_og_name: doc.originalname,
            doc_sys_name: sysName,
            created_by: data.created_by,
            doc_type_id: approvalDocType.id,
            account_id: data.account_id,
            lead_id: data.lead_id,
            vendor_id: data.vendor_id,
          },
        });
        uploadedDocs.push(docEntry);
      }
      paymentFileId = uploadedDocs[0]?.id || null;
    }

    const paymentInfo = await prisma.paymentInfo.create({
      data: {
        lead_id: data.lead_id,
        vendor_id: data.vendor_id,
        account_id: data.account_id,
        created_by: data.created_by,
        payment_type_id: paymentType.id,
        amount: data.amount_paid,
        payment_text: data.payment_text,
        payment_file_id: paymentFileId,
        payment_date: new Date(data.advance_payment_date), // ✅ FIX applied
      },
    });

    // Step 5. Ledger Entry
    const ledger = await prisma.ledger.create({
      data: {
        lead_id: data.lead_id,
        vendor_id: data.vendor_id,
        account_id: data.account_id,
        client_id: data.client_id,
        created_by: data.created_by,
        amount: data.amount_paid,
        payment_date: new Date(data.advance_payment_date), // ✅ Already correct
        type: "credit",
      },
    });

    // Step 6. LeadUserMapping
    const leadUserMapping = await prisma.leadUserMapping.create({
      data: {
        account_id: data.account_id,
        lead_id: data.lead_id,
        vendor_id: data.vendor_id,
        user_id: data.assign_lead_to,
        type: "backend",
        status: "active",
        created_by: data.created_by,
      },
    });

    response.paymentInfo = paymentInfo;
    response.ledger = ledger;
    response.leadUserMapping = leadUserMapping;

    return response;
  }

  public async getBackendUsersByVendor(
    vendorId: number
  ): Promise<BackendData[]> {
    try {
      console.log(
        `[SERVICE] Fetching Backend Users for vendor ID: ${vendorId}`
      );

      // First, find the user type ID for 'backend'
      const BackendUserType = await prisma.userTypeMaster.findFirst({
        where: {
          user_type: {
            equals: "backend",
            mode: "insensitive", // Case insensitive search
          },
        },
      });

      if (!BackendUserType) {
        console.log("[SERVICE] Backend user type not found");
        return [];
      }

      console.log(
        `[SERVICE] Found BackendUserType type ID: ${BackendUserType.id}`
      );

      // Fetch all users with backend role for the specified vendor
      const backendUsers = await prisma.userMaster.findMany({
        where: {
          vendor_id: vendorId,
          user_type_id: BackendUserType.id,
          // Optionally filter only active users
          status: "active",
        },
        include: {
          user_type: true,
          documents: true,
        },
        orderBy: {
          created_at: "desc",
        },
      });

      console.log(`[SERVICE] Found ${backendUsers.length} Site Supervisors`);

      // Transform the data to match our interface
      const transformedData: BackendData[] = backendUsers.map((user) => ({
        id: user.id,
        vendor_id: user.vendor_id,
        user_name: user.user_name,
        user_contact: user.user_contact,
        user_email: user.user_email,
        user_timezone: user.user_timezone,
        status: user.status,
        created_at: user.created_at,
        updated_at: user.updated_at,
        user_type: {
          id: user.user_type.id,
          user_type: user.user_type.user_type,
        },
        documents: user.documents.map((doc) => ({
          id: doc.id,
          document_name: doc.document_name,
          document_number: doc.document_number,
          filename: doc.filename,
        })),
      }));

      return transformedData;
    } catch (error: any) {
      console.error("[SERVICE] Error fetching Backend Users:", error);
      throw new Error(`Failed to fetch Backend Users: ${error.message}`);
    }
  }

  public async getLeadsWithStatusClientApproval(
    vendorId: number,
    userId: number
  ) {
    // 1. Resolve status ID dynamically for Type 7
    const clientApprovalStatus = await prisma.statusTypeMaster.findFirst({
      where: { vendor_id: vendorId, tag: "Type 7" },
      select: { id: true },
    });

    if (!clientApprovalStatus) {
      throw new Error(
        `Client Approval status (Type 7) not found for vendor ${vendorId}`
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
          status_id: clientApprovalStatus.id,
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
        status_id: clientApprovalStatus.id,
        activity_status: { in: ["onGoing", "lostApproval"] }, // ✅ allow both
      },
      include: this.defaultIncludes(),
      orderBy: { created_at: Prisma.SortOrder.desc },
    });
  }

  public async getClientApprovalDetails(vendorId: number, leadId: number) {
    // Step 1. Fetch DocType for approval screenshots
    const approvalDocType = await prisma.documentTypeMaster.findFirst({
      where: { vendor_id: vendorId, tag: "Type 12" }, // Client Approval Documents
      select: { id: true },
    });

    // Step 2. Fetch Payment Info first (so we can exclude its file from screenshots)
    const paymentInfo = await prisma.paymentInfo.findFirst({
      where: { vendor_id: vendorId, lead_id: leadId },
      orderBy: { created_at: "desc" },
    });

    // Step 3. Screenshots (exclude payment_file_id if exists)
    const screenshots = approvalDocType
      ? await prisma.leadDocuments.findMany({
          where: {
            vendor_id: vendorId,
            lead_id: leadId,
            doc_type_id: approvalDocType.id,
            is_deleted: false,
            NOT: paymentInfo?.payment_file_id
              ? { id: paymentInfo.payment_file_id }
              : undefined, // 👈 Exclude payment file
          },
          orderBy: { created_at: "desc" },
        })
      : [];

    // Step 4. Fetch Payment File separately
    let paymentFile: any = null;
    if (paymentInfo?.payment_file_id) {
      paymentFile = await prisma.leadDocuments.findUnique({
        where: { id: paymentInfo.payment_file_id },
      });
    }

    // Step 5. LeadUserMapping with User details
    const leadUserMapping = await prisma.leadUserMapping.findFirst({
      where: { vendor_id: vendorId, lead_id: leadId, status: "active" },
      include: {
        user: { select: { id: true, user_name: true } },
      },
      orderBy: { created_at: "desc" },
    });

    // Step 6. LeadMaster basic details
    const leadMaster = await prisma.leadMaster.findUnique({
      where: { id: leadId, vendor_id: vendorId },
      select: {
        id: true,
        firstname: true,
        lastname: true,
        total_project_amount: true,
        advance_payment_date: true,
      },
    });

    // Merge first + last name for response
    const lead = leadMaster
      ? {
          id: leadMaster.id,
          name: `${leadMaster.firstname ?? ""} ${
            leadMaster.lastname ?? ""
          }`.trim(),
          total_project_amount: leadMaster.total_project_amount,
          advance_payment_date: leadMaster.advance_payment_date,
        }
      : null;

    return {
      lead, // ✅ added
      screenshots,
      paymentInfo,
      paymentFile, // ✅ separate
      leadUserMapping,
    };
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
      // documents: {
      //   where: { is_deleted: false },
      //   include: {
      //     documentType: { select: { id: true, type: true, tag: true } },
      //     createdBy: { select: { id: true, user_name: true } },
      //   },
      // },
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