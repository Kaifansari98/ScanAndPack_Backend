import { Prisma } from "../../../prisma/generated";
import { prisma } from "../../../prisma/client";
import { generateSignedUrl } from "../../../utils/wasabiClient";
import logger from "../../../utils/logger";
import { AssignTaskFMInput } from "../../../types/leadModule.types";
import Joi from "joi";
import { cache } from "../../../utils/cache";
import { ensureLeadStatusLog } from "../../../utils/leadStatusLog";

const assignTaskSiteReadinessSchema = Joi.object({
  lead_id: Joi.number().required(),
  task_type: Joi.string().required(),
  due_date: Joi.date().required(),
  remark: Joi.string().allow(null, ""),
  assignee_user_id: Joi.number().required(),
  created_by: Joi.number().required(),
});

export class ReadyToDispatchService {
  async getLeadsWithStatusReadyToDispatch(
    vendorId: number,
    userId: number,
    limit = 10,
    page = 1
  ) {
    const skip = (page - 1) * limit;

    // 🔹 Fetch Ready-To-Dispatch Status (Type 11)
    const readyDispatchStatus = await prisma.statusTypeMaster.findFirst({
      where: { vendor_id: vendorId, tag: "Type 11" },
      select: { id: true },
    });

    if (!readyDispatchStatus) {
      throw new Error(
        `Ready-To-Dispatch status (Type 11) not found for vendor ${vendorId}`
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
      status_id: readyDispatchStatus.id,
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

  // ✅ Common include (same as Pre-Production)
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

  // ✅ Upload Current Site Photos at Ready-To-Dispatch
  async uploadCurrentSitePhotosAtReadyToDispatch(
    vendorId: number,
    leadId: number,
    accountId: number | null,
    userId: number,
    files: { originalName: string; sysName: string }[]
  ) {
    if (!vendorId || !leadId || !userId)
      throw Object.assign(
        new Error("vendorId, leadId and userId are required"),
        { statusCode: 400 }
      );

    // 🔹 Get DocType for Current Site Photos (Type 16)
    const sitePhotoDocType = await prisma.documentTypeMaster.findFirst({
      where: { vendor_id: vendorId, tag: "Type 18" },
    });

    if (!sitePhotoDocType)
      throw Object.assign(
        new Error("Document type (Type 18) not found for this vendor"),
        { statusCode: 404 }
      );

    const uploadedDocs = [];

    // 🔹 Iterate through each uploaded file
    for (const file of files) {
      // 🔹 Store in DB
      const doc = await prisma.leadDocuments.create({
        data: {
          doc_og_name: file.originalName,
          doc_sys_name: file.sysName,
          vendor_id: vendorId,
          lead_id: leadId,
          account_id: accountId,
          created_by: userId,
          doc_type_id: sitePhotoDocType.id, // Type 16 → Current Site Photos
        },
      });

      uploadedDocs.push(doc);
    }

    return uploadedDocs;
  }

  // ✅ Get Current Site Photos at Ready-To-Dispatch
  async getCurrentSitePhotosAtReadyToDispatch(
    vendorId: number,
    leadId: number
  ) {
    if (!vendorId || !leadId)
      throw Object.assign(new Error("vendorId and leadId are required"), {
        statusCode: 400,
      });

    // 🔹 Get DocType for Current Site Photos (Type 18)
    const sitePhotoDocType = await prisma.documentTypeMaster.findFirst({
      where: { vendor_id: vendorId, tag: "Type 18" },
    });

    if (!sitePhotoDocType)
      throw Object.assign(
        new Error("Document type (Type 18) not found for this vendor"),
        { statusCode: 404 }
      );

    const prefix = `ready_to_dispatch/current_site_photos/${vendorId}/${leadId}/`;

    // 🔹 Fetch all uploaded Current Site Photos for this lead
    const documents = await prisma.leadDocuments.findMany({
      where: {
        vendor_id: vendorId,
        lead_id: leadId,
        doc_type_id: sitePhotoDocType.id,
        is_deleted: false,
        doc_sys_name: { startsWith: prefix }
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

  async getCurrentSitePhotosCountAtReadyToDispatch(
    vendorId: number,
    leadId: number
  ) {
    if (!vendorId || !leadId)
      throw Object.assign(new Error("vendorId and leadId are required"), {
        statusCode: 400,
      });

    // 🔹 Get DocType for Current Site Photos (Type 18)
    const sitePhotoDocType = await prisma.documentTypeMaster.findFirst({
      where: { vendor_id: vendorId, tag: "Type 18" },
    });

    if (!sitePhotoDocType)
      throw Object.assign(
        new Error("Document type (Type 18) not found for this vendor"),
        { statusCode: 404 }
      );

    const prefix = `ready_to_dispatch/current_site_photos/${vendorId}/${leadId}/`;

    // 🔹 Count all uploaded Current Site Photos for this lead
    const count = await prisma.leadDocuments.count({
      where: {
        vendor_id: vendorId,
        lead_id: leadId,
        doc_type_id: sitePhotoDocType.id,
        doc_sys_name: { startsWith: prefix },
      },
    });

    // 🔹 Return count and boolean flag
    return {
      count,
      hasPhotos: count > 0,
    };
  }

  public async assignTaskSiteReadinessService(payload: AssignTaskFMInput) {
    const { error, value } = assignTaskSiteReadinessSchema.validate(payload);
    if (error) {
      throw new Error(
        `Validation failed: ${error.details.map((d) => d.message).join(", ")}`
      );
    }

    const {
      lead_id,
      task_type,
      due_date,
      remark,
      assignee_user_id,
      created_by,
    } = value;

    return prisma.$transaction(async (tx) => {
      // 1️⃣ Validate lead
      const lead = await tx.leadMaster.findUnique({
        where: { id: lead_id },
        select: {
          id: true,
          vendor_id: true,
          account_id: true,
          status_id: true,
          franchise_id: true,
        },
      });
      if (!lead) throw new Error(`Lead ${lead_id} not found`);

      const leadStage = lead.status_id
        ? (
            await tx.statusTypeMaster.findUnique({
              where: { id: lead.status_id },
              select: { type: true },
            })
          )?.type ?? null
        : null;

      // 2️⃣ Validate assignee
      const assignee = await tx.userMaster.findUnique({
        where: { id: assignee_user_id },
        select: { id: true, vendor_id: true, user_name: true },
      });
      if (!assignee)
        throw new Error(`Assignee user ${assignee_user_id} not found`);
      if (assignee.vendor_id !== lead.vendor_id) {
        throw new Error(
          `Assignee user ${assignee_user_id} does not belong to vendor ${lead.vendor_id}`
        );
      }

      // 3️⃣ Create task record
      const task = await tx.userLeadTask.create({
        data: {
          lead_id: lead.id,
          account_id: lead.account_id!,
          vendor_id: lead.vendor_id,
          franchise_id: lead.franchise_id ?? null,
          user_id: assignee_user_id,
          task_type,
          lead_stage: leadStage,
          due_date: new Date(due_date),
          remark: remark || null,
          status: "open",
          created_by,
        },
      });

      // 🧹 Refresh Sales-Executive Dashboard Task Cache
      await cache.del(`dashboard:tasks:${lead.vendor_id}:${assignee_user_id}`);

      // 4️⃣ Update lead status (if not Follow Up)
      let updatedLead: {
        id: number;
        account_id: number | null;
        vendor_id: number;
        status_id: number | null;
      } = { ...lead, status_id: null };

      if (task_type.toLowerCase() !== "follow up") {
        const toStatus = await tx.statusTypeMaster.findFirst({
          where: { vendor_id: lead.vendor_id, tag: "Type 12" }, // 🔸 Use Type 12 for Site Readiness
          select: { id: true },
        });
        if (!toStatus) {
          throw new Error(
            `Status 'Type 12' (Site Readiness) not found for vendor ${lead.vendor_id}`
          );
        }

        updatedLead = await tx.leadMaster.update({
          where: { id: lead.id },
          data: { status_id: toStatus.id },
          select: {
            id: true,
            account_id: true,
            vendor_id: true,
            status_id: true,
          },
        });

        await ensureLeadStatusLog(tx, {
          vendorId: lead.vendor_id,
          leadId: lead.id,
          accountId: lead.account_id,
          statusId: toStatus.id,
          createdBy: created_by,
        });
      }

      // 5️⃣ Create log entry
      let actionMessage = "";
      if (task_type.toLowerCase() === "follow up") {
        actionMessage = `Lead has been assigned to ${assignee.user_name} for Follow Up.`;
      } else {
        actionMessage = `Lead has been assigned to ${assignee.user_name} for Site Readiness.`;
      }

      const formattedDate = new Date(due_date).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
      actionMessage += ` Due Date: ${formattedDate}.`;

      if (remark && remark.trim()) {
        actionMessage += ` — Remark: ${remark.trim()}`;
      } else {
        actionMessage += ` — Remark: No remark provided.`;
      }

      await tx.leadDetailedLogs.create({
        data: {
          vendor_id: lead.vendor_id,
          lead_id: lead.id,
          account_id: lead.account_id!,
          action: actionMessage,
          action_type: "CREATE",
          created_by,
          created_at: new Date(),
        },
      });

      logger.info("[SERVICE] Site Readiness task assigned successfully", {
        lead_id: lead.id,
        task_id: task.id,
        assignee: assignee.user_name,
        due_date: formattedDate,
        remark: remark || "No remark",
      });

      return { task, lead: updatedLead };
    });
  }
}
