-- Non-destructive repair for databases maintained with prisma db push.
-- Existing single-day requests become one-day ranges. Existing end dates are retained.
BEGIN;

LOCK TABLE "LeaveRequest" IN ACCESS EXCLUSIVE MODE;
ALTER TABLE "LeaveRequest" ADD COLUMN IF NOT EXISTS "end_date" DATE;
UPDATE "LeaveRequest" SET "end_date" = "leave_date" WHERE "end_date" IS NULL;
ALTER TABLE "LeaveRequest" ALTER COLUMN "end_date" SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'LeaveRequest_date_range_check'
      AND conrelid = '"LeaveRequest"'::regclass
  ) THEN
    ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_date_range_check"
      CHECK ("end_date" >= "leave_date");
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "LeaveRequest_vendor_user_range_idx"
  ON "LeaveRequest" ("vendor_id", "user_id", "leave_date", "end_date");

COMMIT;
