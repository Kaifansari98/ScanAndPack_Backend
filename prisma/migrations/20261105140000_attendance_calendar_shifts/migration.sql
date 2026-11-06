BEGIN;
ALTER TABLE "FranchiseMaster" ADD COLUMN IF NOT EXISTS "shift_minutes" INTEGER NOT NULL DEFAULT 480;
ALTER TABLE "FranchiseMaster" ADD CONSTRAINT "FranchiseMaster_shift_minutes_check" CHECK (shift_minutes BETWEEN 15 AND 1440 AND shift_minutes % 15 = 0);
-- Capture the expected shift when a new attendance session starts. Older sessions use the location setting.
ALTER TABLE "attendance" ADD COLUMN IF NOT EXISTS "shift_minutes" INTEGER;
UPDATE "attendance" a SET "shift_minutes" = COALESCE((SELECT f."shift_minutes" FROM "FranchiseMaster" f WHERE f.id=a.franchise_id AND f.vendor_id=a.vendor_id),480) WHERE a."shift_minutes" IS NULL;
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_shift_minutes_check" CHECK (shift_minutes IS NULL OR (shift_minutes BETWEEN 15 AND 1440 AND shift_minutes % 15 = 0));
COMMIT;
