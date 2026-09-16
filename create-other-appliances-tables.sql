-- DDL for OtherAppliancesMaster and LeadOtherAppliancesMapping
-- (Others tab -> Stone / Appliances / Sinks / Faucets forms).
-- Generated via `prisma migrate diff` against schema.prisma, so it matches
-- exactly what Prisma would create.

-- CreateTable
CREATE TABLE "OtherAppliancesMaster" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "article_number" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OtherAppliancesMaster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadOtherAppliancesMapping" (
    "id" SERIAL NOT NULL,
    "lead_id" INTEGER NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "specs_id" INTEGER NOT NULL,
    "other_appliances_master_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" INTEGER NOT NULL,

    CONSTRAINT "LeadOtherAppliancesMapping_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OtherAppliancesMaster_vendor_id_idx" ON "OtherAppliancesMaster"("vendor_id");

-- CreateIndex
CREATE INDEX "LeadOtherAppliancesMapping_lead_id_idx" ON "LeadOtherAppliancesMapping"("lead_id");

-- CreateIndex
CREATE INDEX "LeadOtherAppliancesMapping_vendor_id_idx" ON "LeadOtherAppliancesMapping"("vendor_id");

-- CreateIndex
CREATE INDEX "LeadOtherAppliancesMapping_specs_id_idx" ON "LeadOtherAppliancesMapping"("specs_id");

-- CreateIndex
CREATE INDEX "LeadOtherAppliancesMapping_other_appliances_master_id_idx" ON "LeadOtherAppliancesMapping"("other_appliances_master_id");

-- CreateIndex
CREATE INDEX "LeadOtherAppliancesMapping_created_by_idx" ON "LeadOtherAppliancesMapping"("created_by");

-- AddForeignKey
ALTER TABLE "OtherAppliancesMaster" ADD CONSTRAINT "OtherAppliancesMaster_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadOtherAppliancesMapping" ADD CONSTRAINT "LeadOtherAppliancesMapping_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "LeadMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadOtherAppliancesMapping" ADD CONSTRAINT "LeadOtherAppliancesMapping_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadOtherAppliancesMapping" ADD CONSTRAINT "LeadOtherAppliancesMapping_specs_id_fkey" FOREIGN KEY ("specs_id") REFERENCES "LeadSpecificationsMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadOtherAppliancesMapping" ADD CONSTRAINT "LeadOtherAppliancesMapping_other_appliances_master_id_fkey" FOREIGN KEY ("other_appliances_master_id") REFERENCES "OtherAppliancesMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadOtherAppliancesMapping" ADD CONSTRAINT "LeadOtherAppliancesMapping_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "UserMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;
