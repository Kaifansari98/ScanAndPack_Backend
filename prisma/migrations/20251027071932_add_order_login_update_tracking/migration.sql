/*
  Warnings:

  - Added the required column `updated_at` to the `OrderLoginDetails` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "OrderLoginDetails" ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "updated_by" INTEGER;

-- AddForeignKey
ALTER TABLE "OrderLoginDetails" ADD CONSTRAINT "OrderLoginDetails_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "UserMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;
