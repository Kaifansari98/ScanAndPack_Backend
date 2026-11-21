-- Store cities offered when registering a complaint, per vendor.
CREATE TABLE IF NOT EXISTS "StoreCityMaster" (
  "id" SERIAL NOT NULL,
  "vendor_id" INTEGER NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StoreCityMaster_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StoreCityMaster_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "StoreCityMaster_vendor_id_name_key" ON "StoreCityMaster"("vendor_id", "name");
CREATE INDEX IF NOT EXISTS "StoreCityMaster_vendor_id_is_active_sort_order_idx" ON "StoreCityMaster"("vendor_id", "is_active", "sort_order");

-- Starting list for every vendor using client complaints.
INSERT INTO "StoreCityMaster" ("vendor_id", "name", "sort_order")
SELECT v."id", c."name", c."sort_order"
FROM "VendorMaster" v
CROSS JOIN (VALUES
  ('Chinchwad, Pune', 1),
  ('Baner, Pune', 2),
  ('Mukundnagar, Pune', 3),
  ('Nashik', 4),
  ('Jalgaon', 5),
  ('Chhatrapati Sambhaji Nagar', 6),
  ('Nanded', 7),
  ('Latur', 8),
  ('Kolhapur', 9),
  ('Pandharpur', 10),
  ('Solapur', 11),
  ('Belgaum', 12),
  ('Hubli', 13),
  ('Vijaypura', 14),
  ('Bhopal', 15),
  ('Raipur', 16)
) AS c("name", "sort_order")
WHERE v."is_client_complaints_enabled" = true
ON CONFLICT ("vendor_id", "name") DO NOTHING;

-- Miscellaneous type chosen in the inspection when material is required.
ALTER TABLE "ComplaintInspectionReport" ADD COLUMN IF NOT EXISTS "misc_type_id" INTEGER;
