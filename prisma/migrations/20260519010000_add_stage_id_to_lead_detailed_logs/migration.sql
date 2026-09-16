ALTER TABLE "LeadDetailedLogs"
ADD COLUMN "stage_id" INTEGER;

ALTER TABLE "LeadDetailedLogs"
ADD CONSTRAINT "LeadDetailedLogs_stage_id_fkey"
FOREIGN KEY ("stage_id")
REFERENCES "StatusTypeMaster"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION set_lead_detailed_logs_stage_id()
RETURNS TRIGGER AS $$
BEGIN
  SELECT lm."status_id"
  INTO NEW."stage_id"
  FROM "LeadMaster" lm
  WHERE lm."id" = NEW."lead_id";

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_lead_detailed_logs_stage_id
ON "LeadDetailedLogs";

CREATE TRIGGER trg_set_lead_detailed_logs_stage_id
BEFORE INSERT ON "LeadDetailedLogs"
FOR EACH ROW
EXECUTE FUNCTION set_lead_detailed_logs_stage_id();

UPDATE "LeadDetailedLogs" ldl
SET "stage_id" = lm."status_id"
FROM "LeadMaster" lm
WHERE lm."id" = ldl."lead_id"
  AND ldl."stage_id" IS NULL;
