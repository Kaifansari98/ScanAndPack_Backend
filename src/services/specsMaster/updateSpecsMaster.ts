import { prisma } from "../../prisma/client";
import { OtherApplianceType } from "../../prisma/generated";

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
const fail = (message: string, statusCode = 400): never => { throw Object.assign(new Error(message), { statusCode }); };

export async function updateSpecsMaster(vendorId: number, kind: string, id: number, input: Record<string, unknown>) {
  const config = Object.prototype.hasOwnProperty.call(masters, kind) ? masters[kind] : undefined;
  if (!config || !Number.isSafeInteger(id) || id <= 0) return fail("Invalid specification master or ID");
  const value = typeof input[config.field] === "string" ? (input[config.field] as string).trim() : "";
  if (!value) return fail(`${config.field} is required`);
  return prisma.$transaction(async tx => {
    const model = (tx as any)[config.model];
    const scope = config.parent ? { [config.parent.relation]: { vendor_id: vendorId } } : { vendor_id: vendorId };
    const existing = await model.findFirst({ where: { id, ...scope, is_deleted: false } });
    if (!existing) return fail("Specification master not found", 404);
    const data: Record<string, unknown> = { [config.field]: value };
    const duplicateScope: Record<string, unknown> = { ...scope, is_deleted: false };
    if (config.parent) {
      const parentId = Number(input[config.parent.field]);
      if (!Number.isSafeInteger(parentId) || parentId <= 0) return fail("Select a valid parent");
      const parent = await (tx as any)[config.parent.model].findFirst({ where: { id: parentId, vendor_id: vendorId, is_deleted: false } });
      if (!parent) return fail("Parent does not belong to this vendor");
      data[config.parent.field] = parentId;
      duplicateScope[config.parent.field] = parentId;
    }
    if (kind === "hardware-item") {
      if (typeof input.inScope !== "boolean") return fail("inScope must be a boolean");
      data.inScope = input.inScope;
    }
    if (kind === "hardware-item-option") {
      const hardwareItemId = Number(input.hardware_item_id);
      if (!Number.isSafeInteger(hardwareItemId) || hardwareItemId <= 0) return fail("Select a valid hardware item");
      const hardwareItem = await tx.hardwareItemMaster.findFirst({ where: { id: hardwareItemId, hardware_type_id: Number(data.hardware_type_id), is_deleted: false } });
      if (!hardwareItem) return fail("Hardware item does not belong to the selected hardware type");
      data.hardware_item_id = hardwareItemId;
      duplicateScope.hardware_item_id = hardwareItemId;
    }
    if (kind === "other-appliances") {
      if (!Object.values(OtherApplianceType).includes(input.type as OtherApplianceType)) return fail("Invalid appliance type");
      if (typeof input.description !== "string" || !input.description.trim()) return fail("Description is required");
      data.type = input.type;
      data.description = input.description.trim();
      duplicateScope.type = input.type;
    }
    const duplicate = await model.findFirst({ where: { ...duplicateScope, id: { not: id }, [config.field]: { equals: value, mode: "insensitive" } } });
    if (duplicate) return fail("An entry with this value already exists under the selected parent/type", 409);
    const updated = await model.update({ where: { id }, data });
    if (kind === "hardware-item" && data.hardware_type_id !== existing.hardware_type_id) {
      await tx.hardwareItemOptionMaster.updateMany({ where: { hardware_item_id: id }, data: { hardware_type_id: Number(data.hardware_type_id) } });
    }
    return updated;
  });
}

/** Marks one or more entries of a specs master active / inactive (scoped to the vendor). */
export async function updateSpecsMasterStatus(vendorId: number, kind: string, ids: unknown, status: unknown) {
  const config = Object.prototype.hasOwnProperty.call(masters, kind) ? masters[kind] : undefined;
  if (!config) return fail("Invalid specification master");
  if (status !== "active" && status !== "inactive") return fail("status must be either 'active' or 'inactive'");
  const entryIds = Array.isArray(ids) ? [...new Set(ids.map(Number))] : [];
  if (entryIds.length === 0 || !entryIds.every(id => Number.isSafeInteger(id) && id > 0)) return fail("ids must be a non-empty list of IDs");

  const model = (prisma as any)[config.model];
  const scope = config.parent ? { [config.parent.relation]: { vendor_id: vendorId } } : { vendor_id: vendorId };
  const where = { id: { in: entryIds }, ...scope, is_deleted: false };
  const found = await model.count({ where });
  if (found !== entryIds.length) return fail("Specification master not found", 404);
  await model.updateMany({ where, data: { status } });
  return { ids: entryIds, status };
}
