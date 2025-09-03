-- DropForeignKey
ALTER TABLE "public"."PaymentInfo" DROP CONSTRAINT "PaymentInfo_payment_file_id_fkey";

-- CreateTable
CREATE TABLE "public"."LeadStatusLogs" (
    "id" SERIAL NOT NULL,
    "lead_id" INTEGER NOT NULL,
    "account_id" INTEGER NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "status_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" INTEGER NOT NULL,

    CONSTRAINT "LeadStatusLogs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."LeadDesignMeeting" (
    "id" SERIAL NOT NULL,
    "lead_id" INTEGER NOT NULL,
    "account_id" INTEGER NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "desc" VARCHAR(2000) NOT NULL,
    "doc_id" INTEGER,
    "created_by" INTEGER NOT NULL,
    "updated_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeadDesignMeeting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."LeadDesignSelection" (
    "id" SERIAL NOT NULL,
    "lead_id" INTEGER NOT NULL,
    "account_id" INTEGER NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "type" VARCHAR(1000) NOT NULL,
    "desc" VARCHAR(2000) NOT NULL,
    "created_by" INTEGER NOT NULL,
    "updated_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeadDesignSelection_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."PaymentInfo" ADD CONSTRAINT "PaymentInfo_payment_file_id_fkey" FOREIGN KEY ("payment_file_id") REFERENCES "public"."LeadDocuments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LeadStatusLogs" ADD CONSTRAINT "LeadStatusLogs_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "public"."VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LeadStatusLogs" ADD CONSTRAINT "LeadStatusLogs_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."LeadMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LeadStatusLogs" ADD CONSTRAINT "LeadStatusLogs_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."AccountMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LeadStatusLogs" ADD CONSTRAINT "LeadStatusLogs_status_id_fkey" FOREIGN KEY ("status_id") REFERENCES "public"."StatusTypeMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LeadStatusLogs" ADD CONSTRAINT "LeadStatusLogs_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."UserMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LeadDesignMeeting" ADD CONSTRAINT "LeadDesignMeeting_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "public"."VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LeadDesignMeeting" ADD CONSTRAINT "LeadDesignMeeting_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."LeadMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LeadDesignMeeting" ADD CONSTRAINT "LeadDesignMeeting_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."AccountMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LeadDesignMeeting" ADD CONSTRAINT "LeadDesignMeeting_doc_id_fkey" FOREIGN KEY ("doc_id") REFERENCES "public"."LeadDocuments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LeadDesignMeeting" ADD CONSTRAINT "LeadDesignMeeting_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."UserMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LeadDesignMeeting" ADD CONSTRAINT "LeadDesignMeeting_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."UserMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LeadDesignSelection" ADD CONSTRAINT "LeadDesignSelection_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "public"."VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LeadDesignSelection" ADD CONSTRAINT "LeadDesignSelection_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."LeadMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LeadDesignSelection" ADD CONSTRAINT "LeadDesignSelection_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."AccountMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LeadDesignSelection" ADD CONSTRAINT "LeadDesignSelection_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."UserMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LeadDesignSelection" ADD CONSTRAINT "LeadDesignSelection_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."UserMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;
