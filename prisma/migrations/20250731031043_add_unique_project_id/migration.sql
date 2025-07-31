/*
  Warnings:

  - A unique constraint covering the columns `[unique_project_id]` on the table `ProjectMaster` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `unique_project_id` to the `ProjectMaster` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "public"."ProjectMaster" ADD COLUMN     "unique_project_id" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "ProjectMaster_unique_project_id_key" ON "public"."ProjectMaster"("unique_project_id");
