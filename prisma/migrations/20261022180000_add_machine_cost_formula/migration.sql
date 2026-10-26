-- A cell holds either a plain amount or an Excel-like formula (references stored as row codes).
ALTER TABLE "MachineCostDescription" ADD COLUMN IF NOT EXISTS "formula" TEXT;
