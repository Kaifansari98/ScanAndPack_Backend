ALTER TABLE "LeadCarcassMaterialMapping"
ADD COLUMN "amended_remark" TEXT,
ADD COLUMN "deleted_remark" TEXT;

ALTER TABLE "LeadShutterMaterialMapping"
ADD COLUMN "amended_remark" TEXT,
ADD COLUMN "deleted_remark" TEXT;

ALTER TABLE "LeadHardwareMapping"
ADD COLUMN "amended_remark" TEXT,
ADD COLUMN "deleted_remark" TEXT;

ALTER TABLE "LeadLightCarcasUnitMapping"
ADD COLUMN "amended_remark" TEXT,
ADD COLUMN "deleted_remark" TEXT;

ALTER TABLE "LeadOtherAppliancesMapping"
ADD COLUMN "amended_remark" TEXT,
ADD COLUMN "deleted_remark" TEXT;
