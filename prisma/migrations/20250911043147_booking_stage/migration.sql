/*
  Warnings:

  - Added the required column `payment_type_id` to the `PaymentInfo` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "public"."SupervisorStatus" AS ENUM ('active', 'inactive');

-- AlterTable
ALTER TABLE "public"."LeadMaster" ADD COLUMN     "final_booking_amt" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "public"."PaymentInfo" ADD COLUMN     "payment_type_id" INTEGER NOT NULL;

-- CreateTable
CREATE TABLE "public"."PaymentTypeMaster" (
    "id" SERIAL NOT NULL,
    "type" TEXT NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "tag" TEXT NOT NULL,

    CONSTRAINT "PaymentTypeMaster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."LeadSiteSupervisorMapping" (
    "id" SERIAL NOT NULL,
    "lead_id" INTEGER NOT NULL,
    "account_id" INTEGER NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "status" "public"."SupervisorStatus" NOT NULL DEFAULT 'active',
    "created_by" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadSiteSupervisorMapping_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."PaymentInfo" ADD CONSTRAINT "PaymentInfo_payment_type_id_fkey" FOREIGN KEY ("payment_type_id") REFERENCES "public"."PaymentTypeMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PaymentTypeMaster" ADD CONSTRAINT "PaymentTypeMaster_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "public"."VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LeadSiteSupervisorMapping" ADD CONSTRAINT "LeadSiteSupervisorMapping_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."LeadMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LeadSiteSupervisorMapping" ADD CONSTRAINT "LeadSiteSupervisorMapping_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."AccountMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LeadSiteSupervisorMapping" ADD CONSTRAINT "LeadSiteSupervisorMapping_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "public"."VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LeadSiteSupervisorMapping" ADD CONSTRAINT "LeadSiteSupervisorMapping_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."UserMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LeadSiteSupervisorMapping" ADD CONSTRAINT "LeadSiteSupervisorMapping_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."UserMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;
