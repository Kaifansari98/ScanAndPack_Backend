-- Percentages are stored like Excel: 5% = 0.05. Fractions such as 12.5% (0.125) need more than 2 decimals.
ALTER TABLE "MachineCostDescription" ALTER COLUMN "amount" TYPE DECIMAL(20,6);

-- The spares % cell used to store 5 for 5%; convert it to the fraction. Runs once, as part of this migration.
UPDATE "MachineCostDescription"
SET "amount" = "amount" / 100
WHERE "sheet" = 'MACHINE_MAINTENANCE' AND "code" = 'maintenance_spares_percent' AND "amount" IS NOT NULL;
