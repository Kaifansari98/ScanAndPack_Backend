-- Franchises are tagged to one of the vendor's store cities (StoreCityMaster).
-- Safe to re-run.
ALTER TABLE "FranchiseMaster" ADD COLUMN IF NOT EXISTS "store_city_id" INTEGER;

CREATE INDEX IF NOT EXISTS "FranchiseMaster_store_city_id_idx" ON "FranchiseMaster"("store_city_id");

DO $$ BEGIN
  ALTER TABLE "FranchiseMaster"
    ADD CONSTRAINT "FranchiseMaster_store_city_id_fkey"
    FOREIGN KEY ("store_city_id") REFERENCES "StoreCityMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
