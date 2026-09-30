-- AlterTable
ALTER TABLE "ExternalPlatformMaster" ADD COLUMN "type" TEXT;

-- BackfillType
UPDATE "ExternalPlatformMaster"
SET "type" = 'CADBID'
WHERE UPPER("external_platform_name") = 'CADBID';

-- CreateIndex
CREATE UNIQUE INDEX "ExternalPlatformMaster_type_key" ON "ExternalPlatformMaster"("type");

-- CreateTable
CREATE TABLE "LeadExternalPlatformCustomerMapping" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "lead_id" INTEGER NOT NULL,
    "external_platform_customer_id" TEXT NOT NULL,
    "external_platform_id" INTEGER NOT NULL,
    "external_platform_token_id" INTEGER NOT NULL,

    CONSTRAINT "LeadExternalPlatformCustomerMapping_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "uniq_vendor_lead_external_platform_customer_mapping" ON "LeadExternalPlatformCustomerMapping"("vendor_id", "lead_id", "external_platform_id");

-- AddForeignKey
ALTER TABLE "LeadExternalPlatformCustomerMapping" ADD CONSTRAINT "LeadExternalPlatformCustomerMapping_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadExternalPlatformCustomerMapping" ADD CONSTRAINT "LeadExternalPlatformCustomerMapping_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "LeadMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadExternalPlatformCustomerMapping" ADD CONSTRAINT "LeadExternalPlatformCustomerMapping_external_platform_id_fkey" FOREIGN KEY ("external_platform_id") REFERENCES "ExternalPlatformMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadExternalPlatformCustomerMapping" ADD CONSTRAINT "LeadExternalPlatformCustomerMapping_external_platform_token_id_fkey" FOREIGN KEY ("external_platform_token_id") REFERENCES "ExternalPlatformToken"("id") ON DELETE CASCADE ON UPDATE CASCADE;
