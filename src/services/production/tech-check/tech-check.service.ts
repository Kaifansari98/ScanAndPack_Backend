import { Prisma } from "../../../prisma/generated";
import { prisma } from "../../../prisma/client";

export class TechCheckService {
  // ✅ Approve Tech Check
  public async approveTechCheck(
    vendorId: number,
    leadId: number,
    userId: number,
    assignToUserId: number,
    accountId: number
  ) {
    return await prisma.$transaction(async (tx) => {
      // 1️⃣ Get Order Login Status (Type 9)
      const orderLoginStatus = await tx.statusTypeMaster.findFirst({
        where: { vendor_id: vendorId, tag: "Type 9" },
        select: { id: true },
      });

      if (!orderLoginStatus) {
        throw new Error(
          `Order Login (Type 9) not configured for vendor ${vendorId}`
        );
      }

      // 2️⃣ Update Lead status
      const updatedLead = await tx.leadMaster.update({
        where: { id: leadId },
        data: {
          status_id: orderLoginStatus.id,
          updated_by: userId,
          updated_at: new Date(),
        },
      });

      // 3️⃣ Assign to Backend User
      const mapping = await tx.leadUserMapping.create({
        data: {
          vendor_id: vendorId,
          lead_id: leadId,
          account_id: accountId,
          user_id: assignToUserId,
          type: "order-login-stage", // 👈 IMPORTANT
          status: "active",
          created_by: userId,
        },
      });

      // 4️⃣ Log status change
      await tx.leadStatusLogs.create({
        data: {
          vendor_id: vendorId,
          lead_id: leadId,
          account_id: accountId,
          status_id: orderLoginStatus.id,
          created_by: userId,
        },
      });

      // 5️⃣ Detailed Logs
      await tx.leadDetailedLogs.create({
        data: {
          vendor_id: vendorId,
          lead_id: leadId,
          account_id: accountId,
          action: `Tech Check approved and assigned to backend user ${assignToUserId}`,
          action_type: "STATUS_CHANGE",
          created_by: userId,
        },
      });

      return { updatedLead, mapping };
    });
  }

  // ✅ Reject Tech Check
  public async rejectTechCheck(
    vendorId: number,
    leadId: number,
    userId: number,
    rejectedDocs: number[],
    remark?: string
  ) {
    return await prisma.$transaction(async (tx) => {
      // Resolve account_id once
      const accountId = (
        await tx.leadMaster.findUnique({
          where: { id: leadId },
          select: { account_id: true },
        })
      )?.account_id!;

      // 1️⃣ Create a single leadDetailedLogs entry (with remark baked into action)
      const actionText = remark
        ? `Tech check rejected ${rejectedDocs.length} documents — Remark: ${remark}`
        : `Tech check rejected ${rejectedDocs.length} documents`;

      const detailedLog = await tx.leadDetailedLogs.create({
        data: {
          vendor_id: vendorId,
          lead_id: leadId,
          account_id: accountId,
          action: actionText,
          action_type: "UPDATE",
          created_by: userId,
        },
      });

      // 2️⃣ Update only the selected client-documentation docs to REJECTED
      const updateRes = await tx.leadDocuments.updateMany({
        where: {
          id: { in: rejectedDocs },
          vendor_id: vendorId,
          documentType: {
            // ✅ use the correct tags with spaces
            tag: { in: ["Type 11", "Type 12"] },
          },
        },
        data: { tech_check_status: "REJECTED" },
      });

      // 3️⃣ Insert LeadDocumentLogs mappings referencing the detailed log
      if (rejectedDocs.length > 0) {
        const docLogsData = rejectedDocs.map((docId) => ({
          vendor_id: vendorId,
          lead_id: leadId,
          account_id: accountId,
          doc_id: docId, // ✅ schema field name
          lead_logs_id: detailedLog.id, // ✅ link to the detailed log
          created_by: userId,
        }));

        await tx.leadDocumentLogs.createMany({ data: docLogsData });
      }

      return {
        rejectedDocsRequested: rejectedDocs.length,
        rejectedDocsUpdated: updateRes.count,
        detailedLogId: detailedLog.id,
      };
    });
  }

  // ✅ Keep your existing method
  public async getLeadsWithStatusTechCheck(
    vendorId: number,
    userId: number,
    limit = 10,
    page = 1
  ) {
    const skip = (page - 1) * limit;

    const techCheckStatus = await prisma.statusTypeMaster.findFirst({
      where: { vendor_id: vendorId, tag: "Type 8" },
      select: { id: true },
    });

    if (!techCheckStatus) {
      throw new Error(
        `Tech Check status (Type 8) not found for vendor ${vendorId}`
      );
    }

    const creator = await prisma.userMaster.findUnique({
      where: { id: userId },
      include: { user_type: true },
    });

    const isAdmin = creator?.user_type?.user_type?.toLowerCase() === "admin";

    const baseWhere: any = {
      vendor_id: vendorId,
      is_deleted: false,
      status_id: techCheckStatus.id,
      activity_status: { in: ["onGoing", "lostApproval"] },
    };

    if (isAdmin) {
      const [total, leads] = await Promise.all([
        prisma.leadMaster.count({ where: baseWhere }),
        prisma.leadMaster.findMany({
          where: baseWhere,
          include: this.defaultIncludes(),
          orderBy: { created_at: Prisma.SortOrder.desc },
          skip,
          take: limit,
        }),
      ]);

      return { total, leads };
    }

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
        orderBy: { created_at: Prisma.SortOrder.desc },
        skip,
        take: limit,
      }),
    ]);

    return { total, leads };
  }

  // ✅ Approve Multiple Documents (Tech Check)
  public async approveMultipleDocuments(
    vendorId: number,
    leadId: number,
    userId: number,
    approvedDocs: number[]
  ) {
    return await prisma.$transaction(async (tx) => {
      // 1️⃣ Validate & Resolve account_id
      const accountId = (
        await tx.leadMaster.findUnique({
          where: { id: leadId },
          select: { account_id: true },
        })
      )?.account_id!;

      // 2️⃣ Update the provided documents’ tech_check_status to APPROVED
      const updateRes = await tx.leadDocuments.updateMany({
        where: {
          id: { in: approvedDocs },
          vendor_id: vendorId,
          documentType: {
            tag: { in: ["Type 11", "Type 12"] },
          },
        },
        data: { tech_check_status: "APPROVED" },
      });

      // 3️⃣ Create a main detailed log entry
      const detailedLog = await tx.leadDetailedLogs.create({
        data: {
          vendor_id: vendorId,
          lead_id: leadId,
          account_id: accountId,
          action: `Tech check approved ${approvedDocs.length} documents`,
          action_type: "UPDATE",
          created_by: userId,
        },
      });

      // 4️⃣ Create corresponding document logs linked to this detailed log
      if (approvedDocs.length > 0) {
        const docLogsData = approvedDocs.map((docId) => ({
          vendor_id: vendorId,
          lead_id: leadId,
          account_id: accountId,
          doc_id: docId,
          lead_logs_id: detailedLog.id,
          created_by: userId,
        }));

        await tx.leadDocumentLogs.createMany({ data: docLogsData });
      }

      return {
        approvedDocsRequested: approvedDocs.length,
        approvedDocsUpdated: updateRes.count,
        detailedLogId: detailedLog.id,
      };
    });
  }

  private defaultIncludes() {
    return {
      account: {
        select: { id: true, name: true, email: true, contact_no: true },
      },
      siteType: true,
      source: true,
      statusType: true,
      productMappings: { include: { productType: true } },
      leadProductStructureMapping: { include: { productStructure: true } },
      assignedTo: { select: { id: true, user_name: true } },
      createdBy: { select: { id: true, user_name: true } },
    };
  }
}
