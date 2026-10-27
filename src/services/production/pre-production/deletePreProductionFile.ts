import { prisma } from "../../../prisma/client";

export async function deletePreProductionFile(vendorId: number, documentId: number, deletedBy: number) {
  return prisma.$transaction(async (tx) => {
    const initial = await tx.leadDocuments.findFirst({ where: { id: documentId, vendor_id: vendorId }, select: { lead_id: true } });
    if (!initial?.lead_id) throw new Error("Pre-production document not found");
    // Imports and deletes share this lock so a deleted file cannot acquire new cutlist rows.
    await tx.$queryRaw`SELECT id FROM "LeadMaster" WHERE id = ${initial.lead_id} AND vendor_id = ${vendorId} FOR UPDATE`;
    const doc = await tx.leadDocuments.findFirst({ where: { id: documentId, vendor_id: vendorId, is_deleted: false, documentType: { tag: "Type 38" } } });
    if (!doc) throw new Error("Pre-production document not found or already deleted");
    const scope = { vendor_id: vendorId, lead_id: doc.lead_id, instance_id: doc.product_structure_instance_id ?? null };
    const projects = await tx.projectMaster.findMany({ where: { ...scope, isDeleted: false }, select: { id: true } });
    const projectIds = projects.map(project => project.id);
    const remainingFiles = await tx.leadDocuments.count({ where: {
      vendor_id: vendorId, lead_id: doc.lead_id, product_structure_instance_id: doc.product_structure_instance_id ?? null,
      is_deleted: false, id: { not: doc.id }, documentType: { tag: "Type 38" },
    } });
    const rowScope = { vendor_id: vendorId, project_id: { in: projectIds } };
    const linkedCount = await tx.cutList.count({ where: { ...rowScope, source_document_id: doc.id } });
    const legacyCount = await tx.cutList.count({ where: { ...rowScope, source_document_id: null } });
    if (remainingFiles > 0 && !linkedCount && legacyCount > 0) {
      throw Object.assign(new Error("This older upload has no cutlist file link. Its cutlist cannot be safely distinguished from the other files on this instance."), { statusCode: 409 });
    }
    const rows = await tx.cutList.findMany({ where: { ...rowScope, ...(remainingFiles ? { source_document_id: doc.id } : {}) }, select: { id: true } });
    const rowIds = rows.map(row => row.id);
    if (rowIds.length) {
      const mappings = await tx.cutListMachineMapping.findMany({ where: { vendor_id: vendorId, cut_list_id: { in: rowIds } }, select: { id: true } });
      const mappingIds = mappings.map(mapping => mapping.id);
      const defects = await tx.defectedItem.findMany({ where: { vendor_id: vendorId, OR: [{ cut_list_id: { in: rowIds } }, { cut_list_machine_mapping_id: { in: mappingIds } }] }, select: { id: true } });
      const defectIds = defects.map(defect => defect.id);
      await tx.defectCompletionPhoto.deleteMany({ where: { vendor_id: vendorId, OR: [{ cut_list_id: { in: rowIds } }, { cut_list_machine_mapping_id: { in: mappingIds } }, { defected_item_id: { in: defectIds } }] } });
      await tx.defectedItemImage.deleteMany({ where: { defected_item_id: { in: defectIds } } });
      await tx.defectedItem.deleteMany({ where: { vendor_id: vendorId, id: { in: defectIds } } });
      await tx.cutListMachineMapping.deleteMany({ where: { vendor_id: vendorId, cut_list_id: { in: rowIds } } });
      await tx.cutList.deleteMany({ where: { ...rowScope, id: { in: rowIds } } });
    }
    const updated = await tx.leadDocuments.update({ where: { id: doc.id }, data: { is_deleted: true, deleted_by: deletedBy, deleted_at: new Date() } });
    if (!remainingFiles && projectIds.length) {
      // Match Track & Trace's existing project deletion lifecycle.
      await tx.projectMaster.updateMany({ where: { ...scope, id: { in: projectIds }, isDeleted: false }, data: { isDeleted: true, deleted_by: deletedBy, deleted_at: new Date(), updated_by: deletedBy } });
    }
    return updated;
  }, { timeout: 30000 });
}
