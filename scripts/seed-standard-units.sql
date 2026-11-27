-- Run on a server: npx prisma db execute --file scripts/seed-standard-units.sql

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
