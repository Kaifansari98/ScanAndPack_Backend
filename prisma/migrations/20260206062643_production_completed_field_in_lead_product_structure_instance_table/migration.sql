-- AlterTable
ALTER TABLE "LeadProductStructureInstance" ADD COLUMN     "is_production_completed" BOOLEAN,
ADD COLUMN     "production_completed_at" TIMESTAMP(3);
