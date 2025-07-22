-- AlterTable
ALTER TABLE "VendorMaster" ALTER COLUMN "status" SET DEFAULT 'inactive';

-- CreateTable
CREATE TABLE "VendorTaxInfo" (
    "id" SERIAL NOT NULL,
    "tax_no" TEXT NOT NULL,
    "tax_status" TEXT NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "tax_country" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VendorTaxInfo_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "VendorTaxInfo" ADD CONSTRAINT "VendorTaxInfo_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;
