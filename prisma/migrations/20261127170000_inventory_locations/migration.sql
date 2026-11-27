-- Inventory locations (Masters Management → Inventory Masters → Locations):
-- Factory > Shed > Floor > Store > Rack > Shelf > Position, and the product's location.
CREATE TABLE IF NOT EXISTS "InventoryLocation" (
  "id" SERIAL PRIMARY KEY,
  "vendor_id" INTEGER NOT NULL REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "parent_id" INTEGER REFERENCES "InventoryLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "level" INTEGER NOT NULL,
  "name" VARCHAR(50) NOT NULL,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_by" INTEGER,
  "updated_by" INTEGER,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL
);
CREATE INDEX IF NOT EXISTS "InventoryLocation_vendor_id_idx" ON "InventoryLocation"("vendor_id");
CREATE INDEX IF NOT EXISTS "InventoryLocation_parent_id_idx" ON "InventoryLocation"("parent_id");

ALTER TABLE "ProductMaster" ADD COLUMN IF NOT EXISTS "location_id" INTEGER;
DO $$ BEGIN
  ALTER TABLE "ProductMaster" ADD CONSTRAINT "ProductMaster_location_id_fkey"
    FOREIGN KEY ("location_id") REFERENCES "InventoryLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS "ProductMaster_location_id_idx" ON "ProductMaster"("location_id");
