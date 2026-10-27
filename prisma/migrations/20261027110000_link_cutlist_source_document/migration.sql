ALTER TABLE "CutList" ADD COLUMN "source_document_id" INTEGER;
CREATE INDEX "CutList_source_document_id_idx" ON "CutList"("source_document_id");

-- Existing imports can be linked safely when their exact lead/instance has one source file.
WITH sole_source AS (
  SELECT d.vendor_id, d.lead_id, d.product_structure_instance_id, MIN(d.id) AS document_id
  FROM "LeadDocuments" d
  JOIN "DocumentTypeMaster" t ON t.id = d.doc_type_id
  WHERE d.is_deleted = false AND t.tag = 'Type 38'
  GROUP BY d.vendor_id, d.lead_id, d.product_structure_instance_id
  HAVING COUNT(*) = 1
)
UPDATE "CutList" c SET source_document_id = s.document_id
FROM "ProjectMaster" p, sole_source s
WHERE c.project_id = p.id AND c.vendor_id = s.vendor_id
  AND p.vendor_id = s.vendor_id AND p.lead_id = s.lead_id
  AND p.instance_id IS NOT DISTINCT FROM s.product_structure_instance_id
  AND p."isDeleted" = false AND c.source_document_id IS NULL;
