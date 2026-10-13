-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "AttendanceAction" AS ENUM ('IN', 'OUT');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "AttendanceSource" AS ENUM ('MANUAL', 'PHONE', 'CARD');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- CreateTable: time_zone_master
CREATE TABLE IF NOT EXISTS "time_zone_master" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "time_zone_code" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "time_zone_master_pkey" PRIMARY KEY ("id")
);

-- Unique index on time_zone_code
CREATE UNIQUE INDEX IF NOT EXISTS "time_zone_master_time_zone_code_key" ON "time_zone_master"("time_zone_code");

-- AlterTable: VendorMaster
ALTER TABLE "VendorMaster" ADD COLUMN IF NOT EXISTS "time_zone_id" INTEGER;
CREATE INDEX IF NOT EXISTS "VendorMaster_time_zone_id_idx" ON "VendorMaster"("time_zone_id");

DO $$ BEGIN
    ALTER TABLE "VendorMaster" ADD CONSTRAINT "VendorMaster_time_zone_id_fkey" FOREIGN KEY ("time_zone_id") REFERENCES "time_zone_master"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- CreateTable: attendance
CREATE TABLE IF NOT EXISTS "attendance" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "franchise_id" INTEGER,
    "user_id" INTEGER NOT NULL,
    "attendance_date" DATE NOT NULL,
    "check_in" TIMESTAMP(3) NOT NULL,
    "check_out" TIMESTAMP(3),
    "source" "AttendanceSource" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "attendance_vendor_id_user_id_attendance_date_key" ON "attendance"("vendor_id", "user_id", "attendance_date");
CREATE INDEX IF NOT EXISTS "attendance_vendor_id_idx" ON "attendance"("vendor_id");
CREATE INDEX IF NOT EXISTS "attendance_franchise_id_idx" ON "attendance"("franchise_id");
CREATE INDEX IF NOT EXISTS "attendance_user_id_idx" ON "attendance"("user_id");
CREATE INDEX IF NOT EXISTS "attendance_attendance_date_idx" ON "attendance"("attendance_date");

DO $$ BEGIN
    ALTER TABLE "attendance" ADD CONSTRAINT "attendance_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "attendance" ADD CONSTRAINT "attendance_franchise_id_fkey" FOREIGN KEY ("franchise_id") REFERENCES "FranchiseMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "attendance" ADD CONSTRAINT "attendance_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "UserMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- CreateTable: attendance_logs
CREATE TABLE IF NOT EXISTS "attendance_logs" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "franchise_id" INTEGER,
    "user_id" INTEGER NOT NULL,
    "attendance_id" INTEGER NOT NULL,
    "action" "AttendanceAction" NOT NULL,
    "action_time" TIMESTAMP(3) NOT NULL,
    "source" "AttendanceSource" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "attendance_logs_attendance_id_idx" ON "attendance_logs"("attendance_id");
CREATE INDEX IF NOT EXISTS "attendance_logs_vendor_id_idx" ON "attendance_logs"("vendor_id");
CREATE INDEX IF NOT EXISTS "attendance_logs_franchise_id_idx" ON "attendance_logs"("franchise_id");
CREATE INDEX IF NOT EXISTS "attendance_logs_user_id_idx" ON "attendance_logs"("user_id");
CREATE INDEX IF NOT EXISTS "attendance_logs_action_time_idx" ON "attendance_logs"("action_time");

-- Conditional unique index enforcing only one accepted IN log per attendance_id
CREATE UNIQUE INDEX IF NOT EXISTS "attendance_logs_attendance_id_action_in_idx" ON "attendance_logs"("attendance_id") WHERE "action" = 'IN';

DO $$ BEGIN
    ALTER TABLE "attendance_logs" ADD CONSTRAINT "attendance_logs_attendance_id_fkey" FOREIGN KEY ("attendance_id") REFERENCES "attendance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "attendance_logs" ADD CONSTRAINT "attendance_logs_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "attendance_logs" ADD CONSTRAINT "attendance_logs_franchise_id_fkey" FOREIGN KEY ("franchise_id") REFERENCES "FranchiseMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "attendance_logs" ADD CONSTRAINT "attendance_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "UserMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Seed standard IANA time zones into time_zone_master
INSERT INTO "time_zone_master" ("name", "time_zone_code", "is_active", "created_at", "updated_at")
VALUES
  ('India', 'Asia/Kolkata', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('UTC', 'UTC', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('United States - Eastern', 'America/New_York', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('United States - Central', 'America/Chicago', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('United States - Mountain', 'America/Denver', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('United States - Pacific', 'America/Los_Angeles', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('United Kingdom', 'Europe/London', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('France / Central Europe', 'Europe/Paris', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('United Arab Emirates', 'Asia/Dubai', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('Singapore', 'Asia/Singapore', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('Japan', 'Asia/Tokyo', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('Australia - Sydney', 'Australia/Sydney', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("time_zone_code") DO NOTHING;

-- Safely backfill existing VendorMaster.time_zone_id where matching time_zone_code exists
UPDATE "VendorMaster" v
SET "time_zone_id" = t."id"
FROM "time_zone_master" t
WHERE v."time_zone_id" IS NULL
  AND t."time_zone_code" = v."time_zone";
