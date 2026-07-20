-- AlterTable
ALTER TABLE "ClientMaster" ADD COLUMN     "client_type_id" INTEGER,
ADD COLUMN     "company_name" TEXT,
ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "gst_number" TEXT,
ADD COLUMN     "is_active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "vendor_id" INTEGER;

-- Backfill existing rows onto the first vendor before enforcing NOT NULL
UPDATE "ClientMaster" SET "vendor_id" = (SELECT "id" FROM "VendorMaster" ORDER BY "id" LIMIT 1) WHERE "vendor_id" IS NULL;

ALTER TABLE "ClientMaster" ALTER COLUMN "vendor_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "LeadMaster" ADD COLUMN     "client_id" INTEGER;

-- CreateTable
CREATE TABLE "ClientTypeMaster" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientTypeMaster_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClientTypeMaster_vendor_id_idx" ON "ClientTypeMaster"("vendor_id");

-- CreateIndex
CREATE INDEX "ClientMaster_vendor_id_idx" ON "ClientMaster"("vendor_id");

-- CreateIndex
CREATE INDEX "ClientMaster_client_type_id_idx" ON "ClientMaster"("client_type_id");

-- AddForeignKey
ALTER TABLE "ClientMaster" ADD CONSTRAINT "ClientMaster_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientMaster" ADD CONSTRAINT "ClientMaster_client_type_id_fkey" FOREIGN KEY ("client_type_id") REFERENCES "ClientTypeMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientTypeMaster" ADD CONSTRAINT "ClientTypeMaster_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadMaster" ADD CONSTRAINT "LeadMaster_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "ClientMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;
