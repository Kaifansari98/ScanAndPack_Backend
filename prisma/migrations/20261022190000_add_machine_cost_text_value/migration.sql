-- A cell can hold plain text (e.g. "300x300", "NA") instead of an amount or formula.
ALTER TABLE "MachineCostDescription" ADD COLUMN IF NOT EXISTS "text_value" TEXT;
