/*
  Warnings:

  - You are about to drop the column `project_master_id` on the `ScanAndPackItem` table. All the data in the column will be lost.
  - Added the required column `created_by` to the `BoxMaster` table without a default value. This is not possible if the table is not empty.
  - Added the required column `project_details_id` to the `BoxMaster` table without a default value. This is not possible if the table is not empty.
  - Added the required column `project_details_id` to the `ScanAndPackItem` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "BoxMaster" ADD COLUMN     "created_by" INTEGER NOT NULL,
ADD COLUMN     "created_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "deleted_at" TIMESTAMP(3),
ADD COLUMN     "deleted_by" INTEGER,
ADD COLUMN     "is_deleted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "project_details_id" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "ScanAndPackItem" DROP COLUMN "project_master_id",
ADD COLUMN     "project_details_id" INTEGER NOT NULL;

-- AddForeignKey
ALTER TABLE "BoxMaster" ADD CONSTRAINT "BoxMaster_project_details_id_fkey" FOREIGN KEY ("project_details_id") REFERENCES "ProjectDetails"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScanAndPackItem" ADD CONSTRAINT "ScanAndPackItem_project_details_id_fkey" FOREIGN KEY ("project_details_id") REFERENCES "ProjectDetails"("id") ON DELETE CASCADE ON UPDATE CASCADE;
