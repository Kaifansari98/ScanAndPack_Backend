/*
  Warnings:

  - A unique constraint covering the columns `[contact_no,vendor_id]` on the table `LeadMaster` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[email,vendor_id]` on the table `LeadMaster` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `account_id` to the `LeadMaster` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "public"."LeadMaster" ADD COLUMN     "account_id" INTEGER NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "LeadMaster_contact_no_vendor_id_key" ON "public"."LeadMaster"("contact_no", "vendor_id");

-- CreateIndex
CREATE UNIQUE INDEX "LeadMaster_email_vendor_id_key" ON "public"."LeadMaster"("email", "vendor_id");

-- AddForeignKey
ALTER TABLE "public"."LeadMaster" ADD CONSTRAINT "LeadMaster_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."AccountMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;
