/*
  Warnings:

  - Made the column `status` on table `SiteTypeMaster` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "SiteTypeMaster" ALTER COLUMN "status" SET NOT NULL;
