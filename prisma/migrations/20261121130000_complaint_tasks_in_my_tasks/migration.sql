-- Complaint tasks per workflow stage, and their mirror in My Tasks for
-- complaints raised against a CRM lead. Safe to re-run.

ALTER TYPE "ComplaintTaskType" ADD VALUE IF NOT EXISTS 'VISIT_SCHEDULING';
ALTER TYPE "ComplaintTaskType" ADD VALUE IF NOT EXISTS 'FREE_VISIT_APPROVAL';
ALTER TYPE "ComplaintTaskType" ADD VALUE IF NOT EXISTS 'PAYMENT_COLLECTION';
ALTER TYPE "ComplaintTaskType" ADD VALUE IF NOT EXISTS 'ON_HOLD_REVIEW';

ALTER TABLE "UserLeadTask" ADD COLUMN IF NOT EXISTS "complaint_id" INTEGER;
ALTER TABLE "UserLeadTask" ADD COLUMN IF NOT EXISTS "complaint_task_id" INTEGER;

CREATE UNIQUE INDEX IF NOT EXISTS "UserLeadTask_complaint_task_id_key" ON "UserLeadTask"("complaint_task_id");
CREATE INDEX IF NOT EXISTS "UserLeadTask_complaint_id_idx" ON "UserLeadTask"("complaint_id");

DO $$ BEGIN
  ALTER TABLE "UserLeadTask"
    ADD CONSTRAINT "UserLeadTask_complaint_task_id_fkey"
    FOREIGN KEY ("complaint_task_id") REFERENCES "ComplaintTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
