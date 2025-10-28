-- AlterTable
ALTER TABLE "CompanyVendorsMaster" ADD COLUMN     "deleted_at" TIMESTAMP(3),
ADD COLUMN     "deleted_by" INTEGER,
ADD COLUMN     "is_deleted" BOOLEAN NOT NULL DEFAULT false;

-- AddForeignKey
ALTER TABLE "CompanyVendorsMaster" ADD CONSTRAINT "CompanyVendorsMaster_deleted_by_fkey" FOREIGN KEY ("deleted_by") REFERENCES "UserMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;
