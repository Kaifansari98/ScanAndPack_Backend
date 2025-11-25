-- CreateTable
CREATE TABLE "CompanyVendorsMaster" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "vendor_code" TEXT NOT NULL,
    "company_name" TEXT NOT NULL,
    "point_of_contact" TEXT NOT NULL,
    "contact_no" TEXT NOT NULL,
    "email" TEXT,
    "address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" INTEGER NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" INTEGER NOT NULL,

    CONSTRAINT "CompanyVendorsMaster_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "CompanyVendorsMaster" ADD CONSTRAINT "CompanyVendorsMaster_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyVendorsMaster" ADD CONSTRAINT "CompanyVendorsMaster_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "UserMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyVendorsMaster" ADD CONSTRAINT "CompanyVendorsMaster_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "UserMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
