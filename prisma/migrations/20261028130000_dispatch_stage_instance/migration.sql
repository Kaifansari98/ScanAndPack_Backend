-- Dispatch Details belong to one product instance (large-scale vendors)
ALTER TABLE "LeadProductStructureInstance"
  ADD COLUMN "dispatch_date" TIMESTAMP(3),
  ADD COLUMN "driver_name" VARCHAR(255),
  ADD COLUMN "driver_number" VARCHAR(50),
  ADD COLUMN "vehicle_no" VARCHAR(100),
  ADD COLUMN "dispatch_remark" VARCHAR(2000);

-- Backfill: a lead with exactly one instance owns its existing Dispatch Details,
-- Dispatch Documents (Type 21) and Pending Materials tasks.
WITH single AS (
  SELECT "lead_id", MIN("id") AS "instance_id"
  FROM "LeadProductStructureInstance"
  GROUP BY "lead_id"
  HAVING COUNT(*) = 1
)
UPDATE "LeadProductStructureInstance" i
SET "dispatch_date" = l."dispatch_date",
    "driver_name" = l."driver_name",
    "driver_number" = l."driver_number",
    "vehicle_no" = l."vehicle_no",
    "dispatch_remark" = l."dispatch_remark"
FROM single, "LeadMaster" l
WHERE i."id" = single."instance_id"
  AND l."id" = single."lead_id";

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
  AND t."tag" = 'Type 21'
  AND d."lead_id" = single."lead_id"
  AND d."product_structure_instance_id" IS NULL;

WITH single AS (
  SELECT "lead_id", MIN("id") AS "instance_id"
  FROM "LeadProductStructureInstance"
  GROUP BY "lead_id"
  HAVING COUNT(*) = 1
)
UPDATE "UserLeadTask" t
SET "instance_id" = single."instance_id"
FROM single
WHERE t."task_type" = 'Pending Materials'
  AND t."lead_id" = single."lead_id"
  AND t."instance_id" IS NULL;
