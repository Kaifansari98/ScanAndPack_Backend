import { Prisma } from "@prisma/client";
import { prisma } from "../../../prisma/client";
import {
  generateSignedUrl,
  uploadToWasabiDispatchDocuments,
  uploadToWasabiPostDispatchDocuments,
} from "../../../utils/wasabiClient";

export class DispatchStageService {
  /** ✅ Fetch all leads with status = Type 14 (Dispatch Stage) */
  async getLeadsWithStatusDispatchStage(
    vendorId: number,
    userId: number,
    limit = 10,
    page = 1
  ) {
    const skip = (page - 1) * limit;

    // 🔹 Fetch Dispatch Stage Status (Type 14)
    const dispatchStageStatus = await prisma.statusTypeMaster.findFirst({
      where: { vendor_id: vendorId, tag: "Type 14" },
      select: { id: true },
    });

    if (!dispatchStageStatus) {
      throw new Error(
        `Dispatch Stage status (Type 14) not found for vendor ${vendorId}`
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
      status_id: dispatchStageStatus.id,
      activity_status: { in: ["onGoing", "lostApproval"] },
    };

    // 🔹 Admin → all Dispatch Stage leads
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

    // 🔹 Non-admin → mapped + task leads
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

  /** 🔹 Common include for Dispatch Stage */
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

  /** ✅ Get required_date_for_dispatch by Lead ID and Vendor ID */
  async getRequiredDateForDispatch(vendorId: number, leadId: number) {
    const lead = await prisma.leadMaster.findFirst({
      where: {
        id: leadId,
        vendor_id: vendorId,
        is_deleted: false,
      },
      select: {
        id: true,
        vendor_id: true,
        required_date_for_dispatch: true,
        no_of_boxes: true,
      },
    });

    if (!lead) {
      throw new Error(
        `Lead not found for vendor ${vendorId} and lead ${leadId}`
      );
    }

    return lead;
  }

  /** ✅ Save Dispatch details (date, driver info, vehicle, remark) */
  async addDispatchDetails(
    vendorId: number,
    leadId: number,
    data: {
      dispatch_date: Date;
      driver_name?: string;
      driver_number?: string;
      vehicle_no: string;
      dispatch_remark?: string;
      updated_by: number;
    }
  ) {
    const lead = await prisma.leadMaster.findFirst({
      where: { id: leadId, vendor_id: vendorId, is_deleted: false },
    });

    if (!lead) {
      throw new Error(
        `Lead not found for vendor ${vendorId} and lead ${leadId}`
      );
    }

    const updated = await prisma.leadMaster.update({
      where: { id: leadId },
      data: {
        dispatch_date: data.dispatch_date ? new Date(data.dispatch_date) : null,
        driver_name: data.driver_name,
        driver_number: data.driver_number,
        vehicle_no: data.vehicle_no,
        dispatch_remark: data.dispatch_remark,
        updated_by: data.updated_by,
        updated_at: new Date(),
      },
      select: {
        id: true,
        vendor_id: true,
        dispatch_date: true,
        driver_name: true,
        driver_number: true,
        vehicle_no: true,
        dispatch_remark: true,
      },
    });

    return updated;
  }

  /** ✅ Get Dispatch details by Lead ID and Vendor ID */
  async getDispatchDetails(vendorId: number, leadId: number) {
    const lead = await prisma.leadMaster.findFirst({
      where: {
        id: leadId,
        vendor_id: vendorId,
        is_deleted: false,
      },
      select: {
        id: true,
        vendor_id: true,
        dispatch_date: true,
        driver_name: true,
        driver_number: true,
        vehicle_no: true,
        dispatch_remark: true,
      },
    });

    if (!lead) {
      throw new Error(
        `Dispatch details not found for vendor ${vendorId} and lead ${leadId}`
      );
    }

    return lead;
  }

  // ✅ Upload Dispatch Photos & Documents
  async uploadDispatchDocuments(
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

    // 🔹 Get DocType for Dispatch Photos/Documents (Type 20)
    const dispatchDocType = await prisma.documentTypeMaster.findFirst({
      where: { vendor_id: vendorId, tag: "Type 21" },
    });

    if (!dispatchDocType)
      throw Object.assign(
        new Error("Document type (Type 21) not found for this vendor"),
        { statusCode: 404 }
      );

    const uploadedDocs = [];

    for (const file of files) {
      const sysName = await uploadToWasabiDispatchDocuments(
        file.buffer,
        vendorId,
        leadId,
        file.originalname
      );

      const doc = await prisma.leadDocuments.create({
        data: {
          doc_og_name: file.originalname,
          doc_sys_name: sysName,
          vendor_id: vendorId,
          lead_id: leadId,
          account_id: accountId,
          created_by: userId,
          doc_type_id: dispatchDocType.id, // ✅ Type 21 → Dispatch Photos & Docs
        },
      });

      uploadedDocs.push(doc);
    }

    return uploadedDocs;
  }

  // ✅ Get Dispatch Photos & Documents with Signed URLs
  async getDispatchDocuments(vendorId: number, leadId: number) {
    if (!vendorId || !leadId)
      throw Object.assign(new Error("vendorId and leadId are required"), {
        statusCode: 400,
      });

    // 🔹 Get DocType for Dispatch Docs (Type 20)
    const dispatchDocType = await prisma.documentTypeMaster.findFirst({
      where: { vendor_id: vendorId, tag: "Type 21" },
    });

    if (!dispatchDocType)
      throw Object.assign(
        new Error("Document type (Type 21) not found for this vendor"),
        { statusCode: 404 }
      );

    // 🔹 Fetch all documents for this lead and type
    const documents = await prisma.leadDocuments.findMany({
      where: {
        vendor_id: vendorId,
        lead_id: leadId,
        doc_type_id: dispatchDocType.id,
        is_deleted: false,
      },
      select: {
        id: true,
        doc_og_name: true,
        doc_sys_name: true,
        created_at: true,
        created_by: true,
      },
      orderBy: { created_at: "desc" },
    });

    // 🔹 Generate signed URLs for each file
    const result = await Promise.all(
      documents.map(async (doc) => {
        const signedUrl = await generateSignedUrl(
          doc.doc_sys_name,
          3600,
          "inline"
        );
        return {
          ...doc,
          signed_url: signedUrl,
        };
      })
    );

    return result;
  }

  // ✅ Check if Lead is Ready for Post-Dispatch
  async checkReadyForPostDispatch(vendorId: number, leadId: number) {
    const lead = await prisma.leadMaster.findFirst({
      where: { id: leadId, vendor_id: vendorId, is_deleted: false },
      select: {
        id: true,
        dispatch_date: true,
        vehicle_no: true,
        no_of_boxes: true,
      },
    });

    if (!lead) {
      throw new Error(
        `Lead not found for vendor ${vendorId} and lead ${leadId}`
      );
    }

    // 🔹 Check Dispatch Documents (Type 21)
    const dispatchDocs = await prisma.leadDocuments.findMany({
      where: {
        lead_id: leadId,
        vendor_id: vendorId,
        documentType: { tag: "Type 21" },
      },
      select: { id: true },
    });

    // 🔍 Missing fields tracker
    const missing: string[] = [];

    if (!lead.dispatch_date) missing.push("Dispatch Date");
    if (!lead.vehicle_no) missing.push("Vehicle Number");
    if (!lead.no_of_boxes || lead.no_of_boxes <= 0) missing.push("Box Count");
    if (dispatchDocs.length === 0) missing.push("Dispatch Documents");

    const readyForPostDispatch = missing.length === 0;

    return {
      readyForPostDispatch,
      message: readyForPostDispatch
        ? "Lead is ready for Post-Dispatch stage."
        : `Missing: ${missing.join(", ")}`,
      missingFields: missing,
    };
  }

  // ✅ Upload Post Dispatch Photos & Documents
  async uploadPostDispatchDocuments(
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

    // 🔹 Get DocType for Post Dispatch Photos/Documents (Type 22)
    const postDispatchDocType = await prisma.documentTypeMaster.findFirst({
      where: { vendor_id: vendorId, tag: "Type 22" },
    });

    if (!postDispatchDocType)
      throw Object.assign(
        new Error("Document type (Type 22) not found for this vendor"),
        { statusCode: 404 }
      );

    const uploadedDocs = [];

    for (const file of files) {
      const sysName = await uploadToWasabiPostDispatchDocuments(
        file.buffer,
        vendorId,
        leadId,
        file.originalname
      );

      const doc = await prisma.leadDocuments.create({
        data: {
          doc_og_name: file.originalname,
          doc_sys_name: sysName,
          vendor_id: vendorId,
          lead_id: leadId,
          account_id: accountId,
          created_by: userId,
          doc_type_id: postDispatchDocType.id, // ✅ Type 22 → Post Dispatch Docs
        },
      });

      uploadedDocs.push(doc);
    }

    return uploadedDocs;
  }

  // ✅ Get Post Dispatch Photos & Documents (with signed URLs)
  async getPostDispatchDocuments(vendorId: number, leadId: number) {
    if (!vendorId || !leadId)
      throw Object.assign(new Error("vendorId and leadId are required"), {
        statusCode: 400,
      });

    // 🔹 Get DocType for Post Dispatch Photos/Documents (Type 22)
    const postDispatchDocType = await prisma.documentTypeMaster.findFirst({
      where: { vendor_id: vendorId, tag: "Type 22" },
    });

    if (!postDispatchDocType)
      throw Object.assign(
        new Error("Document type (Type 22) not found for this vendor"),
        { statusCode: 404 }
      );

    // 🔹 Fetch all Post Dispatch documents
    const docs = await prisma.leadDocuments.findMany({
      where: {
        vendor_id: vendorId,
        lead_id: leadId,
        doc_type_id: postDispatchDocType.id,
        is_deleted: false,
      },
      orderBy: { created_at: "desc" },
    });

    // 🔹 Generate signed URLs for each document
    const documentsWithUrls = await Promise.all(
      docs.map(async (doc) => ({
        ...doc,
        signed_url: await generateSignedUrl(doc.doc_sys_name, 3600, "inline"),
      }))
    );

    return documentsWithUrls;
  }
}
