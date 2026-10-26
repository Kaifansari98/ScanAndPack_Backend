-- Per-cell display format, like an Excel cell format. "percent" shows a stored fraction (0.05) as 5%.
ALTER TABLE "MachineCostDescription" ADD COLUMN IF NOT EXISTS "value_format" TEXT;

-- These cells were previously shown as percentages by a hard-coded rule; they now carry the format themselves.
UPDATE "MachineCostDescription"
SET "value_format" = 'percent'
WHERE "code" IN ('maintenance_spares_percent', 'general_bank_interest_rate');
