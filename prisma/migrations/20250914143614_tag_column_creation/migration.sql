/*
  Warnings:

  - Added the required column `tag` to the `ProductTypeMaster` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "public"."LeadSiteSupervisorMapping_lead_id_user_id_key";

-- DropIndex
DROP INDEX "public"."PaymentInfo_lead_id_payment_type_id_key";

-- AlterTable
ALTER TABLE "public"."ProductTypeMaster" ADD COLUMN     "tag" TEXT NOT NULL;
