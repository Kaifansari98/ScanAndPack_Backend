import { prisma } from "../../prisma/client";

export const getB2BRequirementTypes = async (vendor_id: number) => {
  if (!vendor_id) throw new Error("vendor_id is required");

  return prisma.b2BRequirementTypeMaster.findMany({
    where: {
      vendor_id,
      status: { equals: "active", mode: "insensitive" },
    },
    orderBy: { id: "asc" },
  });
};

export const createB2BRequirementType = async (payload: {
  vendor_id: number;
  type: string;
}) => {
  const { vendor_id, type } = payload;
  if (!vendor_id || !type) throw new Error("vendor_id and type are required");

  return prisma.b2BRequirementTypeMaster.create({
    data: {
      vendor_id,
      type: type.trim(),
      status: "active",
    },
  });
};

export const updateB2BRequirementType = async (
  id: number,
  payload: {
    vendor_id: number;
    type?: string;
    status?: string;
  }
) => {
  const existing = await prisma.b2BRequirementTypeMaster.findFirst({
    where: { id, vendor_id: payload.vendor_id },
  });

  if (!existing) {
    throw new Error("B2B Requirement Type not found");
  }

  return prisma.b2BRequirementTypeMaster.update({
    where: { id },
    data: {
      ...(payload.type ? { type: payload.type.trim() } : {}),
      ...(payload.status ? { status: payload.status } : {}),
    },
  });
};

export const deleteB2BRequirementType = async (
  id: number,
  vendor_id: number
) => {
  const existing = await prisma.b2BRequirementTypeMaster.findFirst({
    where: { id, vendor_id },
  });

  if (!existing) {
    throw new Error("B2B Requirement Type not found");
  }

  await prisma.b2BRequirementTypeMaster.delete({
    where: { id },
  });

  return true;
};

export const saveLeadB2BRequirementMappings = async (payload: {
  lead_id: number;
  vendor_id: number;
  b2b_requirement_type_ids: number[];
  created_by: number;
  approximate_budget?: number;
  project_status?: string;
}) => {
  const {
    lead_id,
    vendor_id,
    b2b_requirement_type_ids,
    created_by,
    approximate_budget,
    project_status,
  } = payload;

  if (!lead_id || !vendor_id) {
    throw new Error("lead_id and vendor_id are required");
  }

  // Clear previous mappings for this lead
  await prisma.leadB2BRequirementTypeMapping.deleteMany({
    where: { lead_id, vendor_id },
  });

  if (Array.isArray(b2b_requirement_type_ids) && b2b_requirement_type_ids.length > 0) {
    const data = b2b_requirement_type_ids.map((typeId) => ({
      lead_id,
      vendor_id,
      b2b_requirement_type_id: typeId,
      created_by,
      approximate_budget: approximate_budget ?? null,
      project_status: project_status || null,
    }));

    await prisma.leadB2BRequirementTypeMapping.createMany({
      data,
    });
  }

  return getLeadB2BRequirementMappings(lead_id, vendor_id);
};

export const getLeadB2BRequirementMappings = async (
  lead_id: number,
  vendor_id: number
) => {
  return prisma.leadB2BRequirementTypeMapping.findMany({
    where: { lead_id, vendor_id },
    include: {
      b2bRequirementType: {
        select: {
          id: true,
          type: true,
          status: true,
        },
      },
    },
    orderBy: { id: "asc" },
  });
};
