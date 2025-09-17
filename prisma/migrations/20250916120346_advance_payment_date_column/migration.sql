/*
  Warnings:

  - You are about to alter the column `final_desc_note` on the `LeadMaster` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(2000)`.

*/
-- AlterTable
ALTER TABLE "public"."LeadMaster" ADD COLUMN     "advance_payment_date" TIMESTAMP(3),
ALTER COLUMN "final_desc_note" SET DATA TYPE VARCHAR(2000);
