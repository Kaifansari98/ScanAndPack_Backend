import { prisma } from "../../prisma/client";

export interface AddLeadRequirementMaterialItem {
  product_id: number;
  quantity: number;
  unit_id?: number | null;
  unit_name?: string | null;
  supplied_by?: "Frankvin" | "Client" | "Shared";
  client_percentage?: number;
  frankvin_percentage?: number;
}

export interface AddLeadRequirementMaterialInput {
  lead_id: number;
  vendor_id: number;
  product_type_id?: number;
  b2b_requirement_type_id?: number;
  created_by: number;

  // Single-item fallback parameters (for backward compatibility)
  product_id?: number;
  product_ids?: number[];
  quantity?: number;
  unit_id?: number | null;
  unit_name?: string | null;
  supplied_by?: "Frankvin" | "Client" | "Shared";
  client_percentage?: number;
  frankvin_percentage?: number;

  // New materials array parameter
  materials?: AddLeadRequirementMaterialItem[];
}

export const addLeadRequirementMaterial = async (
  payload: AddLeadRequirementMaterialInput,
) => {
  const {
    lead_id,
    vendor_id,
    product_type_id,
    b2b_requirement_type_id,
    created_by,
  } = payload;

  const reqTypeId = b2b_requirement_type_id || product_type_id;

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

  // Handle new materials array bulk creation mode
  if (Array.isArray(payload.materials) && payload.materials.length > 0) {
    return prisma.$transaction(async (tx) => {
      const createdMaterials = [];

      for (const item of payload.materials!) {
        const supplied_by = item.supplied_by || "Frankvin";
        let client_percentage = 0;
        let frankvin_percentage = 100;

        if (supplied_by === "Client") {
          client_percentage = 100;
          frankvin_percentage = 0;
        } else if (supplied_by === "Shared") {
          client_percentage = Number(item.client_percentage) || 0;
          if (client_percentage < 0) client_percentage = 0;
          if (client_percentage > 100) client_percentage = 100;
          frankvin_percentage = 100 - client_percentage;
        }

        const client_quantity = (item.quantity * client_percentage) / 100;
        const frankvin_quantity = (item.quantity * frankvin_percentage) / 100;

        const newMaterial = await tx.leadRequirementMaterialMapping.create({
          data: {
            lead_id,
            vendor_id,
            b2b_requirement_type_id: reqTypeId || null,
            product_type_id: reqTypeId || null,
            product_id: item.product_id,
            quantity: item.quantity,
            unit_id: item.unit_id || null,
            unit_name: item.unit_name ? item.unit_name.trim() : null,
            supplied_by: supplied_by as any,
            client_percentage,
            frankvin_percentage,
            client_quantity,
            frankvin_quantity,
            created_by: validCreatedBy,
          } as any,
          include: {
            product: {
              select: {
                id: true,
                product_name: true,
                item_code: true,
                unit_of_measure: true,
              },
            },
            b2bRequirementType: {
              select: {
                id: true,
                type: true,
              },
            },
            unit: {
              select: {
                id: true,
                unit_name: true,
                short_name: true,
              },
            },
          },
        });
        createdMaterials.push(newMaterial);
      }

      return createdMaterials;
    });
  }

  // Fallback to single item creation mode (for backward compatibility)
  const targetProductIds: number[] = Array.isArray(payload.product_ids) && payload.product_ids.length > 0
    ? payload.product_ids
    : payload.product_id
    ? [payload.product_id]
    : [];

  if (targetProductIds.length === 0) {
    throw new Error("At least one product_id or product_ids must be provided");
  }

  const quantity = payload.quantity || 0;
  const unit_id = payload.unit_id;
  const unit_name = payload.unit_name;
  const supplied_by = payload.supplied_by || "Frankvin";
  let client_percentage = 0;
  let frankvin_percentage = 100;

  if (supplied_by === "Client") {
    client_percentage = 100;
    frankvin_percentage = 0;
  } else if (supplied_by === "Shared") {
    client_percentage = Number(payload.client_percentage) || 0;
    if (client_percentage < 0) client_percentage = 0;
    if (client_percentage > 100) client_percentage = 100;
    frankvin_percentage = 100 - client_percentage;
  }

  const client_quantity = (quantity * client_percentage) / 100;
  const frankvin_quantity = (quantity * frankvin_percentage) / 100;

  const createdMaterials = [];

  for (const pId of targetProductIds) {
    const newMaterial = await prisma.leadRequirementMaterialMapping.create({
      data: {
        lead_id,
        vendor_id,
        b2b_requirement_type_id: reqTypeId || null,
        product_type_id: reqTypeId || null,
        product_id: pId,
        quantity,
        unit_id: unit_id || null,
        unit_name: unit_name ? unit_name.trim() : null,
        supplied_by: supplied_by as any,
        client_percentage,
        frankvin_percentage,
        client_quantity,
        frankvin_quantity,
        created_by: validCreatedBy,
      } as any,
      include: {
        product: {
          select: {
            id: true,
            product_name: true,
            item_code: true,
            unit_of_measure: true,
          },
        },
        b2bRequirementType: {
          select: {
            id: true,
            type: true,
          },
        },
        unit: {
          select: {
            id: true,
            unit_name: true,
            short_name: true,
          },
        },
      },
    });
    createdMaterials.push(newMaterial);
  }

  return createdMaterials;
};

export const getLeadRequirementMaterials = async (
  lead_id: number,
  vendor_id: number,
) => {
  return prisma.leadRequirementMaterialMapping.findMany({
    where: {
      lead_id,
      vendor_id,
    },
    include: {
      product: {
        select: {
          id: true,
          product_name: true,
          item_code: true,
          unit_of_measure: true,
        },
      },
      b2bRequirementType: {
        select: {
          id: true,
          type: true,
        },
      },
      unit: {
        select: {
          id: true,
          unit_name: true,
          short_name: true,
        },
      },
    },
    orderBy: {
      id: "asc",
    },
  });
};

export const updateLeadRequirementMaterial = async (
  id: number,
  payload: {
    vendor_id: number;
    quantity: number;
    unit_id?: number | null;
    unit_name?: string | null;
    supplied_by?: "Frankvin" | "Client" | "Shared";
    client_percentage?: number;
    frankvin_percentage?: number;
  }
) => {
  const existing = await prisma.leadRequirementMaterialMapping.findFirst({
    where: { id, vendor_id: payload.vendor_id },
  });

  if (!existing) {
    throw new Error("Requirement material mapping not found");
  }

  const supplied_by = payload.supplied_by || existing.supplied_by;
  let client_percentage = existing.client_percentage;
  let frankvin_percentage = existing.frankvin_percentage;

  if (supplied_by === "Client") {
    client_percentage = 100;
    frankvin_percentage = 0;
  } else if (supplied_by === "Shared") {
    client_percentage = Number(payload.client_percentage) || 0;
    if (client_percentage < 0) client_percentage = 0;
    if (client_percentage > 100) client_percentage = 100;
    frankvin_percentage = 100 - client_percentage;
  } else {
    client_percentage = 0;
    frankvin_percentage = 100;
  }

  const quantity = payload.quantity;
  const client_quantity = (quantity * client_percentage) / 100;
  const frankvin_quantity = (quantity * frankvin_percentage) / 100;

  return prisma.leadRequirementMaterialMapping.update({
    where: { id },
    data: {
      quantity,
      unit_id: payload.unit_id !== undefined ? payload.unit_id : existing.unit_id,
      unit_name: payload.unit_name !== undefined ? (payload.unit_name ? payload.unit_name.trim() : null) : existing.unit_name,
      supplied_by: supplied_by as any,
      client_percentage,
      frankvin_percentage,
      client_quantity,
      frankvin_quantity,
    },
    include: {
      product: {
        select: {
          id: true,
          product_name: true,
          item_code: true,
          unit_of_measure: true,
        },
      },
      b2bRequirementType: {
        select: {
          id: true,
          type: true,
        },
      },
      unit: {
        select: {
          id: true,
          unit_name: true,
          short_name: true,
        },
      },
    },
  });
};

export const deleteLeadRequirementMaterial = async (
  id: number,
  vendor_id: number,
) => {
  const existing = await prisma.leadRequirementMaterialMapping.findFirst({
    where: { id, vendor_id },
  });

  if (!existing) {
    throw new Error("Requirement material mapping not found");
  }

  await prisma.leadRequirementMaterialMapping.delete({
    where: { id },
  });

  return true;
};
