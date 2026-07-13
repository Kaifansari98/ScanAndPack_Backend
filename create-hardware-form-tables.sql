-- CreateTable
CREATE TABLE "CarcassLegsMaster" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "vendor_id" INTEGER NOT NULL,

    CONSTRAINT "CarcassLegsMaster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SkirtingCarcassLegsMaster" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "carcass_legs_id" INTEGER NOT NULL,
    "inScope" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "SkirtingCarcassLegsMaster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SkirtingCarcassLegsColorMaster" (
    "id" SERIAL NOT NULL,
    "carcass_legs_id" INTEGER NOT NULL,
    "skirting_carcass_legs_id" INTEGER NOT NULL,
    "color" TEXT NOT NULL,

    CONSTRAINT "SkirtingCarcassLegsColorMaster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadHardwareMapping" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "lead_id" INTEGER NOT NULL,
    "carcass_legs_id" INTEGER NOT NULL,
    "skirting_carcass_legs_id" INTEGER NOT NULL,
    "skirting_carcass_legs_color_id" INTEGER,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" INTEGER NOT NULL,

    CONSTRAINT "LeadHardwareMapping_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LeadHardwareMapping_vendor_id_idx" ON "LeadHardwareMapping"("vendor_id");

-- CreateIndex
CREATE INDEX "LeadHardwareMapping_lead_id_idx" ON "LeadHardwareMapping"("lead_id");

-- CreateIndex
CREATE INDEX "LeadHardwareMapping_carcass_legs_id_idx" ON "LeadHardwareMapping"("carcass_legs_id");

-- CreateIndex
CREATE INDEX "LeadHardwareMapping_skirting_carcass_legs_id_idx" ON "LeadHardwareMapping"("skirting_carcass_legs_id");

-- CreateIndex
CREATE INDEX "LeadHardwareMapping_skirting_carcass_legs_color_id_idx" ON "LeadHardwareMapping"("skirting_carcass_legs_color_id");

-- CreateIndex
CREATE INDEX "LeadHardwareMapping_created_by_idx" ON "LeadHardwareMapping"("created_by");

-- AddForeignKey
ALTER TABLE "CarcassLegsMaster" ADD CONSTRAINT "CarcassLegsMaster_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SkirtingCarcassLegsMaster" ADD CONSTRAINT "SkirtingCarcassLegsMaster_carcass_legs_id_fkey" FOREIGN KEY ("carcass_legs_id") REFERENCES "CarcassLegsMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SkirtingCarcassLegsColorMaster" ADD CONSTRAINT "SkirtingCarcassLegsColorMaster_carcass_legs_id_fkey" FOREIGN KEY ("carcass_legs_id") REFERENCES "CarcassLegsMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SkirtingCarcassLegsColorMaster" ADD CONSTRAINT "SkirtingCarcassLegsColorMaster_skirting_carcass_legs_id_fkey" FOREIGN KEY ("skirting_carcass_legs_id") REFERENCES "SkirtingCarcassLegsMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadHardwareMapping" ADD CONSTRAINT "LeadHardwareMapping_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadHardwareMapping" ADD CONSTRAINT "LeadHardwareMapping_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "LeadMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadHardwareMapping" ADD CONSTRAINT "LeadHardwareMapping_carcass_legs_id_fkey" FOREIGN KEY ("carcass_legs_id") REFERENCES "CarcassLegsMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadHardwareMapping" ADD CONSTRAINT "LeadHardwareMapping_skirting_carcass_legs_id_fkey" FOREIGN KEY ("skirting_carcass_legs_id") REFERENCES "SkirtingCarcassLegsMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadHardwareMapping" ADD CONSTRAINT "LeadHardwareMapping_skirting_carcass_legs_color_id_fkey" FOREIGN KEY ("skirting_carcass_legs_color_id") REFERENCES "SkirtingCarcassLegsColorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadHardwareMapping" ADD CONSTRAINT "LeadHardwareMapping_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "UserMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

