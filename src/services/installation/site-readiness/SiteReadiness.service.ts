import { Prisma } from "@prisma/client";
import { prisma } from "../../../prisma/client";
import {
  generateSignedUrl,
  uploadToWasabiCurrentSitePhotosSiteReadiness,
} from "../../../utils/wasabiClient";
import logger from "../../../utils/logger";

interface SiteReadinessPayload {
  account_id: number;
  type: string;
  remark?: string;
  value?: boolean;
  created_by: number;
}

export class SiteReadinessService {
  /** ✅ Fetch all leads with status = Type 12 (Site Readiness) */
  async getLeadsWithStatusSiteReadiness(
    vendorId: number,
    userId: number,
    limit = 10,
    page = 1
  ) {
    const skip = (page - 1) * limit;

    // 🔹 Fetch Site Readiness Status (Type 12)
    const siteReadinessStatus = await prisma.statusTypeMaster.findFirst({
      where: { vendor_id: vendorId, tag: "Type 12" },
      select: { id: true },
    });

    if (!siteReadinessStatus) {
      throw new Error(
        `Site Readiness status (Type 12) not found for vendor ${vendorId}`
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
      status_id: siteReadinessStatus.id,
      activity_status: { in: ["onGoing", "lostApproval"] },
    };

    // 🔹 Admin → all leads
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

    // 🔹 Non-admin: mapped + task leads
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

  /** 🔹 Common include for Site Readiness */
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
        orderBy: { created_at: Prisma.SortOrder.desc },
      },
    };
  }

  /**
   * ✅ Create one or multiple Site Readiness entries
   */
  static async createSiteReadiness(
    vendorId: number,
    leadId: number,
    payload: any
  ) {
    const entries = Array.isArray(payload) ? payload : [payload];

    const dataToInsert = entries.map((item) => ({
      vendor_id: vendorId,
      lead_id: leadId,
      account_id: item.account_id,
      type: item.type,
      remark: item.remark || null,
      value: item.value ?? null,
      created_by: item.created_by,
    }));

    const result = await prisma.siteReadiness.createMany({
      data: dataToInsert,
      skipDuplicates: true,
    });

    return {
      insertedCount: result.count,
      records: dataToInsert,
    };
  }

  /**
   * ✅ Fetch all Site Readiness records (optionally filter by lead/account)
   */
  static async getSiteReadinessRecords(
    vendorId: number,
    leadId?: number,
    accountId?: number
  ) {
    const where: any = { vendor_id: vendorId };

    if (leadId) where.lead_id = leadId;
    if (accountId) where.account_id = accountId;

    const records = await prisma.siteReadiness.findMany({
      where,
      include: {
        lead: {
          select: {
            id: true,
            lead_code: true,
            firstname: true,
            lastname: true,
            contact_no: true,
          },
        },
        account: {
          select: { id: true, name: true, contact_no: true, email: true },
        },
        createdBy: {
          select: { id: true, user_name: true },
        },
      },
      orderBy: { created_at: "desc" },
    });

    return {
      count: records.length,
      records,
    };
  }

  /**
   * ✅ Update one or multiple Site Readiness entries
   */
  static async updateSiteReadiness(
    vendorId: number,
    leadId: number,
    payload: any
  ) {
    const entries = Array.isArray(payload) ? payload : [payload];
    const updatedRecords: any[] = [];

    for (const item of entries) {
      if (!item.id) {
        throw new Error(
          "Each SiteReadiness record must include an 'id' field to update."
        );
      }

      const updated = await prisma.siteReadiness.update({
        where: { id: item.id },
        data: {
          remark: item.remark ?? undefined,
          value: item.value ?? undefined,
          type: item.type ?? undefined,
          updated_by: item.updated_by ?? null,
          updated_at: new Date(),
        },
      });

      updatedRecords.push(updated);
    }

    return {
      updatedCount: updatedRecords.length,
      records: updatedRecords,
    };
  }

  // ✅ Upload Current Site Photos at Site Readiness
  async uploadCurrentSitePhotosAtSiteReadiness(
    vendorId: number,
    leadId: number,
    accountId: number | null,
    userId: number,
    files: Express.Multer.File[]
  ) {
    if (!vendorId || !leadId || !userId)
      throw Object.assign(
        new Error("vendorId, leadId and userId are required"),
        { statusCode: 400 }
      );

    // 🔹 Get DocType for Current Site Photos (Type 19)
    const sitePhotoDocType = await prisma.documentTypeMaster.findFirst({
      where: { vendor_id: vendorId, tag: "Type 19" },
    });

    if (!sitePhotoDocType)
      throw Object.assign(
        new Error("Document type (Type 19) not found for this vendor"),
        { statusCode: 404 }
      );

    const uploadedDocs = [];

    // 🔹 Iterate through each uploaded file
    for (const file of files) {
      const sysName = await uploadToWasabiCurrentSitePhotosSiteReadiness(
        file.buffer,
        vendorId,
        leadId,
        file.originalname
      );

      // 🔹 Save in DB
      const doc = await prisma.leadDocuments.create({
        data: {
          doc_og_name: file.originalname,
          doc_sys_name: sysName,
          vendor_id: vendorId,
          lead_id: leadId,
          account_id: accountId,
          created_by: userId,
          doc_type_id: sitePhotoDocType.id, // Type 19 → Current Site Photos (Site Readiness)
        },
      });

      uploadedDocs.push(doc);
    }

    return uploadedDocs;
  }

  // ✅ Get Current Site Photos at Site Readiness
  async getCurrentSitePhotosAtSiteReadiness(vendorId: number, leadId: number) {
    if (!vendorId || !leadId)
      throw Object.assign(new Error("vendorId and leadId are required"), {
        statusCode: 400,
      });

    // 🔹 Get DocType for Current Site Photos (Type 19)
    const sitePhotoDocType = await prisma.documentTypeMaster.findFirst({
      where: { vendor_id: vendorId, tag: "Type 19" },
    });

    if (!sitePhotoDocType)
      throw Object.assign(
        new Error("Document type (Type 19) not found for this vendor"),
        { statusCode: 404 }
      );

    // 🔹 Fetch all uploaded Current Site Photos for this lead
    const documents = await prisma.leadDocuments.findMany({
      where: {
        vendor_id: vendorId,
        lead_id: leadId,
        doc_type_id: sitePhotoDocType.id,
      },
      orderBy: { created_at: "desc" },
    });

    // 🔹 Attach signed URLs from Wasabi
    const docsWithUrls = await Promise.all(
      documents.map(async (doc) => {
        const signed_url = await generateSignedUrl(doc.doc_sys_name);
        return { ...doc, signed_url };
      })
    );

    return docsWithUrls;
  }

  /**
   * ✅ Check if Site Readiness is completed for a given lead
   * Conditions:
   *  1. At least one Current Site Photo exists (doc_type = "Type 19")
   *  2. All 6 site readiness items are present in SiteReadiness table
   */
  async checkSiteReadinessCompletion(vendorId: number, leadId: number) {
    if (!vendorId || !leadId) {
      throw Object.assign(new Error("vendorId and leadId are required"), {
        statusCode: 400,
      });
    }

    // 🔹 1. Get DocumentTypeMaster for Current Site Photos (Type 19)
    const sitePhotoDocType = await prisma.documentTypeMaster.findFirst({
      where: { vendor_id: vendorId, tag: "Type 19" },
      select: { id: true },
    });

    if (!sitePhotoDocType) {
      throw Object.assign(
        new Error("Document type (Type 19) not found for this vendor"),
        { statusCode: 404 }
      );
    }

    // 🔹 2. Check for at least one Current Site Photo (Type 19)
    const sitePhotos = await prisma.leadDocuments.count({
      where: {
        vendor_id: vendorId,
        lead_id: leadId,
        doc_type_id: sitePhotoDocType.id,
        is_deleted: false,
      },
    });

    const hasPhoto = sitePhotos > 0;

    // 🔹 3. Check for all 6 required Site Readiness items
    const readinessCount = await prisma.siteReadiness.count({
      where: {
        vendor_id: vendorId,
        lead_id: leadId,
      },
    });

    const hasAllSixItems = readinessCount >= 6;

    // ✅ 4. Determine final status
    const isCompleted = hasPhoto && hasAllSixItems;

    return {
      vendor_id: vendorId,
      lead_id: leadId,
      has_photo: hasPhoto,
      has_all_items: hasAllSixItems,
      is_site_readiness_completed: isCompleted,
    };
  }

  /**
   * ✅ Move Lead to Dispatch Planning Stage (Type 13)
   */
  static async moveLeadToDispatchPlanning(
    vendorId: number,
    leadId: number,
    updatedBy: number
  ) {
    return prisma.$transaction(async (tx) => {
      // 1️⃣ Validate lead
      const lead = await tx.leadMaster.findUnique({
        where: { id: leadId },
        select: { id: true, vendor_id: true, account_id: true },
      });

      if (!lead) throw new Error(`Lead ${leadId} not found`);
      if (lead.vendor_id !== vendorId)
        throw new Error(`Lead does not belong to vendor ${vendorId}`);

      // 2️⃣ Fetch Dispatch Planning StatusType (Type 13)
      const toStatus = await tx.statusTypeMaster.findFirst({
        where: { vendor_id: vendorId, tag: "Type 13" },
        select: { id: true, type: true },
      });

      if (!toStatus)
        throw new Error(
          `Status 'Type 13' (Dispatch Planning Stage) not found for vendor ${vendorId}`
        );

      // 3️⃣ Update Lead’s Status
      const updatedLead = await tx.leadMaster.update({
        where: { id: lead.id },
        data: {
          status_id: toStatus.id,
          updated_by: updatedBy,
          updated_at: new Date(),
        },
        select: {
          id: true,
          account_id: true,
          vendor_id: true,
          status_id: true,
        },
      });

      // 4️⃣ Add Detailed Log Entry
      const actionMessage = `Lead moved to Dispatch Planning stage (Type 13).`;

      await tx.leadDetailedLogs.create({
        data: {
          vendor_id: vendorId,
          lead_id: lead.id,
          account_id: lead.account_id!,
          action: actionMessage,
          action_type: "UPDATE",
          created_by: updatedBy,
          created_at: new Date(),
        },
      });

      logger.info("[SERVICE] Lead moved to Dispatch Planning", {
        lead_id: lead.id,
        vendor_id: vendorId,
        updated_by: updatedBy,
      });

      return {
        lead_id: lead.id,
        vendor_id: vendorId,
        new_status: toStatus.type,
      };
    });
  }
}
