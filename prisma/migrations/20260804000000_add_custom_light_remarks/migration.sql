ALTER TABLE "LeadLightCarcasUnitMapping"
ADD COLUMN "custom_remark" TEXT;

ALTER TABLE "LeadLightCarcasUnitMapping"
ALTER COLUMN "light_carcas_unit_master_id" DROP NOT NULL;

ALTER TABLE "LeadLightCarcasUnitMapping"
ADD CONSTRAINT "LeadLightCarcasUnitMapping_unit_or_custom_check"
CHECK (
  ("light_carcas_unit_master_id" IS NOT NULL AND "custom_remark" IS NULL)
  OR
  ("light_carcas_unit_master_id" IS NULL AND "custom_remark" IS NOT NULL)
);
