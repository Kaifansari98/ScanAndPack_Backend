-- Installation start belongs to one product instance (large-scale vendors)
ALTER TABLE "LeadProductStructureInstance"
  ADD COLUMN "actual_installation_start_date" TIMESTAMP(3);

-- Backfill: a lead with exactly one instance owns its existing installation start date.
WITH single AS (
  SELECT "lead_id", MIN("id") AS "instance_id"
  FROM "LeadProductStructureInstance"
  GROUP BY "lead_id"
  HAVING COUNT(*) = 1
)
UPDATE "LeadProductStructureInstance" i
SET "actual_installation_start_date" = l."actual_installation_start_date"
FROM single, "LeadMaster" l
WHERE i."id" = single."instance_id"
  AND l."id" = single."lead_id";
