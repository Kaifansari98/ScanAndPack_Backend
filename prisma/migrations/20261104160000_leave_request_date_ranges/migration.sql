BEGIN;

-- Preserve existing single-day requests as inclusive one-day ranges.
ALTER TABLE "LeaveRequest" ADD COLUMN "end_date" DATE;
UPDATE "LeaveRequest" SET "end_date" = "leave_date";
ALTER TABLE "LeaveRequest" ALTER COLUMN "end_date" SET NOT NULL;
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_date_range_check" CHECK ("end_date" >= "leave_date");
CREATE INDEX "LeaveRequest_vendor_user_range_idx" ON "LeaveRequest" ("vendor_id", "user_id", "leave_date", "end_date");

COMMIT;
