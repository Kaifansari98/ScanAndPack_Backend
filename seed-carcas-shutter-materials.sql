-- Seed data for CarcasMaterialMaster, CarcassMaterialFinishMaster,
-- ShutterMaterialMaster, ShutterMaterialFinishMaster.
--
-- Targets vendor_id = 1.

-- ── Carcas Materials (5 parents) ────────────────────────────────────────────
INSERT INTO "CarcasMaterialMaster" (name, vendor_id)
SELECT m.name, 1
FROM (VALUES
    ('SS304'),
    ('GI PC'),
    ('BWP PLY'),
    ('HDHMR'),
    ('MDF')
) AS m(name);

-- ── Carcass Material Finishes (10 children, distributed across the 5 above) ─
INSERT INTO "CarcassMaterialFinishMaster" (name, carcas_material_id)
SELECT f.finish_name, cm.id
FROM (VALUES
    ('SS304', 'Brush finish'),
    ('SS304', 'Mirror finish'),
    ('GI PC', 'Graphite Grey'),
    ('GI PC', 'AC Ivory'),
    ('GI PC', 'Broken White'),
    ('BWP PLY', 'Text Box / 36 Internal Laminates'),
    ('BWP PLY', 'Matte Laminate'),
    ('HDHMR', 'Text Box / 25 Colors'),
    ('HDHMR', 'Glossy Laminate'),
    ('MDF', 'PU Finish')
) AS f(material_name, finish_name)
JOIN "CarcasMaterialMaster" cm
  ON cm.name = f.material_name
 AND cm.vendor_id = 1;

-- ── Shutter Materials (5 parents) ───────────────────────────────────────────
INSERT INTO "ShutterMaterialMaster" (name, vendor_id)
SELECT m.name, 1
FROM (VALUES
    ('SS304'),
    ('GI PC'),
    ('BWP PLY'),
    ('HDHMR'),
    ('MDF')
) AS m(name);

-- ── Shutter Material Finishes (10 children, distributed across the 5 above) ─
INSERT INTO "ShutterMaterialFinishMaster" (name, shutter_material_id)
SELECT f.finish_name, sm.id
FROM (VALUES
    ('SS304', 'Brush finish'),
    ('SS304', 'Mirror finish'),
    ('GI PC', 'Graphite Grey'),
    ('GI PC', 'AC Ivory'),
    ('GI PC', 'Broken White'),
    ('BWP PLY', 'Text Box / 36 Internal Laminates'),
    ('BWP PLY', 'Matte Laminate'),
    ('HDHMR', 'Text Box / 25 Colors'),
    ('HDHMR', 'Glossy Laminate'),
    ('MDF', 'PU Finish')
) AS f(material_name, finish_name)
JOIN "ShutterMaterialMaster" sm
  ON sm.name = f.material_name
 AND sm.vendor_id = 1;
