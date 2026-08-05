ALTER TABLE "LeadOtherAppliancesMapping"
ADD COLUMN "other_appliance_type" "OtherApplianceType";

ALTER TABLE "LeadOtherAppliancesMapping"
ADD COLUMN "custom_remark" TEXT;

ALTER TABLE "LeadOtherAppliancesMapping"
ALTER COLUMN "other_appliances_master_id" DROP NOT NULL;

ALTER TABLE "LeadOtherAppliancesMapping"
ADD CONSTRAINT "LeadOtherAppliancesMapping_item_or_custom_check"
CHECK (
  ("other_appliances_master_id" IS NOT NULL AND "custom_remark" IS NULL)
  OR
  ("other_appliances_master_id" IS NULL AND "custom_remark" IS NOT NULL AND "other_appliance_type" IS NOT NULL)
);

CREATE TABLE "LeadOtherAppliancesRemarkMapping" (
  "id" SERIAL NOT NULL,
  "vendor_id" INTEGER NOT NULL,
  "lead_id" INTEGER NOT NULL,
  "specs_id" INTEGER NOT NULL,
  "other_appliance_type" "OtherApplianceType" NOT NULL,
  "remark" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_by" INTEGER NOT NULL,
  CONSTRAINT "LeadOtherAppliancesRemarkMapping_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LeadOtherAppliancesRemarkMapping_specs_id_other_appliance_type_key"
ON "LeadOtherAppliancesRemarkMapping"("specs_id", "other_appliance_type");

CREATE INDEX "LeadOtherAppliancesRemarkMapping_vendor_id_idx"
ON "LeadOtherAppliancesRemarkMapping"("vendor_id");

CREATE INDEX "LeadOtherAppliancesRemarkMapping_lead_id_idx"
ON "LeadOtherAppliancesRemarkMapping"("lead_id");

CREATE INDEX "LeadOtherAppliancesRemarkMapping_specs_id_idx"
ON "LeadOtherAppliancesRemarkMapping"("specs_id");

CREATE INDEX "LeadOtherAppliancesRemarkMapping_created_by_idx"
ON "LeadOtherAppliancesRemarkMapping"("created_by");
