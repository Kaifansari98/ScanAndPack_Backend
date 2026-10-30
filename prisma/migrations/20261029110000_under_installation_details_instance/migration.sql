-- Installation Details, Day-Wise Updates and Completion belong to one product instance (large-scale vendors)
ALTER TABLE "LeadProductStructureInstance"
  ADD COLUMN "expected_installation_end_date" TIMESTAMP(3),
  ADD COLUMN "is_carcass_installation_completed" BOOLEAN DEFAULT false,
  ADD COLUMN "carcass_installation_completion_date" TIMESTAMP(3),
  ADD COLUMN "is_shutter_installation_completed" BOOLEAN DEFAULT false,
  ADD COLUMN "shutter_installation_completion_date" TIMESTAMP(3);

ALTER TABLE "InstallerUserMapping" ADD COLUMN "instance_id" INTEGER;
ALTER TABLE "InstallationUpdate" ADD COLUMN "instance_id" INTEGER;

CREATE INDEX "InstallerUserMapping_lead_id_instance_id_idx" ON "InstallerUserMapping"("lead_id", "instance_id");
CREATE INDEX "InstallationUpdate_lead_id_instance_id_idx" ON "InstallationUpdate"("lead_id", "instance_id");

ALTER TABLE "InstallerUserMapping" ADD CONSTRAINT "InstallerUserMapping_instance_id_fkey" FOREIGN KEY ("instance_id") REFERENCES "LeadProductStructureInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InstallationUpdate" ADD CONSTRAINT "InstallationUpdate_instance_id_fkey" FOREIGN KEY ("instance_id") REFERENCES "LeadProductStructureInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: a lead with exactly one instance owns its existing installation details,
-- installers, day-wise updates and day-wise documents (Type 23).
WITH single AS (
  SELECT "lead_id", MIN("id") AS "instance_id"
  FROM "LeadProductStructureInstance"
  GROUP BY "lead_id"
  HAVING COUNT(*) = 1
)
UPDATE "LeadProductStructureInstance" i
SET "expected_installation_end_date" = l."expected_installation_end_date",
    "is_carcass_installation_completed" = l."is_carcass_installation_completed",
    "carcass_installation_completion_date" = l."carcass_installation_completion_date",
    "is_shutter_installation_completed" = l."is_shutter_installation_completed",
    "shutter_installation_completion_date" = l."shutter_installation_completion_date"
FROM single, "LeadMaster" l
WHERE i."id" = single."instance_id"
  AND l."id" = single."lead_id";

WITH single AS (
  SELECT "lead_id", MIN("id") AS "instance_id"
  FROM "LeadProductStructureInstance"
  GROUP BY "lead_id"
  HAVING COUNT(*) = 1
)
UPDATE "InstallerUserMapping" m
SET "instance_id" = single."instance_id"
FROM single
WHERE m."lead_id" = single."lead_id"
  AND m."instance_id" IS NULL;

WITH single AS (
  SELECT "lead_id", MIN("id") AS "instance_id"
  FROM "LeadProductStructureInstance"
  GROUP BY "lead_id"
  HAVING COUNT(*) = 1
)
UPDATE "InstallationUpdate" u
SET "instance_id" = single."instance_id"
FROM single
WHERE u."lead_id" = single."lead_id"
  AND u."instance_id" IS NULL;

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
  AND t."tag" = 'Type 23'
  AND d."lead_id" = single."lead_id"
  AND d."product_structure_instance_id" IS NULL;
