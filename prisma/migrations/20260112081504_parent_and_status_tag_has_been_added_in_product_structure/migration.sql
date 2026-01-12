-- AlterTable
ALTER TABLE "ProductStructure" ADD COLUMN     "parent" TEXT,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'active';
