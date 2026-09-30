-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "ExternalPlatformTokenActiveStatus" AS ENUM ('Yes', 'No');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "ExternalPlatformMasterActiveStatus" AS ENUM ('Yes', 'No');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "ExternalPlatformMaster" (
    "id" SERIAL NOT NULL,
    "external_platform_name" TEXT NOT NULL,
    "active" "ExternalPlatformMasterActiveStatus" NOT NULL DEFAULT 'Yes',

    CONSTRAINT "ExternalPlatformMaster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ExternalPlatformToken" (
    "id" SERIAL NOT NULL,
    "external_platform_id" INTEGER NOT NULL,
    "token" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" INTEGER NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" INTEGER NOT NULL,
    "active" "ExternalPlatformTokenActiveStatus" NOT NULL DEFAULT 'Yes',

    CONSTRAINT "ExternalPlatformToken_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ExternalPlatformToken_external_platform_id_fkey') THEN
        ALTER TABLE "ExternalPlatformToken" ADD CONSTRAINT "ExternalPlatformToken_external_platform_id_fkey" FOREIGN KEY ("external_platform_id") REFERENCES "ExternalPlatformMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ExternalPlatformToken_vendor_id_fkey') THEN
        ALTER TABLE "ExternalPlatformToken" ADD CONSTRAINT "ExternalPlatformToken_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ExternalPlatformToken_created_by_fkey') THEN
        ALTER TABLE "ExternalPlatformToken" ADD CONSTRAINT "ExternalPlatformToken_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "UserMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ExternalPlatformToken_updated_by_fkey') THEN
        ALTER TABLE "ExternalPlatformToken" ADD CONSTRAINT "ExternalPlatformToken_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "UserMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;
