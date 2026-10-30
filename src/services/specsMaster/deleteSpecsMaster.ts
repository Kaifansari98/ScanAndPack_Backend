import { prisma } from "../../prisma/client";

type Config = { model: string; field: string; parent?: { field: string; model: string; relation: string } };
const masters: Record<string, Config> = {
  "carcass-type": { model: "carcassTypeMaster", field: "name" },
  "carcas-material": { model: "carcasMaterialMaster", field: "name" },
  "carcass-material-finish": { model: "carcassMaterialFinishMaster", field: "name", parent: { field: "carcas_material_id", model: "carcasMaterialMaster", relation: "material" } },
  "shutter-type": { model: "shutterTypeMaster", field: "name" },
  "shutter-material": { model: "shutterMaterialMaster", field: "name" },
  "shutter-outer-finish": { model: "shutterOuterFinishMaster", field: "name", parent: { field: "shutter_material_id", model: "shutterMaterialMaster", relation: "material" } },
  "shutter-inner-finish": { model: "shutterInnerFinishMaster", field: "name", parent: { field: "shutter_material_id", model: "shutterMaterialMaster", relation: "material" } },
  "hardware-type": { model: "hardwareTypeMaster", field: "name" },
  "hardware-item": { model: "hardwareItemMaster", field: "name", parent: { field: "hardware_type_id", model: "hardwareTypeMaster", relation: "hardwareType" } },
  "hardware-item-option": { model: "hardwareItemOptionMaster", field: "name", parent: { field: "hardware_type_id", model: "hardwareTypeMaster", relation: "hardwareType" } },
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

