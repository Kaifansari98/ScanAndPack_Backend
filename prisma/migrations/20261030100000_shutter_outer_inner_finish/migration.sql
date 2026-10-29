-- Rename Shutter Material Finish -> Shutter Outer Finish in place (data is kept),
-- and add Shutter Inner Finish (same shape: a finish under a shutter material).

BEGIN;

-- Rename table, column, sequence, keys and index
ALTER TABLE "ShutterMaterialFinishMaster" RENAME TO "ShutterOuterFinishMaster";
ALTER TABLE "LeadShutterMaterialMapping" RENAME COLUMN "shutter_material_finish_id" TO "shutter_outer_finish_id";
ALTER SEQUENCE "ShutterMaterialFinishMaster_id_seq" RENAME TO "ShutterOuterFinishMaster_id_seq";
ALTER TABLE "ShutterOuterFinishMaster" RENAME CONSTRAINT "ShutterMaterialFinishMaster_pkey" TO "ShutterOuterFinishMaster_pkey";
ALTER TABLE "ShutterOuterFinishMaster" RENAME CONSTRAINT "ShutterMaterialFinishMaster_shutter_material_id_fkey" TO "ShutterOuterFinishMaster_shutter_material_id_fkey";
ALTER TABLE "LeadShutterMaterialMapping" RENAME CONSTRAINT "LeadShutterMaterialMapping_shutter_material_finish_id_fkey" TO "LeadShutterMaterialMapping_shutter_outer_finish_id_fkey";
ALTER INDEX "LeadShutterMaterialMapping_shutter_material_finish_id_idx" RENAME TO "LeadShutterMaterialMapping_shutter_outer_finish_id_idx";

-- Shutter Inner Finish
CREATE TABLE "ShutterInnerFinishMaster" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "shutter_material_id" INTEGER NOT NULL,

    CONSTRAINT "ShutterInnerFinishMaster_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ShutterInnerFinishMaster" ADD CONSTRAINT "ShutterInnerFinishMaster_shutter_material_id_fkey" FOREIGN KEY ("shutter_material_id") REFERENCES "ShutterMaterialMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
