-- DropEnum
DROP TYPE "VendorStatus";

-- CreateTable
CREATE TABLE "ProjectMaster" (
    "id" SERIAL NOT NULL,
    "project_name" TEXT NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "client_id" INTEGER NOT NULL DEFAULT 1,
    "created_by" INTEGER NOT NULL,
    "project_status" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectMaster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectDetails" (
    "id" SERIAL NOT NULL,
    "project_id" INTEGER NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "client_id" INTEGER NOT NULL,
    "total_items" INTEGER NOT NULL,
    "total_packed" INTEGER NOT NULL,
    "total_unpacked" INTEGER NOT NULL,

    CONSTRAINT "ProjectDetails_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectItemsMaster" (
    "id" SERIAL NOT NULL,
    "project_id" INTEGER NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "client_id" INTEGER NOT NULL,
    "category" TEXT NOT NULL,
    "unique_id" TEXT NOT NULL,
    "item_name" TEXT NOT NULL,
    "L1" TEXT NOT NULL,
    "L2" TEXT NOT NULL,
    "L3" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "project_details_id" INTEGER NOT NULL,

    CONSTRAINT "ProjectItemsMaster_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "ProjectMaster" ADD CONSTRAINT "ProjectMaster_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMaster" ADD CONSTRAINT "ProjectMaster_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "UserMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectDetails" ADD CONSTRAINT "ProjectDetails_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "ProjectMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectDetails" ADD CONSTRAINT "ProjectDetails_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectItemsMaster" ADD CONSTRAINT "ProjectItemsMaster_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "ProjectMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectItemsMaster" ADD CONSTRAINT "ProjectItemsMaster_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectItemsMaster" ADD CONSTRAINT "ProjectItemsMaster_project_details_id_fkey" FOREIGN KEY ("project_details_id") REFERENCES "ProjectDetails"("id") ON DELETE CASCADE ON UPDATE CASCADE;
