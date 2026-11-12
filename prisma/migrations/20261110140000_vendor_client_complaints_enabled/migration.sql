-- Only vendors with this flag enabled see the Client Complaints module in the CRM.
ALTER TABLE "VendorMaster" ADD COLUMN IF NOT EXISTS "is_client_complaints_enabled" BOOLEAN NOT NULL DEFAULT false;
