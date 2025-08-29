/*
  Warnings:

  - Added the required column `status_id` to the `LeadMaster` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "public"."LeadMaster" ADD COLUMN     "status_id" INTEGER NOT NULL;

-- CreateTable
CREATE TABLE "public"."StatusTypeMaster" (
    "id" SERIAL NOT NULL,
    "type" TEXT NOT NULL,
    "vendor_id" INTEGER NOT NULL,

    CONSTRAINT "StatusTypeMaster_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."LeadMaster" ADD CONSTRAINT "LeadMaster_status_id_fkey" FOREIGN KEY ("status_id") REFERENCES "public"."StatusTypeMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."StatusTypeMaster" ADD CONSTRAINT "StatusTypeMaster_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "public"."VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;
