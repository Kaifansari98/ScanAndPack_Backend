ALTER TABLE "CutList"
ADD COLUMN IF NOT EXISTS "no_of_qty_in_boxes" INTEGER NOT NULL DEFAULT 1;

-- Backfill existing Custom Packing Group projects. The minimum CutList
-- quantity in a product group represents the number of product sets, while
-- each row's ratio represents how many pieces belong in every group box.
WITH "CustomGroupMinimums" AS (
  SELECT
    cl."project_id",
    LOWER(TRIM(cl."group_name")) AS "normalized_group_name",
    MIN(cl."qty") AS "minimum_qty"
  FROM "CutList" cl
  INNER JOIN "ProjectMaster" project
    ON project."id" = cl."project_id"
  WHERE project."packing_type" = 'CUSTOM_GROUP'
    AND cl."group_name" IS NOT NULL
    AND TRIM(cl."group_name") <> ''
    AND cl."qty" > 0
  GROUP BY cl."project_id", LOWER(TRIM(cl."group_name"))
)
UPDATE "CutList" cl
SET "no_of_qty_in_boxes" = GREATEST(
  1,
  cl."qty" / minimums."minimum_qty"
)
FROM "CustomGroupMinimums" minimums
WHERE cl."project_id" = minimums."project_id"
  AND LOWER(TRIM(cl."group_name")) = minimums."normalized_group_name"
  AND minimums."minimum_qty" > 0;
