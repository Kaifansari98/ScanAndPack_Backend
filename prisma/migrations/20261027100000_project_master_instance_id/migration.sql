-- Track & Trace projects belong to one LeadProductStructureInstance (one project per instance)
ALTER TABLE "ProjectMaster" ADD COLUMN "instance_id" INTEGER;

CREATE INDEX "ProjectMaster_lead_id_instance_id_idx" ON "ProjectMaster"("lead_id", "instance_id");

ALTER TABLE "ProjectMaster" ADD CONSTRAINT "ProjectMaster_instance_id_fkey" FOREIGN KEY ("instance_id") REFERENCES "LeadProductStructureInstance"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: a lead with exactly one instance owns all of its existing projects
UPDATE "ProjectMaster" pm
SET "instance_id" = single."instance_id"
FROM (
  SELECT "lead_id", MIN("id") AS "instance_id"
  FROM "LeadProductStructureInstance"
  GROUP BY "lead_id"
  HAVING COUNT(*) = 1
) single
WHERE pm."lead_id" = single."lead_id"
  AND pm."instance_id" IS NULL;
