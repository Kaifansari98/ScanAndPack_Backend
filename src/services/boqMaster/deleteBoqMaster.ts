import { prisma } from "../../prisma/client";

const fail = (message: string, statusCode = 400): never => {
  throw Object.assign(new Error(message), { statusCode });
};

/**
 * Soft-deletes a BOQ master record and all its descendants.
 *
 * Hierarchy:
 *   ProductTypeMaster (Item Group)
 *     → ProductStructure (Item Category)
 *       → ProductSubStructure (Sub-Item Category)
 *         → ProductItemCode (Item Code)
 *
 * Deleting a parent cascades to all children recursively.
 * Deleting a child never affects the parent.
 */
export async function deleteBoqMaster(
  vendorId: number,
  kind: string,
  id: number
) {
  if (!Number.isSafeInteger(id) || id <= 0) fail("Invalid BOQ master ID");
  const now = new Date();

  return prisma.$transaction(async (tx) => {
    // ── Item Code (leaf) ──────────────────────────────────────
    if (kind === "product-item-code") {
      const existing = await tx.productItemCode.findFirst({
        where: { id, vendor_id: vendorId, is_deleted: false },
      });
      if (!existing) fail("Item code not found", 404);
      return tx.productItemCode.update({
        where: { id },
        data: { is_deleted: true, deleted_at: now },
      });
    }

    // ── Sub-Item Category ─────────────────────────────────────
    if (kind === "product-sub-structure") {
      const existing = await tx.productSubStructure.findFirst({
        where: { id, vendor_id: vendorId, is_deleted: false },
      });
      if (!existing) fail("Sub-item category not found", 404);

      // Cascade: soft-delete all item codes under this sub-structure
      await tx.productItemCode.updateMany({
        where: { sub_product_structure_id: id, vendor_id: vendorId, is_deleted: false },
        data: { is_deleted: true, deleted_at: now },
      });

      return tx.productSubStructure.update({
        where: { id },
        data: { is_deleted: true, deleted_at: now },
      });
    }

    // ── Item Category ─────────────────────────────────────────
    if (kind === "product-structure") {
      const existing = await tx.productStructure.findFirst({
        where: { id, vendor_id: vendorId, is_deleted: false },
      });
      if (!existing) fail("Item category not found", 404);

      // Cascade: find all non-deleted sub-structures, soft-delete their item codes, then soft-delete them
      const subStructures = await tx.productSubStructure.findMany({
        where: { product_structure_id: id, vendor_id: vendorId, is_deleted: false },
        select: { id: true },
      });
      const subIds = subStructures.map((s) => s.id);

      if (subIds.length > 0) {
        await tx.productItemCode.updateMany({
          where: { sub_product_structure_id: { in: subIds }, vendor_id: vendorId, is_deleted: false },
          data: { is_deleted: true, deleted_at: now },
        });
        await tx.productSubStructure.updateMany({
          where: { id: { in: subIds }, vendor_id: vendorId },
          data: { is_deleted: true, deleted_at: now },
        });
      }

      // Also soft-delete item codes directly linked to this structure
      await tx.productItemCode.updateMany({
        where: { product_structure_id: id, vendor_id: vendorId, is_deleted: false },
        data: { is_deleted: true, deleted_at: now },
      });

      return tx.productStructure.update({
        where: { id },
        data: { is_deleted: true, deleted_at: now },
      });
    }

    // ── Item Group ────────────────────────────────────────────
    if (kind === "product-type") {
      const existing = await tx.productTypeMaster.findFirst({
        where: { id, vendor_id: vendorId, is_deleted: false },
      });
      if (!existing) fail("Item group not found", 404);

      // Cascade: find all item categories under this group
      const structures = await tx.productStructure.findMany({
        where: { product_type_id: id, vendor_id: vendorId, is_deleted: false },
        select: { id: true },
      });
      const structureIds = structures.map((s) => s.id);

      if (structureIds.length > 0) {
        // Find all sub-structures under those categories
        const subStructures = await tx.productSubStructure.findMany({
          where: { product_structure_id: { in: structureIds }, vendor_id: vendorId, is_deleted: false },
          select: { id: true },
        });
        const subIds = subStructures.map((s) => s.id);

        if (subIds.length > 0) {
          await tx.productItemCode.updateMany({
            where: { sub_product_structure_id: { in: subIds }, vendor_id: vendorId, is_deleted: false },
            data: { is_deleted: true, deleted_at: now },
          });
          await tx.productSubStructure.updateMany({
            where: { id: { in: subIds }, vendor_id: vendorId },
            data: { is_deleted: true, deleted_at: now },
          });
        }

        // Also item codes directly under categories
        await tx.productItemCode.updateMany({
          where: { product_structure_id: { in: structureIds }, vendor_id: vendorId, is_deleted: false },
          data: { is_deleted: true, deleted_at: now },
        });

        await tx.productStructure.updateMany({
          where: { id: { in: structureIds }, vendor_id: vendorId },
          data: { is_deleted: true, deleted_at: now },
        });
      }

      return tx.productTypeMaster.update({
        where: { id },
        data: { is_deleted: true, deleted_at: now },
      });
    }

    fail("Invalid BOQ master kind");
  });
}

