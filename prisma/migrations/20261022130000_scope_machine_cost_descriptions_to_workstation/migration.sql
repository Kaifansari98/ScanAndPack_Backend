ALTER TABLE "MachineCostDescription" ADD COLUMN "machine_id" INTEGER;
DROP INDEX "MachineCostDescription_vendor_id_code_key";
DROP INDEX "MachineCostDescription_vendor_id_sequence_no_idx";

-- Copy each vendor's descriptions into independent rows for each of its workstations.
INSERT INTO "MachineCostDescription" ("vendor_id", "machine_id", "code", "description", "sequence_no")
SELECT description.vendor_id, machine.id, description.code, description.description, description.sequence_no
FROM "MachineCostDescription" description
JOIN "MachineMaster" machine ON machine.vendor_id = description.vendor_id
WHERE description.machine_id IS NULL;

-- The original vendor-wide rows have now been replaced by workstation-owned copies.
DELETE FROM "MachineCostDescription" WHERE "machine_id" IS NULL;
ALTER TABLE "MachineCostDescription" ALTER COLUMN "machine_id" SET NOT NULL;

CREATE UNIQUE INDEX "MachineMaster_id_vendor_id_key" ON "MachineMaster"("id", "vendor_id");
CREATE UNIQUE INDEX "MachineCostDescription_vendor_id_machine_id_code_key" ON "MachineCostDescription"("vendor_id", "machine_id", "code");
CREATE INDEX "MachineCostDescription_vendor_id_machine_id_sequence_no_idx" ON "MachineCostDescription"("vendor_id", "machine_id", "sequence_no");
ALTER TABLE "MachineCostDescription" ADD CONSTRAINT "MachineCostDescription_machine_id_vendor_id_fkey"
FOREIGN KEY ("machine_id", "vendor_id") REFERENCES "MachineMaster"("id", "vendor_id") ON DELETE CASCADE ON UPDATE CASCADE;
