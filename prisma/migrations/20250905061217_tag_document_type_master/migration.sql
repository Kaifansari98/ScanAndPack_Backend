/*
  Warnings:

  - Added the required column `tag` to the `DocumentTypeMaster` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "public"."DocumentTypeMaster" ADD COLUMN     "tag" TEXT NOT NULL;
