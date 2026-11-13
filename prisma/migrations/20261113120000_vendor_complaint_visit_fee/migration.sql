-- Visiting charge raised on each chargeable complaint site visit, set per vendor.
-- Each visit and charge keeps the fee in force when it was created.
ALTER TABLE "VendorMaster" ADD COLUMN IF NOT EXISTS "complaint_visit_fee" DECIMAL(12,2) NOT NULL DEFAULT 800;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'VendorMaster_complaint_visit_fee_check') THEN
    ALTER TABLE "VendorMaster" ADD CONSTRAINT "VendorMaster_complaint_visit_fee_check" CHECK ("complaint_visit_fee" >= 0);
  END IF;
END $$;
