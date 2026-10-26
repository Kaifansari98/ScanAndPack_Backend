-- Give every workstation of every vendor its own General Data rows, with editable default values.
-- The interest rate is a percentage stored as a fraction like Excel (12% = 0.12).
INSERT INTO "MachineCostDescription" ("vendor_id", "machine_id", "code", "description", "sequence_no", "sheet", "amount")
SELECT machine.vendor_id, machine.id, defaults.code, defaults.description, defaults.sequence_no, 'GENERAL_DATA', defaults.amount
FROM "MachineMaster" machine
CROSS JOIN (VALUES
    ('general_shift_hours', 'Shift time (hours)', 1, 8::DECIMAL(20,6)),
    ('general_working_days_per_month', 'Working days per month', 2, 25::DECIMAL(20,6)),
    ('general_months_per_year', 'Months per year', 3, 12::DECIMAL(20,6)),
    ('general_bank_interest_rate', 'Rate of interest from bank (%)', 4, 0.12::DECIMAL(20,6)),
    ('general_electricity_cost_per_unit', 'Electricity cost per unit (Rs/unit)', 5, 12::DECIMAL(20,6))
) AS defaults(code, description, sequence_no, amount)
ON CONFLICT ("vendor_id", "machine_id", "code") DO NOTHING;
