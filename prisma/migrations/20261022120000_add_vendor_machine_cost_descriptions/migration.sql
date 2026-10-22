CREATE TABLE "MachineCostDescription" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "sequence_no" INTEGER NOT NULL,
    CONSTRAINT "MachineCostDescription_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "MachineCostDescription_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "MachineCostDescription_vendor_id_code_key" ON "MachineCostDescription"("vendor_id", "code");
CREATE INDEX "MachineCostDescription_vendor_id_sequence_no_idx" ON "MachineCostDescription"("vendor_id", "sequence_no");

-- Each existing vendor owns independent descriptions. No amounts are seeded.
INSERT INTO "MachineCostDescription" ("vendor_id", "code", "description", "sequence_no")
SELECT vendor.id, defaults.code, defaults.description, defaults.sequence_no
FROM "VendorMaster" vendor
CROSS JOIN (VALUES
    ('machine_purchase', 'Machine Purchase Rate (this is fixed asset)', 1),
    ('machine_loading', 'Machine Loading Cost (Purchase Expenses)', 2),
    ('machine_transit_insurance', 'Machine Transit Insurance', 3),
    ('machine_transport', 'Machine Transport Cost (Purchase Expenses)', 4),
    ('machine_unloading', 'Machine Unloading Cost (Purchase Expenses)', 5),
    ('machine_electrical_setup', 'Machine Electrical Setup Cost (Purchase Expenses)', 6),
    ('machine_isolation_transformer', 'Machine Isolation Transformer (this is fixed asset)', 7),
    ('machine_servo_stabilizer', 'Machine Servo Stabilizer (this is fixed asset)', 8),
    ('dust_collector', 'Dust Collector Cost (this is fixed asset)', 9),
    ('dust_collector_ducting', 'Dust Collector Ducting Cost (this is fixed asset)', 10)
) AS defaults(code, description, sequence_no)
ON CONFLICT ("vendor_id", "code") DO NOTHING;
