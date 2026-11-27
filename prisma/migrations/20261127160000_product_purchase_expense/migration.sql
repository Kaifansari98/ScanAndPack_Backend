-- Purchase expenses on a product (Inventory & Taxation): % of the purchase
-- rate or a ₹ amount, shown with the resulting rate after expenses.
ALTER TABLE "ProductMaster" ADD COLUMN IF NOT EXISTS "purchase_expense_type" VARCHAR(10);
ALTER TABLE "ProductMaster" ADD COLUMN IF NOT EXISTS "purchase_expense_value" DECIMAL(12,2);
