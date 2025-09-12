/*
  Warnings:

  - A unique constraint covering the columns `[lead_id,user_id]` on the table `LeadSiteSupervisorMapping` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[lead_id,payment_type_id]` on the table `PaymentInfo` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "LeadSiteSupervisorMapping_lead_id_user_id_key" ON "public"."LeadSiteSupervisorMapping"("lead_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentInfo_lead_id_payment_type_id_key" ON "public"."PaymentInfo"("lead_id", "payment_type_id");
