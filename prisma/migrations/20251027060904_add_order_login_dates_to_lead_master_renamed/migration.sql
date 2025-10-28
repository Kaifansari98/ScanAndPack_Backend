/*
  Warnings:

  - You are about to drop the column `expected_order_ready_date` on the `LeadMaster` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "LeadMaster" DROP COLUMN "expected_order_ready_date",
ADD COLUMN     "expected_order_login_ready_date" TIMESTAMP(3);
