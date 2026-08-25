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
