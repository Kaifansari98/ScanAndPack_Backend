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
    include: {
      machineMappings: {
        include: {
          machine: {
            select: {
              id: true,
              machine_name: true,
              machine_code: true
            }
          },
          machineType: {
            select: {
              id: true,
              machine_type: true
            }
          }
        }
      }
    },
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
  const { lead_id, vendor_id, mappings, process_brief_ids, created_by } = payload;

  if (!lead_id || !vendor_id) {
    throw new Error("lead_id and vendor_id are required");
  }

  // Validate created_by foreign key to prevent database constraint failures
  let validCreatedBy = Number(created_by);
  if (isNaN(validCreatedBy) || validCreatedBy <= 0) {
    validCreatedBy = 1;
  }

  const userExists = await prisma.userMaster.findUnique({
    where: { id: validCreatedBy },
    select: { id: true },
  });

  if (!userExists) {
    const lead = await prisma.leadMaster.findUnique({
      where: { id: lead_id },
      select: { created_by: true },
    });
    if (lead?.created_by) {
      validCreatedBy = lead.created_by;
    } else {
      const anyUser = await prisma.userMaster.findFirst({ select: { id: true } });
      if (anyUser) {
        validCreatedBy = anyUser.id;
      }
    }
  }

  await prisma.leadProcessBriefMapping.deleteMany({
    where: { lead_id, vendor_id },
  });

  const firstB2bType = await prisma.b2BRequirementTypeMaster.findFirst({
    where: { vendor_id, status: { equals: "active", mode: "insensitive" } },
  });
  const defaultTypeId = firstB2bType?.id ?? null;

  if (mappings && mappings.length > 0) {
    const data = mappings
      .map((m) => {
        const rawTypeId = m.b2b_requirement_type_id ?? m.product_type_id;
        const reqTypeId =
          rawTypeId !== undefined && rawTypeId !== null && !isNaN(Number(rawTypeId))
            ? Number(rawTypeId)
            : defaultTypeId;
        const briefId =
          m.process_brief_id !== undefined && m.process_brief_id !== null && !isNaN(Number(m.process_brief_id))
            ? Number(m.process_brief_id)
            : null;

        if (!briefId) return null;
        if (reqTypeId === null) return null;

        return {
          lead_id,
          vendor_id,
          b2b_requirement_type_id: reqTypeId,
          process_brief_id: briefId,
          created_by: validCreatedBy,
        };
      })
      .filter(
        (item): item is { lead_id: number; vendor_id: number; b2b_requirement_type_id: number; process_brief_id: number; created_by: number } =>
          item !== null
      );

    if (data.length > 0) {
      await prisma.leadProcessBriefMapping.createMany({
        data,
      });
    }
  } else if (process_brief_ids && process_brief_ids.length > 0) {
    const firstB2bType = await prisma.b2BRequirementTypeMaster.findFirst({
      where: { vendor_id, status: { equals: "active", mode: "insensitive" } },
    });
    const defaultTypeId = firstB2bType?.id ?? null;

    if (defaultTypeId !== null) {
      const data = process_brief_ids
        .map((bId) => {
          const briefId = !isNaN(Number(bId)) ? Number(bId) : null;
          if (!briefId) return null;
          return {
            lead_id,
            vendor_id,
            b2b_requirement_type_id: defaultTypeId,
            process_brief_id: briefId,
            created_by: validCreatedBy,
          };
        })
        .filter((item): item is NonNullable<typeof item> => item !== null);

      if (data.length > 0) {
        await prisma.leadProcessBriefMapping.createMany({
          data,
        });
      }
    }
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

export interface SaveProcessBriefMachineMappingsInput {
  process_brief_id: number;
  vendor_id: number;
  machine_ids?: number[];
  machine_type_ids?: number[];
  created_by: number;
}

export const saveProcessBriefMachineMappings = async (payload: SaveProcessBriefMachineMappingsInput) => {
  const { process_brief_id, vendor_id, machine_ids = [], machine_type_ids = [], created_by } = payload;

  return prisma.$transaction(async (tx) => {
    // Delete existing mappings
    await tx.processBriefMachineMapping.deleteMany({
      where: { process_brief_id, vendor_id },
    });

    const dataToCreate: any[] = [];

    // Create mappings for specific machines
    if (machine_ids.length > 0) {
      machine_ids.forEach((machineId) => {
        dataToCreate.push({
          process_brief_id,
          machine_id: machineId,
          machine_type_id: null,
          vendor_id,
          created_by,
        });
      });
    }

    // Create mappings for machine types
    if (machine_type_ids.length > 0) {
      machine_type_ids.forEach((machineTypeId) => {
        dataToCreate.push({
          process_brief_id,
          machine_id: null,
          machine_type_id: machineTypeId,
          vendor_id,
          created_by,
        });
      });
    }

    if (dataToCreate.length > 0) {
      await tx.processBriefMachineMapping.createMany({
        data: dataToCreate,
      });
    }

    // Return updated mappings
    return tx.processBriefMachineMapping.findMany({
      where: { process_brief_id, vendor_id },
      include: {
        machine: true,
        machineType: true,
      },
    });
  });
};

export const getProcessBriefMachineMappings = async (process_brief_id: number, vendor_id: number) => {
  return prisma.processBriefMachineMapping.findMany({
    where: { process_brief_id, vendor_id },
    include: {
      machine: {
        select: {
          id: true,
          machine_name: true,
          machine_code: true,
          machine_type_id: true,
          status: true,
        },
      },
      machineType: {
        select: {
          id: true,
          machine_type: true,
          active: true,
        },
      },
    },
  });
};

export const updateProcessBrief = async (id: number, name: string) => {
  return prisma.processBriefMaster.update({
    where: { id },
    data: { name: name.trim() },
  });
};

export const toggleProcessBriefStatus = async (id: number, is_active: boolean) => {
  return prisma.processBriefMaster.update({
    where: { id },
    data: { is_active },
  });
};


