/*
  Warnings:

  - You are about to drop the column `is_grouping_allowed` on the `ProjectDetails` table. All the data in the column will be lost.
  - You are about to drop the column `room_name` on the `ProjectDetails` table. All the data in the column will be lost.
  - You are about to drop the column `weight` on the `ProjectDetails` table. All the data in the column will be lost.
  - You are about to drop the column `group_name` on the `ProjectItemsMaster` table. All the data in the column will be lost.
  - You are about to drop the column `weight` on the `ProjectItemsMaster` table. All the data in the column will be lost.
  - You are about to drop the column `is_grouping_allowed` on the `ProjectMaster` table. All the data in the column will be lost.
  - You are about to drop the column `weight` on the `ProjectMaster` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "public"."ProjectDetails" DROP COLUMN "is_grouping_allowed",
DROP COLUMN "room_name",
DROP COLUMN "weight";

-- AlterTable
ALTER TABLE "public"."ProjectItemsMaster" DROP COLUMN "group_name",
DROP COLUMN "weight";

-- AlterTable
ALTER TABLE "public"."ProjectMaster" DROP COLUMN "is_grouping_allowed",
DROP COLUMN "weight";
