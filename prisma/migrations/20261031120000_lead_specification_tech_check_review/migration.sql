-- Latest specifications are approved / rejected in Tech Check (existing specifications stay unreviewed)
-- AlterTable
ALTER TABLE "LeadSpecificationsMaster" ADD COLUMN     "tech_check_remark" VARCHAR(2000),
ADD COLUMN     "tech_check_reviewed_at" TIMESTAMP(3),
ADD COLUMN     "tech_check_reviewed_by" INTEGER,
ADD COLUMN     "tech_check_status" "TechCheckStatus";
