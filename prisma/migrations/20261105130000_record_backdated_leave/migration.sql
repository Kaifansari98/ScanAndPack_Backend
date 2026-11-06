BEGIN;

ALTER TYPE "LeaveRequestStatus" ADD VALUE IF NOT EXISTS 'RECORDED';
ALTER TABLE "LeaveRequest" ADD COLUMN IF NOT EXISTS "is_backdated" BOOLEAN NOT NULL DEFAULT false;

-- Backdated leave is recorded without a reviewer; other decisions retain their audit requirements.
-- Compare the new enum label as text so this migration remains atomic in PostgreSQL.
ALTER TABLE "LeaveRequest" DROP CONSTRAINT IF EXISTS "LeaveRequest_review_check";
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_review_check" CHECK (
  (is_backdated AND status::text = 'RECORDED' AND reviewed_by IS NULL AND reviewed_at IS NULL AND rejection_reason IS NULL)
  OR (NOT is_backdated AND (
    (status = 'PENDING' AND reviewed_by IS NULL AND reviewed_at IS NULL AND rejection_reason IS NULL)
    OR (status = 'APPROVED' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL AND rejection_reason IS NULL)
    OR (status = 'REJECTED' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL AND rejection_reason IS NOT NULL AND length(trim(rejection_reason)) > 0)
  ))
);

-- Recorded leave also reserves its dates. The boolean predicate avoids using a newly added enum value before commit.
DROP INDEX IF EXISTS "LeaveRequest_one_active_date";
CREATE UNIQUE INDEX "LeaveRequest_one_active_date" ON "LeaveRequest" (vendor_id,user_id,leave_date)
  WHERE status IN ('PENDING','APPROVED') OR is_backdated;

COMMIT;
