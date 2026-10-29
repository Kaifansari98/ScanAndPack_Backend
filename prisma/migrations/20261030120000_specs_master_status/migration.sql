-- Specs Master entries can be marked active / inactive (existing entries stay active)
-- AlterTable
ALTER TABLE "CarcassTypeMaster" ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'active';
-- AlterTable
ALTER TABLE "CarcasMaterialMaster" ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'active';
-- AlterTable
ALTER TABLE "CarcassMaterialFinishMaster" ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'active';
-- AlterTable
ALTER TABLE "ShutterTypeMaster" ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'active';
-- AlterTable
ALTER TABLE "ShutterMaterialMaster" ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'active';
-- AlterTable
ALTER TABLE "ShutterOuterFinishMaster" ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'active';
-- AlterTable
ALTER TABLE "ShutterInnerFinishMaster" ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'active';
-- AlterTable
ALTER TABLE "HardwareTypeMaster" ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'active';
-- AlterTable
ALTER TABLE "HardwareItemMaster" ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'active';
-- AlterTable
ALTER TABLE "HardwareItemOptionMaster" ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'active';
-- AlterTable
ALTER TABLE "LightCarcasTypeMaster" ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'active';
-- AlterTable
ALTER TABLE "LightCarcasUnitMaster" ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'active';
-- AlterTable
ALTER TABLE "OtherAppliancesMaster" ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'active';
