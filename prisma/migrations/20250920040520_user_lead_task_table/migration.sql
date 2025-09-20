-- CreateEnum
CREATE TYPE "public"."LeadTaskStatus" AS ENUM ('open', 'closed', 'in_progress');

-- CreateTable
CREATE TABLE "public"."UserLeadTask" (
    "id" SERIAL NOT NULL,
    "lead_id" INTEGER NOT NULL,
    "account_id" INTEGER NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "task_type" TEXT NOT NULL,
    "due_date" TIMESTAMP(3) NOT NULL,
    "remark" VARCHAR(2000),
    "status" "public"."LeadTaskStatus" NOT NULL DEFAULT 'open',
    "closed_by" INTEGER,
    "closed_at" TIMESTAMP(3),
    "created_by" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserLeadTask_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."UserLeadTask" ADD CONSTRAINT "UserLeadTask_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."LeadMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."UserLeadTask" ADD CONSTRAINT "UserLeadTask_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."AccountMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."UserLeadTask" ADD CONSTRAINT "UserLeadTask_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "public"."VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."UserLeadTask" ADD CONSTRAINT "UserLeadTask_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."UserMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."UserLeadTask" ADD CONSTRAINT "UserLeadTask_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."UserMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."UserLeadTask" ADD CONSTRAINT "UserLeadTask_closed_by_fkey" FOREIGN KEY ("closed_by") REFERENCES "public"."UserMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;
