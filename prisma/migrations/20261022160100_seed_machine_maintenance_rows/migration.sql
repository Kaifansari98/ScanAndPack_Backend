-- Give every workstation of every vendor its own Machine Maintenance rows. No values are seeded.
-- The codes are referenced by the Machine Total Maintenance cost formula, so keep them stable.
INSERT INTO "MachineCostDescription" ("vendor_id", "machine_id", "code", "description", "sequence_no", "sheet")
SELECT machine.vendor_id, machine.id, defaults.code, defaults.description, defaults.sequence_no, 'MACHINE_MAINTENANCE'
FROM "MachineMaster" machine
CROSS JOIN (VALUES
    ('maintenance_amc', 'by % of total cost of machine or Fixed amount or AMC', 1),
    ('maintenance_spares_percent', 'Maintenance % per year for spares', 2)
) AS defaults(code, description, sequence_no)
ON CONFLICT ("vendor_id", "machine_id", "code") DO NOTHING;
