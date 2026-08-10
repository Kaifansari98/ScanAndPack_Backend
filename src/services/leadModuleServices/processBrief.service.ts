import { prisma } from "../../prisma/client";

export interface ProcessBriefInput {
  vendor_id: number;
  name: string;
  created_by: number;
  is_active?: boolean;
}

export const addProcessBrief = async (payload: ProcessBriefInput) => {
  const vendor = await prisma.vendorMaster.findUnique({
    where: { id: payload.vendor_id },
  });
  if (!vendor) {
    throw new Error("Invalid vendor_id");
  }

  const processBrief = await prisma.processBriefMaster.create({
    data: {
      vendor_id: payload.vendor_id,
      name: payload.name.trim(),
      created_by: payload.created_by,
      is_active: payload.is_active ?? true,
    },
  });

  return processBrief;
};

export const getAllProcessBriefs = async (vendor_id: number) => {
  const briefs = await prisma.processBriefMaster.findMany({
    where: { vendor_id },
    orderBy: { id: "desc" },
  });

  return briefs;
};

export interface ProcessBriefMappingItem {
  product_type_id?: number;
  b2b_requirement_type_id?: number;
  process_brief_id: number;
}

export interface SaveLeadProcessBriefsInput {
  lead_id: number;
  vendor_id: number;
  mappings?: ProcessBriefMappingItem[];
  process_brief_ids?: number[];
  created_by: number;
}

export const saveLeadProcessBriefs = async (payload: SaveLeadProcessBriefsInput) => {
  const {
     lead_id,
      vendor_id,
       mappings,
        process_brief_ids,
         created_by 
        } = payload;

  await prisma.leadProcessBriefMapping.deleteMany({
    where: { lead_id, vendor_id },
  });

  if (mappings && mappings.length > 0) {
    const data = mappings.map((m) => ({
      lead_id,
      vendor_id,
      b2b_requirement_type_id: m.b2b_requirement_type_id || m.product_type_id,
      process_brief_id: m.process_brief_id,
      created_by,
    }));

    await prisma.leadProcessBriefMapping.createMany({
      data,
    });
  } else if (process_brief_ids && process_brief_ids.length > 0) {
    const firstB2bType = await prisma.b2BRequirementTypeMaster.findFirst({
      where: { vendor_id, status: { equals: "active", mode: "insensitive" } },
    });
    const defaultTypeId = firstB2bType?.id || null;

    const data = process_brief_ids.map((bId) => ({
      lead_id,
      vendor_id,
      b2b_requirement_type_id: defaultTypeId,
      process_brief_id: bId,
      created_by,
    }));

    await prisma.leadProcessBriefMapping.createMany({
      data,
    });
  }

  return getLeadProcessBriefs(lead_id, vendor_id);
};

export const getLeadProcessBriefs = async (lead_id: number, vendor_id: number) => {
  return prisma.leadProcessBriefMapping.findMany({
    where: { lead_id, vendor_id },
    include: {
      processBrief: true,
      b2bRequirementType: {
        select: {
          id: true,
          type: true,
        },
      },
    },
  });
};
