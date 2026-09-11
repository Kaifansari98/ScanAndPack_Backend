import { Prisma, prisma } from "../../prisma/client";
import { generateSignedUrl } from "../../utils/wasabiClient";

/* ------------------------------ Type Master ------------------------------ */

export const addMiscType = async (payload: {
  vendor_id: number;
  name: string;
  created_by: number;
}) => {
  console.log("[SERVICE] addMiscType called", payload);

  // Validate vendor
  const vendor = await prisma.vendorMaster.findUnique({
    where: { id: payload.vendor_id },
  });
  if (!vendor) throw new Error("Invalid vendor_id");

  // Validate creator
  const user = await prisma.userMaster.findUnique({
    where: { id: payload.created_by },
  });
  if (!user) throw new Error("Invalid created_by user");

  return prisma.miscellaneousTypeMaster.create({
    data: {
      vendor_id: payload.vendor_id,
      name: payload.name,
      created_by: payload.created_by,
    },
  });
};

export const fetchMiscTypes = async (vendor_id: number) => {
  console.log("[SERVICE] fetchMiscTypes", { vendor_id });

  return prisma.miscellaneousTypeMaster.findMany({
    where: { vendor_id },
    orderBy: { created_at: "desc" },
  });
};

export const removeMiscType = async (id: number) => {
  console.log("[SERVICE] removeMiscType", { id });

  const existing = await prisma.miscellaneousTypeMaster.findUnique({
    where: { id },
  });
  if (!existing) throw new Error("Misc Type not found");

  await prisma.miscellaneousTypeMaster.delete({ where: { id } });
  return true;
};

export const updateMiscType = async (id: number, name: string) => {
  console.log("[SERVICE] updateMiscType", { id, name });

  const existing = await prisma.miscellaneousTypeMaster.findUnique({
    where: { id },
  });
  if (!existing) throw new Error("Misc Type not found");

  return prisma.miscellaneousTypeMaster.update({
    where: { id },
    data: { name },
  });
};

export const updateMiscTypeStatus = async (
  id: number,
  status: "active" | "inactive",
) => {
  console.log("[SERVICE] updateMiscTypeStatus", { id, status });

  const existing = await prisma.miscellaneousTypeMaster.findUnique({
    where: { id },
  });
  if (!existing) throw new Error("Misc Type not found");

  return prisma.miscellaneousTypeMaster.update({
    where: { id },
    data: { status },
  });
};

/* ------------------------------ Team Master ------------------------------ */

export const addMiscTeam = async (payload: {
  vendor_id: number;
  name: string;
  created_by: number;
}) => {
  console.log("[SERVICE] addMiscTeam called", payload);

  const vendor = await prisma.vendorMaster.findUnique({
    where: { id: payload.vendor_id },
  });
  if (!vendor) throw new Error("Invalid vendor_id");

  const user = await prisma.userMaster.findUnique({
    where: { id: payload.created_by },
  });
  if (!user) throw new Error("Invalid created_by user");

  return prisma.miscellaneousTeamMaster.create({
    data: {
      vendor_id: payload.vendor_id,
      name: payload.name,
      created_by: payload.created_by,
    },
  });
};

export const fetchMiscTeams = async (vendor_id: number) => {
  console.log("[SERVICE] fetchMiscTeams", { vendor_id });

  return prisma.miscellaneousTeamMaster.findMany({
    where: { vendor_id },
    orderBy: { created_at: "desc" },
  });
};

export const removeMiscTeam = async (id: number) => {
  console.log("[SERVICE] removeMiscTeam", { id });

  const existing = await prisma.miscellaneousTeamMaster.findUnique({
    where: { id },
  });
  if (!existing) throw new Error("Team not found");

  await prisma.miscellaneousTeamMaster.delete({ where: { id } });
  return true;
};

export const updateMiscTeam = async (id: number, name: string) => {
  console.log("[SERVICE] updateMiscTeam", { id, name });

  const existing = await prisma.miscellaneousTeamMaster.findUnique({
    where: { id },
  });
  if (!existing) throw new Error("Team not found");

  return prisma.miscellaneousTeamMaster.update({
    where: { id },
    data: { name },
  });
};

export const updateMiscTeamStatus = async (
  id: number,
  status: "active" | "inactive",
) => {
  console.log("[SERVICE] updateMiscTeamStatus", { id, status });

  const existing = await prisma.miscellaneousTeamMaster.findUnique({
    where: { id },
  });
  if (!existing) throw new Error("Team not found");

  return prisma.miscellaneousTeamMaster.update({
    where: { id },
    data: { status },
  });
};

export const getPendingMiscellaneousLeads = async (
  vendorId: number,
  franchiseId: number | undefined,
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
    assign_to?: Array<number | string>;
    site_address?: string;
    archetech_name?: string;
    source?: Array<number | string>;
    date_range?: { from: string; to: string };
  } = {},
  userId?: number,
  userType?: string
): Promise<{ leads: any[]; count: number }> => {
  const skip = (page - 1) * limit;

  // ===============================
  // STEP 1 → Get Lead IDs having pending Misc
  // ===============================

  const leadFilter: any = {};
  if (franchiseId) leadFilter.franchise_id = franchiseId;
  
  // We need to fetch mapped leads first if we have a restrictive user
  let mappedLeadIds: number[] = [];
  if (userId && !["admin", "super-admin", "auditor", "miscellaneous", "factory"].includes(userType || "")) {
    const mappedLeads = await prisma.leadUserMapping.findMany({
      where: { user_id: userId, vendor_id: vendorId, status: "active" },
      select: { lead_id: true }
    });
    mappedLeadIds = mappedLeads.map((m) => m.lead_id);

    leadFilter.OR = [
      { assign_to: userId },
      { id: { in: mappedLeadIds } }
    ];
  }

  const miscLeadIds = await prisma.miscellaneousMaster.findMany({
    where: {
      vendor_id: vendorId,
      is_resolved: false,
      ...(Object.keys(leadFilter).length > 0 ? { lead: leadFilter } : {}),
    },
    select: { lead_id: true },
    distinct: ["lead_id"],
  });

  const leadIds = miscLeadIds.map((m) => m.lead_id);

  if (!leadIds.length) return { leads: [], count: 0 };

  // ===============================
  // STEP 2 → Build Lead Filters (Same Logic)
  // ===============================

  const where: Prisma.LeadMasterWhereInput = {
    id: { in: leadIds },
    vendor_id: vendorId,
    ...(franchiseId ? { franchise_id: franchiseId } : {}),
    is_deleted: false,
  };

  const addAnd = (condition: Prisma.LeadMasterWhereInput) => {
    if (!where.AND) where.AND = [];
    (where.AND as Prisma.LeadMasterWhereInput[]).push(condition);
  };

  if (userId && !["admin", "super-admin", "auditor", "miscellaneous", "factory"].includes(userType || "")) {
    addAnd({
      OR: [
        { assign_to: userId },
        { id: { in: mappedLeadIds } }
      ]
    });
  }

  const contains = (value?: string) =>
    value ? { contains: value, mode: "insensitive" as const } : undefined;

  // 🔎 Global Search
  if (filters.global_search) {
    addAnd({
      OR: [
        { firstname: contains(filters.global_search) },
        { lastname: contains(filters.global_search) },
        { lead_code: contains(filters.global_search) },
        { contact_no: contains(filters.global_search) },
      ],
    });
  }

  // Lead Code
  if (filters.filter_lead_code) {
    addAnd({ lead_code: contains(filters.filter_lead_code) });
  }

  // Name
  if (filters.filter_name) {
    addAnd({
      OR: [
        { firstname: contains(filters.filter_name) },
        { lastname: contains(filters.filter_name) },
      ],
    });
  }

  // Contact
  if (filters.contact) {
    addAnd({ contact_no: contains(filters.contact) });
  }

  // Address
  if (filters.site_address) {
    addAnd({ site_address: contains(filters.site_address) });
  }

  // Architect
  if (filters.archetech_name) {
    addAnd({ archetech_name: contains(filters.archetech_name) });
  }

  // Date Range
  if (filters.date_range?.from && filters.date_range?.to) {
    addAnd({
      created_at: {
        gte: new Date(filters.date_range.from),
        lte: new Date(filters.date_range.to),
      },
    });
  }

  // Furniture Type
  if (filters.furniture_type?.length) {
    addAnd({
      productMappings: {
        some: {
          product_type_id: { in: filters.furniture_type.map(Number) },
        },
      },
    });
  }

  // Structure
  if (filters.furniture_structure?.length) {
    addAnd({
      leadProductStructureMapping: {
        some: {
          product_structure_id: {
            in: filters.furniture_structure.map(Number),
          },
        },
      },
    });
  }

  // Source
  if (filters.source?.length) {
    addAnd({ source_id: { in: filters.source.map(Number) } });
  }

  // Site Type
  if (filters.site_type?.length) {
    addAnd({ site_type_id: { in: filters.site_type.map(Number) } });
  }

  // Assign To
  if (filters.assign_to?.length) {
    addAnd({ assign_to: { in: filters.assign_to.map(Number) } });
  }

  // Site Map
  if (typeof filters.site_map_link === "boolean") {
    addAnd(
      filters.site_map_link
        ? { site_map_link: { not: null } }
        : { site_map_link: null },
    );
  }

  // ===============================
  // STEP 3 → Fetch Leads (LIGHT SELECT)
  // ===============================

  const [rows, count] = await Promise.all([
    prisma.leadMaster.findMany({
      where,
      skip,
      take: limit,
      orderBy: { created_at: "desc" },

      select: {
        // 🔹 Basic Identity
        id: true,
        lead_code: true,
        firstname: true,
        lastname: true,

        // 🔹 Contact Info
        contact_no: true,
        alt_contact_no: true,
        email: true,

        // 🔹 Site Info
        site_address: true,
        site_map_link: true,
        archetech_name: true,

        // 🔹 Assignment
        assignedTo: {
          select: {
            id: true,
            user_name: true,
          },
        },

        // 🔹 Dates
        created_at: true,

        // 🔹 Source & Site Type (Minimal)
        source_id: true,
        site_type_id: true,

        // 🔹 Furniture Type (only id for UI usage)
        productMappings: {
          select: {
            product_type_id: true,
            productType: true,
          },
        },

        siteType: true,
        source: true,
        account_id: true,

        // 🔹 Furniture Structure
        leadProductStructureMapping: {
          select: {
            product_structure_id: true,
            productStructure: true,
          },
        },
      },
    }),

    prisma.leadMaster.count({ where }),
  ]);

  return { leads: rows, count };
};


export const getPendingMiscellaneousLeadCountService = async (
  vendorId: number,
  franchiseId?: number,
  userId?: number,
  userType?: string
): Promise<number> => {

  const leadFilter: any = {};
  if (franchiseId) leadFilter.franchise_id = franchiseId;
  
  if (userId && !["admin", "super-admin", "auditor", "miscellaneous", "factory"].includes(userType || "")) {
    // Get leads mapped to this user (e.g. site-supervisor, factory, backend)
    const mappedLeads = await prisma.leadUserMapping.findMany({
      where: { user_id: userId, vendor_id: vendorId, status: "active" },
      select: { lead_id: true }
    });
    const mappedLeadIds = mappedLeads.map((m) => m.lead_id);

    leadFilter.OR = [
      { assign_to: userId },
      { id: { in: mappedLeadIds } }
    ];
  }

  const result = await prisma.miscellaneousMaster.findMany({
    where: {
      vendor_id: vendorId,
      is_resolved: false,
      ...(Object.keys(leadFilter).length > 0 ? { lead: leadFilter } : {}),
    },
    select: { lead_id: true },
    distinct: ["lead_id"],
  });

  return result.length;
};

/* -------------------------------------------------------------------------- */
/* -------------------------------------------------------------------------- */
/* 🔹 Helper: Resolve Exact Stage Slug & Label for a Miscellaneous Record     */
/* -------------------------------------------------------------------------- */
export const resolveMiscStage = (
  m: {
    misc_approved: boolean | null;
    is_resolved: boolean;
    expected_ready_date: Date | string | null;
    required_delivery_date: Date | string | null;
  },
  taskForMisc?: { status: string } | null,
  deliveryTaskForMisc?: { status: string } | null,
): { slug: string; label: string } => {
  if (m.is_resolved) {
    return { slug: "resolved", label: "RESOLVED" };
  }
  if (m.misc_approved === false) {
    return { slug: "rejected", label: "REJECTED" };
  }
  if (m.misc_approved !== true) {
    return { slug: "awaiting-approval", label: "AWAITING APPROVAL" };
  }

  // At this point, m.misc_approved === true
  if (deliveryTaskForMisc?.status === "completed") {
    return { slug: "dispatched", label: "DISPATCHED" };
  }
  if (m.required_delivery_date) {
    return { slug: "dispatch-scheduled", label: "DISPATCH SCHEDULED" };
  }
  if (taskForMisc?.status === "completed") {
    return { slug: "rtd", label: "RTD" };
  }
  if (m.expected_ready_date) {
    return { slug: "under-process", label: "UNDER PROCESS" };
  }
  return { slug: "misc-approved", label: "MISCL APPROVED" };
};

export const findMiscTask = (
  m: {
    id: number;
    lead_id: number;
    misc_approved: boolean | null;
    expected_ready_date: Date | string | null;
    reorder_material_details: string | null;
    problem_description: string | null;
  },
  tasks: any[],
) => {
  if (m.misc_approved !== true || !m.expected_ready_date) return null;
  const remarkKey = `${m.reorder_material_details} - ${m.problem_description}`;
  const miscTaskKey = `[misc:${m.id}]`;
  const pendingMaterialKey = m.problem_description;
  return (
    tasks.find(
      (t) =>
        t.lead_id === m.lead_id &&
        ((t.remark && t.remark.includes(miscTaskKey)) ||
          t.remark === remarkKey ||
          (t.remark &&
            m.reorder_material_details &&
            t.remark.includes(m.reorder_material_details) &&
            m.problem_description &&
            t.remark.includes(m.problem_description)) ||
          (m.reorder_material_details === "Pending Material" &&
            t.remark === pendingMaterialKey)),
    ) || null
  );
};

export const findDeliveryTask = (
  m: {
    lead_id: number;
    misc_approved: boolean | null;
    required_delivery_date: Date | string | null;
    reorder_material_details: string | null;
    problem_description: string | null;
  },
  tasks: any[],
) => {
  if (m.misc_approved !== true || !m.required_delivery_date) return null;
  return (
    tasks.find(
      (t) =>
        t.lead_id === m.lead_id &&
        typeof t.remark === "string" &&
        t.remark.includes("Required delivery date set for") &&
        ((m.reorder_material_details &&
          t.remark.includes(m.reorder_material_details)) ||
          (m.problem_description && t.remark.includes(m.problem_description))),
    ) || null
  );
};

/* -------------------------------------------------------------------------- */
/* 🔹 Helper: Build Prisma condition for Miscellaneous status                */
/* -------------------------------------------------------------------------- */
export const buildMiscStatusWhereCondition = (
  statusSlug: string,
): Prisma.MiscellaneousMasterWhereInput => {
  const norm = (statusSlug || "").toLowerCase().trim().replace(/_/g, "-");

  switch (norm) {
    case "rejected":
      return { misc_approved: false };
    case "resolved":
      return { is_resolved: true };
    case "misc-approved":
    case "misc_approved":
      return {
        is_resolved: false,
        misc_approved: true,
        expected_ready_date: null,
        required_delivery_date: null,
      };
    case "awaiting-approval":
    case "awaiting_approval":
      return {
        is_resolved: false,
        misc_approved: null,
      };
    case "under-process":
    case "under_process":
    case "rtd":
    case "ready-to-dispatch":
    case "ready_to_dispatch":
      return {
        is_resolved: false,
        misc_approved: true,
        expected_ready_date: { not: null },
        required_delivery_date: null,
      };
    case "dispatch-scheduled":
    case "dispatch_scheduled":
    case "dispatched":
      return {
        is_resolved: false,
        misc_approved: true,
        required_delivery_date: { not: null },
      };
    default:
      return {};
  }
};

/* -------------------------------------------------------------------------- */
/* 🔹 Service: Get Leads by Miscellaneous Status                              */
/* -------------------------------------------------------------------------- */
export const getMiscellaneousLeadsByStatusService = async (
  vendorId: number,
  statusSlug: string,
  franchiseId?: number,
  page: number = 1,
  limit: number = 10,
  filters: {
    global_search?: string;
    filter_lead_code?: string;
    filter_name?: string;
    contact?: string;
    date_range?: { from: string; to: string };
  } = {},
  userId?: number,
  userType?: string,
): Promise<{ miscellaneous: any[]; count: number }> => {
  const skip = (page - 1) * limit;
  const normRole = (userType || "").toLowerCase().trim().replace(/_/g, "-");
  const normSlug = (statusSlug || "").toLowerCase().trim().replace(/_/g, "-");
  const targetSlug = normSlug === "ready-to-dispatch" ? "rtd" : normSlug;

  // Role Scoping Rule:
  // site-supervisor, head-site-supervisor, admin -> Franchise-wise
  // miscellaneous, factory, super-admin, auditor -> Vendor-wise
  const isFranchiseScoped = ["admin", "site-supervisor", "head-site-supervisor"].includes(normRole);
  const effectiveFranchiseId = isFranchiseScoped ? franchiseId : undefined;

  const leadFilter: any = {};
  if (effectiveFranchiseId) {
    leadFilter.franchise_id = effectiveFranchiseId;
  }

  // Mandatory user lead mapping restriction if non-privileged user
  if (userId && !["admin", "super-admin", "auditor", "miscellaneous", "factory"].includes(normRole)) {
    const mappedLeads = await prisma.leadUserMapping.findMany({
      where: { user_id: userId, vendor_id: vendorId, status: "active" },
      select: { lead_id: true },
    });
    const mappedLeadIds = mappedLeads.map((m) => m.lead_id);
    leadFilter.OR = [{ assign_to: userId }, { id: { in: mappedLeadIds } }];
  }

  const statusCondition = buildMiscStatusWhereCondition(statusSlug);

  const where: Prisma.MiscellaneousMasterWhereInput = {
    vendor_id: vendorId,
    ...statusCondition,
    ...(Object.keys(leadFilter).length > 0 ? { lead: leadFilter } : {}),
  };

  const addAnd = (condition: Prisma.MiscellaneousMasterWhereInput) => {
    if (!where.AND) where.AND = [];
    (where.AND as Prisma.MiscellaneousMasterWhereInput[]).push(condition);
  };

  if (filters.global_search?.trim()) {
    const term = filters.global_search.trim();
    addAnd({
      OR: [
        { problem_description: { contains: term, mode: "insensitive" } },
        { reorder_material_details: { contains: term, mode: "insensitive" } },
        { lead: { lead_code: { contains: term, mode: "insensitive" } } },
        { lead: { firstname: { contains: term, mode: "insensitive" } } },
        { lead: { lastname: { contains: term, mode: "insensitive" } } },
        { lead: { contact_no: { contains: term, mode: "insensitive" } } },
      ],
    });
  }

  if (filters.filter_lead_code?.trim()) {
    addAnd({
      lead: { lead_code: { contains: filters.filter_lead_code.trim(), mode: "insensitive" } },
    });
  }

  if (filters.filter_name?.trim()) {
    const term = filters.filter_name.trim();
    addAnd({
      lead: {
        OR: [
          { firstname: { contains: term, mode: "insensitive" } },
          { lastname: { contains: term, mode: "insensitive" } },
        ],
      },
    });
  }

  if (filters.contact?.trim()) {
    addAnd({
      lead: { contact_no: { contains: filters.contact.trim(), mode: "insensitive" } },
    });
  }

  if (filters.date_range?.from && filters.date_range?.to) {
    addAnd({
      created_at: {
        gte: new Date(filters.date_range.from),
        lte: new Date(filters.date_range.to),
      },
    });
  }

  const isTaskDependent = [
    "under-process",
    "rtd",
    "ready-to-dispatch",
    "dispatch-scheduled",
    "dispatched",
  ].includes(normSlug);

  const sharedInclude = {
    type: true,
    createdBy: { select: { id: true, user_name: true } },
    updatedBy: { select: { id: true, user_name: true } },
    teams: {
      include: {
        team: true,
      },
    },
    documents: {
      include: {
        document: {
          include: {
            documentType: true,
          },
        },
      },
      where: {
        document: {
          is_deleted: false,
        },
      },
    },
    lead: {
      select: {
        id: true,
        lead_code: true,
        firstname: true,
        lastname: true,
        contact_no: true,
        site_address: true,
        franchise_id: true,
        account_id: true,
        franchise: {
          select: {
            id: true,
            franchise_name: true,
            franchise_code: true,
          },
        },
        assignedTo: {
          select: {
            id: true,
            user_name: true,
          },
        },
      },
    },
  };

  let pageItems: any[] = [];
  let totalCount = 0;
  let allRelevantTasks: any[] = [];

  if (!isTaskDependent) {
    // For direct statuses (awaiting-approval, misc-approved, resolved, rejected):
    // Prisma where condition is 100% exact.
    const [rawMiscList, count] = await Promise.all([
      prisma.miscellaneousMaster.findMany({
        where,
        skip,
        take: limit,
        orderBy: { created_at: "desc" },
        include: sharedInclude,
      }),
      prisma.miscellaneousMaster.count({ where }),
    ]);

    totalCount = count;
    pageItems = rawMiscList;

    const leadIds = Array.from(new Set(pageItems.map((m) => m.lead_id)));
    if (leadIds.length > 0) {
      allRelevantTasks = await prisma.userLeadTask.findMany({
        where: {
          vendor_id: vendorId,
          lead_id: { in: leadIds },
          task_type: { in: ["Miscellaneous", "Pending Materials"] },
        },
        select: {
          id: true,
          lead_id: true,
          task_type: true,
          remark: true,
          status: true,
          due_date: true,
          closed_at: true,
          closed_by: true,
          closedBy: { select: { id: true, user_name: true } },
        },
      });
    }
  } else {
    // For task-dependent stages (under-process, rtd, dispatch-scheduled, dispatched):
    // Fetch all candidates matching base conditions, match task status, filter accurately.
    const rawCandidates = await prisma.miscellaneousMaster.findMany({
      where,
      orderBy: { created_at: "desc" },
      include: sharedInclude,
    });

    const leadIds = Array.from(new Set(rawCandidates.map((m) => m.lead_id)));
    allRelevantTasks =
      leadIds.length > 0
        ? await prisma.userLeadTask.findMany({
            where: {
              vendor_id: vendorId,
              lead_id: { in: leadIds },
              task_type: { in: ["Miscellaneous", "Pending Materials"] },
            },
            select: {
              id: true,
              lead_id: true,
              task_type: true,
              remark: true,
              status: true,
              due_date: true,
              closed_at: true,
              closed_by: true,
              closedBy: { select: { id: true, user_name: true } },
            },
          })
        : [];

    const filteredCandidates = rawCandidates.filter((m) => {
      const taskForMisc = findMiscTask(m, allRelevantTasks);
      const deliveryTaskForMisc = findDeliveryTask(m, allRelevantTasks);
      const stage = resolveMiscStage(m, taskForMisc, deliveryTaskForMisc);
      return stage.slug === targetSlug;
    });

    totalCount = filteredCandidates.length;
    pageItems = filteredCandidates.slice(skip, skip + limit);
  }

  const miscellaneous = await Promise.all(
    pageItems.map(async (m) => {
      const docs = await Promise.all(
        m.documents.map(async (docLink: any) => {
          let signed_url = null;
          try {
            if (docLink.document?.doc_sys_name) {
              signed_url = await generateSignedUrl(docLink.document.doc_sys_name);
            }
          } catch (err) {}

          return {
            document_id: docLink.document?.id,
            original_name: docLink.document?.doc_og_name,
            file_key: docLink.document?.doc_sys_name,
            doc_type_tag: docLink.document?.documentType?.tag ?? null,
            doc_type_name:
              docLink.document?.documentType?.doc_title ??
              docLink.document?.documentType?.type ??
              null,
            signed_url,
            uploaded_at: docLink.document?.created_at,
          };
        }),
      );

      const taskForMisc = findMiscTask(m, allRelevantTasks);
      const deliveryTaskForMisc = findDeliveryTask(m, allRelevantTasks);
      const stage = resolveMiscStage(m, taskForMisc, deliveryTaskForMisc);

      return {
        id: m.id,
        vendor_id: m.vendor_id,
        lead_id: m.lead_id,
        account_id: m.account_id,
        lead: m.lead,
        misc_approved: m.misc_approved,
        exp_of_rejection: m.exp_of_rejection,
        type: {
          id: m.type.id,
          name: m.type.name,
        },
        problem_description: m.problem_description,
        reorder_material_details: m.reorder_material_details,
        quantity: m.quantity,
        cost: m.cost,
        supervisor_remark: m.supervisor_remark,
        expected_ready_date: m.expected_ready_date,
        solution: (m as any).solution ?? null,
        required_delivery_date: m.required_delivery_date,
        is_resolved: m.is_resolved,
        resolved_at: m.resolved_at,
        created_by: m.created_by,
        created_at: m.created_at,
        created_user: m.createdBy,
        teams: m.teams.map((t: any) => ({
          team_id: t.team_id,
          team_name: t.team.name,
        })),
        documents: docs,
        task: taskForMisc || null,
        delivery_task: deliveryTaskForMisc || null,
        status_label: stage.label,
        status_slug: stage.slug,
      };
    }),
  );

  return { miscellaneous, count: totalCount };
};

/* -------------------------------------------------------------------------- */
/* 🔹 Service: Get Miscellaneous Counts across All Statuses                   */
/* -------------------------------------------------------------------------- */
export const getMiscellaneousStatusCountsService = async (
  vendorId: number,
  franchiseId?: number,
  userId?: number,
  userType?: string,
): Promise<{
  awaiting_approval: number;
  misc_approved: number;
  under_process: number;
  rtd: number;
  dispatch_scheduled: number;
  dispatched: number;
  resolved: number;
  rejected: number;
  total: number;
}> => {
  const normRole = (userType || "").toLowerCase().trim().replace(/_/g, "-");

  const isFranchiseScoped = ["admin", "site-supervisor", "head-site-supervisor"].includes(normRole);
  const effectiveFranchiseId = isFranchiseScoped ? franchiseId : undefined;

  const leadFilter: any = {};
  if (effectiveFranchiseId) {
    leadFilter.franchise_id = effectiveFranchiseId;
  }

  if (userId && !["admin", "super-admin", "auditor", "miscellaneous", "factory"].includes(normRole)) {
    const mappedLeads = await prisma.leadUserMapping.findMany({
      where: { user_id: userId, vendor_id: vendorId, status: "active" },
      select: { lead_id: true },
    });
    const mappedLeadIds = mappedLeads.map((m) => m.lead_id);
    leadFilter.OR = [{ assign_to: userId }, { id: { in: mappedLeadIds } }];
  }

  const baseWhere = {
    vendor_id: vendorId,
    ...(Object.keys(leadFilter).length > 0 ? { lead: leadFilter } : {}),
  };

  const [awaitingCount, miscApprovedCount, resolvedCount, rejectedCount] = await Promise.all([
    prisma.miscellaneousMaster.count({
      where: {
        ...baseWhere,
        is_resolved: false,
        misc_approved: null,
      },
    }),
    prisma.miscellaneousMaster.count({
      where: {
        ...baseWhere,
        is_resolved: false,
        misc_approved: true,
        expected_ready_date: null,
        required_delivery_date: null,
      },
    }),
    prisma.miscellaneousMaster.count({
      where: {
        ...baseWhere,
        is_resolved: true,
      },
    }),
    prisma.miscellaneousMaster.count({
      where: {
        ...baseWhere,
        misc_approved: false,
      },
    }),
  ]);

  // Candidates for ERD (under-process vs rtd)
  const erdCandidates = await prisma.miscellaneousMaster.findMany({
    where: {
      ...baseWhere,
      is_resolved: false,
      misc_approved: true,
      expected_ready_date: { not: null },
      required_delivery_date: null,
    },
    select: {
      id: true,
      lead_id: true,
      misc_approved: true,
      is_resolved: true,
      expected_ready_date: true,
      required_delivery_date: true,
      reorder_material_details: true,
      problem_description: true,
    },
  });

  // Candidates for Delivery (dispatch-scheduled vs dispatched)
  const deliveryCandidates = await prisma.miscellaneousMaster.findMany({
    where: {
      ...baseWhere,
      is_resolved: false,
      misc_approved: true,
      required_delivery_date: { not: null },
    },
    select: {
      id: true,
      lead_id: true,
      misc_approved: true,
      is_resolved: true,
      expected_ready_date: true,
      required_delivery_date: true,
      reorder_material_details: true,
      problem_description: true,
    },
  });

  const allCandidateLeadIds = Array.from(
    new Set([
      ...erdCandidates.map((m) => m.lead_id),
      ...deliveryCandidates.map((m) => m.lead_id),
    ]),
  );

  const candidateTasks =
    allCandidateLeadIds.length > 0
      ? await prisma.userLeadTask.findMany({
          where: {
            vendor_id: vendorId,
            lead_id: { in: allCandidateLeadIds },
            task_type: { in: ["Miscellaneous", "Pending Materials"] },
          },
          select: {
            id: true,
            lead_id: true,
            task_type: true,
            remark: true,
            status: true,
          },
        })
      : [];

  let rtdCount = 0;
  let underProcessCount = 0;
  for (const m of erdCandidates) {
    const task = findMiscTask(m, candidateTasks);
    const stage = resolveMiscStage(m, task, null);
    if (stage.slug === "rtd") {
      rtdCount++;
    } else {
      underProcessCount++;
    }
  }

  let dispatchedCount = 0;
  let dispatchScheduledCount = 0;
  for (const m of deliveryCandidates) {
    const delTask = findDeliveryTask(m, candidateTasks);
    const stage = resolveMiscStage(m, null, delTask);
    if (stage.slug === "dispatched") {
      dispatchedCount++;
    } else {
      dispatchScheduledCount++;
    }
  }

  const counts = {
    awaiting_approval: awaitingCount,
    misc_approved: miscApprovedCount,
    under_process: underProcessCount,
    rtd: rtdCount,
    dispatch_scheduled: dispatchScheduledCount,
    dispatched: dispatchedCount,
    resolved: resolvedCount,
    rejected: rejectedCount,
    total:
      awaitingCount +
      miscApprovedCount +
      underProcessCount +
      rtdCount +
      dispatchScheduledCount +
      dispatchedCount +
      resolvedCount +
      rejectedCount,
  };

  return counts;
};
