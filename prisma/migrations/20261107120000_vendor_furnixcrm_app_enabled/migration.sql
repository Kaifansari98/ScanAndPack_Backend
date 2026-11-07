-- Only vendors with this flag enabled can sign in to the FurnixCRM mobile app.
ALTER TABLE "VendorMaster" ADD COLUMN IF NOT EXISTS "is_furnixcrm_app_enabled" BOOLEAN NOT NULL DEFAULT false;
