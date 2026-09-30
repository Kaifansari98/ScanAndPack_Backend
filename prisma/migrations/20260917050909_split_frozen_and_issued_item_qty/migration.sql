-- AlterEnum
ALTER TYPE "StockChangeSource" ADD VALUE IF NOT EXISTS 'MaterialFreeze';

-- AlterTable
ALTER TABLE "ProductsRequiredForProduction" RENAME COLUMN "issued_item_qty" TO "frozen_item_qty";
ALTER TABLE "ProductsRequiredForProduction" ADD COLUMN "issued_item_qty" DECIMAL(12,2) NOT NULL DEFAULT 0;
