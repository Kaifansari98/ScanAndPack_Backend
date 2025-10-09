-- CreateEnum
CREATE TYPE "public"."DocumentType" AS ENUM ('site_photo');

-- CreateTable
CREATE TABLE "public"."LeadMaster" (
    "id" SERIAL NOT NULL,
    "firstname" TEXT NOT NULL,
    "lastname" TEXT NOT NULL,
    "country_code" TEXT NOT NULL,
    "contact_no" TEXT NOT NULL,
    "alt_contact_no" TEXT,
    "email" TEXT NOT NULL,
    "site_address" TEXT NOT NULL,
    "site_type_id" INTEGER NOT NULL,
    "source_id" INTEGER NOT NULL,
    "archetech_name" TEXT NOT NULL,
    "designer_remark" TEXT NOT NULL,
    "created_by" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" INTEGER,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "assign_to" INTEGER,
    "assigned_by" INTEGER,

    CONSTRAINT "LeadMaster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SiteTypeMaster" (
    "id" SERIAL NOT NULL,
    "type" TEXT NOT NULL,
    "vendor_id" INTEGER NOT NULL,

    CONSTRAINT "SiteTypeMaster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SourceMaster" (
    "id" SERIAL NOT NULL,
    "type" TEXT NOT NULL,
    "vendor_id" INTEGER NOT NULL,

    CONSTRAINT "SourceMaster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AccountMaster" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "country_code" TEXT NOT NULL,
    "contact_no" TEXT NOT NULL,
    "alt_contact_no" TEXT,
    "email" TEXT NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "created_by" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" INTEGER,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountMaster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."LeadProductMapping" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "lead_id" INTEGER NOT NULL,
    "account_id" INTEGER NOT NULL,
    "product_type_id" INTEGER NOT NULL,
    "created_by" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_by" INTEGER,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "LeadProductMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ProductTypeMaster" (
    "id" SERIAL NOT NULL,
    "type" TEXT NOT NULL,
    "vendor_id" INTEGER NOT NULL,

    CONSTRAINT "ProductTypeMaster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."DocumentMaster" (
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

    CONSTRAINT "DocumentMaster_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."LeadMaster" ADD CONSTRAINT "LeadMaster_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "public"."VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LeadMaster" ADD CONSTRAINT "LeadMaster_site_type_id_fkey" FOREIGN KEY ("site_type_id") REFERENCES "public"."SiteTypeMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LeadMaster" ADD CONSTRAINT "LeadMaster_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "public"."SourceMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LeadMaster" ADD CONSTRAINT "LeadMaster_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."UserMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LeadMaster" ADD CONSTRAINT "LeadMaster_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."UserMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LeadMaster" ADD CONSTRAINT "LeadMaster_assign_to_fkey" FOREIGN KEY ("assign_to") REFERENCES "public"."UserMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LeadMaster" ADD CONSTRAINT "LeadMaster_assigned_by_fkey" FOREIGN KEY ("assigned_by") REFERENCES "public"."UserMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SiteTypeMaster" ADD CONSTRAINT "SiteTypeMaster_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "public"."VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SourceMaster" ADD CONSTRAINT "SourceMaster_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "public"."VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AccountMaster" ADD CONSTRAINT "AccountMaster_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "public"."VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AccountMaster" ADD CONSTRAINT "AccountMaster_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."UserMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AccountMaster" ADD CONSTRAINT "AccountMaster_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."UserMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LeadProductMapping" ADD CONSTRAINT "LeadProductMapping_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "public"."VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LeadProductMapping" ADD CONSTRAINT "LeadProductMapping_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."LeadMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LeadProductMapping" ADD CONSTRAINT "LeadProductMapping_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."AccountMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LeadProductMapping" ADD CONSTRAINT "LeadProductMapping_product_type_id_fkey" FOREIGN KEY ("product_type_id") REFERENCES "public"."ProductTypeMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LeadProductMapping" ADD CONSTRAINT "LeadProductMapping_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."UserMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LeadProductMapping" ADD CONSTRAINT "LeadProductMapping_deleted_by_fkey" FOREIGN KEY ("deleted_by") REFERENCES "public"."UserMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProductTypeMaster" ADD CONSTRAINT "ProductTypeMaster_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "public"."VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DocumentMaster" ADD CONSTRAINT "DocumentMaster_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "public"."VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DocumentMaster" ADD CONSTRAINT "DocumentMaster_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."AccountMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DocumentMaster" ADD CONSTRAINT "DocumentMaster_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."LeadMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DocumentMaster" ADD CONSTRAINT "DocumentMaster_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."UserMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DocumentMaster" ADD CONSTRAINT "DocumentMaster_deleted_by_fkey" FOREIGN KEY ("deleted_by") REFERENCES "public"."UserMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;
