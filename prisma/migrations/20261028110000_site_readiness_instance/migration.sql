-- Site Readiness checklist answers belong to one product instance (large-scale vendors)
ALTER TABLE "SiteReadiness" ADD COLUMN "instance_id" INTEGER;

CREATE INDEX "SiteReadiness_lead_id_instance_id_idx" ON "SiteReadiness"("lead_id", "instance_id");

ALTER TABLE "SiteReadiness" ADD CONSTRAINT "SiteReadiness_instance_id_fkey" FOREIGN KEY ("instance_id") REFERENCES "LeadProductStructureInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: a lead with exactly one instance owns all of its existing answers
-- and Site Readiness Current Site Photos (Type 19).
WITH single AS (
  SELECT "lead_id", MIN("id") AS "instance_id"
  FROM "LeadProductStructureInstance"
  GROUP BY "lead_id"
  HAVING COUNT(*) = 1
)
UPDATE "SiteReadiness" sr
SET "instance_id" = single."instance_id"
FROM single
WHERE sr."lead_id" = single."lead_id"
  AND sr."instance_id" IS NULL;

WITH single AS (
  SELECT "lead_id", MIN("id") AS "instance_id"
  FROM "LeadProductStructureInstance"
  GROUP BY "lead_id"
  HAVING COUNT(*) = 1
)
UPDATE "LeadDocuments" d
SET "product_structure_instance_id" = single."instance_id"
FROM "DocumentTypeMaster" t, single
WHERE d."doc_type_id" = t."id"
  AND t."tag" = 'Type 19'
  AND d."lead_id" = single."lead_id"
  AND d."product_structure_instance_id" IS NULL;
