-- CreateEnum
CREATE TYPE "BoxStatus" AS ENUM ('packed', 'unpacked');

-- CreateEnum
CREATE TYPE "ItemStatus" AS ENUM ('packed', 'unpacked');

-- CreateTable
CREATE TABLE "BoxMaster" (
    "id" SERIAL NOT NULL,
    "project_id" INTEGER NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "client_id" INTEGER NOT NULL,
    "box_name" TEXT NOT NULL,
    "box_status" "BoxStatus" NOT NULL,

    CONSTRAINT "BoxMaster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScanAndPackItem" (
    "id" SERIAL NOT NULL,
    "project_id" INTEGER NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "client_id" INTEGER NOT NULL,
    "box_id" INTEGER NOT NULL,
    "project_master_id" INTEGER NOT NULL,
    "unique_id" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "created_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" INTEGER NOT NULL,
    "status" "ItemStatus" NOT NULL,

    CONSTRAINT "ScanAndPackItem_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "BoxMaster" ADD CONSTRAINT "BoxMaster_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "ProjectMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoxMaster" ADD CONSTRAINT "BoxMaster_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScanAndPackItem" ADD CONSTRAINT "ScanAndPackItem_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "ProjectMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScanAndPackItem" ADD CONSTRAINT "ScanAndPackItem_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScanAndPackItem" ADD CONSTRAINT "ScanAndPackItem_box_id_fkey" FOREIGN KEY ("box_id") REFERENCES "BoxMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScanAndPackItem" ADD CONSTRAINT "ScanAndPackItem_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "UserMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;
