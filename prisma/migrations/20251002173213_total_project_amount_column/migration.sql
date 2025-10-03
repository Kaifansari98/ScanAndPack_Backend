/*
  Warnings:

  - You are about to drop the column `final_booking_amt` on the `LeadMaster` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "public"."LeadMaster" DROP COLUMN "final_booking_amt",
ADD COLUMN     "total_project_amount" DOUBLE PRECISION;
