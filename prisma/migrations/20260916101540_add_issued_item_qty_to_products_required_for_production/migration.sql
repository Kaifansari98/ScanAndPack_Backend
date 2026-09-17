-- AlterEnum
ALTER TYPE "StockChangeSource" ADD VALUE IF NOT EXISTS 'MaterialIssue';

-- AlterTable
ALTER TABLE "ProductsRequiredForProduction" ADD COLUMN "issued_item_qty" DECIMAL(12,2) NOT NULL DEFAULT 0;
