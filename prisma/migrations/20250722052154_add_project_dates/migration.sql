/*
  Warnings:

  - Added the required column `estimated_completion_date` to the `ProjectDetails` table without a default value. This is not possible if the table is not empty.
  - Added the required column `start_date` to the `ProjectDetails` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "ProjectDetails" ADD COLUMN     "actual_completion_date" TIMESTAMP(3),
ADD COLUMN     "estimated_completion_date" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "start_date" TIMESTAMP(3) NOT NULL;
