-- Site map link on a complaint, fetched from the lead or entered for external clients.
ALTER TABLE "ComplaintMaster" ADD COLUMN IF NOT EXISTS "site_map_link" VARCHAR(1000);

-- Backfill existing lead complaints from the lead's map link.
UPDATE "ComplaintMaster" c
SET "site_map_link" = LEFT(TRIM(l."site_map_link"), 1000)
FROM "LeadMaster" l
WHERE c."lead_id" = l."id"
  AND c."site_map_link" IS NULL
  AND NULLIF(TRIM(l."site_map_link"), '') IS NOT NULL;
