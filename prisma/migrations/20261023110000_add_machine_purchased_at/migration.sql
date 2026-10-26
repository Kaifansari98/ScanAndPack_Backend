-- Date the workstation was purchased (shown as "Purchased At" on the workstation form).
ALTER TABLE "MachineMaster" ADD COLUMN IF NOT EXISTS "purchased_at" DATE;
