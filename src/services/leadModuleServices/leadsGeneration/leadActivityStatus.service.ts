import { prisma } from "../../../prisma/client";
import { ActivityStatus, Prisma } from "../../../prisma/generated";
import logger from "../../../utils/logger";
import { cache } from "../../../utils/cache";

export class LeadActivityStatusService {
  // Change status (onHold / lostApproval / lost )
  static async updateStatus(
    leadId: number,
    vendorId: number,
    accountId: number,
    userId: number,
    status: ActivityStatus,
    remark: string,
    createdBy: number,
    dueDate?: string, // 👈 optional param, required only for onHold
  ) {
    if (!remark) {
      throw new Error("Remark is required when changing activity status.");
    }

    return await prisma.$transaction(async (tx) => {
      // 1. Update LeadMaster
      const lead = await tx.leadMaster.update({
        where: { id: leadId, vendor_id: vendorId },
        data: {
          activity_status: status,
          activity_status_remark: remark,
          updated_by: createdBy,
        },
      });

      // 2. Insert into logs
      await tx.leadActivityStatusLog.create({
        data: {
          vendor_id: vendorId,
          account_id: accountId,
          lead_id: leadId,
          user_id: userId,
          activity_status: status,
          activity_status_remark: remark,
          created_by: createdBy,
        },
      });

      // 3. If status is onHold → create a follow-up task
      if (status === ActivityStatus.onHold) {
        if (!dueDate) {
          throw new Error("Due date is required when marking lead as On Hold.");
        }

        const leadStage = lead.status_id
          ? ((
              await tx.statusTypeMaster.findUnique({
                where: { id: lead.status_id },
                select: { type: true },
              })
            )?.type ?? null)
          : null;

        await tx.userLeadTask.create({
          data: {
            lead_id: leadId,
            account_id: accountId,
            vendor_id: vendorId,
            user_id: userId,
            task_type: "Follow Up",
            lead_stage: leadStage,
            due_date: new Date(dueDate),
            remark: remark,
            status: "open", // default anyway
            created_by: createdBy,
          },
        });
      }

      // 🧹 Invalidate Sales-Executive Dashboard Cache
      await cache.del(`dashboard:tasks:${vendorId}:${userId}`);

      // 4️⃣ Insert into LeadDetailedLogs (Audit Trail)
      let actionMessage = "";

      if (status === ActivityStatus.onHold) {
        const formattedDate = new Date(dueDate!).toLocaleDateString("en-IN", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        });
        actionMessage = `Lead has been put On Hold till ${formattedDate}.`;
      } else if (status === ActivityStatus.lostApproval) {
        actionMessage = `Lead has been sent for Lost Approval.`;
      } else if (status === ActivityStatus.lost) {
        actionMessage = `Lead has been marked as Lost.`;
      }

      // 👇 Append remark (if provided)
      if (remark && remark.trim() !== "") {
        actionMessage += ` — Remark: ${remark.trim()}`;
      }

      await tx.leadDetailedLogs.create({
        data: {
          vendor_id: vendorId,
          lead_id: leadId,
          account_id: accountId,
          action: actionMessage,
          action_type: "UPDATE",
          created_by: createdBy,
          created_at: new Date(),
        },
      });

      logger.info(
        "✅ LeadDetailedLogs entry created for activity status change",
        {
          leadId,
          status,
          actionMessage,
        },
      );

      logger.info("Lead activity status updated", { leadId, vendorId, status });
      return lead;
    });
  }

  // Revert to onGoing
  static async revertToOnGoing(
    leadId: number,
    vendorId: number,
    accountId: number,
    userId: number,
    remark: string,
    createdBy: number,
  ) {
    if (!remark) {
      throw new Error("Remark is required when reverting to onGoing.");
    }

    return await prisma.$transaction(async (tx) => {
      // 1️⃣ Update LeadMaster
      const lead = await tx.leadMaster.update({
        where: { id: leadId, vendor_id: vendorId },
        data: {
          activity_status: ActivityStatus.onGoing,
          activity_status_remark: remark,
          updated_by: createdBy,
        },
      });

      // 2️⃣ Insert into LeadActivityStatusLog
      await tx.leadActivityStatusLog.create({
        data: {
          vendor_id: vendorId,
          account_id: accountId,
          lead_id: leadId,
          user_id: userId,
          activity_status: ActivityStatus.onGoing,
          activity_status_remark: remark,
          created_by: createdBy,
        },
      });

      // 3️⃣ Build action message dynamically with remark
      let actionMessage = "Lead has been reverted to Active.";
      if (remark && remark.trim() !== "") {
        actionMessage += ` — Remark: ${remark.trim()}`;
      }

      // 4️⃣ Insert into LeadDetailedLogs (Audit Trail)
      await tx.leadDetailedLogs.create({
        data: {
          vendor_id: vendorId,
          lead_id: leadId,
          account_id: accountId,
          action: actionMessage,
          action_type: "UPDATE",
          created_by: createdBy,
          created_at: new Date(),
        },
      });

      logger.info("✅ LeadDetailedLogs entry created for revert to Active", {
        leadId,
        vendorId,
        actionMessage,
      });

      logger.info("Lead activity status reverted to onGoing", {
        leadId,
        vendorId,
      });
      return lead;
    });
  }

  // Get all onHold leads with product + product structure
  static async getOnHoldLeads(vendorId: number) {
    return prisma.leadMaster.findMany({
      where: {
        vendor_id: vendorId,
        activity_status: ActivityStatus.onHold,
        is_deleted: false,
      },
      include: {
        productMappings: {
          include: {
            productType: true, // assuming relation exists
          },
        },
        leadProductStructureMapping: {
          include: {
            productStructure: true, // assuming relation exists
          },
        },
        statusType: true,
        siteType: true,
      },
      orderBy: { created_at: "desc" },
    });
  }

  // Get all lost leads with product + product structure
  static async getLostLeads(vendorId: number) {
    return prisma.leadMaster.findMany({
      where: {
        vendor_id: vendorId,
        activity_status: ActivityStatus.lost,
        is_deleted: false,
      },
      include: {
        productMappings: {
          include: {
            productType: true,
          },
        },
        leadProductStructureMapping: {
          include: {
            productStructure: true,
          },
        },
        statusType: true,
        siteType: true,
      },
      orderBy: { created_at: "desc" },
    });
  }

  // Get all lostApproval leads with product + product structure
  static async getLostApprovalLeads(vendorId: number) {
    return prisma.leadMaster.findMany({
      where: {
        vendor_id: vendorId,
        activity_status: ActivityStatus.lostApproval,
        is_deleted: false,
      },
      include: {
        productMappings: {
          include: {
            productType: true,
          },
        },
        leadProductStructureMapping: {
          include: {
            productStructure: true,
          },
        },
        statusType: true,
        siteType: true,
      },
      orderBy: { created_at: "desc" },
    });
  }

  // Helper function to add filter conditions
  private static addFilterConditions(
    baseWhere: Prisma.LeadMasterWhereInput,
    filters: {
      global_search?: string;
      filter_lead_code?: string;
      filter_name?: string;
      contact?: string;
      furniture_type?: Array<number | string>;
      furniture_structure?: Array<number | string>;
      site_map_link?: boolean;
      site_type?: Array<number | string>;
      assign_to?: Array<number>;
      site_address?: string;
      source?: Array<number | string>;
      status?: Array<string>; // ONLY STRINGS
      date_range?: { from: string; to: string };
      created_at?: "asc" | "desc";
    },
  ): Prisma.LeadMasterWhereInput {
    const whereClause = { ...baseWhere };

    const addAnd = (condition: Prisma.LeadMasterWhereInput) => {
      if (!whereClause.AND) whereClause.AND = [];
      if (Array.isArray(whereClause.AND)) {
        whereClause.AND.push(condition);
      } else {
        whereClause.AND = [whereClause.AND, condition];
      }
    };

    const toString = (value: unknown) =>
      typeof value === "string" ? value.trim() : "";

    const toArray = (value: unknown): Array<number | string> => {
      if (Array.isArray(value)) return value;
      if (value === undefined || value === null) return [];
      return [value as number | string];
    };

    const parseNumberList = (value: unknown) => {
      const raw = toArray(value);
      const numbers = raw
        .map((item) => Number(item))
        .filter((item) => !Number.isNaN(item));
      const strings = raw
        .filter((item) => Number.isNaN(Number(item)))
        .map((item) => String(item));
      return { numbers, strings };
    };

    // Lead Code Filter
    const leadCode = toString(filters.filter_lead_code);
    if (leadCode) {
      addAnd({ lead_code: { contains: leadCode, mode: "insensitive" } });
    }

    // Name Filter
    const nameFilter = toString(filters.filter_name);
    if (nameFilter) {
      const nameParts = nameFilter.split(/\s+/).filter(Boolean);
      if (nameParts.length >= 2) {
        addAnd({
          AND: [
            {
              firstname: {
                contains: nameParts[0],
                mode: "insensitive",
              },
            },
            {
              lastname: {
                contains: nameParts.slice(1).join(" "),
                mode: "insensitive",
              },
            },
          ],
        });
      } else {
        addAnd({
          OR: [
            { firstname: { contains: nameFilter, mode: "insensitive" } },
            { lastname: { contains: nameFilter, mode: "insensitive" } },
          ],
        });
      }
    }

    // Global Search
    const globalSearch = toString(filters.global_search);
    if (globalSearch) {
      const nameParts = globalSearch.split(/\s+/).filter(Boolean);

      if (nameParts.length >= 2) {
        addAnd({
          OR: [
            {
              AND: [
                {
                  firstname: {
                    contains: nameParts[0],
                    mode: "insensitive",
                  },
                },
                {
                  lastname: {
                    contains: nameParts.slice(1).join(" "),
                    mode: "insensitive",
                  },
                },
              ],
            },
            {
              lead_code: {
                contains: globalSearch,
                mode: "insensitive",
              },
            },
            {
              contact_no: {
                contains: globalSearch,
                mode: "insensitive",
              },
            },
          ],
        });
      } else {
        addAnd({
          OR: [
            {
              firstname: {
                contains: globalSearch,
                mode: "insensitive",
              },
            },
            {
              lastname: {
                contains: globalSearch,
                mode: "insensitive",
              },
            },
            {
              lead_code: {
                contains: globalSearch,
                mode: "insensitive",
              },
            },
            {
              contact_no: {
                contains: globalSearch,
                mode: "insensitive",
              },
            },
          ],
        });
      }
    }

    // Contact Filter
    const contactFilter = toString(filters.contact);
    if (contactFilter) {
      addAnd({
        contact_no: { contains: contactFilter, mode: "insensitive" },
      });
    }

    // Site Address Filter
    const siteAddressFilter = toString(filters.site_address);
    if (siteAddressFilter) {
      addAnd({
        site_address: { contains: siteAddressFilter, mode: "insensitive" },
      });
    }

    // Assign To Filter - ARRAY OF NUMBERS
    if (filters.assign_to !== undefined && filters.assign_to !== null) {
      const assignToArray = toArray(filters.assign_to);
      const assignToNumbers = assignToArray
        .map((item) => Number(item))
        .filter((item) => !Number.isNaN(item));

      if (assignToNumbers.length > 0) {
        addAnd({ assign_to: { in: assignToNumbers } });
      }
    }

    // Site Type Filter
    const siteTypeList = parseNumberList(filters.site_type);
    if (siteTypeList.numbers.length > 0) {
      addAnd({ site_type_id: { in: siteTypeList.numbers } });
    } else if (siteTypeList.strings.length > 0) {
      addAnd({ siteType: { type: { in: siteTypeList.strings } } });
    }

    // Source Filter
    const sourceList = parseNumberList(filters.source);
    if (sourceList.numbers.length > 0) {
      addAnd({ source_id: { in: sourceList.numbers } });
    } else if (sourceList.strings.length > 0) {
      addAnd({ source: { type: { in: sourceList.strings } } });
    }

    // ✅ Status Filter - ONLY STRINGS
    if (
      filters.status &&
      Array.isArray(filters.status) &&
      filters.status.length > 0
    ) {
      addAnd({
        statusType: {
          type: { in: filters.status },
        },
      });
    }

    // Furniture Type Filter
    const furnitureTypes = parseNumberList(filters.furniture_type);
    if (furnitureTypes.numbers.length > 0) {
      addAnd({
        productMappings: {
          some: { product_type_id: { in: furnitureTypes.numbers } },
        },
      });
    } else if (furnitureTypes.strings.length > 0) {
      addAnd({
        productMappings: {
          some: { productType: { type: { in: furnitureTypes.strings } } },
        },
      });
    }

    // Furniture Structure Filter
    const furnitureStructures = parseNumberList(filters.furniture_structure);
    if (furnitureStructures.numbers.length > 0) {
      addAnd({
        leadProductStructureMapping: {
          some: {
            product_structure_id: { in: furnitureStructures.numbers },
          },
        },
      });
    } else if (furnitureStructures.strings.length > 0) {
      addAnd({
        leadProductStructureMapping: {
          some: {
            productStructure: { type: { in: furnitureStructures.strings } },
          },
        },
      });
    }

    // Site Map Link Filter
    if (typeof filters.site_map_link === "boolean") {
      if (filters.site_map_link) {
        addAnd({
          AND: [
            { site_map_link: { not: null } },
            { site_map_link: { not: "" } },
          ],
        });
      } else {
        addAnd({
          OR: [{ site_map_link: null }, { site_map_link: "" }],
        });
      }
    }

    // ✅ Date Range Filter
    const dateRange = filters.date_range;

    if (dateRange && (dateRange.from || dateRange.to)) {
      let fromDate: Date | null = null;
      let toDate: Date | null = null;

      // Parse 'from' date - START of day (00:00:00.000)
      if (dateRange.from) {
        fromDate = new Date(dateRange.from);
        fromDate.setHours(0, 0, 0, 0);
      }

      // Parse 'to' date - END of day (23:59:59.999)
      if (dateRange.to) {
        toDate = new Date(dateRange.to);
        toDate.setHours(23, 59, 59, 999);
      }

      // ✅ Main case: Both dates exist (includes single date scenario)
      // Controller already normalizes single date to: { from: "2024-01-15", to: "2024-01-15" }
      if (fromDate && toDate) {
        addAnd({
          created_at: {
            gte: fromDate, // Start: 2024-01-15 00:00:00.000
            lte: toDate, // End:   2024-01-15 23:59:59.999
          },
        });
      }

      // ✅ Edge case: Only 'from' provided (shouldn't happen after controller normalization)
      else if (fromDate) {
        const endOfDay = new Date(fromDate);
        endOfDay.setHours(23, 59, 59, 999);

        addAnd({
          created_at: {
            gte: fromDate,
            lte: endOfDay,
          },
        });
      }

      // ✅ Edge case: Only 'to' provided
      else if (toDate) {
        addAnd({
          created_at: {
            lte: toDate,
          },
        });
      }
    }

    return whereClause;
  }

  // Get all onHold leads with filters
  static async getOnHoldLeadsFilter(
    vendorId: number,
    page: number = 1,
    limit: number = 10,
    filters: {
      global_search?: string;
      filter_lead_code?: string;
      filter_name?: string;
      contact?: string;
      furniture_type?: Array<number | string>;
      furniture_structure?: Array<number | string>;
      site_map_link?: boolean;
      site_type?: Array<number | string>;
      assign_to?: Array<number>;
      site_address?: string;
      source?: Array<number | string>;
      status?: Array<string>; // New status filter (ONLY STRINGS)
      date_range?: { from: string; to: string }; // New date range filter
      created_at?: "asc" | "desc";
    } = {},
  ): Promise<{ leads: any[]; count: number }> {
    logger.info("[LeadActivityStatusService] getOnHoldLeadsFilter called", {
      vendorId,
      page,
      limit,
    });

    const skip = (page - 1) * limit;
    const orderBy = {
      created_at:
        filters.created_at === "asc"
          ? Prisma.SortOrder.asc
          : Prisma.SortOrder.desc,
    };

    const whereClause = LeadActivityStatusService.addFilterConditions(
      {
        vendor_id: vendorId,
        activity_status: ActivityStatus.onHold,
        is_deleted: false,
      },
      filters,
    );

    const [leads, total] = await Promise.all([
      prisma.leadMaster.findMany({
        where: whereClause,
        include: {
          productMappings: {
            include: {
              productType: true,
            },
          },
          leadProductStructureMapping: {
            include: {
              productStructure: true,
            },
          },
          statusType: true,
          siteType: true,
          source: true,
          assignedTo: { select: { id: true, user_name: true } },
          assignedBy: { select: { id: true, user_name: true } },
          createdBy: { select: { id: true, user_name: true } },
        },
        orderBy,
        skip,
        take: limit,
      }),
      prisma.leadMaster.count({ where: whereClause }),
    ]);

    return { leads, count: total };
  }

  // Get all lost leads with filters
  static async getLostLeadsFilter(
    vendorId: number,
    page: number = 1,
    limit: number = 10,
    filters: {
      global_search?: string;
      filter_lead_code?: string;
      filter_name?: string;
      contact?: string;
      furniture_type?: Array<number | string>;
      furniture_structure?: Array<number | string>;
      site_map_link?: boolean;
      site_type?: Array<number | string>;
      assign_to?: Array<number>;
      site_address?: string;
      source?: Array<number | string>;
      status?: Array<string>; // New status filter
      date_range?: { from: string; to: string }; // New date range filter
      created_at?: "asc" | "desc";
    } = {},
  ): Promise<{ leads: any[]; count: number }> {
    logger.info("[LeadActivityStatusService] getLostLeadsFilter called", {
      vendorId,
      page,
      limit,
    });

    const skip = (page - 1) * limit;
    const orderBy = {
      created_at:
        filters.created_at === "asc"
          ? Prisma.SortOrder.asc
          : Prisma.SortOrder.desc,
    };

    const whereClause = LeadActivityStatusService.addFilterConditions(
      {
        vendor_id: vendorId,
        activity_status: ActivityStatus.lost,
        is_deleted: false,
      },
      filters,
    );

    const [leads, total] = await Promise.all([
      prisma.leadMaster.findMany({
        where: whereClause,
        include: {
          productMappings: {
            include: {
              productType: true,
            },
          },
          leadProductStructureMapping: {
            include: {
              productStructure: true,
            },
          },
          statusType: true,
          siteType: true,
          source: true,
          assignedTo: { select: { id: true, user_name: true } },
          assignedBy: { select: { id: true, user_name: true } },
          createdBy: { select: { id: true, user_name: true } },
        },
        orderBy,
        skip,
        take: limit,
      }),
      prisma.leadMaster.count({ where: whereClause }),
    ]);

    return { leads, count: total };
  }

  // Get all lostApproval leads with filters
  static async getLostApprovalLeadsFilter(
    vendorId: number,
    page: number = 1,
    limit: number = 10,
    filters: {
      global_search?: string;
      filter_lead_code?: string;
      filter_name?: string;
      contact?: string;
      furniture_type?: Array<number | string>;
      furniture_structure?: Array<number | string>;
      site_map_link?: boolean;
      site_type?: Array<number | string>;
      assign_to?: Array<number>;
      site_address?: string;
      source?: Array<number | string>;
      status?: Array<string>; // New status filter
      date_range?: { from: string; to: string }; // New date range filter
      created_at?: "asc" | "desc";
    } = {},
  ): Promise<{ leads: any[]; count: number }> {
    logger.info(
      "[LeadActivityStatusService] getLostApprovalLeadsFilter called",
      {
        vendorId,
        page,
        limit,
      },
    );

    const skip = (page - 1) * limit;
    const orderBy = {
      created_at:
        filters.created_at === "asc"
          ? Prisma.SortOrder.asc
          : Prisma.SortOrder.desc,
    };

    const whereClause = LeadActivityStatusService.addFilterConditions(
      {
        vendor_id: vendorId,
        activity_status: ActivityStatus.lostApproval,
        is_deleted: false,
      },
      filters,
    );

    const [leads, total] = await Promise.all([
      prisma.leadMaster.findMany({
        where: whereClause,
        include: {
          productMappings: {
            include: {
              productType: true,
            },
          },
          leadProductStructureMapping: {
            include: {
              productStructure: true,
            },
          },
          statusType: true,
          siteType: true,
          source: true,
          assignedTo: { select: { id: true, user_name: true } },
          assignedBy: { select: { id: true, user_name: true } },
          createdBy: { select: { id: true, user_name: true } },
        },
        orderBy,
        skip,
        take: limit,
      }),
      prisma.leadMaster.count({ where: whereClause }),
    ]);

    return { leads, count: total };
  }

  static async getActivityStatusCount(vendorId: number) {
    const counts = await prisma.leadMaster.groupBy({
      by: ["activity_status"],
      where: {
        vendor_id: vendorId,
        is_deleted: false,
      },
      _count: {
        id: true,
      },
    });

    // Initialize response
    const response: {
      totalOnGoing: number;
      openOnGoing: number;
      onHold: number;
      lostApproval: number;
      lost: number;
    } = {
      totalOnGoing: 0,
      openOnGoing: 0,
      onHold: 0,
      lostApproval: 0,
      lost: 0,
    };

    // 2️⃣ Fill totals from groupBy
    counts.forEach((c) => {
      if (c.activity_status === "onGoing") {
        response.totalOnGoing = c._count.id;
      } else if (c.activity_status === "onHold") {
        response.onHold = c._count.id;
      } else if (c.activity_status === "lostApproval") {
        response.lostApproval = c._count.id;
      } else if (c.activity_status === "lost") {
        response.lost = c._count.id;
      }
    });

    // 3️⃣ Query for openOnGoing (statusTypeMaster.type = 'open')
    const openOnGoingCount = await prisma.leadMaster.count({
      where: {
        vendor_id: vendorId,
        is_deleted: false,
        activity_status: "onGoing",
        statusType: {
          type: "open", // depends on your StatusTypeMaster records
        },
      },
    });

    response.openOnGoing = openOnGoingCount;

    return response;
  }
}
