-- Open this file in pgAdmin Query Tool on STAGING and run the whole script.
-- First deploy Prisma migration: 20261020090000_add_machine_fabrication.
-- Change target_vendor_code below if this is not Onkar's staging vendor code.
-- Existing machine records are preserved. Repeat runs skip existing codes.
-- All 69 machines are METALWORK / ACTIVE / IN. Targets and images remain unset.

BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL search_path = public;

CREATE TEMP TABLE metalwork_seed_context (
  vendor_id integer NOT NULL,
  actor_id integer NOT NULL
) ON COMMIT DROP;

DO $validate$
DECLARE
  target_vendor_code text := 'ONKAR'; -- EDIT ONLY THIS VALUE IF NEEDED
  selected_vendor_id integer;
  selected_actor_id integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'MachineMaster'
      AND column_name = 'fabrication' AND udt_name = 'FabricationType'
  ) THEN
    RAISE EXCEPTION 'Deploy Prisma migration 20261020090000_add_machine_fabrication before running this seed';
  END IF;

  IF (SELECT COUNT(*) FROM "VendorMaster" WHERE vendor_code = target_vendor_code) <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one vendor with code %, check target_vendor_code', target_vendor_code;
  END IF;
  SELECT id INTO STRICT selected_vendor_id FROM "VendorMaster" WHERE vendor_code = target_vendor_code;
  SELECT u.id INTO selected_actor_id
  FROM "UserMaster" u JOIN "UserTypeMaster" t ON t.id = u.user_type_id
  WHERE u.vendor_id = selected_vendor_id AND lower(u.status) = 'active'
    AND t.user_type IN ('admin', 'super-admin')
  ORDER BY u.id LIMIT 1;
  IF selected_actor_id IS NULL THEN
    RAISE EXCEPTION 'No active admin or super-admin found for vendor %', target_vendor_code;
  END IF;
  INSERT INTO metalwork_seed_context VALUES (selected_vendor_id, selected_actor_id);
END $validate$;

CREATE TEMP TABLE metalwork_seed_plan (
  sequence_no integer PRIMARY KEY,
  shop text NOT NULL,
  machine_name text NOT NULL,
  machine_code text UNIQUE NOT NULL,
  workstation_type text NOT NULL
) ON COMMIT DROP;

INSERT INTO metalwork_seed_plan VALUES
  (1, 'FABRICATION SHOP', 'Laser Tube Cutting', 'FAB_LASER_TUBE_CUTTING', 'Laser Cutting'),
  (2, 'FABRICATION SHOP', 'Tube Cutting', 'FAB_TUBE_CUTTING', 'Cutting Machines'),
  (3, 'FABRICATION SHOP', 'CNC TUBE BENDING', 'FAB_CNC_TUBE_BENDING', 'Tube Bending'),
  (4, 'FABRICATION SHOP', 'MANUAL TUBE BENDING', 'FAB_MANUAL_TUBE_BENDING', 'Tube Bending'),
  (5, 'FABRICATION SHOP', 'TUBE NOTCHING', 'FAB_TUBE_NOTCHING', 'Tube Notching'),
  (6, 'FABRICATION SHOP', 'LASER WELDING', 'FAB_LASER_WELDING', 'Laser Welding'),
  (7, 'FABRICATION SHOP', 'MIG Welding', 'FAB_MIG_WELDING', 'MIG Welding'),
  (8, 'FABRICATION SHOP', 'WELDING ROBOT 1', 'FAB_WELDING_ROBOT_1', 'Robotic Welding'),
  (9, 'FABRICATION SHOP', 'WELDING ROBOT 2', 'FAB_WELDING_ROBOT_2', 'Robotic Welding'),
  (10, 'FABRICATION SHOP', 'GRINDING', 'FAB_GRINDING', 'Grinding'),
  (11, 'FABRICATION SHOP', 'BUFFING', 'FAB_BUFFING', 'Buffing'),
  (12, 'FABRICATION SHOP', 'Pre Treatment', 'FAB_PRE_TREATMENT', 'Pre Treatment'),
  (13, 'FABRICATION SHOP', 'Powder Coating', 'FAB_POWDER_COATING', 'Powder Coating'),
  (14, 'FABRICATION SHOP', 'Assembly', 'FAB_ASSEMBLY', 'Assembly'),
  (15, 'FABRICATION SHOP', 'Quality Check', 'FAB_QUALITY_CHECK', 'QC Station'),
  (16, 'FABRICATION SHOP', 'Cleaning', 'FAB_CLEANING', 'Cleaning'),
  (17, 'FABRICATION SHOP', 'Packing', 'FAB_PACKING', 'Packaging'),
  (18, 'SHEET METAL SHOP', 'Laser Cutting', 'SHEET_LASER_CUTTING', 'Laser Cutting'),
  (19, 'SHEET METAL SHOP', 'Press Break 1', 'SHEET_PRESS_BREAK_1', 'Press Brake'),
  (20, 'SHEET METAL SHOP', 'Press Break 2', 'SHEET_PRESS_BREAK_2', 'Press Brake'),
  (21, 'SHEET METAL SHOP', 'Spot Welding', 'SHEET_SPOT_WELDING', 'Spot Welding'),
  (22, 'SHEET METAL SHOP', 'Laser Welding', 'SHEET_LASER_WELDING', 'Laser Welding'),
  (23, 'SHEET METAL SHOP', 'Laser Spot Welding', 'SHEET_LASER_SPOT_WELDING', 'Laser Spot Welding'),
  (24, 'SHEET METAL SHOP', 'MIG Welding', 'SHEET_MIG_WELDING', 'MIG Welding'),
  (25, 'SHEET METAL SHOP', 'Pre Treatment', 'SHEET_PRE_TREATMENT', 'Pre Treatment'),
  (26, 'SHEET METAL SHOP', 'Powder Coating', 'SHEET_POWDER_COATING', 'Powder Coating'),
  (27, 'SHEET METAL SHOP', 'Quality Check', 'SHEET_QUALITY_CHECK', 'QC Station'),
  (28, 'SHEET METAL SHOP', 'Cleaning', 'SHEET_CLEANING', 'Cleaning'),
  (29, 'SHEET METAL SHOP', 'Packing', 'SHEET_PACKING', 'Packaging'),
  (30, 'LEATHER SHOP', 'Leather Cutting', 'LEATHER_LEATHER_CUTTING', 'Cutting Machines'),
  (31, 'LEATHER SHOP', 'Leather Stitching', 'LEATHER_LEATHER_STITCHING', 'Stitching'),
  (32, 'LEATHER SHOP', 'Leather Pasting', 'LEATHER_LEATHER_PASTING', 'Pasting'),
  (33, 'LEATHER SHOP', 'Leather Assembly', 'LEATHER_LEATHER_ASSEMBLY', 'Assembly'),
  (34, 'LEATHER SHOP', 'Quality Check', 'LEATHER_QUALITY_CHECK', 'QC Station'),
  (35, 'LEATHER SHOP', 'Cleaning', 'LEATHER_CLEANING', 'Cleaning'),
  (36, 'LEATHER SHOP', 'Packing', 'LEATHER_PACKING', 'Packaging'),
  (37, 'STONE SHOP', 'Stone Cutting', 'STONE_STONE_CUTTING', 'Cutting Machines'),
  (38, 'STONE SHOP', 'Stone Edging', 'STONE_STONE_EDGING', 'Stone Edging'),
  (39, 'STONE SHOP', 'Stone Pasting', 'STONE_STONE_PASTING', 'Pasting'),
  (40, 'STONE SHOP', 'Stone Profile Assembly', 'STONE_STONE_PROFILE_ASSEMBLY', 'Assembly'),
  (41, 'STONE SHOP', 'Quality Check', 'STONE_QUALITY_CHECK', 'QC Station'),
  (42, 'STONE SHOP', 'Cleaning', 'STONE_CLEANING', 'Cleaning'),
  (43, 'STONE SHOP', 'Packing', 'STONE_PACKING', 'Packaging'),
  (44, 'MEMBRANE SHOP', 'Sanding 1', 'MEMBRANE_SANDING_1', 'Sanding'),
  (45, 'MEMBRANE SHOP', 'Gluing', 'MEMBRANE_GLUING', 'Gluing'),
  (46, 'MEMBRANE SHOP', 'Vaccum Foiling', 'MEMBRANE_VACCUM_FOILING', 'Vacuum Foiling'),
  (47, 'MEMBRANE SHOP', 'Foil Cutting', 'MEMBRANE_FOIL_CUTTING', 'Cutting Machines'),
  (48, 'MEMBRANE SHOP', 'Quality Check', 'MEMBRANE_QUALITY_CHECK', 'QC Station'),
  (49, 'MEMBRANE SHOP', 'Cleaning', 'MEMBRANE_CLEANING', 'Cleaning'),
  (50, 'MEMBRANE SHOP', 'Packing', 'MEMBRANE_PACKING', 'Packaging'),
  (51, 'ACRYLIC SHOP', 'Acrylic Cutting', 'ACRYLIC_ACRYLIC_CUTTING', 'Cutting Machines'),
  (52, 'ACRYLIC SHOP', 'Acrylic Pressing', 'ACRYLIC_ACRYLIC_PRESSING', 'Pressing'),
  (53, 'ACRYLIC SHOP', 'Acrylic Trimming', 'ACRYLIC_ACRYLIC_TRIMMING', 'Trimming'),
  (54, 'ACRYLIC SHOP', 'Acrylic Buffing', 'ACRYLIC_ACRYLIC_BUFFING', 'Buffing'),
  (55, 'ACRYLIC SHOP', 'Quality Check', 'ACRYLIC_QUALITY_CHECK', 'QC Station'),
  (56, 'ACRYLIC SHOP', 'Cleaning', 'ACRYLIC_CLEANING', 'Cleaning'),
  (57, 'ACRYLIC SHOP', 'Packing', 'ACRYLIC_PACKING', 'Packaging'),
  (58, 'PAINT SHOP', 'Panel Sanding 1', 'PAINT_PANEL_SANDING_1', 'Sanding'),
  (59, 'PAINT SHOP', 'Base Coat 1', 'PAINT_BASE_COAT_1', 'Painting'),
  (60, 'PAINT SHOP', 'Panel Sanding 2', 'PAINT_PANEL_SANDING_2', 'Sanding'),
  (61, 'PAINT SHOP', 'Base Coat 2', 'PAINT_BASE_COAT_2', 'Painting'),
  (62, 'PAINT SHOP', 'Top Coat 1', 'PAINT_TOP_COAT_1', 'Painting'),
  (63, 'PAINT SHOP', 'Top Coat 2', 'PAINT_TOP_COAT_2', 'Painting'),
  (64, 'PAINT SHOP', 'Matte', 'PAINT_MATTE', 'Painting'),
  (65, 'ALUMINIUM SHOP', 'Profile Cutting', 'ALUMINIUM_PROFILE_CUTTING', 'Cutting Machines'),
  (66, 'ALUMINIUM SHOP', 'Profile Routing', 'ALUMINIUM_PROFILE_ROUTING', 'Router'),
  (67, 'ALUMINIUM SHOP', 'Profile Assembly', 'ALUMINIUM_PROFILE_ASSEMBLY', 'Assembly'),
  (68, 'ALUMINIUM SHOP', 'Glass Assembly', 'ALUMINIUM_GLASS_ASSEMBLY', 'Assembly'),
  (69, 'ALUMINIUM SHOP', 'Profile Packing', 'ALUMINIUM_PROFILE_PACKING', 'Packaging');

-- Serialize changes to these tables while checking codes and allocating IDs.
LOCK TABLE "MachineTypeMaster", "MachineMaster" IN SHARE ROW EXCLUSIVE MODE;

DO $seed$
DECLARE
  context record;
  station record;
  type_id integer;
  table_name text;
  sequence_name text;
  highest_id bigint;
  current_sequence_value bigint;
  inserted_count integer := 0;
BEGIN
  SELECT * INTO STRICT context FROM metalwork_seed_context;

  -- Reject conflicting codes instead of silently overwriting unrelated records.
  IF EXISTS (
    SELECT 1 FROM "MachineMaster" m JOIN metalwork_seed_plan p USING (machine_code)
    WHERE m.vendor_id = context.vendor_id
      AND (m.fabrication <> 'METALWORK' OR m.machine_name <> p.machine_name)
  ) THEN
    RAISE EXCEPTION 'A seed code already belongs to a different machine; no records have been changed';
  END IF;

  -- Repair stale serial counters only if a restored database left them behind.
  FOREACH table_name IN ARRAY ARRAY['MachineTypeMaster', 'MachineMaster'] LOOP
    sequence_name := pg_get_serial_sequence(format('public.%I', table_name), 'id');
    EXECUTE format('SELECT COALESCE(MAX(id), 0) FROM public.%I', table_name) INTO highest_id;
    EXECUTE format('SELECT last_value FROM %s', sequence_name) INTO current_sequence_value;
    IF highest_id >= current_sequence_value THEN
      PERFORM setval(sequence_name::regclass, highest_id + 1, false);
    END IF;
  END LOOP;

  FOR station IN SELECT * FROM metalwork_seed_plan ORDER BY sequence_no LOOP
    IF EXISTS (SELECT 1 FROM "MachineMaster" WHERE vendor_id = context.vendor_id AND machine_code = station.machine_code) THEN
      CONTINUE;
    END IF;

    SELECT id INTO type_id FROM "MachineTypeMaster"
    WHERE lower(machine_type) = lower(station.workstation_type)
    ORDER BY id LIMIT 1;
    IF type_id IS NULL THEN
      INSERT INTO "MachineTypeMaster"
        (machine_type, is_scanandpack, is_trackandtrace, active, created_at, updated_at)
      VALUES (station.workstation_type, false, true, 'YES', NOW(), NOW())
      RETURNING id INTO type_id;
    END IF;

    INSERT INTO "MachineMaster"
      (machine_name, machine_code, machine_type_id, fabrication, status, scan_type,
       description, vendor_id, sequence_no, created_by, updated_by, created_at, updated_at)
    VALUES
      (station.machine_name, station.machine_code, type_id, 'METALWORK', 'ACTIVE', 'IN',
       station.shop, context.vendor_id, station.sequence_no, context.actor_id, context.actor_id, NOW(), NOW());
    inserted_count := inserted_count + 1;
  END LOOP;

  IF (SELECT COUNT(DISTINCT m.machine_code)
      FROM "MachineMaster" m JOIN metalwork_seed_plan p USING (machine_code)
      WHERE m.vendor_id = context.vendor_id AND m.fabrication = 'METALWORK') <> 69 THEN
    RAISE EXCEPTION 'Verification failed: expected all 69 requested machine codes';
  END IF;
  RAISE NOTICE 'Inserted % machines; % already existed for vendor ID %', inserted_count, 69 - inserted_count, context.vendor_id;
END $seed$;

-- pgAdmin results: expected counts are 17, 12, 7, 7, 7, 7, 7, 5 by shop order.
SELECT p.shop, COUNT(DISTINCT m.machine_code) AS machine_count
FROM metalwork_seed_plan p
JOIN metalwork_seed_context c ON true
JOIN "MachineMaster" m ON m.vendor_id = c.vendor_id AND m.machine_code = p.machine_code
GROUP BY p.shop
ORDER BY MIN(p.sequence_no);

COMMIT;
-- If any statement fails, run ROLLBACK; before retrying.
