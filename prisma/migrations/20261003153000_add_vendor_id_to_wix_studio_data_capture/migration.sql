-- AlterTable
ALTER TABLE "wix_studio_data_capture" ADD COLUMN IF NOT EXISTS "vendor_id" INTEGER;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "wix_studio_data_capture_vendor_id_idx" ON "wix_studio_data_capture"("vendor_id");
