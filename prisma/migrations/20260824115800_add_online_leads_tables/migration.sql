-- CreateEnum
CREATE TYPE "LeadCallType" AS ENUM ('OUTGOING', 'INCOMING');

-- CreateEnum
CREATE TYPE "LeadEntryType" AS ENUM ('ONLINE', 'WALK_IN');

-- CreateEnum
CREATE TYPE "LeadStoreActionType" AS ENUM ('PREFERENCE', 'ASSIGNED', 'TRANSFERRED');

-- AlterTable
ALTER TABLE "VendorMaster" ADD COLUMN "is_online_lead_feature_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "is_scanpack_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "push_lead_to_cadbid" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "online_lead_call_log" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "online_lead_id" INTEGER NOT NULL,
    "telecaller_id" INTEGER NOT NULL,
    "call_type" "LeadCallType" NOT NULL DEFAULT 'OUTGOING',
    "online_lead_status_id" INTEGER,
    "started_at" TIMESTAMP(3),
    "ended_at" TIMESTAMP(3),
    "duration_seconds" INTEGER,
    "remark" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "online_lead_call_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "online_lead_followup_status" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "status_name" TEXT NOT NULL,
    "followup_required" BOOLEAN NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" INTEGER,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" INTEGER,

    CONSTRAINT "online_lead_followup_status_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "online_lead_history" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "online_lead_id" INTEGER NOT NULL,
    "remark" TEXT,
    "created_by" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "follow_up_date" TIMESTAMP(3),
    "store_id" INTEGER,
    "store_preference_option" TEXT,
    "online_lead_status_id" INTEGER NOT NULL,

    CONSTRAINT "online_lead_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "online_lead_store_log" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "online_lead_id" INTEGER NOT NULL,
    "from_store_id" INTEGER,
    "to_store_id" INTEGER NOT NULL,
    "action_type" "LeadStoreActionType" NOT NULL,
    "selected_by" INTEGER NOT NULL,
    "assigned_to" INTEGER,
    "remark" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "online_lead_store_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "online_leads" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "leads_name" TEXT NOT NULL,
    "lead_code" TEXT,
    "email" TEXT,
    "contact" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "lead_entry_type" "LeadEntryType" NOT NULL DEFAULT 'ONLINE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" INTEGER,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" INTEGER,
    "assign_to" INTEGER,
    "status" INTEGER,
    "remark" TEXT,
    "follow_up_date" TIMESTAMP(3),
    "store_id" INTEGER,
    "final_assigned_leads" INTEGER,
    "firstname" TEXT,
    "lastname" TEXT,
    "alt_contact_no" TEXT,
    "site_address" TEXT,
    "site_type_id" INTEGER,
    "source_id" INTEGER,
    "refered_by" TEXT,
    "archetech_name" TEXT,
    "archetech_number" TEXT,
    "priority" TEXT,
    "product_types" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "product_structures" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "online_leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "telecaller_campaign_leads" (
    "id" SERIAL NOT NULL,
    "campaign_name" TEXT NOT NULL,
    "online_lead_id" INTEGER NOT NULL,

    CONSTRAINT "telecaller_campaign_leads_pkey" PRIMARY KEY ("id")
);

-- CreateUniqueIndex
CREATE UNIQUE INDEX "online_leads_vendor_id_contact_key" ON "online_leads"("vendor_id", "contact");

-- AddForeignKey
ALTER TABLE "online_lead_call_log" ADD CONSTRAINT "online_lead_call_log_online_lead_id_fkey" FOREIGN KEY ("online_lead_id") REFERENCES "online_leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "online_lead_call_log" ADD CONSTRAINT "online_lead_call_log_online_lead_status_id_fkey" FOREIGN KEY ("online_lead_status_id") REFERENCES "online_lead_followup_status"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "online_lead_call_log" ADD CONSTRAINT "online_lead_call_log_telecaller_id_fkey" FOREIGN KEY ("telecaller_id") REFERENCES "UserMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "online_lead_call_log" ADD CONSTRAINT "online_lead_call_log_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "online_lead_followup_status" ADD CONSTRAINT "online_lead_followup_status_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "UserMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "online_lead_followup_status" ADD CONSTRAINT "online_lead_followup_status_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "UserMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "online_lead_followup_status" ADD CONSTRAINT "online_lead_followup_status_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "online_lead_history" ADD CONSTRAINT "online_lead_history_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "UserMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "online_lead_history" ADD CONSTRAINT "online_lead_history_online_lead_id_fkey" FOREIGN KEY ("online_lead_id") REFERENCES "online_leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "online_lead_history" ADD CONSTRAINT "online_lead_history_online_lead_status_id_fkey" FOREIGN KEY ("online_lead_status_id") REFERENCES "online_lead_followup_status"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "online_lead_history" ADD CONSTRAINT "online_lead_history_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "FranchiseMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "online_lead_history" ADD CONSTRAINT "online_lead_history_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "online_lead_store_log" ADD CONSTRAINT "online_lead_store_log_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "UserMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "online_lead_store_log" ADD CONSTRAINT "online_lead_store_log_from_store_id_fkey" FOREIGN KEY ("from_store_id") REFERENCES "FranchiseMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "online_lead_store_log" ADD CONSTRAINT "online_lead_store_log_online_lead_id_fkey" FOREIGN KEY ("online_lead_id") REFERENCES "online_leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "online_lead_store_log" ADD CONSTRAINT "online_lead_store_log_selected_by_fkey" FOREIGN KEY ("selected_by") REFERENCES "UserMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "online_lead_store_log" ADD CONSTRAINT "online_lead_store_log_to_store_id_fkey" FOREIGN KEY ("to_store_id") REFERENCES "FranchiseMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "online_lead_store_log" ADD CONSTRAINT "online_lead_store_log_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "online_leads" ADD CONSTRAINT "online_leads_assign_to_fkey" FOREIGN KEY ("assign_to") REFERENCES "UserMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "online_leads" ADD CONSTRAINT "online_leads_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "UserMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "online_leads" ADD CONSTRAINT "online_leads_final_assigned_leads_fkey" FOREIGN KEY ("final_assigned_leads") REFERENCES "UserMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "online_leads" ADD CONSTRAINT "online_leads_status_fkey" FOREIGN KEY ("status") REFERENCES "online_lead_followup_status"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "online_leads" ADD CONSTRAINT "online_leads_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "FranchiseMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "online_leads" ADD CONSTRAINT "online_leads_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "SourceMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "online_leads" ADD CONSTRAINT "online_leads_site_type_id_fkey" FOREIGN KEY ("site_type_id") REFERENCES "SiteTypeMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "online_leads" ADD CONSTRAINT "online_leads_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "UserMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "online_leads" ADD CONSTRAINT "online_leads_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "telecaller_campaign_leads" ADD CONSTRAINT "telecaller_campaign_leads_online_lead_id_fkey" FOREIGN KEY ("online_lead_id") REFERENCES "online_leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
