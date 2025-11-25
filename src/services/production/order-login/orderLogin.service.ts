import { prisma } from "../../../prisma/client";
import { uploadToWasabiProductionFiles } from "../../../utils/wasabiClient";

// 🧩 Define this at the top of your service file

interface BackendData {
  id: number;
  vendor_id: number;
  user_name: string;
  user_contact: string | null;
  user_email: string | null;
  user_timezone: string | null;
  status: string;
  created_at: Date;
  updated_at: Date;
  user_type: {
    id: number;
    user_type: string;
  };
  documents: {
    id: number;
    document_name: string | null;
    document_number: string | null;
    filename: string | null;
  }[];
}

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

  async uploadMultipleFileBreakupsByLead(
    vendorId: number,
    leadId: number,
    accountId: number,
    breakups: any[]
  ) {
    if (!vendorId || !leadId)
      throw Object.assign(new Error("vendorId and leadId are required"), {
        statusCode: 400,
      });

    if (!Array.isArray(breakups) || breakups.length === 0)
      throw Object.assign(new Error("breakups array is required"), {
        statusCode: 400,
      });

    const results = [];
    const errors = [];

    for (const [index, payload] of breakups.entries()) {
      try {
        const { item_type, item_desc, company_vendor_id, created_by } = payload;

        // validation
        const missing = [];
        if (!item_type) missing.push("item_type");
        if (!item_desc) missing.push("item_desc");
        if (!created_by) missing.push("created_by");
        if (missing.length)
          throw new Error(
            `Missing field(s) in record #${index + 1}: ${missing.join(", ")}`
          );

        // duplicate check
        const existing = await prisma.orderLoginDetails.findFirst({
          where: {
            vendor_id: vendorId,
            lead_id: leadId,
            item_type,
            is_completed: false,
          },
        });

        if (existing)
          throw new Error(
            `Item type '${item_type}' already exists for lead ${leadId}`
          );

        // create record
        const record = await prisma.orderLoginDetails.create({
          data: {
            vendor_id: vendorId,
            lead_id: leadId,
            account_id: accountId,
            item_type,
            item_desc,
            company_vendor_id: company_vendor_id
              ? Number(company_vendor_id)
              : null,
            created_by: Number(created_by),
          },
        });

        results.push(record);
      } catch (err: any) {
        errors.push({ index, message: err.message });
      }
    }

    return { results, errors };
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

  async updateMultipleOrderLogins(
    vendorId: number,
    leadId: number,
    updates: any[]
  ) {
    if (!vendorId || !leadId)
      throw Object.assign(new Error("vendorId and leadId are required"), {
        statusCode: 400,
      });

    if (!Array.isArray(updates) || updates.length === 0)
      throw Object.assign(new Error("updates array is required"), {
        statusCode: 400,
      });

    const results = [];
    const errors = [];

    for (const [index, payload] of updates.entries()) {
      try {
        const { id, item_type, item_desc, company_vendor_id, updated_by } =
          payload;

        const missing = [];
        if (!id) missing.push("id");
        if (!item_type) missing.push("item_type");
        if (!item_desc) missing.push("item_desc");
        if (!updated_by) missing.push("updated_by");
        if (missing.length)
          throw new Error(
            `Missing field(s) in record #${index + 1}: ${missing.join(", ")}`
          );

        // Check if record exists
        const existing = await prisma.orderLoginDetails.findFirst({
          where: { id: Number(id), vendor_id: vendorId },
        });

        if (!existing)
          throw new Error(
            `Order login record #${id} not found for vendor ${vendorId}`
          );

        // Duplicate check (unique item_type per lead)
        const duplicate = await prisma.orderLoginDetails.findFirst({
          where: {
            vendor_id: vendorId,
            lead_id: leadId,
            item_type,
            NOT: { id: Number(id) },
          },
        });

        if (duplicate)
          throw new Error(
            `Item type '${item_type}' already exists for this lead. (record #${id})`
          );

        // Update
        const updated = await prisma.orderLoginDetails.update({
          where: { id: Number(id) },
          data: {
            item_type,
            item_desc,
            company_vendor_id: company_vendor_id
              ? Number(company_vendor_id)
              : null,
            updated_by: Number(updated_by),
          },
        });

        results.push(updated);
      } catch (err: any) {
        errors.push({ index, message: err.message });
      }
    }

    return { results, errors };
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
    assignToUserId,
    requiredDate,
  }: {
    vendorId: number;
    leadId: number;
    accountId: number;
    userId: number;
    assignToUserId: number;
    requiredDate: Date;
  }) {
    // ✅ 1. Fetch StatusTypeMaster entry for Production Stage (Type 10)
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

    // ✅ 2. Update LeadMaster → move to Production Stage
    const updatedLead = await prisma.leadMaster.update({
      where: { id: leadId },
      data: {
        status_id: statusType.id,
        client_required_order_login_complition_date: requiredDate,
        updated_by: userId,
        updated_at: new Date(),
      },
      include: {
        statusType: true,
      },
    });

    // ✅ 3. Assign this lead to the Factory user via LeadUserMapping
    const leadUserMapping = await prisma.leadUserMapping.create({
      data: {
        account_id: accountId,
        lead_id: leadId,
        vendor_id: vendorId,
        user_id: assignToUserId,
        type: "production-stage",
        status: "active",
        created_by: userId,
      },
    });

    // ✅ 4. Log in LeadStatusLogs
    await prisma.leadStatusLogs.create({
      data: {
        lead_id: leadId,
        account_id: accountId,
        vendor_id: vendorId,
        status_id: statusType.id,
        created_by: userId,
      },
    });

    // ✅ 5. Log in LeadDetailedLogs
    await prisma.leadDetailedLogs.create({
      data: {
        vendor_id: vendorId,
        lead_id: leadId,
        account_id: accountId,
        action: `Lead moved to Production Stage and assigned to user ID ${assignToUserId}. Required completion date: ${requiredDate.toLocaleDateString()}`,
        action_type: "UPDATE",
        created_by: userId,
      },
    });

    return { lead: updatedLead, leadUserMapping };
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

  async getFactoryUsersByVendor(vendorId: number): Promise<BackendData[]> {
    try {
      console.log(
        `[SERVICE] Fetching Factory Users for vendor ID: ${vendorId}`
      );

      // 1. Find the user type ID for 'factory'
      const factoryUserType = await prisma.userTypeMaster.findFirst({
        where: {
          user_type: {
            equals: "factory",
            mode: "insensitive",
          },
        },
      });

      if (!factoryUserType) {
        console.log("[SERVICE] Factory user type not found");
        return [];
      }

      console.log(
        `[SERVICE] Found Factory user type ID: ${factoryUserType.id}`
      );

      // 2. Fetch all users with factory role for the specified vendor
      const factoryUsers = await prisma.userMaster.findMany({
        where: {
          vendor_id: vendorId,
          user_type_id: factoryUserType.id,
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

      console.log(`[SERVICE] Found ${factoryUsers.length} Factory Users`);

      // 3. Transform data
      const transformedData: BackendData[] = factoryUsers.map((user) => ({
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
      console.error("[SERVICE] Error fetching Factory Users:", error);
      throw new Error(`Failed to fetch Factory Users: ${error.message}`);
    }
  }
}
