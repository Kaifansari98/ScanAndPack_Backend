/*
  Warnings:

  - Added the required column `room_name` to the `ProjectDetails` table without a default value. This is not possible if the table is not empty.
  - Added the required column `weight` to the `ProjectDetails` table without a default value. This is not possible if the table is not empty.
  - Added the required column `group_name` to the `ProjectItemsMaster` table without a default value. This is not possible if the table is not empty.
  - Added the required column `weight` to the `ProjectItemsMaster` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "public"."ProjectDetails" ADD COLUMN     "is_grouping_allowed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "room_name" TEXT NOT NULL,
ADD COLUMN     "weight" DOUBLE PRECISION NOT NULL;

-- AlterTable
ALTER TABLE "public"."ProjectItemsMaster" ADD COLUMN     "group_name" TEXT NOT NULL,
ADD COLUMN     "weight" DOUBLE PRECISION NOT NULL;

-- AlterTable
ALTER TABLE "public"."ProjectMaster" ADD COLUMN     "is_grouping_allowed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "weight" DOUBLE PRECISION NOT NULL DEFAULT 0;
