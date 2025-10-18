-- CreateEnum
CREATE TYPE "TechCheckStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "LeadDocuments" ADD COLUMN     "tech_check_status" "TechCheckStatus";
