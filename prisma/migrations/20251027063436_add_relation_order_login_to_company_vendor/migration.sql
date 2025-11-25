-- AlterTable
ALTER TABLE "OrderLoginDetails" ADD COLUMN     "company_vendor_id" INTEGER;

-- AddForeignKey
ALTER TABLE "OrderLoginDetails" ADD CONSTRAINT "OrderLoginDetails_company_vendor_id_fkey" FOREIGN KEY ("company_vendor_id") REFERENCES "CompanyVendorsMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;
