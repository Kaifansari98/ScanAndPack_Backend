-- CreateTable
CREATE TABLE "public"."LeadDesignMeetingDocumentsMapping" (
    "id" SERIAL NOT NULL,
    "lead_id" INTEGER NOT NULL,
    "account_id" INTEGER NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "meeting_id" INTEGER NOT NULL,
    "document_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" INTEGER NOT NULL,

    CONSTRAINT "LeadDesignMeetingDocumentsMapping_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."LeadDesignMeetingDocumentsMapping" ADD CONSTRAINT "LeadDesignMeetingDocumentsMapping_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "public"."VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LeadDesignMeetingDocumentsMapping" ADD CONSTRAINT "LeadDesignMeetingDocumentsMapping_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."LeadMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LeadDesignMeetingDocumentsMapping" ADD CONSTRAINT "LeadDesignMeetingDocumentsMapping_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."AccountMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LeadDesignMeetingDocumentsMapping" ADD CONSTRAINT "LeadDesignMeetingDocumentsMapping_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."UserMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LeadDesignMeetingDocumentsMapping" ADD CONSTRAINT "LeadDesignMeetingDocumentsMapping_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "public"."LeadDesignMeeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;
