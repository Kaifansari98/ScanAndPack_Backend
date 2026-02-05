-- AlterTable
ALTER TABLE "LeadProductStructureInstance"
ADD COLUMN "is_tech_check_completed" BOOLEAN,
ADD COLUMN "tech_check_completed_at" TIMESTAMP(3);
