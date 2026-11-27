-- Dummy inventory locations (Inventory Masters → Locations).
-- Run on a server: npx prisma db execute --file scripts/seed-inventory-locations.sql
--
-- Adds a sample tree Factory > Shed > Floor > Store > Rack > Shelf > Position to
-- every inventory-enabled vendor that has no locations yet. Safe to re-run:
-- vendors that already have locations are left alone.
-- To seed one vendor only, change the WHERE clause at the bottom to v."id" = <id>.

CREATE OR REPLACE FUNCTION pg_temp.seed_location_tree(p_vendor INT, p_parent INT, p_level INT, p_nodes JSONB)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
  node JSONB;
  i INT := 0;
  new_id INT;
BEGIN
  FOR node IN SELECT * FROM jsonb_array_elements(p_nodes) LOOP
    i := i + 1;
    INSERT INTO "InventoryLocation" ("vendor_id", "parent_id", "level", "name", "sort_order", "updated_at")
    VALUES (p_vendor, p_parent, p_level, node->>'n', i, CURRENT_TIMESTAMP)
    RETURNING "id" INTO new_id;
    IF node ? 'c' THEN
      PERFORM pg_temp.seed_location_tree(p_vendor, new_id, p_level + 1, node->'c');
    END IF;
  END LOOP;
END $$;

-- n = name / number, c = what's inside it.
DO $$
DECLARE
  tree JSONB := '[
    {"n": "1", "c": [
      {"n": "A", "c": [
        {"n": "G", "c": [
          {"n": "S1", "c": [
            {"n": "R1", "c": [
              {"n": "1", "c": [{"n": "P1"}, {"n": "P2"}, {"n": "P3"}]},
              {"n": "2", "c": [{"n": "P1"}, {"n": "P2"}]}
            ]},
            {"n": "R2", "c": [
              {"n": "1", "c": [{"n": "P1"}, {"n": "P2"}]}
            ]}
          ]},
          {"n": "S2", "c": [
            {"n": "R1", "c": [
              {"n": "1", "c": [{"n": "P1"}]}
            ]}
          ]}
        ]},
        {"n": "1", "c": [
          {"n": "S3", "c": [
            {"n": "R1", "c": [
              {"n": "1", "c": [{"n": "P1"}, {"n": "P2"}]}
            ]}
          ]}
        ]}
      ]},
      {"n": "B", "c": [
        {"n": "G", "c": [
          {"n": "S1", "c": [
            {"n": "R1", "c": [
              {"n": "1", "c": [{"n": "P1"}]}
            ]}
          ]}
        ]}
      ]}
    ]},
    {"n": "2", "c": [
      {"n": "A", "c": [
        {"n": "G", "c": [
          {"n": "S1", "c": [
            {"n": "R1", "c": [
              {"n": "1", "c": [{"n": "P1"}, {"n": "P2"}]}
            ]}
          ]}
        ]}
      ]}
    ]}
  ]';
  v RECORD;
BEGIN
  FOR v IN
    SELECT "id" FROM "VendorMaster" vm
    WHERE vm."is_inventory_enabled" = true
      AND NOT EXISTS (SELECT 1 FROM "InventoryLocation" l WHERE l."vendor_id" = vm."id")
  LOOP
    PERFORM pg_temp.seed_location_tree(v."id", NULL, 1, tree);
  END LOOP;
END $$;
