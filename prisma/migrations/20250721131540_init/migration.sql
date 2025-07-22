-- CreateEnum
CREATE TYPE "VendorStatus" AS ENUM ('active', 'inactive');

-- CreateTable
CREATE TABLE "VendorMaster" (
    "id" SERIAL NOT NULL,
    "vendor_name" TEXT NOT NULL,
    "vendor_code" TEXT NOT NULL,
    "primary_contact_number" TEXT NOT NULL,
    "primary_contact_email" TEXT NOT NULL,
    "primary_contact_name" TEXT NOT NULL,
    "country_code" TEXT NOT NULL,
    "head_office_id" INTEGER,
    "status" TEXT NOT NULL,
    "logo" TEXT NOT NULL,
    "time_zone" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VendorMaster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorAddress" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "address" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "pincode" TEXT NOT NULL,
    "landmark" TEXT NOT NULL,

    CONSTRAINT "VendorAddress_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "VendorAddress" ADD CONSTRAINT "VendorAddress_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;
