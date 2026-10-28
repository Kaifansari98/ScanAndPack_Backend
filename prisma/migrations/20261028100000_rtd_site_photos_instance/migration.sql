-- Ready-To-Dispatch Current Site Photos (Type 18) are now uploaded per product instance.
-- Backfill: a lead with exactly one instance owns all of its existing site photos.
UPDATE "LeadDocuments" d
SET "product_structure_instance_id" = single."instance_id"
FROM "DocumentTypeMaster" t,
  (
    SELECT "lead_id", MIN("id") AS "instance_id"
    FROM "LeadProductStructureInstance"
    GROUP BY "lead_id"
    HAVING COUNT(*) = 1
  ) single
WHERE d."doc_type_id" = t."id"
  AND t."tag" = 'Type 18'
  AND d."lead_id" = single."lead_id"
  AND d."product_structure_instance_id" IS NULL;
