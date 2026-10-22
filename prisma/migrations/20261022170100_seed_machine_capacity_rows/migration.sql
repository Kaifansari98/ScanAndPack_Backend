-- Give every workstation of every vendor its own Machine Capacity rows. No values are seeded yet.
-- Codes are kept stable so the capacity formulas added later can reference rows by code.
INSERT INTO "MachineCostDescription" ("vendor_id", "machine_id", "code", "description", "sequence_no", "sheet")
SELECT machine.vendor_id, machine.id, defaults.code, defaults.description, defaults.sequence_no, 'MACHINE_CAPACITY'
FROM "MachineMaster" machine
CROSS JOIN (VALUES
    ('capacity_sheets_per_hour', 'Sheet processing/hour', 1),
    ('capacity_machine_speed_m_per_min', 'Machine Speed in meter/min', 2),
    ('capacity_machine_processing_per_hour', 'Machine processing per hour', 3),
    ('capacity_sample_qty_per_sheet', 'Sample qty generated from 1 sheet of 8x4', 4),
    ('capacity_sheets_per_shift', 'Sheet processing/shift of 8 hour', 5),
    ('capacity_panels_per_hour', 'No of panels/hour from 1 sheet as per sample area', 6),
    ('capacity_sample_size_mm', 'Sample size in MM', 7),
    ('capacity_sample_area_sqm', 'Sample area to be picked from sample size in sqm', 8),
    ('capacity_glue_pot_capacity_grams', 'Glue pot Capacity in Grams', 9),
    ('capacity_glue_pot_output_meter', 'Glue pot output in meter', 10),
    ('capacity_cuts_in_sheet_width', 'No of cut in width of Sheet to make 32 pcs', 11),
    ('capacity_cuts_in_sheet_height', 'No of cut in Height of sheet to make 32 pcs', 12),
    ('capacity_cuts_per_sheet', 'No of cut/sheet to make 32 pcs from 1 sheet', 13),
    ('capacity_cuts_per_hour', 'No of cut/hour', 14),
    ('capacity_cuts_per_shift', 'No of cut/shift', 15),
    ('capacity_process_wastage_mm', 'Process wastage in MM', 16),
    ('capacity_run_length_meter', 'Run Length in Meter for Sample size BS-Perimeter/EB-perimeter+200mm wastage', 17),
    ('capacity_total_length_per_hour_meter', 'Total length/hour in meter', 18)
) AS defaults(code, description, sequence_no)
ON CONFLICT ("vendor_id", "machine_id", "code") DO NOTHING;
