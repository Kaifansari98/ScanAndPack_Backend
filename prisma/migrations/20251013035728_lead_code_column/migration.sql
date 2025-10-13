/*
  Warnings:

  - A unique constraint covering the columns `[vendor_id,lead_code]` on the table `LeadMaster` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `lead_code` to the `LeadMaster` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "LeadMaster" ADD COLUMN     "lead_code" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "LeadMaster_vendor_id_lead_code_key" ON "LeadMaster"("vendor_id", "lead_code");
