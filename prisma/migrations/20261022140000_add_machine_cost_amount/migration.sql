ALTER TABLE "MachineCostDescription" ADD COLUMN "amount" DECIMAL(14,2);
ALTER TABLE "MachineCostDescription" ADD CONSTRAINT "MachineCostDescription_amount_nonnegative" CHECK ("amount" >= 0);
