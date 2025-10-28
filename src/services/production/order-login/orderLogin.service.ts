import { prisma } from "../../../prisma/client";
import { uploadToWasabiProductionFiles } from "../../../utils/wasabiClient";

export class OrderLoginService {
  async uploadFileBreakups(vendorId: number, payload: any) {
    const {
      lead_id,
      account_id,
      item_type,
      item_desc,
      company_vendor_id,
      created_by,
    } = payload;

    // 🧾 Validation
    const missing: string[] = [];
    if (!vendorId) missing.push("vendor_id");
    if (!lead_id) missing.push("lead_id");
    if (!account_id) missing.push("account_id");
    if (!item_type) missing.push("item_type");
    if (!item_desc) missing.push("item_desc");
    if (!created_by) missing.push("created_by");

    if (missing.length > 0) {
      const error = new Error(
        `Missing required field(s): ${missing.join(", ")}`
      );
      (error as any).statusCode = 400;
      throw error;
    }

    // 🔍 Check uniqueness (item_type per lead)
    const existing = await prisma.orderLoginDetails.findFirst({
      where: {
        vendor_id: vendorId,
        lead_id: Number(lead_id),
        item_type: item_type,
        is_completed: false,
      },
    });

    if (existing) {
      const error = new Error("Item type already exists for this lead.");
      (error as any).statusCode = 409;
      throw error;
    }

    // ✅ Create record
    const newOrderLogin = await prisma.orderLoginDetails.create({
      data: {
        vendor_id: vendorId,
        lead_id: Number(lead_id),
        account_id: Number(account_id),
        item_type,
        item_desc,
        company_vendor_id: company_vendor_id ? Number(company_vendor_id) : null,
        created_by: Number(created_by),
      },
      include: {
        companyVendor: {
          select: { id: true, company_name: true },
        },
        lead: {
          select: { lead_code: true, firstname: true, lastname: true },
        },
      },
    });

    return newOrderLogin;
  }

  async getOrderLoginByLead(vendorId: number, leadId: number) {
    if (!vendorId || !leadId) {
      const error = new Error("vendor_id and lead_id are required");
      (error as any).statusCode = 400;
      throw error;
    }

    const orderLogins = await prisma.orderLoginDetails.findMany({
      where: {
        vendor_id: vendorId,
        lead_id: leadId,
      },
      orderBy: {
        created_at: "asc",
      },
      include: {
        companyVendor: {
          select: {
            id: true,
            company_name: true,
            contact_no: true,
          },
        },
      },
    });

    if (orderLogins.length === 0) {
      const error = new Error("No order login details found for this lead.");
      (error as any).statusCode = 404;
      throw error;
    }

    return orderLogins;
  }

  async updateOrderLogin(vendorId: number, orderLoginId: number, payload: any) {
    const { lead_id, item_type, item_desc, company_vendor_id, updated_by } =
      payload;

    // 🧾 Validation
    const missingFields: string[] = [];
    if (!vendorId) missingFields.push("vendor_id");
    if (!orderLoginId) missingFields.push("order_login_id");
    if (!lead_id) missingFields.push("lead_id");
    if (!item_type) missingFields.push("item_type");
    if (!item_desc) missingFields.push("item_desc");
    if (!updated_by) missingFields.push("updated_by");

    if (missingFields.length > 0) {
      const error = new Error(
        `Missing required field(s): ${missingFields.join(", ")}`
      );
      (error as any).statusCode = 400;
      throw error;
    }

    // ✅ Check if record exists
    const existing = await prisma.orderLoginDetails.findFirst({
      where: {
        id: orderLoginId,
        vendor_id: vendorId,
      },
    });

    if (!existing) {
      const error = new Error("Order login record not found.");
      (error as any).statusCode = 404;
      throw error;
    }

    // 🚫 Duplicate validation: item_type unique per lead_id
    const duplicate = await prisma.orderLoginDetails.findFirst({
      where: {
        vendor_id: vendorId,
        lead_id: Number(lead_id),
        item_type: item_type,
        NOT: { id: orderLoginId },
      },
    });

    if (duplicate) {
      const error = new Error(
        `Item type '${item_type}' already exists for this lead.`
      );
      (error as any).statusCode = 409;
      throw error;
    }

    // ✅ Update record
    const updated = await prisma.orderLoginDetails.update({
      where: { id: orderLoginId },
      data: {
        item_type,
        item_desc,
        company_vendor_id: company_vendor_id ? Number(company_vendor_id) : null,
        updated_by: Number(updated_by),
      },
    });

    return updated;
  }

  async getLeadsWithStatusOrderLogin(
    vendorId: number,
    userId: number,
    limit = 10,
    page = 1
  ) {
    const skip = (page - 1) * limit;

    // 🔹 Fetch Order Login Status (Type 9)
    const orderLoginStatus = await prisma.statusTypeMaster.findFirst({
      where: { vendor_id: vendorId, tag: "Type 9" },
      select: { id: true },
    });

    if (!orderLoginStatus) {
      throw new Error(
        `Order Login status (Type 9) not found for vendor ${vendorId}`
      );
    }

    // 🔹 Identify user role
    const creator = await prisma.userMaster.findUnique({
      where: { id: userId },
      include: { user_type: true },
    });

    const isAdmin =
      creator?.user_type?.user_type?.toLowerCase() === "admin" ||
      creator?.user_type?.user_type?.toLowerCase() === "super-admin";

    const baseWhere: any = {
      vendor_id: vendorId,
      is_deleted: false,
      status_id: orderLoginStatus.id,
      activity_status: { in: ["onGoing", "lostApproval"] },
    };

    // 🔹 If Admin → Return all leads
    if (isAdmin) {
      const [total, leads] = await Promise.all([
        prisma.leadMaster.count({ where: baseWhere }),
        prisma.leadMaster.findMany({
          where: baseWhere,
          include: this.defaultIncludes(),
          orderBy: { created_at: "desc" },
          skip,
          take: limit,
        }),
      ]);
      return { total, leads };
    }

    // 🔹 Non-admin: Fetch mapped & task-based leads
    const mappedLeads = await prisma.leadUserMapping.findMany({
      where: { vendor_id: vendorId, user_id: userId, status: "active" },
      select: { lead_id: true },
    });

    const taskLeads = await prisma.userLeadTask.findMany({
      where: {
        vendor_id: vendorId,
        OR: [{ created_by: userId }, { user_id: userId }],
      },
      select: { lead_id: true },
    });

    const leadIds = [
      ...new Set([
        ...mappedLeads.map((m) => m.lead_id),
        ...taskLeads.map((t) => t.lead_id),
      ]),
    ];

    if (!leadIds.length) return { total: 0, leads: [] };

    const where = { ...baseWhere, id: { in: leadIds } };

    const [total, leads] = await Promise.all([
      prisma.leadMaster.count({ where }),
      prisma.leadMaster.findMany({
        where,
        include: this.defaultIncludes(),
        orderBy: { created_at: "desc" },
        skip,
        take: limit,
      }),
    ]);

    return { total, leads };
  }

  // ✅ Default includes (same as techCheck)
  private defaultIncludes() {
    return {
      account: true,
      siteType: true,
      source: true,
      statusType: true,
      assignedTo: { select: { id: true, user_name: true } },
      leadProductStructureMapping: {
        include: { productStructure: true },
      },
      productMappings: {
        include: { productType: true },
      },
    };
  }

  async uploadProductionFiles(
    vendorId: number,
    leadId: number,
    accountId: number | null,
    userId: number,
    files: Express.Multer.File[]
  ) {
    if (!vendorId || !leadId || !userId) {
      const error = new Error("vendorId, leadId, and userId are required");
      (error as any).statusCode = 400;
      throw error;
    }

    if (!files || files.length === 0) {
      const error = new Error("No files provided for upload");
      (error as any).statusCode = 400;
      throw error;
    }

    const uploadedDocs = [];

    // ✅ Step 1: Upload Client Approval Screenshots
    const ProductionDocType = await prisma.documentTypeMaster.findFirst({
      where: { vendor_id: vendorId, tag: "Type 14" },
    });
    if (!ProductionDocType) throw new Error("Doc Type (Type 14) not found");

    for (const file of files) {
      // ✅ Upload to Wasabi
      const sysName = await uploadToWasabiProductionFiles(
        file.buffer,
        vendorId,
        leadId,
        file.originalname
      );

      // ✅ Store record in DB
      const savedDoc = await prisma.leadDocuments.create({
        data: {
          doc_og_name: file.originalname,
          doc_sys_name: sysName,
          created_by: userId,
          vendor_id: vendorId,
          lead_id: leadId,
          account_id: accountId || null,
          doc_type_id: ProductionDocType.id, // ✅ Type 14 = Production Files
        },
      });

      uploadedDocs.push(savedDoc);
    }

    return uploadedDocs;
  }

  async updateLeadToProductionStage({
    vendorId,
    leadId,
    accountId,
    userId,
    requiredDate,
  }: {
    vendorId: number;
    leadId: number;
    accountId: number;
    userId: number;
    requiredDate: Date;
  }) {
    // ✅ Fetch StatusTypeMaster entry for Production Stage (Type 10)
    const statusType = await prisma.statusTypeMaster.findFirst({
      where: { vendor_id: vendorId, tag: "Type 10" },
    });

    if (!statusType) {
      const error = new Error(
        "Production Stage (Type 10) not configured for this vendor."
      );
      (error as any).statusCode = 404;
      throw error;
    }

    // ✅ Update LeadMaster
    const updatedLead = await prisma.leadMaster.update({
      where: { id: leadId },
      data: {
        status_id: statusType.id,
        client_required_order_login_complition_date: requiredDate,
        updated_by: userId,
      },
      include: {
        statusType: true,
      },
    });

    // ✅ Log into LeadStatusLogs
    await prisma.leadStatusLogs.create({
      data: {
        lead_id: leadId,
        account_id: accountId,
        vendor_id: vendorId,
        status_id: statusType.id,
        created_by: userId,
      },
    });

    // ✅ Log into LeadDetailedLogs
    await prisma.leadDetailedLogs.create({
      data: {
        vendor_id: vendorId,
        lead_id: leadId,
        account_id: accountId,
        action: "Lead has been moved to Production Stage",
        action_type: "UPDATE",
        created_by: userId,
      },
    });

    return updatedLead;
  }

  async getLeadProductionReadiness(vendorId: number, leadId: number) {
    if (!vendorId || !leadId) {
      const error = new Error("vendorId and leadId are required");
      (error as any).statusCode = 400;
      throw error;
    }
  
    // --- Check required OrderLoginDetails (three items) ---
    const REQUIRED_TYPES = ["Carcass", "Shutter", "Stock Hardware"] as const;
  
    // Fetch existing item_types for this lead
    const existing = await prisma.orderLoginDetails.findMany({
      where: {
        vendor_id: vendorId,
        lead_id: leadId,
        is_completed: false, // optional; remove if you want any record regardless of completion
      },
      select: { item_type: true },
    });
  
    const presentSet = new Set(existing.map((e) => e.item_type));
    const carcass = presentSet.has("Carcass");
    const shutter = presentSet.has("Shutter");
    const stockHardware = presentSet.has("Stock Hardware");
    const allThree = carcass && shutter && stockHardware;
  
    // --- Check if at least 1 Production File (Type 14) exists ---
    const docType = await prisma.documentTypeMaster.findFirst({
      where: { vendor_id: vendorId, tag: "Type 14" },
      select: { id: true },
    });
  
    let productionFilesCount = 0;
  
    if (docType?.id) {
      productionFilesCount = await prisma.leadDocuments.count({
        where: {
          vendor_id: vendorId,
          lead_id: leadId,
          doc_type_id: docType.id,
          is_deleted: false,
        },
      });
    }
  
    const hasAnyProductionFiles = productionFilesCount > 0;
  
    // You asked for “true/false” overall; returning detailed + overall flags
    return {
      orderLogin: {
        carcass,
        shutter,
        stockHardware,
        allThree,
        missing: REQUIRED_TYPES.filter((t) => !presentSet.has(t)),
      },
      productionFiles: {
        hasAny: hasAnyProductionFiles,
        count: productionFilesCount,
        docTypeFound: Boolean(docType?.id), // helpful for diagnosing vendor setup
      },
      readyForProduction: allThree && hasAnyProductionFiles,
    };
  }
  
}
