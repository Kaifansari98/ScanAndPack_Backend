/*
  Warnings:

  - A unique constraint covering the columns `[user_contact]` on the table `UserMaster` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "UserMaster_user_contact_key" ON "UserMaster"("user_contact");
