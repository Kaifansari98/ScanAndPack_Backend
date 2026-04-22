import { Prisma, prisma } from "../../prisma/client";

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
): Promise<{ leads: any[]; count: number }> => {
  const skip = (page - 1) * limit;

  // ===============================
  // STEP 1 → Get Lead IDs having pending Misc
  // ===============================

  const miscLeadIds = await prisma.miscellaneousMaster.findMany({
    where: {
      vendor_id: vendorId,
      is_resolved: false,
      ...(franchiseId ? { lead: { franchise_id: franchiseId } } : {}),
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
  franchiseId: number,
): Promise<number> => {

  // Step 1 → Find unique lead_ids having unresolved misc
  const result = await prisma.miscellaneousMaster.findMany({
    where: {
      vendor_id: vendorId,
      is_resolved: false,
      lead: {
        franchise_id: franchiseId,
      },
    },
    select: {
      lead_id: true,
    },
    distinct: ["lead_id"],
  });

  return result.length;
};
