-- Give every workstation of every vendor its own Process Cost rows. No values are seeded.
-- Codes are kept stable so formulas reference rows by code, not position.
INSERT INTO "MachineCostDescription" ("vendor_id", "machine_id", "code", "description", "sequence_no", "sheet")
SELECT machine.vendor_id, machine.id, defaults.code, defaults.description, defaults.sequence_no, 'PROCESS_COST'
FROM "MachineMaster" machine
CROSS JOIN (VALUES
    ('process_electric_cost_per_hour', 'Electric Cost/Hr', 1),
    ('process_interest_cost_per_hour', 'Interest Cost/Hr', 2),
    ('process_maintenance_cost_per_hour', 'Maint Cost/Hr', 3),
    ('process_labour_cost_per_hour', 'Labour Cost/Hr', 4),
    ('process_tool_cost_per_hour', 'Tool Cost/Hr', 5)
) AS defaults(code, description, sequence_no)
ON CONFLICT ("vendor_id", "machine_id", "code") DO NOTHING;
