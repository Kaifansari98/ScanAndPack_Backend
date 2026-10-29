import { prisma } from "../../prisma/client";

const fail = (message: string, statusCode = 400): never => { throw Object.assign(new Error(message), { statusCode }); };
const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");
const positiveId = (value: unknown, message: string) => {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : fail(message);
};
const isActive = (status?: string | null) => (status ?? "active").toLowerCase() === "active";

export async function updateBoqMaster(vendorId: number, kind: string, id: number, input: Record<string, unknown>) {
  if (!Number.isSafeInteger(id) || id <= 0) return fail("Invalid BOQ master ID");

  return prisma.$transaction(async tx => {
    if (kind === "product-type") {
      const type = text(input.type) || fail("type is required");
      const existing = await tx.productTypeMaster.findFirst({ where: { id, vendor_id: vendorId } });
      if (!existing) return fail("Item group not found", 404);
      const duplicate = await tx.productTypeMaster.findFirst({ where: { vendor_id: vendorId, id: { not: id }, type: { equals: type, mode: "insensitive" } } });
      if (duplicate) return fail("An item group with this name already exists", 409);
      const updated = await tx.productTypeMaster.update({ where: { id }, data: { type } });
      // Item categories keep a copy of their item group name in `parent`.
      await tx.productStructure.updateMany({ where: { product_type_id: id, vendor_id: vendorId }, data: { parent: type } });
      return updated;
    }

    if (kind === "product-structure") {
      const type = text(input.type) || fail("type is required");
      const productTypeId = positiveId(input.product_type_id, "Select a valid item group");
      const existing = await tx.productStructure.findFirst({ where: { id, vendor_id: vendorId } });
      if (!existing) return fail("Item category not found", 404);
      const productType = await tx.productTypeMaster.findFirst({ where: { id: productTypeId, vendor_id: vendorId } });
      if (!productType || (productTypeId !== existing.product_type_id && !isActive(productType.status))) return fail("Select a valid item group");
      const duplicate = await tx.productStructure.findFirst({ where: { vendor_id: vendorId, product_type_id: productTypeId, id: { not: id }, type: { equals: type, mode: "insensitive" } } });
      if (duplicate) return fail("An item category with this name already exists under the selected item group", 409);
      return tx.productStructure.update({ where: { id }, data: { type, product_type_id: productTypeId, parent: productType.type } });
    }

    if (kind === "product-sub-structure") {
      const type = text(input.type) || fail("type is required");
      const productStructureId = positiveId(input.product_structure_id, "Select a valid item category");
      const existing = await tx.productSubStructure.findFirst({ where: { id, vendor_id: vendorId } });
      if (!existing) return fail("Sub-item category not found", 404);
      const productStructure = await tx.productStructure.findFirst({ where: { id: productStructureId, vendor_id: vendorId } });
      if (!productStructure || (productStructureId !== existing.product_structure_id && !isActive(productStructure.status))) return fail("Select a valid item category");
      const duplicate = await tx.productSubStructure.findFirst({ where: { vendor_id: vendorId, product_structure_id: productStructureId, id: { not: id }, type: { equals: type, mode: "insensitive" } } });
      if (duplicate) return fail("A sub-item category with this name already exists under the selected item category", 409);
      const updated = await tx.productSubStructure.update({ where: { id }, data: { type, product_structure_id: productStructureId } });
      // Item codes store the item category of their sub-item category.
      if (productStructureId !== existing.product_structure_id) {
        await tx.productItemCode.updateMany({ where: { sub_product_structure_id: id, vendor_id: vendorId }, data: { product_structure_id: productStructureId } });
      }
      return updated;
    }

    if (kind === "product-item-code") {
      const itemCode = text(input.item_code) || fail("item_code is required");
      const subStructureId = positiveId(input.sub_product_structure_id, "Select a valid sub-item category");
      const description = text(input.description) || null;
      const specification = text(input.specification) || null;
      const existing = await tx.productItemCode.findFirst({ where: { id, vendor_id: vendorId } });
      if (!existing) return fail("Item code not found", 404);
      const subStructure = await tx.productSubStructure.findFirst({ where: { id: subStructureId, vendor_id: vendorId } });
      if (!subStructure || (subStructureId !== existing.sub_product_structure_id && !isActive(subStructure.status))) return fail("Select a valid sub-item category");
      const duplicate = await tx.productItemCode.findFirst({ where: { vendor_id: vendorId, id: { not: id }, item_code: itemCode, description, specification } });
      if (duplicate) return fail("An item code with the same description and specification already exists", 409);
      return tx.productItemCode.update({
        where: { id },
        data: { item_code: itemCode, sub_product_structure_id: subStructureId, product_structure_id: subStructure.product_structure_id, description, specification },
      });
    }

    return fail("Invalid BOQ master");
  });
}
