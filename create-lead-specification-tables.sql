-- CreateTable
CREATE TABLE "LeadSpecificationsMaster" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "lead_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" INTEGER NOT NULL,

    CONSTRAINT "LeadSpecificationsMaster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadCarcassMaterialMapping" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "lead_id" INTEGER NOT NULL,
    "carcass_type_id" INTEGER NOT NULL,
    "carcas_material_id" INTEGER NOT NULL,
    "carcass_material_finish_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" INTEGER NOT NULL,

    CONSTRAINT "LeadCarcassMaterialMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadShutterMaterialMapping" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "lead_id" INTEGER NOT NULL,
    "shutter_type_id" INTEGER NOT NULL,
    "shutter_material_id" INTEGER NOT NULL,
    "shutter_material_finish_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" INTEGER NOT NULL,

    CONSTRAINT "LeadShutterMaterialMapping_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LeadSpecificationsMaster_vendor_id_idx" ON "LeadSpecificationsMaster"("vendor_id");

-- CreateIndex
CREATE INDEX "LeadSpecificationsMaster_lead_id_idx" ON "LeadSpecificationsMaster"("lead_id");

-- CreateIndex
CREATE INDEX "LeadSpecificationsMaster_created_by_idx" ON "LeadSpecificationsMaster"("created_by");

-- CreateIndex
CREATE INDEX "LeadCarcassMaterialMapping_vendor_id_idx" ON "LeadCarcassMaterialMapping"("vendor_id");

-- CreateIndex
CREATE INDEX "LeadCarcassMaterialMapping_lead_id_idx" ON "LeadCarcassMaterialMapping"("lead_id");

-- CreateIndex
CREATE INDEX "LeadCarcassMaterialMapping_carcass_type_id_idx" ON "LeadCarcassMaterialMapping"("carcass_type_id");

-- CreateIndex
CREATE INDEX "LeadCarcassMaterialMapping_carcas_material_id_idx" ON "LeadCarcassMaterialMapping"("carcas_material_id");

-- CreateIndex
CREATE INDEX "LeadCarcassMaterialMapping_carcass_material_finish_id_idx" ON "LeadCarcassMaterialMapping"("carcass_material_finish_id");

-- CreateIndex
CREATE INDEX "LeadCarcassMaterialMapping_created_by_idx" ON "LeadCarcassMaterialMapping"("created_by");

-- CreateIndex
CREATE INDEX "LeadShutterMaterialMapping_vendor_id_idx" ON "LeadShutterMaterialMapping"("vendor_id");

-- CreateIndex
CREATE INDEX "LeadShutterMaterialMapping_lead_id_idx" ON "LeadShutterMaterialMapping"("lead_id");

-- CreateIndex
CREATE INDEX "LeadShutterMaterialMapping_shutter_type_id_idx" ON "LeadShutterMaterialMapping"("shutter_type_id");

-- CreateIndex
CREATE INDEX "LeadShutterMaterialMapping_shutter_material_id_idx" ON "LeadShutterMaterialMapping"("shutter_material_id");

-- CreateIndex
CREATE INDEX "LeadShutterMaterialMapping_shutter_material_finish_id_idx" ON "LeadShutterMaterialMapping"("shutter_material_finish_id");

-- CreateIndex
CREATE INDEX "LeadShutterMaterialMapping_created_by_idx" ON "LeadShutterMaterialMapping"("created_by");

-- AddForeignKey
ALTER TABLE "LeadSpecificationsMaster" ADD CONSTRAINT "LeadSpecificationsMaster_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadSpecificationsMaster" ADD CONSTRAINT "LeadSpecificationsMaster_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "LeadMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadSpecificationsMaster" ADD CONSTRAINT "LeadSpecificationsMaster_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "UserMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadCarcassMaterialMapping" ADD CONSTRAINT "LeadCarcassMaterialMapping_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadCarcassMaterialMapping" ADD CONSTRAINT "LeadCarcassMaterialMapping_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "LeadMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadCarcassMaterialMapping" ADD CONSTRAINT "LeadCarcassMaterialMapping_carcass_type_id_fkey" FOREIGN KEY ("carcass_type_id") REFERENCES "CarcassTypeMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadCarcassMaterialMapping" ADD CONSTRAINT "LeadCarcassMaterialMapping_carcas_material_id_fkey" FOREIGN KEY ("carcas_material_id") REFERENCES "CarcasMaterialMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadCarcassMaterialMapping" ADD CONSTRAINT "LeadCarcassMaterialMapping_carcass_material_finish_id_fkey" FOREIGN KEY ("carcass_material_finish_id") REFERENCES "CarcassMaterialFinishMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadCarcassMaterialMapping" ADD CONSTRAINT "LeadCarcassMaterialMapping_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "UserMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadShutterMaterialMapping" ADD CONSTRAINT "LeadShutterMaterialMapping_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadShutterMaterialMapping" ADD CONSTRAINT "LeadShutterMaterialMapping_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "LeadMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadShutterMaterialMapping" ADD CONSTRAINT "LeadShutterMaterialMapping_shutter_type_id_fkey" FOREIGN KEY ("shutter_type_id") REFERENCES "ShutterTypeMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadShutterMaterialMapping" ADD CONSTRAINT "LeadShutterMaterialMapping_shutter_material_id_fkey" FOREIGN KEY ("shutter_material_id") REFERENCES "ShutterMaterialMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadShutterMaterialMapping" ADD CONSTRAINT "LeadShutterMaterialMapping_shutter_material_finish_id_fkey" FOREIGN KEY ("shutter_material_finish_id") REFERENCES "ShutterMaterialFinishMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadShutterMaterialMapping" ADD CONSTRAINT "LeadShutterMaterialMapping_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "UserMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

