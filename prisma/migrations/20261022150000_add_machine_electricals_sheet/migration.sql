-- Written to be re-runnable: some databases already got the enum/column via `prisma db push`.
DO $$ BEGIN
    CREATE TYPE "MachineCostSheet" AS ENUM ('MACHINE_COST', 'MACHINE_ELECTRICALS');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Existing rows all belong to the original Machine Cost sheet.
ALTER TABLE "MachineCostDescription" ADD COLUMN IF NOT EXISTS "sheet" "MachineCostSheet" NOT NULL DEFAULT 'MACHINE_COST';

CREATE INDEX IF NOT EXISTS "MachineCostDescription_vendor_id_machine_id_sheet_sequence_no_idx" ON "MachineCostDescription"("vendor_id", "machine_id", "sheet", "sequence_no");

-- Give every workstation of every vendor its own Machine Electricals rows. No values are seeded.
INSERT INTO "MachineCostDescription" ("vendor_id", "machine_id", "code", "description", "sequence_no", "sheet")
SELECT machine.vendor_id, machine.id, defaults.code, defaults.description, defaults.sequence_no, 'MACHINE_ELECTRICALS'
FROM "MachineMaster" machine
CROSS JOIN (VALUES
    ('machine_electrical_hp', 'Machine Electrical Horse Power (HP)', 1),
    ('dust_collector_electrical_hp', 'Dust Collector Electrical Horse Power (HP)', 2)
) AS defaults(code, description, sequence_no)
ON CONFLICT ("vendor_id", "machine_id", "code") DO NOTHING;
