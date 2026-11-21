-- Complaints from clients without a lead code get a placeholder lead
-- (<VendorCode>EX-n), parked in Project Completed and kept out of normal lead
-- lists. Each external client keeps one placeholder lead. Safe to re-run.

ALTER TABLE "LeadMaster" ADD COLUMN IF NOT EXISTS "is_complaint_placeholder" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS "LeadMaster_vendor_id_is_complaint_placeholder_idx"
  ON "LeadMaster"("vendor_id", "is_complaint_placeholder");

ALTER TABLE "ComplaintExternalClient" ADD COLUMN IF NOT EXISTS "lead_id" INTEGER;
CREATE UNIQUE INDEX IF NOT EXISTS "ComplaintExternalClient_lead_id_key" ON "ComplaintExternalClient"("lead_id");

DO $$ BEGIN
  ALTER TABLE "ComplaintExternalClient"
    ADD CONSTRAINT "ComplaintExternalClient_lead_id_fkey"
    FOREIGN KEY ("lead_id") REFERENCES "LeadMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
