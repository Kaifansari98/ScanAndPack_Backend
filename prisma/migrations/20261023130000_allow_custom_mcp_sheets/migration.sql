ALTER TABLE "MachineCostDescription" ALTER COLUMN "sheet" DROP DEFAULT;
ALTER TABLE "MachineCostDescription" ALTER COLUMN "sheet" TYPE TEXT USING "sheet"::text;
ALTER TABLE "MachineCostDescription" ALTER COLUMN "sheet" SET DEFAULT 'MACHINE_COST';
