
import { prisma, Prisma } from "../../prisma/client";

export class TaskService {
private static activeLeadWhere() {
  return {
    lead: {
      is_deleted: false,
    },
  } satisfies Prisma.UserLeadTaskWhereInput;
}

private static taskIncludes() {
  return {
    select: {
      // ----------------
      // TASK TABLE FIELDS
      // ----------------
      id: true,
      status: true,
      due_date: true,
      task_type: true,
      remark: true,
      closed_by: true,
      closed_at: true,
      created_by: true,
      created_at: true,
      updated_by: true,
      updated_at: true,
      instance_id: true, // ✅ NEW

      // ----------------
      // RELATIONS
      // ----------------

      createdBy: {
        select: {
          id: true,
          user_name: true,
        },
      },

      user: {
        select: {
          id: true,
          user_name: true,
        },
      },

      // ✅ NEW: instance relation
      instance: {
        select: {
          id: true,
          quantity_index: true,
          product_structure_id: true,
          product_type_id: true,
          productStructure: {
            select: {
              type: true,
            },
          },
          productType: {
            select: {
              type: true,
            },
          },
        },
      },

      lead: {
        select: {
          id: true,
          
          account_id: true,
          vendor_id: true,
          lead_code: true,
          firstname: true,
          lastname: true,
          contact_no: true,
          site_map_link: true,
          is_blocked: true,
          lead_blocked_at: true,

          statusType: {
            select: {
              type: true,
            },
          },

          siteType: {
            select: {
              type: true,
            },
          },

          productMappings: {
            select: {
              productType: {
                select: {
                  type: true,
                },
              },
            },
          },

          leadProductStructureMapping: {
            select: {
              productStructure: {
                select: {
                  type: true,
                },
              },
            },
          },
        },
      },
    },
  };
}

private static mapTaskWithLead(task: any) {
  const rawLeadCode = task.lead?.lead_code ?? null;
  const quantityIndex = task.instance?.quantity_index ?? null;

  const displayLeadCode =
    rawLeadCode && quantityIndex !== null && quantityIndex !== undefined
      ? `${rawLeadCode}.${quantityIndex}`
      : rawLeadCode;

  // ✅ Agar instance hai → sirf uska product_structure dikhao
  // ✅ Agar instance nahi → saare lead ke product_structures dikhao
  const productStructure = task.instance
    ? task.instance.productStructure?.type
      ? [task.instance.productStructure.type]
      : []
    : (task.lead?.leadProductStructureMapping ?? []).map(
        (ps: any) => ps.productStructure.type,
      );

  // ✅ Same for product_type
  const productType = task.instance
    ? task.instance.productType?.type
      ? [task.instance.productType.type]
      : []
    : (task.lead?.productMappings ?? []).map(
        (pm: any) => pm.productType.type,
      );

  return {
    userLeadTask: {
      id: task.id,
      status: task.status,
      due_date: task.due_date,
      task_type: task.task_type,
      remark: task.remark,
      closed_by: task.closed_by,
      closed_at: task.closed_at,
      created_by: task.created_by,
      created_by_name: task.createdBy?.user_name || null,
      assigned_to_name: task.user?.user_name || null,
      created_at: task.created_at,
      updated_by: task.updated_by,
      updated_at: task.updated_at,
      instance_id: task.instance_id ?? null,
    },
    leadMaster: {
      id: task.lead?.id,
      account_id: task.lead?.account_id,
      vendor_id: task?.lead?.vendor_id,
      lead_code: displayLeadCode,
      site_map_link: task.lead?.site_map_link,
      name: `${task.lead?.firstname} ${task.lead?.lastname}`,
      phone_number: task.lead?.contact_no,
      site_type: task.lead?.siteType?.type,
      lead_status: task.lead?.statusType?.type,
      product_type: productType,       // ✅ instance-aware
      product_structure: productStructure, // ✅ instance-aware
      instance_id: task.instance_id ?? null, 
      is_blocked: task.lead?.is_blocked ?? false,
      lead_blocked_at: task.lead?.lead_blocked_at ?? null,
    },
    instanceDetails: task.instance
      ? {
          id: task.instance.id,
          quantity_index: task.instance.quantity_index,
          product_structure_id: task.instance.product_structure_id,
          product_structure_type: task.instance.productStructure?.type ?? null,
          product_type_id: task.instance.product_type_id,
          product_type: task.instance.productType?.type ?? null,
        }
      : null,
  };
}

  /**
   * Get all tasks for a given vendor and user, including relations
   */
  static async getTasksByVendorAndUser(vendorId: number, userId: number) {
    const tasks = await prisma.userLeadTask.findMany({
      where: {
        vendor_id: vendorId,
        user_id: userId,
        status: "open",
        ...TaskService.activeLeadWhere(),
      },
      select: {
        id: true,
        status: true,
        due_date: true,
        task_type: true,
        remark: true,
        closed_by: true,
        closed_at: true,
        created_by: true,
        created_at: true,
        updated_by: true,
        updated_at: true,

        // 👤 Who created the task
        createdBy: {
          select: {
            id: true,
            user_name: true,
          },
        },
        user: {
          select: {
            id: true,
            user_name: true,
          },
        },

        // 🔑 Lead details
        lead: {
          select: {
            id: true,
            account_id: true,
            vendor_id: true,
            lead_code: true,
            firstname: true,
            lastname: true,
            contact_no: true,
            site_map_link: true,
            is_blocked: true,
            lead_blocked_at: true,
            statusType: { select: { type: true } },
            siteType: { select: { type: true } },
            productMappings: {
              select: { productType: { select: { type: true } } },
            },
            leadProductStructureMapping: {
              select: { productStructure: { select: { type: true } } },
            },
          },
        },
      },
      orderBy: { created_at: "desc" },
    });

    // ✅ Shape data into your desired format
    return tasks.map((task) => this.mapTaskWithLead(task));
  }

  static async getTasksByVendorAndUser2(
    vendorId: number,
    userId: number,
    franchiseId: number | undefined,
    page: number = 1,
    limit: number = 10,
    filters: {
      global_search?: string;
      lead_code?: string;
      lead_name?: string;
      phone?: string;
      task_type?: string[];
      due_date?: string;
      due_filter?: "today" | "upcoming" | "overdue" | "completed";
      site_map_link?: boolean;
      site_type?: number[];
      product_type?: number[];
      product_structure?: number[];
      assign_by?: number;
      assign_to?: number[];
      created_at?: "asc" | "desc";
      date_range?: { from: string; to: string };
      assignat_range?: { from: string; to: string };
    },
  ): Promise<{
    tasks: any[];
    count: number;
    summary: {
      today: number;
      upcoming: number;
      overdue: number;
      completed: number;
    };
  }> {
    return this.getTasksByVendorAndUserReport(
      vendorId,
      userId,
      franchiseId,
      page,
      limit,
      filters,
      false,
    );
  }

  static async getTasksByVendorAndUserReport(
    vendorId: number,
    userId: number,
    franchiseId: number | undefined,
    page: number = 1,
    limit: number = 10,
    filters: {
      global_search?: string;
      lead_code?: string;
      lead_name?: string;
      phone?: string;
      task_type?: string[];
      due_date?: string;
      due_filter?: "today" | "upcoming" | "overdue" | "completed";
      site_map_link?: boolean;
      site_type?: number[];
      product_type?: number[];
      product_structure?: number[];
      assign_by?: number;
      assign_to?: number[];
      created_at?: "asc" | "desc";
      date_range?: { from: string; to: string };
      assignat_range?: { from: string; to: string };
    },
    includeAllStatuses: boolean = true,
  ): Promise<{
    tasks: any[];
    count: number;
    summary: {
      today: number;
      upcoming: number;
      overdue: number;
      completed: number;
    };
  }> {
    // USER ROLE RESOLUTION
    const creator = await prisma.userMaster.findUnique({
      where: { id: userId },
      include: { user_type: true },
    });

    const normalizedUserType = creator?.user_type?.user_type?.toLowerCase();
    const isAdmin = normalizedUserType === "admin";
    const shouldIncludeFranchise = [
      "sales-executive",
      "admin",
      "super-admin",
    ].includes(normalizedUserType ?? "");
    const includeFranchise = shouldIncludeFranchise && !!franchiseId;

    const skip = (page - 1) * limit;

    const orderBy = {
      created_at:
        filters.created_at === "asc"
          ? Prisma.SortOrder.asc
          : Prisma.SortOrder.desc,
    };

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    // ============================
    // FILTER ENGINE
    // ============================

    const addFilterConditions = (whereClause: any) => {
      const addAnd = (condition: any) => {
        if (!whereClause.AND) whereClause.AND = [];
        if (Array.isArray(whereClause.AND)) {
          whereClause.AND.push(condition);
        } else {
          whereClause.AND = [whereClause.AND, condition];
        }
      };

      const toString = (val: unknown) =>
        typeof val === "string" ? val.trim() : "";

      if (filters.task_type?.length) {
        addAnd({ task_type: { in: filters.task_type } });
      }

      if (filters.assign_by) {
        addAnd({ created_by: filters.assign_by });
      }

      if (filters.assign_to?.length) {
        const ids = filters.assign_to.map(Number).filter((id) => !isNaN(id));

        if (ids.length) {
          addAnd({
            user_id: { in: ids },
          });
        }
      }

      if (filters.due_date && !filters.due_filter) {
        const parsedDate = new Date(filters.due_date);
        if (!isNaN(parsedDate.getTime())) {
          addAnd({
            due_date: {
              gte: new Date(filters.due_date + "T00:00:00.000Z"),
              lte: new Date(filters.due_date + "T23:59:59.999Z"),
            },
          });
        }
      }

      const globalSearch = toString(filters.global_search);

      if (globalSearch) {
        const nameParts = globalSearch.split(/\s+/).filter(Boolean);

        if (nameParts.length >= 2) {
          addAnd({
            OR: [
              {
                lead: {
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
              },
              {
                lead: {
                  lead_code: { contains: globalSearch, mode: "insensitive" },
                },
              },
              {
                lead: {
                  contact_no: { contains: globalSearch, mode: "insensitive" },
                },
              },
            ],
          });
        } else {
          addAnd({
            OR: [
              {
                lead: {
                  firstname: { contains: globalSearch, mode: "insensitive" },
                },
              },
              {
                lead: {
                  lastname: { contains: globalSearch, mode: "insensitive" },
                },
              },
              {
                lead: {
                  lead_code: { contains: globalSearch, mode: "insensitive" },
                },
              },
              {
                lead: {
                  contact_no: { contains: globalSearch, mode: "insensitive" },
                },
              },
            ],
          });
        }
      }

      const leadCode = toString(filters.lead_code);
      if (leadCode) {
        addAnd({
          lead: { lead_code: { contains: leadCode, mode: "insensitive" } },
        });
      }

      const phone = toString(filters.phone);
      if (phone) {
        addAnd({
          lead: { contact_no: { contains: phone, mode: "insensitive" } },
        });
      }

      const leadName = toString(filters.lead_name);
      if (leadName) {
        addAnd({
          lead: {
            OR: [
              { firstname: { contains: leadName, mode: "insensitive" } },
              { lastname: { contains: leadName, mode: "insensitive" } },
            ],
          },
        });
      }

      if (typeof filters.site_map_link === "boolean") {
        if (filters.site_map_link) {
          addAnd({
            lead: {
              AND: [
                { site_map_link: { not: null } },
                { site_map_link: { not: "" } },
              ],
            },
          });
        } else {
          addAnd({
            lead: {
              OR: [{ site_map_link: null }, { site_map_link: "" }],
            },
          });
        }
      }

      if (filters.site_type?.length) {
        addAnd({
          lead: { site_type_id: { in: filters.site_type } },
        });
      }

      if (filters.product_type?.length) {
        addAnd({
          lead: {
            productMappings: {
              some: { product_type_id: { in: filters.product_type } },
            },
          },
        });
      }

      // ============================
      // CREATED_AT FILTER (Task Creation Date)
      // ============================

      if (filters.date_range) {
        const { from, to } = filters.date_range;

        if (from || to) {
          const createdAtFilter: any = {};

          if (from) {
            createdAtFilter.gte = new Date(`${from}T00:00:00`);
          }

          if (to) {
            createdAtFilter.lte = new Date(`${to}T23:59:59`);
          }

          addAnd({
            due_date: createdAtFilter,
          });
        }
      }

      if (filters.assignat_range) {
        const { from, to } = filters.assignat_range;

        if (from || to) {
          const createdAtFilter: any = {};

          if (from) {
            createdAtFilter.gte = new Date(`${from}T00:00:00`);
          }

          if (to) {
            createdAtFilter.lte = new Date(`${to}T23:59:59`);
          }

          addAnd({
            created_at: createdAtFilter,
          });
        }
      }

      if (filters.product_structure?.length) {
        addAnd({
          lead: {
            leadProductStructureMapping: {
              some: { product_structure_id: { in: filters.product_structure } },
            },
          },
        });
      }

      return whereClause;
    };

    // ============================
    // ADMIN FLOW                  
    // ============================

    if (isAdmin) {
      const activeStatusFilter = { status: { in: ["open", "in_progress"] } };
      const completedStatusFilter = { status: "completed" as const };
      const dataStatusFilter =
        filters.due_filter === "completed"
          ? completedStatusFilter
          : includeAllStatuses
            ? {}
            : activeStatusFilter;

      // ✅ UNFILTERED BASE (for inactive tabs)
      const unfilteredBaseWhereClause: any = {
        vendor_id: vendorId,
        user_id: userId,
        ...TaskService.activeLeadWhere(),
        ...(includeAllStatuses ? {} : activeStatusFilter),
      };
      const completedBaseWhereClause: any = {
        vendor_id: vendorId,
        user_id: userId,
        ...TaskService.activeLeadWhere(),
        ...completedStatusFilter,
      };
      if (includeFranchise) {
        unfilteredBaseWhereClause.franchise_id = franchiseId;
        completedBaseWhereClause.franchise_id = franchiseId;
      }

      // ✅ FILTERED BASE (for active tab)
      const filteredBaseWhereClause = addFilterConditions({
        vendor_id: vendorId,
        user_id: userId,
        ...TaskService.activeLeadWhere(),
        ...dataStatusFilter,
      });
      if (includeFranchise) {
        filteredBaseWhereClause.franchise_id = franchiseId;
      }

      const dataWhereClause: any = { ...filteredBaseWhereClause };

      if (filters.due_filter === "today") {
        dataWhereClause.AND = [
          ...(dataWhereClause.AND || []),
          { due_date: { gte: todayStart, lte: todayEnd } },
        ];
      }

      if (filters.due_filter === "upcoming") {
        dataWhereClause.AND = [
          ...(dataWhereClause.AND || []),
          { due_date: { gt: todayEnd } },
        ];
      }

      if (filters.due_filter === "overdue") {
        dataWhereClause.AND = [
          ...(dataWhereClause.AND || []),
          { due_date: { lt: todayStart } },
        ];
      }

      // ✅ SMART SUMMARY CALCULATION
      let todayCount = 0;
      let upcomingCount = 0;
      let overdueCount = 0;
      let completedCount = 0;

      if (filters.due_filter === "today") {
        todayCount = await prisma.userLeadTask.count({
          where: dataWhereClause, // filtered
        });

        [upcomingCount, overdueCount] = await Promise.all([
          prisma.userLeadTask.count({
            where: {
              ...unfilteredBaseWhereClause,
              due_date: { gt: todayEnd },
            },
          }),
          prisma.userLeadTask.count({
            where: {
              ...unfilteredBaseWhereClause,
              due_date: { lt: todayStart },
            },
          }),
        ]);
      } else if (filters.due_filter === "upcoming") {
        upcomingCount = await prisma.userLeadTask.count({
          where: dataWhereClause, // filtered
        });

        [todayCount, overdueCount] = await Promise.all([
          prisma.userLeadTask.count({
            where: {
              ...unfilteredBaseWhereClause,
              due_date: { gte: todayStart, lte: todayEnd },
            },
          }),
          prisma.userLeadTask.count({
            where: {
              ...unfilteredBaseWhereClause,
              due_date: { lt: todayStart },
            },
          }),
        ]);
      } else if (filters.due_filter === "overdue") {
        overdueCount = await prisma.userLeadTask.count({
          where: dataWhereClause, // filtered
        });

        [todayCount, upcomingCount] = await Promise.all([
          prisma.userLeadTask.count({
            where: {
              ...unfilteredBaseWhereClause,
              due_date: { gte: todayStart, lte: todayEnd },
            },
          }),
          prisma.userLeadTask.count({
            where: {
              ...unfilteredBaseWhereClause,
              due_date: { gt: todayEnd },
            },
          }),
        ]);
      } else {
        // No filter selected
        [todayCount, upcomingCount, overdueCount] = await Promise.all([
          prisma.userLeadTask.count({
            where: {
              ...unfilteredBaseWhereClause,
              due_date: { gte: todayStart, lte: todayEnd },
            },
          }),
          prisma.userLeadTask.count({
            where: {
              ...unfilteredBaseWhereClause,
              due_date: { gt: todayEnd },
            },
          }),
          prisma.userLeadTask.count({
            where: {
              ...unfilteredBaseWhereClause,
              due_date: { lt: todayStart },
            },
          }),
        ]);
      }

      completedCount =
        filters.due_filter === "completed"
          ? await prisma.userLeadTask.count({
              where: dataWhereClause,
            })
          : await prisma.userLeadTask.count({
              where: completedBaseWhereClause,
            });

      const [tasks, total] = await Promise.all([
        prisma.userLeadTask.findMany({
          where: dataWhereClause,
          select: TaskService.taskIncludes().select,
          orderBy,
          skip,
          take: limit,
        }),

        prisma.userLeadTask.count({ where: dataWhereClause }),
      ]);

      return {
        tasks: tasks.map((t) => this.mapTaskWithLead(t)),
        count: total,
        summary: {
          today: todayCount,
          upcoming: upcomingCount,
          overdue: overdueCount,
          completed: completedCount,
        },
      };
    }

    // ============================
    // NON-ADMIN FLOW
    // ============================
 
    if (normalizedUserType === "telecaller" || normalizedUserType === "telecaller-team-lead" || normalizedUserType === "telecaller team lead") {
      const baseWhere: any = {
        vendor_id: vendorId,
        assign_to: userId,
      };
 
      const lostStatusFilter: any = {
        online_lead_followup_status: {
          status_name: {
            equals: "lost",
            mode: "insensitive"
          }
        }
      };
 
      let todayCount = 0;
      let upcomingCount = 0;
      let overdueCount = 0;
      let completedCount = 0;
 
      [todayCount, upcomingCount, overdueCount, completedCount] = await Promise.all([
        prisma.online_leads.count({
          where: {
            ...baseWhere,
            follow_up_date: { gte: todayStart, lte: todayEnd },
            online_lead_followup_status: { status_name: { not: "lost", mode: "insensitive" } }
          }
        }),
        prisma.online_leads.count({
          where: {
            ...baseWhere,
            follow_up_date: { gt: todayEnd },
            online_lead_followup_status: { status_name: { not: "lost", mode: "insensitive" } }
          }
        }),
        prisma.online_leads.count({
          where: {
            ...baseWhere,
            follow_up_date: { lt: todayStart },
            online_lead_followup_status: { status_name: { not: "lost", mode: "insensitive" } }
          }
        }),
        prisma.online_leads.count({
          where: {
            ...baseWhere,
            OR: [
              lostStatusFilter,
              { online_lead_followup_status: { status_name: { in: ["converted", "store assigned"], mode: "insensitive" } } }
            ]
          }
        })
      ]);
 
      let dataWhereClause: any = { ...baseWhere };
      if (filters.due_filter === "today") {
        dataWhereClause = {
          ...baseWhere,
          follow_up_date: { gte: todayStart, lte: todayEnd },
          online_lead_followup_status: { status_name: { not: "lost", mode: "insensitive" } }
        };
      } else if (filters.due_filter === "upcoming") {
        dataWhereClause = {
          ...baseWhere,
          follow_up_date: { gt: todayEnd },
          online_lead_followup_status: { status_name: { not: "lost", mode: "insensitive" } }
        };
      } else if (filters.due_filter === "overdue") {
        dataWhereClause = {
          ...baseWhere,
          follow_up_date: { lt: todayStart },
          online_lead_followup_status: { status_name: { not: "lost", mode: "insensitive" } }
        };
      } else if (filters.due_filter === "completed") {
        dataWhereClause = {
          ...baseWhere,
          OR: [
            lostStatusFilter,
            { online_lead_followup_status: { status_name: { in: ["converted", "store assigned"], mode: "insensitive" } } }
          ]
        };
      } else {
        dataWhereClause = {
          ...baseWhere,
          OR: [
            { follow_up_date: { not: null } },
            lostStatusFilter
          ]
        };
      }
 
      const total = await prisma.online_leads.count({ where: dataWhereClause });
      const onlineLeads = await prisma.online_leads.findMany({
        where: dataWhereClause,
        include: {
          online_lead_followup_status: true,
          UserMaster_online_leads_assign_toToUserMaster: true,
        },
        orderBy: {
          created_at: filters.created_at === "asc" ? "asc" : "desc",
        },
        skip,
        take: limit,
      });
 
      const mappedTasks = onlineLeads.map((lead: any) => {
        const isLost = lead.online_lead_followup_status?.status_name.toLowerCase() === "lost";
        const taskType = isLost ? "Lost Lead" : "Follow Up";
        const taskStatus = isLost ? "lost" : "open";
 
        return {
          userLeadTask: {
            id: lead.id,
            status: taskStatus,
            due_date: lead.follow_up_date,
            task_type: taskType,
            remark: lead.remark || null,
            closed_by: isLost ? lead.assign_to : null,
            closed_at: isLost ? lead.updated_at : null,
            created_by: lead.assign_to || null,
            created_by_name: lead.UserMaster_online_leads_assign_toToUserMaster?.user_name || null,
            assigned_to_name: lead.UserMaster_online_leads_assign_toToUserMaster?.user_name || null,
            created_at: lead.created_at,
            updated_by: null,
            updated_at: lead.updated_at,
            instance_id: null,
          },
          leadMaster: {
            id: lead.id,
            account_id: null,
            vendor_id: lead.vendor_id,
            lead_code: lead.lead_code || `Lead #${lead.id}`,
            site_map_link: null,
            name: lead.leads_name || "—",
            phone_number: lead.contact,
            site_type: null,
            lead_status: lead.online_lead_followup_status?.status_name || "New Lead",
            product_type: lead.product_types || [],
            product_structure: lead.product_structures || [],
            instance_id: null,
            is_blocked: false,
            lead_blocked_at: null,
            isOnlineLead: true,
          },
          instanceDetails: null,
        };
      });
 
      return {
        tasks: mappedTasks,
        count: total,
        summary: {
          today: todayCount,
          upcoming: upcomingCount,
          overdue: overdueCount,
          completed: completedCount,
        },
      };
    }

    const ownedTasks = await prisma.userLeadTask.findMany({
      where: {
        vendor_id: vendorId,
        user_id: userId,
        ...TaskService.activeLeadWhere(),
        ...(includeFranchise ? { franchise_id: franchiseId } : {}),
      },
      select: { id: true },
    });

    const taskIds = ownedTasks.map((t) => t.id);

    if (!taskIds.length) {
      return {
        tasks: [],
        count: 0,
        summary: { today: 0, upcoming: 0, overdue: 0, completed: 0 },
      };
    }

    // ✅ UNFILTERED BASE (for inactive tabs)
    const activeStatusFilter = { status: { in: ["open", "in_progress"] } };
    const completedStatusFilter = { status: "completed" as const };
    const dataStatusFilter =
      filters.due_filter === "completed"
        ? completedStatusFilter
        : includeAllStatuses
          ? {}
          : activeStatusFilter;

    const unfilteredBaseWhereClause: any = {
      id: { in: taskIds },
      vendor_id: vendorId,
      ...TaskService.activeLeadWhere(),
      ...(includeAllStatuses ? {} : activeStatusFilter),
    };
    const completedBaseWhereClause: any = {
      id: { in: taskIds },
      vendor_id: vendorId,
      ...TaskService.activeLeadWhere(),
      ...completedStatusFilter,
    };
    if (includeFranchise) {
      unfilteredBaseWhereClause.franchise_id = franchiseId;
      completedBaseWhereClause.franchise_id = franchiseId;
    }

    // ✅ FILTERED BASE (for active tab)
    const filteredBaseWhereClause = addFilterConditions({
      id: { in: taskIds },
      vendor_id: vendorId,
      ...TaskService.activeLeadWhere(),
      ...dataStatusFilter,
    });
    if (includeFranchise) {
      filteredBaseWhereClause.franchise_id = franchiseId;
    }

    const dataWhereClause: any = { ...filteredBaseWhereClause };

    if (filters.due_filter === "today") {
      dataWhereClause.AND = [
        ...(dataWhereClause.AND || []),
        { due_date: { gte: todayStart, lte: todayEnd } },
      ];
    }

    if (filters.due_filter === "upcoming") {
      dataWhereClause.AND = [
        ...(dataWhereClause.AND || []),
        { due_date: { gt: todayEnd } },
      ];
    }

    if (filters.due_filter === "overdue") {
      dataWhereClause.AND = [
        ...(dataWhereClause.AND || []),
        { due_date: { lt: todayStart } },
      ];
    }

    // ✅ SMART SUMMARY CALCULATION
    let todayCount = 0;
    let upcomingCount = 0;
    let overdueCount = 0;
    let completedCount = 0;

    if (filters.due_filter === "today") {
      todayCount = await prisma.userLeadTask.count({
        where: dataWhereClause, // filtered
      });

      [upcomingCount, overdueCount] = await Promise.all([
        prisma.userLeadTask.count({
          where: {
            ...unfilteredBaseWhereClause,
            due_date: { gt: todayEnd },
          },
        }),
        prisma.userLeadTask.count({
          where: {
            ...unfilteredBaseWhereClause,
            due_date: { lt: todayStart },
          },
        }),
      ]);
    } else if (filters.due_filter === "upcoming") {
      upcomingCount = await prisma.userLeadTask.count({
        where: dataWhereClause, // filtered
      });

      [todayCount, overdueCount] = await Promise.all([
        prisma.userLeadTask.count({
          where: {
            ...unfilteredBaseWhereClause,
            due_date: { gte: todayStart, lte: todayEnd },
          },
        }),
        prisma.userLeadTask.count({
          where: {
            ...unfilteredBaseWhereClause,
            due_date: { lt: todayStart },
          },
        }),
      ]);
    } else if (filters.due_filter === "overdue") {
      overdueCount = await prisma.userLeadTask.count({
        where: dataWhereClause, // filtered
      });

      [todayCount, upcomingCount] = await Promise.all([
        prisma.userLeadTask.count({
          where: {
            ...unfilteredBaseWhereClause,
            due_date: { gte: todayStart, lte: todayEnd },
          },
        }),
        prisma.userLeadTask.count({
          where: {
            ...unfilteredBaseWhereClause,
            due_date: { gt: todayEnd },
          },
        }),
      ]);
    } else {
      // No filter selected
      [todayCount, upcomingCount, overdueCount] = await Promise.all([
        prisma.userLeadTask.count({
          where: {
            ...unfilteredBaseWhereClause,
            due_date: { gte: todayStart, lte: todayEnd },
          },
        }),
        prisma.userLeadTask.count({
          where: {
            ...unfilteredBaseWhereClause,
            due_date: { gt: todayEnd },
          },
        }),
        prisma.userLeadTask.count({
          where: {
            ...unfilteredBaseWhereClause,
            due_date: { lt: todayStart },
          },
        }),
      ]);
    }

    completedCount =
      filters.due_filter === "completed"
        ? await prisma.userLeadTask.count({
            where: dataWhereClause,
          })
        : await prisma.userLeadTask.count({
            where: completedBaseWhereClause,
          });

    const [tasks, total] = await Promise.all([
      prisma.userLeadTask.findMany({
        where: dataWhereClause,
        select: TaskService.taskIncludes().select,
        orderBy,
        skip,
        take: limit,
      }),

      prisma.userLeadTask.count({ where: dataWhereClause }),
    ]);

    return {
      tasks: tasks.map((t) => this.mapTaskWithLead(t)),
      count: total,
      summary: {
        today: todayCount,
        upcoming: upcomingCount,
        overdue: overdueCount,
        completed: completedCount,
      },
    };
  }

  /**
   * Get all tasks for a given vendor (admin view)
   */
  static async getTasksByVendor(vendorId: number) {
    const tasks = await prisma.userLeadTask.findMany({
      where: {
        vendor_id: vendorId,
        status: { in: ["open", "in_progress"] },
        ...TaskService.activeLeadWhere(),
      },
      select: {
        id: true,
        status: true,
        due_date: true,
        task_type: true,
        remark: true,
        closed_by: true,
        closed_at: true,
        created_by: true,
        created_at: true,
        updated_by: true,
        updated_at: true,
        createdBy: {
          select: {
            id: true,
            user_name: true,
          },
        },
        user: {
          select: {
            id: true,
            user_name: true,
          },
        },
        lead: {
          select: {
            id: true,
            account_id: true,
            vendor_id: true,
            lead_code: true,
            firstname: true,
            lastname: true,
            contact_no: true,
            site_map_link: true,
            statusType: { select: { type: true } },
            siteType: { select: { type: true } },
            productMappings: {
              select: { productType: { select: { type: true } } },
            },
            leadProductStructureMapping: {
              select: { productStructure: { select: { type: true } } },
            },
          },
        },
      },
      orderBy: { created_at: "desc" },
    });

    return tasks.map((task) => this.mapTaskWithLead(task));
  }

  static async getTasksFilterByVendor2(
    vendorId: number,
    franchiseId: number,
    page: number = 1,
    limit: number = 10,
    filters: {
      global_search?: string;
      lead_code?: string;
      lead_name?: string;
      phone?: string;
      task_type?: string[];
      due_date?: string;
      due_filter?: "today" | "upcoming" | "overdue" | "completed";
      site_map_link?: boolean;
      site_type?: number[];
      product_type?: number[];
      product_structure?: number[];
      assign_by?: number;
      assign_to?: number[];
      created_at?: "asc" | "desc";
      date_range?: { from: string; to: string };
      assignat_range?: { from: string; to: string };
    },
  ): Promise<{
    tasks: any[];
    count: number;
    summary: {
      today: number;
      upcoming: number;
      overdue: number;
      completed: number;
    };
  }> {
    return this.getTasksFilterByVendorReport(
      vendorId,
      franchiseId,
      page,
      limit,
      filters,
      false,
    );
  }

  static async getTasksFilterByVendorReport(
    vendorId: number,
    franchiseId: number,
    page: number = 1,
    limit: number = 10,
    filters: {
      global_search?: string;
      lead_code?: string;
      lead_name?: string;
      phone?: string;
      task_type?: string[];
      due_date?: string;
      due_filter?: "today" | "upcoming" | "overdue" | "completed";
      site_map_link?: boolean;
      site_type?: number[];
      product_type?: number[];
      product_structure?: number[];
      assign_by?: number;
      assign_to?: number[];
      created_at?: "asc" | "desc";
      date_range?: { from: string; to: string };
      assignat_range?: { from: string; to: string };
    },
    includeAllStatuses: boolean = true,
  ): Promise<{
    tasks: any[];
    count: number;
    summary: {
      today: number;
      upcoming: number;
      overdue: number;
      completed: number;
    };
  }> {
    const skip = (page - 1) * limit;

    const orderBy = {
      created_at:
        filters.created_at === "asc"
          ? Prisma.SortOrder.asc
          : Prisma.SortOrder.desc,
    };

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    // ============================
    // FILTER ENGINE
    // ============================

    const addFilterConditions = (whereClause: any, includeDueFilter = true) => {
      const addAnd = (condition: any) => {
        if (!whereClause.AND) whereClause.AND = [];
        if (Array.isArray(whereClause.AND)) {
          whereClause.AND.push(condition);
        } else {
          whereClause.AND = [whereClause.AND, condition];
        }
      };

      const toString = (val: unknown) =>
        typeof val === "string" ? val.trim() : "";

      // TASK FILTERS
      if (filters.task_type?.length) {
        addAnd({ task_type: { in: filters.task_type } });
      }

      if (filters.assign_by) {
        addAnd({ created_by: filters.assign_by });
      }

      if (filters.assign_to?.length) {
        const ids = filters.assign_to.map(Number).filter((id) => !isNaN(id));

        if (ids.length) {
          addAnd({
            user_id: { in: ids },
          });
        }
      }

      if (filters.due_date && !filters.due_filter) {
        addAnd({
          due_date: {
            gte: new Date(filters.due_date + "T00:00:00.000Z"),
            lte: new Date(filters.due_date + "T23:59:59.999Z"),
          },
        });
      }

      // GLOBAL SEARCH
      const globalSearch = toString(filters.global_search);

      if (globalSearch) {
        const nameParts = globalSearch.split(/\s+/).filter(Boolean);

        if (nameParts.length >= 2) {
          addAnd({
            OR: [
              {
                lead: {
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
              },
              {
                lead: {
                  lead_code: { contains: globalSearch, mode: "insensitive" },
                },
              },
              {
                lead: {
                  contact_no: { contains: globalSearch, mode: "insensitive" },
                },
              },
            ],
          });
        } else {
          addAnd({
            OR: [
              {
                lead: {
                  firstname: { contains: globalSearch, mode: "insensitive" },
                },
              },
              {
                lead: {
                  lastname: { contains: globalSearch, mode: "insensitive" },
                },
              },
              {
                lead: {
                  lead_code: { contains: globalSearch, mode: "insensitive" },
                },
              },
              {
                lead: {
                  contact_no: { contains: globalSearch, mode: "insensitive" },
                },
              },
            ],
          });
        }
      }

      // LEAD FILTERS
      const leadCode = toString(filters.lead_code);
      if (leadCode) {
        addAnd({
          lead: { lead_code: { contains: leadCode, mode: "insensitive" } },
        });
      }

      const phone = toString(filters.phone);
      if (phone) {
        addAnd({
          lead: { contact_no: { contains: phone, mode: "insensitive" } },
        });
      }

      const leadName = toString(filters.lead_name);
      if (leadName) {
        addAnd({
          lead: {
            OR: [
              { firstname: { contains: leadName, mode: "insensitive" } },
              { lastname: { contains: leadName, mode: "insensitive" } },
            ],
          },
        });
      }

      if (typeof filters.site_map_link === "boolean") {
        if (filters.site_map_link) {
          addAnd({
            lead: {
              AND: [
                { site_map_link: { not: null } },
                { site_map_link: { not: "" } },
              ],
            },
          });
        } else {
          addAnd({
            lead: {
              OR: [{ site_map_link: null }, { site_map_link: "" }],
            },
          });
        }
      }

      if (filters.site_type?.length) {
        addAnd({
          lead: { site_type_id: { in: filters.site_type } },
        });
      }

      // ============================
      // CREATED_AT FILTER (Task Creation Date)
      // ============================

      if (filters.date_range) {
        const { from, to } = filters.date_range;

        if (from || to) {
          const createdAtFilter: any = {};

          if (from) {
            createdAtFilter.gte = new Date(`${from}T00:00:00`);
          }

          if (to) {
            createdAtFilter.lte = new Date(`${to}T23:59:59`);
          }

          addAnd({
            due_date: createdAtFilter,
          });
        }
      }

      if (filters.assignat_range) {
        const { from, to } = filters.assignat_range;

        if (from || to) {
          const createdAtFilter: any = {};

          if (from) {
            createdAtFilter.gte = new Date(`${from}T00:00:00`);
          }

          if (to) {
            createdAtFilter.lte = new Date(`${to}T23:59:59`);
          }

          addAnd({
            created_at: createdAtFilter,
          });
        }
      }

      if (filters.product_type?.length) {
        addAnd({
          lead: {
            productMappings: {
              some: { product_type_id: { in: filters.product_type } },
            },
          },
        });
      }

      if (filters.product_structure?.length) {
        addAnd({
          lead: {
            leadProductStructureMapping: {
              some: {
                product_structure_id: { in: filters.product_structure },
              },
            },
          },
        });
      }

      return whereClause;
    };

    // ============================
    // ✅ BASE QUERY - WITHOUT ANY FILTERS (for unfiltered counts)
    // ============================

    const activeStatusFilter = { status: { in: ["open", "in_progress"] } };
    const completedStatusFilter = { status: "completed" as const };
    const dataStatusFilter =
      filters.due_filter === "completed"
        ? completedStatusFilter
        : includeAllStatuses
          ? {}
          : activeStatusFilter;

    const unfilteredBaseWhereClause: any = {
      vendor_id: vendorId,
      franchise_id: franchiseId,
      ...TaskService.activeLeadWhere(),
      ...(includeAllStatuses ? {} : activeStatusFilter),
    };
    const completedBaseWhereClause: any = {
      vendor_id: vendorId,
      franchise_id: franchiseId,
      ...TaskService.activeLeadWhere(),
      ...completedStatusFilter,
    };

    // ============================
    // ✅ FILTERED BASE QUERY - WITH ALL FILTERS (for active tab)
    // ============================

    const filteredBaseWhereClause: any = addFilterConditions({
      vendor_id: vendorId,
      franchise_id: franchiseId,
      ...TaskService.activeLeadWhere(),
      ...dataStatusFilter,
    });

    // ============================
    // ✅ DATA QUERY - Apply due_filter to filtered base
    // ============================

    const dataWhereClause: any = { ...filteredBaseWhereClause };

    if (filters.due_filter === "today") {
      dataWhereClause.AND = [
        ...(dataWhereClause.AND || []),
        { due_date: { gte: todayStart, lte: todayEnd } },
      ];
    }

    if (filters.due_filter === "upcoming") {
      dataWhereClause.AND = [
        ...(dataWhereClause.AND || []),
        { due_date: { gt: todayEnd } },
      ];
    }

    if (filters.due_filter === "overdue") {
      dataWhereClause.AND = [
        ...(dataWhereClause.AND || []),
        { due_date: { lt: todayStart } },
      ];
    }

    // ============================
    // ✅ SUMMARY CALCULATION
    // Active tab: filtered count
    // Other tabs: unfiltered count
    // ============================

    let todayCount = 0;
    let upcomingCount = 0;
    let overdueCount = 0;
    let completedCount = 0;

    if (filters.due_filter === "today") {
      // Today is active → filtered count
      todayCount = await prisma.userLeadTask.count({
        where: dataWhereClause,
      });

      // Other tabs → unfiltered count
      [upcomingCount, overdueCount] = await Promise.all([
        prisma.userLeadTask.count({
          where: {
            ...unfilteredBaseWhereClause,
            due_date: { gt: todayEnd },
          },
        }),
        prisma.userLeadTask.count({
          where: {
            ...unfilteredBaseWhereClause,
            due_date: { lt: todayStart },
          },
        }),
      ]);
    } else if (filters.due_filter === "upcoming") {
      // Upcoming is active → filtered count
      upcomingCount = await prisma.userLeadTask.count({
        where: dataWhereClause,
      });

      // Other tabs → unfiltered count
      [todayCount, overdueCount] = await Promise.all([
        prisma.userLeadTask.count({
          where: {
            ...unfilteredBaseWhereClause,
            due_date: { gte: todayStart, lte: todayEnd },
          },
        }),
        prisma.userLeadTask.count({
          where: {
            ...unfilteredBaseWhereClause,
            due_date: { lt: todayStart },
          },
        }),
      ]);
    } else if (filters.due_filter === "overdue") {
      // Overdue is active → filtered count
      overdueCount = await prisma.userLeadTask.count({
        where: dataWhereClause,
      });

      // Other tabs → unfiltered count
      [todayCount, upcomingCount] = await Promise.all([
        prisma.userLeadTask.count({
          where: {
            ...unfilteredBaseWhereClause,
            due_date: { gte: todayStart, lte: todayEnd },
          },
        }),
        prisma.userLeadTask.count({
          where: {
            ...unfilteredBaseWhereClause,
            due_date: { gt: todayEnd },
          },
        }),
      ]);
    } else {
      // No filter selected → all unfiltered
      [todayCount, upcomingCount, overdueCount] = await Promise.all([
        prisma.userLeadTask.count({
          where: {
            ...unfilteredBaseWhereClause,
            due_date: { gte: todayStart, lte: todayEnd },
          },
        }),
        prisma.userLeadTask.count({
          where: {
            ...unfilteredBaseWhereClause,
            due_date: { gt: todayEnd },
          },
        }),
        prisma.userLeadTask.count({
          where: {
            ...unfilteredBaseWhereClause,
            due_date: { lt: todayStart },
          },
        }),
      ]);
    }

    completedCount =
      filters.due_filter === "completed"
        ? await prisma.userLeadTask.count({
            where: dataWhereClause,
          })
        : await prisma.userLeadTask.count({
            where: completedBaseWhereClause,
          });

    // ============================
    // FETCH TASKS (with filters)
    // ============================

    const [tasks, total] = await Promise.all([
      prisma.userLeadTask.findMany({
        where: dataWhereClause,
        select: TaskService.taskIncludes().select,
        orderBy,
        skip,
        take: limit,
      }),

      prisma.userLeadTask.count({
        where: dataWhereClause,
      }),
    ]);

    // ============================
    // RESPONSE
    // ============================

    return {
      tasks: tasks.map((t) => this.mapTaskWithLead(t)),
      count: total,
      summary: {
        today: todayCount,
        upcoming: upcomingCount,
        overdue: overdueCount,
        completed: completedCount,
      },
    };
  }

  /**
   * Generic fetcher by task_type
   */
  static async getTasksByUserAndLead(
    userId: number,
    leadId: number,
    taskType: string,
  ) {
    return prisma.userLeadTask.findMany({
      where: {
        user_id: userId,
        lead_id: leadId,
        task_type: taskType,
        status: "open", // ✅ only open tasks
        ...TaskService.activeLeadWhere(),
      },
      select: {
        id: true,
        lead_id: true,
        account_id: true,
        vendor_id: true,
        user_id: true,
        task_type: true,
        due_date: true,
        remark: true,
        status: true,
        created_by: true,
        created_at: true,
        updated_by: true,
        updated_at: true,
      },
      orderBy: { created_at: "desc" },
    });
  }

  static async getSelfAssignTaskTypeByVendor(
    vendorId: number,
    taskType: string,
  ) {
    return prisma.selfAssignTaskTypeMaster.findFirst({
      where: {
        vendor_id: vendorId,
        type: taskType,
      },
      select: {
        id: true,
        vendor_id: true,
        user_type_id: true,
        type: true,
      },
    });
  }

  static async getValidatedSelfAssignTask(leadId: number, taskId: number) {
    const task = await prisma.userLeadTask.findFirst({
      where: {
        id: taskId,
        lead_id: leadId,
      },
      select: {
        id: true,
        lead_id: true,
        task_type: true,
        vendor_id: true,
        user_id: true,
        user: {
          select: {
            user_type_id: true,
          },
        },
      },
    });

    if (!task) {
      throw new Error("Task not found");
    }

    const selfAssignTaskType = await prisma.selfAssignTaskTypeMaster.findFirst({
      where: {
        vendor_id: task.vendor_id,
        user_type_id: task.user.user_type_id,
        type: task.task_type,
      },
      select: {
        id: true,
      },
    });

    if (!selfAssignTaskType) {
      throw new Error("This is not a self-assign task");
    }

    return task;
  }

  // Convenience wrappers
  static async getInitialSiteMeasurementTasks(userId: number, leadId: number) {
    return this.getTasksByUserAndLead(
      userId,
      leadId,
      "Initial Site Measurement",
    );
  }

  static async getFollowUpTasks(userId: number, leadId: number) {
    return this.getTasksByUserAndLead(userId, leadId, "Follow Up");
  }

  static async getFinalMeasurementTasks(userId: number, leadId: number) {
    return this.getTasksByUserAndLead(userId, leadId, "Final Measurements");
  }

  static async getActiveTasksByVendorAndLead(
    vendorId: number,
    leadId: number,
    franchiseId?: number,
  ) {
    return prisma.userLeadTask.findMany({
      where: {
        vendor_id: vendorId,
        lead_id: leadId,
        ...(franchiseId !== undefined ? { franchise_id: franchiseId } : {}),
        status: { in: ["open", "in_progress"] },
      },
      select: {
        task_type: true,
        lead_stage: true,
        due_date: true,
        remark: true,
        status: true,
        created_by: true,
        user: {
          select: {
            user_name: true,
          },
        },
        createdBy: {
          select: {
            user_name: true,
          },
        },
      },
      orderBy: { created_at: "desc" },
    });
  }
}
