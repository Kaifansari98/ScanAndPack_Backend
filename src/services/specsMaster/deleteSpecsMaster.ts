import { prisma } from "../../prisma/client";

type Config = { model: string; field: string; parent?: { field: string; model: string; relation: string } };
const masters: Record<string, Config> = {
  "carcass-type": { model: "carcassTypeMaster", field: "name" },
  "carcas-material": { model: "carcasMaterialMaster", field: "name" },
  "carcass-material-finish": { model: "carcassMaterialFinishMaster", field: "name", parent: { field: "carcas_material_id", model: "carcasMaterialMaster", relation: "material" } },
  "shutter-type": { model: "shutterTypeMaster", field: "name" },
  "shutter-material": { model: "shutterMaterialMaster", field: "name" },
  "shutter-material-finish": { model: "shutterMaterialFinishMaster", field: "name", parent: { field: "shutter_material_id", model: "shutterMaterialMaster", relation: "material" } },
  "carcass-legs": { model: "carcassLegsMaster", field: "name" },
  "skirting-carcass-legs": { model: "skirtingCarcassLegsMaster", field: "name", parent: { field: "carcass_legs_id", model: "carcassLegsMaster", relation: "carcassLegs" } },
  "skirting-carcass-legs-color": { model: "skirtingCarcassLegsColorMaster", field: "color", parent: { field: "carcass_legs_id", model: "carcassLegsMaster", relation: "carcassLegs" } },
  "light-carcas-type": { model: "lightCarcasTypeMaster", field: "type" },
  "light-carcas-unit": { model: "lightCarcasUnitMaster", field: "type", parent: { field: "light_carcas_type_id", model: "lightCarcasTypeMaster", relation: "lightCarcasType" } },
  "other-appliances": { model: "otherAppliancesMaster", field: "article_number" },
};

const fail = (message: string, statusCode = 400): never => {
  throw Object.assign(new Error(message), { statusCode });
};

export async function deleteSpecsMaster(vendorId: number, kind: string, id: number) {
  const config = Object.prototype.hasOwnProperty.call(masters, kind) ? masters[kind] : undefined;
  if (!config || !Number.isSafeInteger(id) || id <= 0) {
    return fail("Invalid specification master or ID");
  }

  return prisma.$transaction(async (tx) => {
    const model = (tx as any)[config.model];
    const scope = config.parent
      ? { [config.parent.relation]: { vendor_id: vendorId } }
      : { vendor_id: vendorId };

    const existing = await model.findFirst({
      where: {
        id,
        ...scope,
        is_deleted: false,
      },
    });

    if (!existing) {
      return fail("Specification master entry not found or already deleted", 404);
    }

    const updated = await model.update({
      where: { id },
      data: {
        is_deleted: true,
        deleted_at: new Date(),
      },
    });

    return updated;
  });
}

