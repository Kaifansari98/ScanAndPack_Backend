BEGIN;
-- Refuse to guess historical check-out times. Resolve duplicate open sessions before deployment.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM "attendance" WHERE "check_out" IS NULL GROUP BY "vendor_id", "user_id" HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'Multiple open attendance sessions exist. Review SELECT vendor_id, user_id, array_agg(id) FROM attendance WHERE check_out IS NULL GROUP BY vendor_id, user_id HAVING count(*) > 1; close the obsolete sessions with verified times before retrying this migration.';
  END IF;
END $$;

ALTER TYPE "AttendanceAction" ADD VALUE 'BREAK_START';
ALTER TYPE "AttendanceAction" ADD VALUE 'BREAK_END';
ALTER TYPE "AttendanceAction" ADD VALUE 'CORRECTED';
CREATE TYPE "AttendanceWorkLocation" AS ENUM ('OFFICE', 'FACTORY', 'SITE', 'REMOTE');
CREATE TYPE "AttendanceCorrectionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

ALTER TABLE "attendance" ADD COLUMN "work_location" "AttendanceWorkLocation", ADD COLUMN "time_zone" TEXT;
ALTER TABLE "attendance_logs" ADD COLUMN "actor_id" INTEGER, ADD COLUMN "correction_id" INTEGER,
  ADD COLUMN "before_values" JSONB, ADD COLUMN "after_values" JSONB;

CREATE TABLE "attendance_breaks" (
  "id" SERIAL PRIMARY KEY, "attendance_id" INTEGER NOT NULL,
  "started_at" TIMESTAMP(3) NOT NULL, "ended_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "attendance_breaks_attendance_id_fkey" FOREIGN KEY ("attendance_id") REFERENCES "attendance"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "attendance_breaks_time_order" CHECK ("ended_at" IS NULL OR "ended_at" >= "started_at")
);
CREATE INDEX "attendance_breaks_attendance_id_started_at_idx" ON "attendance_breaks"("attendance_id", "started_at");
CREATE UNIQUE INDEX "attendance_one_open_break" ON "attendance_breaks"("attendance_id") WHERE "ended_at" IS NULL;

CREATE TABLE "attendance_corrections" (
  "id" SERIAL PRIMARY KEY, "vendor_id" INTEGER NOT NULL, "user_id" INTEGER NOT NULL, "attendance_id" INTEGER,
  "attendance_date" DATE NOT NULL, "requested_check_in" TIMESTAMP(3), "requested_check_out" TIMESTAMP(3),
  "reason" TEXT NOT NULL, "status" "AttendanceCorrectionStatus" NOT NULL DEFAULT 'PENDING',
  "requested_by" INTEGER NOT NULL, "reviewed_by" INTEGER, "reviewed_at" TIMESTAMP(3), "review_note" TEXT,
  "baseline_updated_at" TIMESTAMP(3), "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "attendance_corrections_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "attendance_corrections_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "UserMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "attendance_corrections_attendance_id_fkey" FOREIGN KEY ("attendance_id") REFERENCES "attendance"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "attendance_corrections_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "UserMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "attendance_corrections_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "UserMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "attendance_corrections_reason_length" CHECK (length(btrim("reason")) BETWEEN 10 AND 1000)
);
CREATE INDEX "attendance_corrections_vendor_id_status_attendance_date_idx" ON "attendance_corrections"("vendor_id", "status", "attendance_date");
CREATE INDEX "attendance_corrections_user_id_attendance_date_idx" ON "attendance_corrections"("user_id", "attendance_date");
CREATE INDEX "attendance_corrections_attendance_id_idx" ON "attendance_corrections"("attendance_id");
CREATE INDEX "attendance_corrections_requested_by_idx" ON "attendance_corrections"("requested_by");
CREATE INDEX "attendance_corrections_reviewed_by_idx" ON "attendance_corrections"("reviewed_by");
CREATE UNIQUE INDEX "attendance_one_pending_correction" ON "attendance_corrections"("vendor_id", "user_id", "attendance_date") WHERE "status" = 'PENDING';
ALTER TABLE "attendance_logs" ADD CONSTRAINT "attendance_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "UserMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "attendance_logs" ADD CONSTRAINT "attendance_logs_correction_id_fkey" FOREIGN KEY ("correction_id") REFERENCES "attendance_corrections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "attendance_logs_actor_id_idx" ON "attendance_logs"("actor_id");
CREATE INDEX "attendance_logs_correction_id_idx" ON "attendance_logs"("correction_id");

CREATE UNIQUE INDEX "attendance_one_open_session" ON "attendance"("vendor_id", "user_id") WHERE "check_out" IS NULL;

COMMIT;
