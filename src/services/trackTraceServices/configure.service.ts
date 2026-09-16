import { prisma } from "../../../src/prisma/client";
import logger from "../../../src/utils/logger";

export class ConfigureService {
  async getLeadsVendorById(token: string, projectId: string) {
    logger.info("Configure request received", { token, projectId });

    // 1️⃣ Validate token
    const tokenData = await prisma.vendorTokens.findFirst({
      where: {
        token,
        expiry_date: { gt: new Date() },
      },
    });

    if (!tokenData) {
      logger.warn("Invalid or expired vendor token", { token });
      throw new Error("Invalid or expired token");
    }

    const vendorId = tokenData.vendor_id;

    // 2️⃣ Validate project belongs to vendor
    const project = await prisma.projectMaster.findFirst({
      where: {
        unique_project_id: projectId,
        vendor_id: vendorId,
      },
    });

    if (!project) {
      logger.warn("Project not found for vendor", { vendorId, projectId });
      throw new Error("Project not found for this vendor");
    }

    // 3️⃣ Fetch FULL leads (structured include like your advanced service)
    const leads = await prisma.leadMaster.findMany({
      where: {
        vendor_id: vendorId,
        is_deleted: false,
      },

      include: {
        productMappings: {
          include: {
            productType: true,
          },
        },

        productStructureInstances: {
          include: {
            productStructure: true,
            productType: true,
          },
        },

        statusType: true,
        source: true,
        siteType: true,
        account: true,
      },

      orderBy: {
        created_at: "desc",
      },
    });

    logger.info("Vendor leads fetched successfully", {
      vendorId,
      count: leads.length,
    });

    return {
      vendorId,
      projectId,
      total: leads.length,
      leads,
    };
  }


  async getLeadsVendorByIdPost(
  token: string,
  projectId: string,
  page: number = 1,
  limit: number = 10,
  filters: any
): Promise<{ leads: any[]; count: number }> {
  logger.info("Configure request received", { token, projectId });

  const skip = (page - 1) * limit;

  // ✅ Validate token
  const tokenData = await prisma.vendorTokens.findFirst({
    where: {
      token,
      expiry_date: { gt: new Date() },
    },
  });

  if (!tokenData) throw new Error("Invalid or expired token");

  const vendorId = tokenData.vendor_id;

  // ✅ Validate project
  const project = await prisma.projectMaster.findFirst({
    where: {
      unique_project_id: projectId,
      vendor_id: vendorId,
    },
  });

  if (!project) throw new Error("Project not found for this vendor");

  // ====================================================
  // 🔥 FILTER ENGINE
  // ====================================================

const addFilterConditions = (baseWhere: any) => {
  const andConditions: any[] = [];

  const toArray = (val: any) =>
    Array.isArray(val) ? val : val ? [val] : [];

  // ---------------- GLOBAL SEARCH ----------------
if (filters.global_search && filters.global_search.trim() !== "") {
  const search = filters.global_search.trim();

  // Split words: "usman khan" → ["usman", "khan"]
  const parts = search.split(/\s+/).filter(Boolean);

  // If user typed multiple words → match across firstname + lastname
  if (parts.length >= 2) {
    andConditions.push({
      OR: [
        {
          AND: parts.map((part: string) => ({
            OR: [
              { firstname: { contains: part, mode: "insensitive" } },
              { lastname: { contains: part, mode: "insensitive" } },
            ],
          })),
        },

        // fallback matches (lead code / contact search)
        { lead_code: { contains: search, mode: "insensitive" } },
        { contact_no: { contains: search, mode: "insensitive" } },
      ],
    });
  } else {
    // Single word search
    andConditions.push({
      OR: [
        { firstname: { contains: search, mode: "insensitive" } },
        { lastname: { contains: search, mode: "insensitive" } },
        { lead_code: { contains: search, mode: "insensitive" } },
        { contact_no: { contains: search, mode: "insensitive" } },
      ],
    });
  }
}


  // ---------------- PRODUCT STRUCTURE ----------------
  const structures = toArray(filters.product_structure).map(Number);
  if (structures.length > 0) {
    andConditions.push({
      productStructureInstances: {
        some: {
          product_structure_id: { in: structures },
        },
      },
    });
  }

  // ---------------- PRODUCT MAPPING ----------------
  const mappings = toArray(filters.product_mapping).map(Number);
  if (mappings.length > 0) {
    andConditions.push({
      productMappings: {
        some: {
          product_type_id: { in: mappings },
        },
      },
    });
  }

  // ---------------- DATE RANGE ----------------
  if (filters.date_range?.from && filters.date_range?.to) {
    const fromDate = new Date(filters.date_range.from);
    fromDate.setHours(0, 0, 0, 0);

    const toDate = new Date(filters.date_range.to);
    toDate.setHours(23, 59, 59, 999);

    andConditions.push({
      created_at: {
        gte: fromDate,
        lte: toDate,
      },
    });
  }

  // ---------------- SITE MAP LINK ----------------
  if (typeof filters.site_map_link === "boolean") {
    if (filters.site_map_link) {
      andConditions.push({
        AND: [
          { site_map_link: { not: null } },
          { site_map_link: { not: "" } },
        ],
      });
    } else {
      andConditions.push({
        OR: [{ site_map_link: null }, { site_map_link: "" }],
      });
    }
  }

  // ---------------- SITE TYPE ----------------
  const siteTypes = toArray(filters.site_type).map(Number);
  if (siteTypes.length > 0) {
    andConditions.push({ site_type_id: { in: siteTypes } });
  }

  // ---------------- ASSIGN TO ----------------
  const assignTo = toArray(filters.assign_to).map(Number);
  if (assignTo.length > 0) {
    andConditions.push({ assign_to: { in: assignTo } });
  }

  // ---------------- SOURCE ----------------
  const sources = toArray(filters.source).map(Number);
  if (sources.length > 0) {
    andConditions.push({ source_id: { in: sources } });
  }

  // ---------------- SITE ADDRESS ----------------
  if (filters.site_address && filters.site_address.trim() !== "") {
    andConditions.push({
      site_address: {
        contains: filters.site_address.trim(),
        mode: "insensitive",
      },
    });
  }

  // ✅ IMPORTANT — Only attach AND if exists
  if (andConditions.length > 0) {
    return {
      ...baseWhere,
      AND: andConditions,
    };
  }

  return baseWhere;
};

const whereClause = addFilterConditions({
  vendor_id: vendorId,
  is_deleted: false,
});

  // ====================================================
  // 🔥 FINAL QUERY (Pagination + Count)
  // ====================================================

  const [leads, total] = await Promise.all([
    prisma.leadMaster.findMany({
      where: whereClause,

      include: {
        productMappings: { include: { productType: true } },
        productStructureInstances: {
          include: { productStructure: true, productType: true },
        },
        statusType: true,
        source: true,
        siteType: true,
        account: true,
      },

      orderBy: { created_at: "desc" },
      skip,
      take: limit,
    }),

    prisma.leadMaster.count({ where: whereClause }),
  ]);

  logger.info("Filtered vendor leads fetched", { total });

  return { leads, count: total };
}

async applyConfiguration(
  projectId: string,
  leadId: number
) {
  logger.info("Apply configuration started", { projectId, leadId });

  return await prisma.$transaction(async (tx) => {

    // 1️⃣ Validate Lead
    const lead = await tx.leadMaster.findUnique({
      where: { id: leadId }
    });

    if (!lead) {
      throw new Error("Lead not found");
    }

    const clientId = lead.account_id;

    if (!clientId) {
      throw new Error("Lead has no account_id (client_id)");
    }

    // 2️⃣ Validate Project
    const project = await tx.projectMaster.findFirst({
      where: {
        unique_project_id: projectId
      }
    });

    if (!project) {
      throw new Error("Project not found");
    }

    // 3️⃣ Update ProjectMaster.client_id
    await tx.projectMaster.update({
      where: { id: project.id },
      data: { lead_id: leadId }
    });

    // 4️⃣ Update CutList.lead_id
    await tx.cutList.updateMany({
      where: {
        project_id: project.id
      },
      data: {
        lead_id: leadId
      }
    });

    logger.info("Configuration applied successfully", {
      projectId,
      leadId,
      clientId
    });

    return {
      projectId,
      leadId,
      clientId
    };
  });
}
}