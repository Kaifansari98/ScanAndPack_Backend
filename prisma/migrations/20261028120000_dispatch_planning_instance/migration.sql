-- Dispatch Planning Information and Payment belong to one product instance (large-scale vendors)
ALTER TABLE "LeadProductStructureInstance"
  ADD COLUMN "required_date_for_dispatch" TIMESTAMP(3),
  ADD COLUMN "onsite_contact_person_name" TEXT,
  ADD COLUMN "onsite_contact_person_number" TEXT,
  ADD COLUMN "alt_onsite_contact_person_name" TEXT,
  ADD COLUMN "alt_onsite_contact_person_number" TEXT,
  ADD COLUMN "material_lift_availability" BOOLEAN,
  ADD COLUMN "material_lift_size" TEXT,
  ADD COLUMN "vehicle_approachability_for_dispatch" BOOLEAN,
  ADD COLUMN "dispatch_planning_remark" VARCHAR(2000);

ALTER TABLE "PaymentInfo" ADD COLUMN "instance_id" INTEGER;

CREATE INDEX "PaymentInfo_lead_id_instance_id_idx" ON "PaymentInfo"("lead_id", "instance_id");

ALTER TABLE "PaymentInfo" ADD CONSTRAINT "PaymentInfo_instance_id_fkey" FOREIGN KEY ("instance_id") REFERENCES "LeadProductStructureInstance"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: a lead with exactly one instance owns its existing Dispatch Planning
-- Information, its Dispatch Planning payments (Type 5) and their proof documents (Type 20).
WITH single AS (
  SELECT "lead_id", MIN("id") AS "instance_id"
  FROM "LeadProductStructureInstance"
  GROUP BY "lead_id"
  HAVING COUNT(*) = 1
)
UPDATE "LeadProductStructureInstance" i
SET "required_date_for_dispatch" = l."required_date_for_dispatch",
    "onsite_contact_person_name" = l."onsite_contact_person_name",
    "onsite_contact_person_number" = l."onsite_contact_person_number",
    "alt_onsite_contact_person_name" = l."alt_onsite_contact_person_name",
    "alt_onsite_contact_person_number" = l."alt_onsite_contact_person_number",
    "material_lift_availability" = l."material_lift_availability",
    "material_lift_size" = l."material_lift_size",
    "vehicle_approachability_for_dispatch" = l."vehicle_approachability_for_dispatch",
    "dispatch_planning_remark" = l."dispatch_planning_remark"
FROM single, "LeadMaster" l
WHERE i."id" = single."instance_id"
  AND l."id" = single."lead_id";

WITH single AS (
  SELECT "lead_id", MIN("id") AS "instance_id"
  FROM "LeadProductStructureInstance"
  GROUP BY "lead_id"
  HAVING COUNT(*) = 1
)
UPDATE "PaymentInfo" p
SET "instance_id" = single."instance_id"
FROM "PaymentTypeMaster" t, single
WHERE p."payment_type_id" = t."id"
  AND t."tag" = 'Type 5'
  AND p."lead_id" = single."lead_id"
  AND p."instance_id" IS NULL;

WITH single AS (
  SELECT "lead_id", MIN("id") AS "instance_id"
  FROM "LeadProductStructureInstance"
  GROUP BY "lead_id"
  HAVING COUNT(*) = 1
)
UPDATE "LeadDocuments" d
SET "product_structure_instance_id" = single."instance_id"
FROM "DocumentTypeMaster" t, single
WHERE d."doc_type_id" = t."id"
  AND t."tag" = 'Type 20'
  AND d."lead_id" = single."lead_id"
  AND d."product_structure_instance_id" IS NULL;
