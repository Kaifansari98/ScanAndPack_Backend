import { Prisma } from "../../../prisma/generated";
import { prisma } from "../../../prisma/client";

export class PreProductionService {
  async getLeadsWithStatusPreProduction(
    vendorId: number,
    userId: number,
    limit = 10,
    page = 1
  ) {
    const skip = (page - 1) * limit;

    // 🔹 Fetch Pre-Production Status (Type 10)
    const preProdStatus = await prisma.statusTypeMaster.findFirst({
      where: { vendor_id: vendorId, tag: "Type 10" },
      select: { id: true },
    });

    if (!preProdStatus) {
      throw new Error(
        `Pre-Production status (Type 10) not found for vendor ${vendorId}`
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
      status_id: preProdStatus.id,
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

  async handleOrderLoginCompletion(
    vendorId: number,
    leadId: number,
    updates: any[]
  ) {
    const results = [];
    const errors = [];

    for (const [index, u] of updates.entries()) {
      try {
        const { id, estimated_completion_date, is_completed, updated_by } = u;

        if (!id || !updated_by)
          throw new Error(`Missing id or updated_by in record #${index + 1}`);

        const existing = await prisma.orderLoginDetails.findFirst({
          where: { id, vendor_id: vendorId, lead_id: leadId },
        });

        if (!existing)
          throw new Error(
            `Order login record #${id} not found for vendor ${vendorId}`
          );

        const updateData: any = {
          estimated_completion_date: estimated_completion_date
            ? new Date(estimated_completion_date)
            : existing.estimated_completion_date,
          updated_by: Number(updated_by),
        };

        // If user marks completed
        if (is_completed) {
          updateData.is_completed = true;
          updateData.completion_date = new Date();
        }

        const updated = await prisma.orderLoginDetails.update({
          where: { id },
          data: updateData,
        });

        results.push(updated);
      } catch (err: any) {
        errors.push({ index, message: err.message });
      }
    }

    return { results, errors };
  }

  async handleFactoryVendorSelection(
    vendorId: number,
    leadId: number,
    updates: any[]
  ) {
    const results = [];
    const errors = [];

    for (const [index, u] of updates.entries()) {
      try {
        const { id, company_vendor_id, remark, updated_by } = u;

        if (!id || !updated_by)
          throw new Error(`Missing id or updated_by in record #${index + 1}`);

        const existing = await prisma.orderLoginDetails.findFirst({
          where: { id, vendor_id: vendorId, lead_id: leadId },
        });

        if (!existing)
          throw new Error(
            `Order login record #${id} not found for vendor ${vendorId}`
          );

        const updated = await prisma.orderLoginDetails.update({
          where: { id },
          data: {
            company_vendor_id: company_vendor_id
              ? Number(company_vendor_id)
              : null,
            factory_user_vendor_selection_remark: remark ?? null,
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

  async updateExpectedOrderLoginReadyDate(
    vendorId: number,
    leadId: number,
    date: string,
    updatedBy: number
  ) {
    // Verify lead belongs to vendor
    const lead = await prisma.leadMaster.findFirst({
      where: { id: leadId, vendor_id: vendorId, is_deleted: false },
    });

    if (!lead) {
      throw new Error(`Lead ${leadId} not found for vendor ${vendorId}`);
    }

    // Update expected date
    const updatedLead = await prisma.leadMaster.update({
      where: { id: leadId },
      data: {
        expected_order_login_ready_date: new Date(date),
        updated_by: updatedBy,
      },
    });

    // Optionally log the change
    await prisma.leadDetailedLogs.create({
      data: {
        vendor_id: vendorId,
        lead_id: leadId,
        account_id: lead.account_id ?? 0,
        action: `Expected Order Login Ready Date updated to ${new Date(
          date
        ).toLocaleString()}`,
        action_type: "UPDATE",
        created_by: updatedBy,
        created_at: new Date(),
      },
    });

    return updatedLead;
  }

  async checkPostProductionReady(
    vendorId: number,
    leadId: number
  ): Promise<{
    readyForPostProduction: boolean;
    all_order_login_dates_added: boolean;
    all_order_login_marked_completed: boolean;
  }> {
    // 1️⃣ Fetch the lead to confirm existence and get the expected date
    const lead = await prisma.leadMaster.findFirst({
      where: { id: leadId, vendor_id: vendorId, is_deleted: false },
      select: { expected_order_login_ready_date: true },
    });

    if (!lead)
      throw new Error(`Lead ${leadId} not found for vendor ${vendorId}`);

    const hasExpectedDate = !!lead.expected_order_login_ready_date;

    // 2️⃣ Fetch all order login records
    const orderLogins = await prisma.orderLoginDetails.findMany({
      where: { vendor_id: vendorId, lead_id: leadId },
      select: {
        id: true,
        is_completed: true,
        estimated_completion_date: true,
      },
    });

    const totalItems = orderLogins.length;

    // 3️⃣ Compute detailed checks
    const all_order_login_dates_added =
      totalItems > 0 &&
      orderLogins.every((item) => !!item.estimated_completion_date);

    const all_order_login_marked_completed =
      totalItems > 0 && orderLogins.every((item) => item.is_completed === true);

    // 4️⃣ Evaluate overall readiness
    const readyForPostProduction =
      totalItems > 0 &&
      all_order_login_dates_added &&
      all_order_login_marked_completed &&
      hasExpectedDate;

    return {
      readyForPostProduction,
      all_order_login_dates_added,
      all_order_login_marked_completed,
    };
  }

  async getLatestOrderLoginByLead(vendorId: number, leadId: number) {
    if (!vendorId || !leadId) {
      const error = new Error("vendor_id and lead_id are required");
      (error as any).statusCode = 400;
      throw error;
    }

    // Fetch the latest order login sorted by estimated_completion_date DESC
    const latestOrder = await prisma.orderLoginDetails.findFirst({
      where: {
        vendor_id: vendorId,
        lead_id: leadId,
        estimated_completion_date: {
          not: null,
        },
      },
      orderBy: {
        estimated_completion_date: "desc",
      },
      select: {
        id: true,
        item_type: true,
        estimated_completion_date: true,
        is_completed: true,
      },
    });

    // If none found, return a simple response instead of throwing an error
    if (!latestOrder) {
      return {
        message: "No order login with estimated completion date added yet.",
        data: null,
      };
    }

    return {
      message: "Latest order login fetched successfully.",
      data: latestOrder,
    };
  }
}
