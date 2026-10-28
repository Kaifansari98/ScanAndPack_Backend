ALTER TABLE "LeadProductStructureInstance" ADD COLUMN "stage_status_id" INTEGER;
ALTER TABLE "LeadProductStructureInstance" ADD CONSTRAINT "LeadProductStructureInstance_stage_status_id_fkey" FOREIGN KEY ("stage_status_id") REFERENCES "StatusTypeMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "LeadProductStructureInstance_vendor_id_stage_status_id_lead_id_idx" ON "LeadProductStructureInstance"("vendor_id", "stage_status_id", "lead_id");
CREATE TABLE "InstanceStageHistory" (
  "id" SERIAL PRIMARY KEY,
  "instance_id" INTEGER NOT NULL REFERENCES "LeadProductStructureInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "vendor_id" INTEGER NOT NULL REFERENCES "VendorMaster"("id") ON UPDATE CASCADE,
  "from_status_id" INTEGER REFERENCES "StatusTypeMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "to_status_id" INTEGER NOT NULL REFERENCES "StatusTypeMaster"("id") ON UPDATE CASCADE,
  "created_by" INTEGER NOT NULL REFERENCES "UserMaster"("id") ON UPDATE CASCADE,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "InstanceStageHistory_vendor_id_instance_id_created_at_idx" ON "InstanceStageHistory"("vendor_id", "instance_id", "created_at");
-- Preserve downstream stages; earlier stages continue to use their completion flags.
-- This is an initial snapshot, not a fabricated historical transition.
UPDATE "LeadProductStructureInstance" i
SET "stage_status_id" = target.id
FROM "LeadMaster" l, "VendorMaster" v, "StatusTypeMaster" current_stage, "StatusTypeMaster" target
WHERE i.lead_id = l.id AND i.vendor_id = v.id AND v."handlesLargeScaleProjects" = TRUE
  AND current_stage.id = l.status_id AND current_stage.vendor_id = v.id
  AND target.vendor_id = v.id AND i.is_archived = FALSE
  AND current_stage.tag IN ('Type 8','Type 9','Type 10','Type 11','Type 12','Type 13','Type 14','Type 15','Type 16','Type 17')
  AND target.id = (
    SELECT s.id FROM "StatusTypeMaster" s WHERE s.vendor_id = v.id AND s.tag = CASE
      WHEN current_stage.tag IN ('Type 11','Type 12','Type 13','Type 14','Type 15','Type 16','Type 17') THEN current_stage.tag
      WHEN i.is_order_login_completed = TRUE THEN 'Type 10'
      WHEN i.is_tech_check_completed = TRUE THEN 'Type 9'
      ELSE 'Type 8' END
    ORDER BY s.id LIMIT 1
  );
