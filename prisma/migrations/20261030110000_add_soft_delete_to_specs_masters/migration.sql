-- Add soft delete fields to Specs Master models
ALTER TABLE "CarcassTypeMaster" ADD COLUMN IF NOT EXISTS "is_deleted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CarcassTypeMaster" ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMP(3);

ALTER TABLE "CarcasMaterialMaster" ADD COLUMN IF NOT EXISTS "is_deleted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CarcasMaterialMaster" ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMP(3);

ALTER TABLE "CarcassMaterialFinishMaster" ADD COLUMN IF NOT EXISTS "is_deleted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CarcassMaterialFinishMaster" ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMP(3);

ALTER TABLE "ShutterTypeMaster" ADD COLUMN IF NOT EXISTS "is_deleted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ShutterTypeMaster" ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMP(3);

ALTER TABLE "ShutterMaterialMaster" ADD COLUMN IF NOT EXISTS "is_deleted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ShutterMaterialMaster" ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMP(3);

ALTER TABLE "ShutterOuterFinishMaster" ADD COLUMN IF NOT EXISTS "is_deleted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ShutterOuterFinishMaster" ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMP(3);

ALTER TABLE "ShutterInnerFinishMaster" ADD COLUMN IF NOT EXISTS "is_deleted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ShutterInnerFinishMaster" ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMP(3);

ALTER TABLE "HardwareTypeMaster" ADD COLUMN IF NOT EXISTS "is_deleted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "HardwareTypeMaster" ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMP(3);

ALTER TABLE "HardwareItemMaster" ADD COLUMN IF NOT EXISTS "is_deleted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "HardwareItemMaster" ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMP(3);

ALTER TABLE "HardwareItemOptionMaster" ADD COLUMN IF NOT EXISTS "is_deleted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "HardwareItemOptionMaster" ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMP(3);

ALTER TABLE "LightCarcasTypeMaster" ADD COLUMN IF NOT EXISTS "is_deleted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "LightCarcasTypeMaster" ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMP(3);

ALTER TABLE "LightCarcasUnitMaster" ADD COLUMN IF NOT EXISTS "is_deleted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "LightCarcasUnitMaster" ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMP(3);

ALTER TABLE "OtherAppliancesMaster" ADD COLUMN IF NOT EXISTS "is_deleted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "OtherAppliancesMaster" ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMP(3);

