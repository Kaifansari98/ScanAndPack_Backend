/*
  Warnings:

  - Made the column `tag` on table `StatusTypeMaster` required. This step will fail if there are existing NULL values in that column.

*/
-- CreateEnum
CREATE TYPE "public"."LeadUserStatus" AS ENUM ('inactive', 'active');

-- AlterTable
ALTER TABLE "public"."StatusTypeMaster" ALTER COLUMN "tag" SET NOT NULL;

-- CreateTable
CREATE TABLE "public"."LeadUserMapping" (
    "id" SERIAL NOT NULL,
    "account_id" INTEGER NOT NULL,
    "lead_id" INTEGER NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "status" "public"."LeadUserStatus" NOT NULL DEFAULT 'active',
    "created_by" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" INTEGER,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeadUserMapping_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."LeadUserMapping" ADD CONSTRAINT "LeadUserMapping_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."LeadMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LeadUserMapping" ADD CONSTRAINT "LeadUserMapping_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."AccountMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LeadUserMapping" ADD CONSTRAINT "LeadUserMapping_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "public"."VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LeadUserMapping" ADD CONSTRAINT "LeadUserMapping_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."UserMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LeadUserMapping" ADD CONSTRAINT "LeadUserMapping_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."UserMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LeadUserMapping" ADD CONSTRAINT "LeadUserMapping_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."UserMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;
