-- Sheet totals used to be hard-coded rows in the UI. They become ordinary rows holding Excel-like formulas,
-- appended after each sheet's existing rows. References are stored as row codes ("[code]").

-- =SUM(first row:last row) for the summed sheets.
INSERT INTO "MachineCostDescription" ("vendor_id", "machine_id", "code", "description", "sequence_no", "sheet", "formula")
SELECT
    r.vendor_id,
    r.machine_id,
    totals.code,
    totals.description,
    MAX(r.sequence_no) + 1,
    r.sheet,
    '=SUM([' || (ARRAY_AGG(r.code ORDER BY r.sequence_no, r.id))[1] || ']:[' || (ARRAY_AGG(r.code ORDER BY r.sequence_no DESC, r.id DESC))[1] || '])'
FROM "MachineCostDescription" r
JOIN (VALUES
    ('MACHINE_COST'::"MachineCostSheet", 'machine_cost_total', 'Total Cost of Machine'),
    ('MACHINE_ELECTRICALS'::"MachineCostSheet", 'electricals_total_connected_load', 'Machine Total Connected Load'),
    ('MACHINE_LABOUR'::"MachineCostSheet", 'labour_total', 'Total Labour Cost'),
    ('PROCESS_COST'::"MachineCostSheet", 'process_total_cost_per_hour', 'Total cost/hr')
) AS totals(sheet, code, description) ON totals.sheet = r.sheet
GROUP BY r.vendor_id, r.machine_id, r.sheet, totals.code, totals.description
ON CONFLICT ("vendor_id", "machine_id", "code") DO NOTHING;

-- Machine Total Maintenance cost = (Total Cost of Machine x spares %) + AMC, now a cross-sheet formula.
INSERT INTO "MachineCostDescription" ("vendor_id", "machine_id", "code", "description", "sequence_no", "sheet", "formula")
SELECT r.vendor_id, r.machine_id, 'maintenance_total', 'Machine Total Maintenance cost', MAX(r.sequence_no) + 1, 'MACHINE_MAINTENANCE',
    '=([machine_cost_total]*[maintenance_spares_percent])+[maintenance_amc]'
FROM "MachineCostDescription" r
WHERE r.sheet = 'MACHINE_MAINTENANCE'
GROUP BY r.vendor_id, r.machine_id
ON CONFLICT ("vendor_id", "machine_id", "code") DO NOTHING;
