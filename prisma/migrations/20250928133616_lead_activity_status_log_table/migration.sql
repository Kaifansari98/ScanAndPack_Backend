-- CreateTable
CREATE TABLE "public"."LeadActivityStatusLog" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "account_id" INTEGER NOT NULL,
    "lead_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "activity_status" "public"."ActivityStatus" NOT NULL,
    "activity_status_remark" VARCHAR(2000),
    "created_by" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadActivityStatusLog_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."LeadActivityStatusLog" ADD CONSTRAINT "LeadActivityStatusLog_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "public"."VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LeadActivityStatusLog" ADD CONSTRAINT "LeadActivityStatusLog_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."AccountMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LeadActivityStatusLog" ADD CONSTRAINT "LeadActivityStatusLog_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."LeadMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LeadActivityStatusLog" ADD CONSTRAINT "LeadActivityStatusLog_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."UserMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;
