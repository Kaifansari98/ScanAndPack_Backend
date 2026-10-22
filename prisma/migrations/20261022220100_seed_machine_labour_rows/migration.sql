-- Give every workstation of every vendor its own Machine Labour rows. No values are seeded.
INSERT INTO "MachineCostDescription" ("vendor_id", "machine_id", "code", "description", "sequence_no", "sheet")
SELECT machine.vendor_id, machine.id, defaults.code, defaults.description, defaults.sequence_no, 'MACHINE_LABOUR'
FROM "MachineMaster" machine
CROSS JOIN (VALUES
    ('labour_skilled', 'Skilled Rs/8 hour', 1),
    ('labour_semi_skilled', 'Semi Skilled', 2),
    ('labour_unskilled', 'Unskilled', 3)
) AS defaults(code, description, sequence_no)
ON CONFLICT ("vendor_id", "machine_id", "code") DO NOTHING;
