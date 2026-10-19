-- AlterTable CutList
ALTER TABLE "CutList" ADD COLUMN IF NOT EXISTS "top_drill" TEXT;
ALTER TABLE "CutList" ADD COLUMN IF NOT EXISTS "bottom_drill" TEXT;
ALTER TABLE "CutList" ADD COLUMN IF NOT EXISTS "is_drill" TEXT;

-- Insert drill and cutlist fields into RuleFieldMaster
INSERT INTO "RuleFieldMaster" ("field_key", "field_name", "data_type", "status", "updated_at")
VALUES
  ('category_name', 'Category Name', 'STRING', 'ACTIVE', CURRENT_TIMESTAMP),
  ('custom_packing_group', 'Custom Packing Group', 'STRING', 'ACTIVE', CURRENT_TIMESTAMP),
  ('top_drill', 'Top Drill', 'STRING', 'ACTIVE', CURRENT_TIMESTAMP),
  ('bottom_drill', 'Bottom Drill', 'STRING', 'ACTIVE', CURRENT_TIMESTAMP),
  ('is_drill', 'Is Drill', 'STRING', 'ACTIVE', CURRENT_TIMESTAMP)
ON CONFLICT ("field_key") DO UPDATE SET "status" = 'ACTIVE', "data_type" = 'STRING';
