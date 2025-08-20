/*
  Warnings:

  - You are about to drop the `DocumentMaster` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "public"."DocumentMaster" DROP CONSTRAINT "DocumentMaster_account_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."DocumentMaster" DROP CONSTRAINT "DocumentMaster_created_by_fkey";

-- DropForeignKey
ALTER TABLE "public"."DocumentMaster" DROP CONSTRAINT "DocumentMaster_deleted_by_fkey";

-- DropForeignKey
ALTER TABLE "public"."DocumentMaster" DROP CONSTRAINT "DocumentMaster_lead_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."DocumentMaster" DROP CONSTRAINT "DocumentMaster_vendor_id_fkey";

-- DropTable
DROP TABLE "public"."DocumentMaster";

-- CreateTable
CREATE TABLE "public"."LeadDocuments" (
    "id" SERIAL NOT NULL,
    "doc_og_name" TEXT NOT NULL,
    "doc_sys_name" TEXT NOT NULL,
    "created_by" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_by" INTEGER,
    "deleted_at" TIMESTAMP(3),
    "doc_type" "public"."DocumentType" NOT NULL,
    "account_id" INTEGER,
    "lead_id" INTEGER,
    "vendor_id" INTEGER NOT NULL,

    CONSTRAINT "LeadDocuments_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."LeadDocuments" ADD CONSTRAINT "LeadDocuments_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "public"."VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LeadDocuments" ADD CONSTRAINT "LeadDocuments_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."AccountMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LeadDocuments" ADD CONSTRAINT "LeadDocuments_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."LeadMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LeadDocuments" ADD CONSTRAINT "LeadDocuments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."UserMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LeadDocuments" ADD CONSTRAINT "LeadDocuments_deleted_by_fkey" FOREIGN KEY ("deleted_by") REFERENCES "public"."UserMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;
