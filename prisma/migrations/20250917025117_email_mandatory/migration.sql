/*
  Warnings:

  - Made the column `email` on table `LeadMaster` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "public"."LeadMaster" ALTER COLUMN "email" SET NOT NULL;
