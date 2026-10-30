import { prisma } from "../../prisma/client";
import { OtherApplianceType } from "../../prisma/generated";

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
    if (kind === "skirting-carcass-legs") {
      if (typeof input.inScope !== "boolean") return fail("inScope must be a boolean");
      data.inScope = input.inScope;
    }
    if (kind === "skirting-carcass-legs-color") {
      const skirtingId = Number(input.skirting_carcass_legs_id);
      if (!Number.isSafeInteger(skirtingId) || skirtingId <= 0) return fail("Select a valid skirting");
      const skirting = await tx.skirtingCarcassLegsMaster.findFirst({ where: { id: skirtingId, carcass_legs_id: Number(data.carcass_legs_id) } });
      if (!skirting) return fail("Skirting does not belong to the selected carcass legs");
      data.skirting_carcass_legs_id = skirtingId;
      duplicateScope.skirting_carcass_legs_id = skirtingId;
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
    if (kind === "skirting-carcass-legs" && data.carcass_legs_id !== existing.carcass_legs_id) {
      await tx.skirtingCarcassLegsColorMaster.updateMany({ where: { skirting_carcass_legs_id: id }, data: { carcass_legs_id: Number(data.carcass_legs_id) } });
    }
    return updated;
  });
}
