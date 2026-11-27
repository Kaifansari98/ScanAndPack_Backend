-- Standard units for inventory (Masters Management → Inventory Masters →
-- Unit Conversions): per-vendor unit classes, units with one base unit per
-- class, and unit relations within a class (1 Mtr = 100 CM).
CREATE TABLE IF NOT EXISTS "StandardUnitClass" (
  "id" SERIAL PRIMARY KEY,
  "vendor_id" INTEGER NOT NULL REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "name" VARCHAR(100) NOT NULL,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_by" INTEGER,
  "updated_by" INTEGER,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "StandardUnitClass_vendor_id_name_key" ON "StandardUnitClass"("vendor_id", "name");
CREATE INDEX IF NOT EXISTS "StandardUnitClass_vendor_id_idx" ON "StandardUnitClass"("vendor_id");

CREATE TABLE IF NOT EXISTS "StandardUnit" (
  "id" SERIAL PRIMARY KEY,
  "vendor_id" INTEGER NOT NULL REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "unit_class_id" INTEGER NOT NULL REFERENCES "StandardUnitClass"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "name" VARCHAR(50) NOT NULL,
  "is_base" BOOLEAN NOT NULL DEFAULT false,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_by" INTEGER,
  "updated_by" INTEGER,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "StandardUnit_vendor_id_name_key" ON "StandardUnit"("vendor_id", "name");
CREATE INDEX IF NOT EXISTS "StandardUnit_vendor_id_unit_class_id_idx" ON "StandardUnit"("vendor_id", "unit_class_id");
-- At most one base unit per class.
CREATE UNIQUE INDEX IF NOT EXISTS "StandardUnit_one_base_per_class_idx" ON "StandardUnit"("unit_class_id") WHERE "is_base";

CREATE TABLE IF NOT EXISTS "StandardUnitRelation" (
  "id" SERIAL PRIMARY KEY,
  "vendor_id" INTEGER NOT NULL REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "unit_class_id" INTEGER NOT NULL REFERENCES "StandardUnitClass"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "from_unit_id" INTEGER NOT NULL REFERENCES "StandardUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "from_qty" DECIMAL(20,6) NOT NULL DEFAULT 1,
  "to_unit_id" INTEGER NOT NULL REFERENCES "StandardUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "to_qty" DECIMAL(24,6) NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_by" INTEGER,
  "updated_by" INTEGER,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StandardUnitRelation_values_check" CHECK ("from_qty" > 0 AND "to_qty" > 0 AND "from_unit_id" <> "to_unit_id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "StandardUnitRelation_vendor_id_from_unit_id_to_unit_id_key" ON "StandardUnitRelation"("vendor_id", "from_unit_id", "to_unit_id");
CREATE INDEX IF NOT EXISTS "StandardUnitRelation_vendor_id_unit_class_id_idx" ON "StandardUnitRelation"("vendor_id", "unit_class_id");

-- Default unit classes, units (one base unit per class) and unit relations,
-- for every vendor. Safe to re-run: existing rows are left as they are.
INSERT INTO "StandardUnitClass" ("vendor_id", "name", "sort_order", "updated_at")
SELECT v."id", c."name", c."sort", CURRENT_TIMESTAMP
FROM "VendorMaster" v
CROSS JOIN (VALUES
  ('Length', 1), ('Area', 2), ('Volume', 3), ('Weight', 4), ('Quantity', 5), ('Packing', 6)
) AS c("name", "sort")
ON CONFLICT ("vendor_id", "name") DO NOTHING;

INSERT INTO "StandardUnit" ("vendor_id", "unit_class_id", "name", "is_base", "sort_order", "updated_at")
SELECT v."id", uc."id", u."name", u."is_base", u."sort", CURRENT_TIMESTAMP
FROM "VendorMaster" v
CROSS JOIN (VALUES
  ('Length',   'Mtr',    true,  1), ('Length', 'CM',     false, 2), ('Length', 'mm',    false, 3),
  ('Length',   'Ft',     false, 4), ('Length', 'Inch',   false, 5),
  ('Area',     'Sq.M',   true,  1), ('Area',   'Sq.cm',  false, 2), ('Area',   'Sq.mm', false, 3),
  ('Area',     'Sq.Ft',  false, 4), ('Area',   'Sq.In',  false, 5),
  ('Volume',   'Cu.M',   true,  1), ('Volume', 'cc',     false, 2), ('Volume', 'Ltr',   false, 3),
  ('Volume',   'CFT',    false, 4),
  ('Weight',   'MTon',   true,  1), ('Weight', 'Kg',     false, 2), ('Weight', 'Gram',  false, 3),
  ('Quantity', 'Nos',    true,  1), ('Quantity', 'Pair', false, 2),
  ('Packing',  'Set',    true,  1), ('Packing', 'Pack',  false, 2)
) AS u("class", "name", "is_base", "sort")
JOIN "StandardUnitClass" uc ON uc."vendor_id" = v."id" AND uc."name" = u."class"
ON CONFLICT ("vendor_id", "name") DO NOTHING;

INSERT INTO "StandardUnitRelation" ("vendor_id", "unit_class_id", "from_unit_id", "from_qty", "to_unit_id", "to_qty", "updated_at")
SELECT v."id", fu."unit_class_id", fu."id", 1, tu."id", r."qty", CURRENT_TIMESTAMP
FROM "VendorMaster" v
CROSS JOIN (VALUES
  ('Mtr',  100::numeric,   'CM'),
  ('Mtr',  1000,           'mm'),
  ('Mtr',  3.28084,        'Ft'),
  ('Mtr',  39.3701,        'Inch'),
  ('Sq.M', 10000,          'Sq.cm'),
  ('Sq.M', 1000000,        'Sq.mm'),
  ('Sq.M', 10.764,         'Sq.Ft'),
  ('Sq.M', 1550.003,       'Sq.In'),
  ('Cu.M', 35.315,         'CFT'),
  ('Cu.M', 1000000,        'cc'),
  ('Cu.M', 1000,           'Ltr'),
  ('MTon', 1000,           'Kg'),
  ('MTon', 1000000,        'Gram'),
  ('Pair', 2,              'Nos')
) AS r("from_unit", "qty", "to_unit")
JOIN "StandardUnit" fu ON fu."vendor_id" = v."id" AND fu."name" = r."from_unit"
JOIN "StandardUnit" tu ON tu."vendor_id" = v."id" AND tu."name" = r."to_unit" AND tu."unit_class_id" = fu."unit_class_id"
ON CONFLICT ("vendor_id", "from_unit_id", "to_unit_id") DO NOTHING;
