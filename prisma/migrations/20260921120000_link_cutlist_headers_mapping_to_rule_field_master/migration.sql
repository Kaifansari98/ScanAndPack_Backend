-- Add the master rows needed so these cutlist columns stay mappable once
-- CutlistHeadersMapping targets RuleFieldMaster instead of a free-text field.
INSERT INTO "RuleFieldMaster" ("field_key", "field_name", "data_type", "status", "updated_at")
VALUES
  ('category_name', 'Category Name', 'STRING', 'ACTIVE', CURRENT_TIMESTAMP),
  ('custom_packing_group', 'Custom Packing Group', 'STRING', 'ACTIVE', CURRENT_TIMESTAMP)
ON CONFLICT ("field_key") DO NOTHING;

DROP INDEX "CutlistHeadersMapping_vendor_id_cutlist_field_key";

ALTER TABLE "CutlistHeadersMapping" ADD COLUMN "rule_field_id" INTEGER;

UPDATE "CutlistHeadersMapping" chm
SET "rule_field_id" = rfm."id"
FROM "RuleFieldMaster" rfm
WHERE rfm."field_key" = chm."cutlist_field";

ALTER TABLE "CutlistHeadersMapping" DROP COLUMN "cutlist_field";

CREATE UNIQUE INDEX "CutlistHeadersMapping_vendor_id_rule_field_id_key"
ON "CutlistHeadersMapping"("vendor_id", "rule_field_id");

ALTER TABLE "CutlistHeadersMapping" ADD CONSTRAINT "CutlistHeadersMapping_rule_field_id_fkey"
FOREIGN KEY ("rule_field_id") REFERENCES "RuleFieldMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;
