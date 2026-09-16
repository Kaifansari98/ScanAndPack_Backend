ALTER TABLE "LeadCarcassMaterialMapping"
ADD COLUMN "specs_id" INTEGER;

INSERT INTO "LeadCarcassMaterialMapping" (
  "vendor_id",
  "lead_id",
  "specs_id",
  "carcass_type_id",
  "carcas_material_id",
  "carcass_material_finish_id",
  "created_at",
  "created_by"
)
SELECT
  src."vendor_id",
  src."lead_id",
  specs."id",
  src."carcass_type_id",
  src."carcas_material_id",
  src."carcass_material_finish_id",
  src."created_at",
  src."created_by"
FROM "LeadCarcassMaterialMapping" src
JOIN "LeadSpecificationsMaster" specs
  ON specs."vendor_id" = src."vendor_id"
 AND specs."lead_id" = src."lead_id"
WHERE src."specs_id" IS NULL;

DELETE FROM "LeadCarcassMaterialMapping"
WHERE "specs_id" IS NULL
  AND EXISTS (
    SELECT 1
    FROM "LeadSpecificationsMaster" specs
    WHERE specs."vendor_id" = "LeadCarcassMaterialMapping"."vendor_id"
      AND specs."lead_id" = "LeadCarcassMaterialMapping"."lead_id"
  );

ALTER TABLE "LeadCarcassMaterialMapping"
ALTER COLUMN "specs_id" SET NOT NULL;

CREATE INDEX "LeadCarcassMaterialMapping_specs_id_idx"
ON "LeadCarcassMaterialMapping"("specs_id");

ALTER TABLE "LeadCarcassMaterialMapping"
ADD CONSTRAINT "LeadCarcassMaterialMapping_specs_id_fkey"
FOREIGN KEY ("specs_id") REFERENCES "LeadSpecificationsMaster"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LeadShutterMaterialMapping"
ADD COLUMN "specs_id" INTEGER;

INSERT INTO "LeadShutterMaterialMapping" (
  "vendor_id",
  "lead_id",
  "specs_id",
  "shutter_type_id",
  "shutter_material_id",
  "shutter_material_finish_id",
  "created_at",
  "created_by"
)
SELECT
  src."vendor_id",
  src."lead_id",
  specs."id",
  src."shutter_type_id",
  src."shutter_material_id",
  src."shutter_material_finish_id",
  src."created_at",
  src."created_by"
FROM "LeadShutterMaterialMapping" src
JOIN "LeadSpecificationsMaster" specs
  ON specs."vendor_id" = src."vendor_id"
 AND specs."lead_id" = src."lead_id"
WHERE src."specs_id" IS NULL;

DELETE FROM "LeadShutterMaterialMapping"
WHERE "specs_id" IS NULL
  AND EXISTS (
    SELECT 1
    FROM "LeadSpecificationsMaster" specs
    WHERE specs."vendor_id" = "LeadShutterMaterialMapping"."vendor_id"
      AND specs."lead_id" = "LeadShutterMaterialMapping"."lead_id"
  );

ALTER TABLE "LeadShutterMaterialMapping"
ALTER COLUMN "specs_id" SET NOT NULL;

CREATE INDEX "LeadShutterMaterialMapping_specs_id_idx"
ON "LeadShutterMaterialMapping"("specs_id");

ALTER TABLE "LeadShutterMaterialMapping"
ADD CONSTRAINT "LeadShutterMaterialMapping_specs_id_fkey"
FOREIGN KEY ("specs_id") REFERENCES "LeadSpecificationsMaster"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LeadHardwareMapping"
ADD COLUMN "specs_id" INTEGER;

INSERT INTO "LeadHardwareMapping" (
  "vendor_id",
  "lead_id",
  "specs_id",
  "carcass_legs_id",
  "skirting_carcass_legs_id",
  "skirting_carcass_legs_color_id",
  "note",
  "created_at",
  "created_by"
)
SELECT
  src."vendor_id",
  src."lead_id",
  specs."id",
  src."carcass_legs_id",
  src."skirting_carcass_legs_id",
  src."skirting_carcass_legs_color_id",
  src."note",
  src."created_at",
  src."created_by"
FROM "LeadHardwareMapping" src
JOIN "LeadSpecificationsMaster" specs
  ON specs."vendor_id" = src."vendor_id"
 AND specs."lead_id" = src."lead_id"
WHERE src."specs_id" IS NULL;

DELETE FROM "LeadHardwareMapping"
WHERE "specs_id" IS NULL
  AND EXISTS (
    SELECT 1
    FROM "LeadSpecificationsMaster" specs
    WHERE specs."vendor_id" = "LeadHardwareMapping"."vendor_id"
      AND specs."lead_id" = "LeadHardwareMapping"."lead_id"
  );

ALTER TABLE "LeadHardwareMapping"
ALTER COLUMN "specs_id" SET NOT NULL;

CREATE INDEX "LeadHardwareMapping_specs_id_idx"
ON "LeadHardwareMapping"("specs_id");

ALTER TABLE "LeadHardwareMapping"
ADD CONSTRAINT "LeadHardwareMapping_specs_id_fkey"
FOREIGN KEY ("specs_id") REFERENCES "LeadSpecificationsMaster"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
