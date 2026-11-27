-- Purchase, stock and consumption units per category / sub-category
-- (Category → Unit Conversions). Units come from StandardUnit.
CREATE TABLE IF NOT EXISTS "CategoryUnitSetting" (
  "id" SERIAL PRIMARY KEY,
  "vendor_id" INTEGER NOT NULL REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "category_id" INTEGER NOT NULL REFERENCES "ProjectCategoriesMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "purchase_unit_id" INTEGER REFERENCES "StandardUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "stock_unit_id" INTEGER REFERENCES "StandardUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "consumption_unit_id" INTEGER REFERENCES "StandardUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "created_by" INTEGER,
  "updated_by" INTEGER,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "CategoryUnitSetting_category_id_key" ON "CategoryUnitSetting"("category_id");
CREATE INDEX IF NOT EXISTS "CategoryUnitSetting_vendor_id_idx" ON "CategoryUnitSetting"("vendor_id");
