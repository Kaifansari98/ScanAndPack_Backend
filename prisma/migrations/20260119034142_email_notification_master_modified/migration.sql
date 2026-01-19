/*
  Warnings:

  - A unique constraint covering the columns `[vendor_id,template_key]` on the table `EmailNotificationMaster` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `html` to the `EmailNotificationMaster` table without a default value. This is not possible if the table is not empty.
  - Added the required column `subject` to the `EmailNotificationMaster` table without a default value. This is not possible if the table is not empty.
  - Added the required column `template_key` to the `EmailNotificationMaster` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "EmailNotificationMaster" ADD COLUMN     "html" TEXT NOT NULL,
ADD COLUMN     "subject" TEXT NOT NULL,
ADD COLUMN     "template_key" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "EmailNotificationMaster_vendor_id_template_key_key" ON "EmailNotificationMaster"("vendor_id", "template_key");
