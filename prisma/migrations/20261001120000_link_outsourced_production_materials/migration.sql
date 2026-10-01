ALTER TABLE "ProductsRequiredForProduction" ADD COLUMN "order_login_id" INTEGER;
CREATE INDEX "ProductsRequiredForProduction_order_login_id_idx" ON "ProductsRequiredForProduction"("order_login_id");
ALTER TABLE "ProductsRequiredForProduction" ADD CONSTRAINT "ProductsRequiredForProduction_order_login_id_fkey"
  FOREIGN KEY ("order_login_id") REFERENCES "OrderLoginDetails"("id") ON DELETE SET NULL ON UPDATE CASCADE;
