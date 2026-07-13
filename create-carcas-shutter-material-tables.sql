-- DDL for the 4 new tables: CarcasMaterialMaster, CarcassMaterialFinishMaster,
-- ShutterMaterialMaster, ShutterMaterialFinishMaster.
-- Generated via `prisma migrate diff` against schema.prisma, so it matches
-- exactly what Prisma would create.

-- CreateTable
CREATE TABLE "CarcasMaterialMaster" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "vendor_id" INTEGER NOT NULL,

    CONSTRAINT "CarcasMaterialMaster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CarcassMaterialFinishMaster" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "carcas_material_id" INTEGER NOT NULL,

    CONSTRAINT "CarcassMaterialFinishMaster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShutterMaterialMaster" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "vendor_id" INTEGER NOT NULL,

    CONSTRAINT "ShutterMaterialMaster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShutterMaterialFinishMaster" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "shutter_material_id" INTEGER NOT NULL,

    CONSTRAINT "ShutterMaterialFinishMaster_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "CarcasMaterialMaster" ADD CONSTRAINT "CarcasMaterialMaster_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarcassMaterialFinishMaster" ADD CONSTRAINT "CarcassMaterialFinishMaster_carcas_material_id_fkey" FOREIGN KEY ("carcas_material_id") REFERENCES "CarcasMaterialMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShutterMaterialMaster" ADD CONSTRAINT "ShutterMaterialMaster_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShutterMaterialFinishMaster" ADD CONSTRAINT "ShutterMaterialFinishMaster_shutter_material_id_fkey" FOREIGN KEY ("shutter_material_id") REFERENCES "ShutterMaterialMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;
