-- AlterTable: time_zone_master
-- 1. Rename existing text and boolean columns
ALTER TABLE "time_zone_master" RENAME COLUMN "name" TO "country";
ALTER TABLE "time_zone_master" RENAME COLUMN "time_zone_code" TO "time_zone_name";
ALTER TABLE "time_zone_master" RENAME COLUMN "is_active" TO "active";

-- 2. Convert created_at to time_zone (TEXT) and updated_at to mins (INTEGER)
ALTER TABLE "time_zone_master" ALTER COLUMN "created_at" DROP NOT NULL;
ALTER TABLE "time_zone_master" ALTER COLUMN "created_at" DROP DEFAULT;
ALTER TABLE "time_zone_master" ALTER COLUMN "created_at" TYPE TEXT USING NULL;
ALTER TABLE "time_zone_master" RENAME COLUMN "created_at" TO "time_zone";

ALTER TABLE "time_zone_master" ALTER COLUMN "updated_at" DROP NOT NULL;
ALTER TABLE "time_zone_master" ALTER COLUMN "updated_at" DROP DEFAULT;
ALTER TABLE "time_zone_master" ALTER COLUMN "updated_at" TYPE INTEGER USING NULL;
ALTER TABLE "time_zone_master" RENAME COLUMN "updated_at" TO "mins";

-- 3. Rename unique index to match Prisma model
ALTER INDEX IF EXISTS "time_zone_master_time_zone_code_key" RENAME TO "time_zone_master_time_zone_name_key";

-- 4. Backfill existing row 1 (India) and row 2 (UTC) with appropriate time_zone offsets
UPDATE "time_zone_master" SET "time_zone" = '+05:30' WHERE "id" = 1 AND "time_zone" IS NULL;
UPDATE "time_zone_master" SET "time_zone" = '+00:00' WHERE "id" = 2 AND "time_zone" IS NULL;
