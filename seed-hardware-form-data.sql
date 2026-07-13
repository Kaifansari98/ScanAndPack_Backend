-- Seed data for CarcassLegsMaster, SkirtingCarcassLegsMaster,
-- SkirtingCarcassLegsColorMaster (Hardware Form).
--
-- Targets vendor_id = 1.
-- Colors are only seeded for PVC Skirting at 80 MM and 100 MM, matching the
-- spec sheet (75 MM PVC Skirting has no colors listed; Stone/Civil skirting
-- are out of scope and have no colors either).

-- ── Carcass Legs (3 parents) ─────────────────────────────────────────────────
INSERT INTO "CarcassLegsMaster" (name, vendor_id)
SELECT m.name, 1
FROM (VALUES
    ('75 MM'),
    ('80 MM'),
    ('100 MM')
) AS m(name);

-- ── Skirting options per Carcass Leg (9 rows) ────────────────────────────────
INSERT INTO "SkirtingCarcassLegsMaster" (name, carcass_legs_id, "inScope")
SELECT s.skirting_name, cl.id, s.in_scope
FROM (VALUES
    ('75 MM', 'PVC Skirting', true),
    ('75 MM', 'Stone skirting', false),
    ('75 MM', 'Civil Skirting', false),
    ('80 MM', 'PVC Skirting', true),
    ('80 MM', 'Stone skirting', false),
    ('80 MM', 'Civil Skirting / Raise Platform', false),
    ('100 MM', 'PVC Skirting', true),
    ('100 MM', 'Stone skirting', false),
    ('100 MM', 'Civil Skirting / Raise Platform', false)
) AS s(legs_name, skirting_name, in_scope)
JOIN "CarcassLegsMaster" cl
  ON cl.name = s.legs_name
 AND cl.vendor_id = 1;

-- ── Colors for PVC Skirting @ 80 MM and 100 MM (10 rows) ─────────────────────
INSERT INTO "SkirtingCarcassLegsColorMaster" (carcass_legs_id, skirting_carcass_legs_id, color)
SELECT cl.id, sk.id, c.color_name
FROM (VALUES
    ('80 MM', 'PVC Skirting', 'Graphite'),
    ('80 MM', 'PVC Skirting', 'Rosegold'),
    ('80 MM', 'PVC Skirting', 'Brushgold'),
    ('80 MM', 'PVC Skirting', 'Mirror'),
    ('80 MM', 'PVC Skirting', 'Grey'),
    ('100 MM', 'PVC Skirting', 'Graphite'),
    ('100 MM', 'PVC Skirting', 'Rosegold'),
    ('100 MM', 'PVC Skirting', 'Brushgold'),
    ('100 MM', 'PVC Skirting', 'Mirror'),
    ('100 MM', 'PVC Skirting', 'Grey')
) AS c(legs_name, skirting_name, color_name)
JOIN "CarcassLegsMaster" cl
  ON cl.name = c.legs_name
 AND cl.vendor_id = 1
JOIN "SkirtingCarcassLegsMaster" sk
  ON sk.name = c.skirting_name
 AND sk.carcass_legs_id = cl.id;
