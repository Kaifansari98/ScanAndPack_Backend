-- Seed data for LightCarcasTypeMaster and LightCarcasUnitMaster
-- (Others tab -> Lights form).
--
-- Targets vendor_id = 1.
-- Wall Unit, Loft Unit, Roll Unit and Open Unit each get their own copy of
-- the 12 "Wall/Loft/Roll/Open Unit Selected" positions, since each unit
-- belongs to exactly one carcas type via light_carcas_type_id. Base unit
-- gets its own 2 positions, Tall Unit gets its own 9 positions.

-- ── Carcas Types (6 parents) ─────────────────────────────────────────────────
INSERT INTO "LightCarcasTypeMaster" (vendor_id, type)
SELECT 1, t.type_name
FROM (VALUES
    ('Base unit'),
    ('Wall Unit'),
    ('Tall Unit'),
    ('Loft Unit'),
    ('Roll Unit'),
    ('Open Unit')
) AS t(type_name);

-- ── Units for Base unit (2 rows) ─────────────────────────────────────────────
INSERT INTO "LightCarcasUnitMaster" (vendor_id, type, light_carcas_type_id)
SELECT 1, u.unit_name, lct.id
FROM (VALUES
    ('Base unit', 'At Skirting Level'),
    ('Base unit', 'At below counter')
) AS u(type_name, unit_name)
JOIN "LightCarcasTypeMaster" lct
  ON lct.type = u.type_name
 AND lct.vendor_id = 1;

-- ── Units for Wall / Loft / Roll / Open Unit (12 rows each = 48 rows) ────────
INSERT INTO "LightCarcasUnitMaster" (vendor_id, type, light_carcas_type_id)
SELECT 1, u.unit_name, lct.id
FROM (VALUES
    ('Wall Unit', 'On Bottom at Center'),
    ('Wall Unit', 'On Bottom at 75 mm from Front'),
    ('Wall Unit', 'On Bottom at 75 mm from Back'),
    ('Wall Unit', 'On Top at Center'),
    ('Wall Unit', 'On Top at 75 mm from Front'),
    ('Wall Unit', 'On Top at 75 mm from Back'),
    ('Wall Unit', 'On Left Side at Center'),
    ('Wall Unit', 'On Left Side at 75 mm from Front'),
    ('Wall Unit', 'On Left Side at 75 mm from Back'),
    ('Wall Unit', 'On Right Side at Center'),
    ('Wall Unit', 'On Right Side at 75 mm from Front'),
    ('Wall Unit', 'On Right Side at 75 mm from Back'),

    ('Loft Unit', 'On Bottom at Center'),
    ('Loft Unit', 'On Bottom at 75 mm from Front'),
    ('Loft Unit', 'On Bottom at 75 mm from Back'),
    ('Loft Unit', 'On Top at Center'),
    ('Loft Unit', 'On Top at 75 mm from Front'),
    ('Loft Unit', 'On Top at 75 mm from Back'),
    ('Loft Unit', 'On Left Side at Center'),
    ('Loft Unit', 'On Left Side at 75 mm from Front'),
    ('Loft Unit', 'On Left Side at 75 mm from Back'),
    ('Loft Unit', 'On Right Side at Center'),
    ('Loft Unit', 'On Right Side at 75 mm from Front'),
    ('Loft Unit', 'On Right Side at 75 mm from Back'),

    ('Roll Unit', 'On Bottom at Center'),
    ('Roll Unit', 'On Bottom at 75 mm from Front'),
    ('Roll Unit', 'On Bottom at 75 mm from Back'),
    ('Roll Unit', 'On Top at Center'),
    ('Roll Unit', 'On Top at 75 mm from Front'),
    ('Roll Unit', 'On Top at 75 mm from Back'),
    ('Roll Unit', 'On Left Side at Center'),
    ('Roll Unit', 'On Left Side at 75 mm from Front'),
    ('Roll Unit', 'On Left Side at 75 mm from Back'),
    ('Roll Unit', 'On Right Side at Center'),
    ('Roll Unit', 'On Right Side at 75 mm from Front'),
    ('Roll Unit', 'On Right Side at 75 mm from Back'),

    ('Open Unit', 'On Bottom at Center'),
    ('Open Unit', 'On Bottom at 75 mm from Front'),
    ('Open Unit', 'On Bottom at 75 mm from Back'),
    ('Open Unit', 'On Top at Center'),
    ('Open Unit', 'On Top at 75 mm from Front'),
    ('Open Unit', 'On Top at 75 mm from Back'),
    ('Open Unit', 'On Left Side at Center'),
    ('Open Unit', 'On Left Side at 75 mm from Front'),
    ('Open Unit', 'On Left Side at 75 mm from Back'),
    ('Open Unit', 'On Right Side at Center'),
    ('Open Unit', 'On Right Side at 75 mm from Front'),
    ('Open Unit', 'On Right Side at 75 mm from Back')
) AS u(type_name, unit_name)
JOIN "LightCarcasTypeMaster" lct
  ON lct.type = u.type_name
 AND lct.vendor_id = 1;

-- ── Units for Tall Unit (9 rows) ─────────────────────────────────────────────
INSERT INTO "LightCarcasUnitMaster" (vendor_id, type, light_carcas_type_id)
SELECT 1, u.unit_name, lct.id
FROM (VALUES
    ('Tall Unit', 'On Top at Center'),
    ('Tall Unit', 'On Top at 75 mm from Front'),
    ('Tall Unit', 'On Top at 75 mm from Back'),
    ('Tall Unit', 'On Left Side at Center'),
    ('Tall Unit', 'On Left Side at 75 mm from Front'),
    ('Tall Unit', 'On Left Side at 75 mm from Back'),
    ('Tall Unit', 'On Right Side at Center'),
    ('Tall Unit', 'On Right Side at 75 mm from Front'),
    ('Tall Unit', 'On Right Side at 75 mm from Back')
) AS u(type_name, unit_name)
JOIN "LightCarcasTypeMaster" lct
  ON lct.type = u.type_name
 AND lct.vendor_id = 1;
