import { prisma } from "../../../prisma/client";
import { Prisma } from "@prisma/client";
import {
    generateSignedUrl,
  uploadToWasabiFinalHandoverBookletPhoto,
  uploadToWasabiFinalHandoverFinalSitePhotos,
  uploadToWasabiFinalHandoverFormPhoto,
  uploadToWasabiFinalHandoverQCDocument,
  uploadToWasabiFinalHandoverWarrantyCardPhotos,
} from "../../../utils/wasabiClient";

export class FinalHandoverStageService {
  /**
   * ✅ Fetch all leads with status = Type 16 (Final Handover Stage)
   */
  async getLeadsWithStatusFinalHandoverStage(
    vendorId: number,
    userId: number,
    limit = 10,
    page = 1
  ) {
    const skip = (page - 1) * limit;

    // 🔹 Fetch Final Handover Stage Status (Type 16)
    const finalHandoverStatus = await prisma.statusTypeMaster.findFirst({
      where: { vendor_id: vendorId, tag: "Type 16" },
      select: { id: true },
    });

    if (!finalHandoverStatus) {
      throw new Error(
        `Final Handover Stage status (Type 16) not found for vendor ${vendorId}`
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
      status_id: finalHandoverStatus.id,
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

  /** Default relations */
  /** 🔹 Common include for Post-Dispatch Stage */
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

  async uploadFinalHandoverDocuments(
    vendorId: number,
    leadId: number,
    accountId: number,
    userId: number,
    files: any
  ) {
    const uploadedDocs: any[] = [];

    // Get doc types
    const docTypes = await prisma.documentTypeMaster.findMany({
      where: {
        vendor_id: vendorId,
        tag: { in: ["Type 27", "Type 28", "Type 29", "Type 30", "Type 31"] },
      },
    });

    const getDocTypeId = (tag: string) => {
      const type = docTypes.find((d) => d.tag === tag);
      if (!type) {
        throw new Error(
          `Document Type ${tag} not found for vendor ${vendorId}`
        );
      }
      return type.id;
    };

    /** ------------------------------------------------------
     * 1. Final Site Photos (multiple)
     * ------------------------------------------------------ */
    if (files.final_site_photos) {
      for (const file of files.final_site_photos) {
        const sysName = await uploadToWasabiFinalHandoverFinalSitePhotos(
          file.buffer,
          vendorId,
          leadId,
          file.originalname
        );

        const saved = await prisma.leadDocuments.create({
          data: {
            vendor_id: vendorId,
            account_id: accountId,
            lead_id: leadId,
            created_by: userId,
            doc_og_name: file.originalname,
            doc_sys_name: sysName,
            doc_type_id: getDocTypeId("Type 27"),
          },
        });

        uploadedDocs.push(saved);
      }
    }

    /** ------------------------------------------------------
     * 2. Warranty Card
     * ------------------------------------------------------ */
    if (files.warranty_card_photo) {
      for (const file of files.warranty_card_photo) {
        const sysName = await uploadToWasabiFinalHandoverWarrantyCardPhotos(
          file.buffer,
          vendorId,
          leadId,
          file.originalname
        );

        const saved = await prisma.leadDocuments.create({
          data: {
            vendor_id: vendorId,
            account_id: accountId,
            lead_id: leadId,
            created_by: userId,
            doc_og_name: file.originalname,
            doc_sys_name: sysName,
            doc_type_id: getDocTypeId("Type 28"),
          },
        });

        uploadedDocs.push(saved);
      }
    }

    /** ------------------------------------------------------
     * 3. Handover Booklet Photo
     * ------------------------------------------------------ */
    if (files.handover_booklet_photo) {
      for (const file of files.handover_booklet_photo) {
        const sysName = await uploadToWasabiFinalHandoverBookletPhoto(
          file.buffer,
          vendorId,
          leadId,
          file.originalname
        );

        const saved = await prisma.leadDocuments.create({
          data: {
            vendor_id: vendorId,
            account_id: accountId,
            lead_id: leadId,
            created_by: userId,
            doc_og_name: file.originalname,
            doc_sys_name: sysName,
            doc_type_id: getDocTypeId("Type 29"),
          },
        });

        uploadedDocs.push(saved);
      }
    }

    /** ------------------------------------------------------
     * 4. Final Handover Form Photo
     * ------------------------------------------------------ */
    if (files.final_handover_form_photo) {
      for (const file of files.final_handover_form_photo) {
        const sysName = await uploadToWasabiFinalHandoverFormPhoto(
          file.buffer,
          vendorId,
          leadId,
          file.originalname
        );

        const saved = await prisma.leadDocuments.create({
          data: {
            vendor_id: vendorId,
            account_id: accountId,
            lead_id: leadId,
            created_by: userId,
            doc_og_name: file.originalname,
            doc_sys_name: sysName,
            doc_type_id: getDocTypeId("Type 30"),
          },
        });

        uploadedDocs.push(saved);
      }
    }

    /** ------------------------------------------------------
     * 5. QC Documents
     * ------------------------------------------------------ */
    if (files.qc_document) {
      for (const file of files.qc_document) {
        const sysName = await uploadToWasabiFinalHandoverQCDocument(
          file.buffer,
          vendorId,
          leadId,
          file.originalname
        );

        const saved = await prisma.leadDocuments.create({
          data: {
            vendor_id: vendorId,
            account_id: accountId,
            lead_id: leadId,
            created_by: userId,
            doc_og_name: file.originalname,
            doc_sys_name: sysName,
            doc_type_id: getDocTypeId("Type 31"),
          },
        });

        uploadedDocs.push(saved);
      }
    }

    return uploadedDocs;
  }

  async getFinalHandoverDocuments(vendorId: number, leadId: number) {
    if (!vendorId || !leadId)
      throw Object.assign(new Error("vendorId and leadId are required"), {
        statusCode: 400,
      });

    // 🔹 Fetch all relevant final-handover document types
    const docTypes = await prisma.documentTypeMaster.findMany({
      where: {
        vendor_id: vendorId,
        tag: { in: ["Type 27", "Type 28", "Type 29", "Type 30", "Type 31"] },
      },
    });

    if (!docTypes.length)
      throw Object.assign(
        new Error("Final Handover document types not found for vendor"),
        { statusCode: 404 }
      );

    const docTypeIds = docTypes.map((d) => d.id);

    // 🔹 Fetch matching documents
    const docs = await prisma.leadDocuments.findMany({
      where: {
        vendor_id: vendorId,
        lead_id: leadId,
        doc_type_id: { in: docTypeIds },
        is_deleted: false,
      },
      orderBy: { created_at: "desc" },
    });

    // 🔹 Generate signed url for each document
    const documentsWithUrls = await Promise.all(
      docs.map(async (doc) => {
        const signed_url = await generateSignedUrl(doc.doc_sys_name, 3600, "inline");

        return {
          ...doc,
          signed_url,
          doc_type_tag: docTypes.find((d) => d.id === doc.doc_type_id)?.tag,
        };
      })
    );

    return documentsWithUrls;
  }
}
