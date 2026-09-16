-- CreateTable
CREATE TABLE IF NOT EXISTS "ProcessBriefMaster" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" INTEGER NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" INTEGER,

    CONSTRAINT "ProcessBriefMaster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "LeadProcessBriefMapping" (
    "id" SERIAL NOT NULL,
    "lead_id" INTEGER NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "process_brief_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" INTEGER NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" INTEGER,
    "b2b_requirement_type_id" INTEGER NOT NULL,

    CONSTRAINT "LeadProcessBriefMapping_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ProcessBriefMaster_vendor_id_idx" ON "ProcessBriefMaster"("vendor_id");
CREATE INDEX IF NOT EXISTS "ProcessBriefMaster_created_by_idx" ON "ProcessBriefMaster"("created_by");
CREATE INDEX IF NOT EXISTS "LeadProcessBriefMapping_lead_id_idx" ON "LeadProcessBriefMapping"("lead_id");
CREATE INDEX IF NOT EXISTS "LeadProcessBriefMapping_vendor_id_idx" ON "LeadProcessBriefMapping"("vendor_id");
CREATE INDEX IF NOT EXISTS "LeadProcessBriefMapping_b2b_requirement_type_id_idx" ON "LeadProcessBriefMapping"("b2b_requirement_type_id");
CREATE INDEX IF NOT EXISTS "LeadProcessBriefMapping_process_brief_id_idx" ON "LeadProcessBriefMapping"("process_brief_id");

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProcessBriefMaster_created_by_fkey') THEN
        ALTER TABLE "ProcessBriefMaster" ADD CONSTRAINT "ProcessBriefMaster_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "UserMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProcessBriefMaster_updated_by_fkey') THEN
        ALTER TABLE "ProcessBriefMaster" ADD CONSTRAINT "ProcessBriefMaster_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "UserMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProcessBriefMaster_vendor_id_fkey') THEN
        ALTER TABLE "ProcessBriefMaster" ADD CONSTRAINT "ProcessBriefMaster_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LeadProcessBriefMapping_b2b_requirement_type_id_fkey') THEN
        ALTER TABLE "LeadProcessBriefMapping" ADD CONSTRAINT "LeadProcessBriefMapping_b2b_requirement_type_id_fkey" FOREIGN KEY ("b2b_requirement_type_id") REFERENCES "B2BRequirementTypeMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LeadProcessBriefMapping_created_by_fkey') THEN
        ALTER TABLE "LeadProcessBriefMapping" ADD CONSTRAINT "LeadProcessBriefMapping_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "UserMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LeadProcessBriefMapping_lead_id_fkey') THEN
        ALTER TABLE "LeadProcessBriefMapping" ADD CONSTRAINT "LeadProcessBriefMapping_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "LeadMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LeadProcessBriefMapping_process_brief_id_fkey') THEN
        ALTER TABLE "LeadProcessBriefMapping" ADD CONSTRAINT "LeadProcessBriefMapping_process_brief_id_fkey" FOREIGN KEY ("process_brief_id") REFERENCES "ProcessBriefMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LeadProcessBriefMapping_updated_by_fkey') THEN
        ALTER TABLE "LeadProcessBriefMapping" ADD CONSTRAINT "LeadProcessBriefMapping_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "UserMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LeadProcessBriefMapping_vendor_id_fkey') THEN
        ALTER TABLE "LeadProcessBriefMapping" ADD CONSTRAINT "LeadProcessBriefMapping_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

ALTER TABLE public."LeadProductMapping"
ADD COLUMN IF NOT EXISTS "is_archived" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public."LeadProcessBriefMapping"
ADD COLUMN IF NOT EXISTS "is_archived" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public."LeadRequirementMaterialMapping"
ADD COLUMN IF NOT EXISTS "is_archived" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public."LeadDocuments"
ADD COLUMN IF NOT EXISTS "is_archived" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public."LeadProductStructureInstance"
ADD COLUMN IF NOT EXISTS "is_archived" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public."PaymentInfo"
ADD COLUMN IF NOT EXISTS "is_archived" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public."Ledger"
ADD COLUMN IF NOT EXISTS "is_archived" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public."LeadDetailedLogs"
ADD COLUMN IF NOT EXISTS "is_archived" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public."lead_billing_addresses"
ADD COLUMN IF NOT EXISTS "is_archived" BOOLEAN NOT NULL DEFAULT false;
