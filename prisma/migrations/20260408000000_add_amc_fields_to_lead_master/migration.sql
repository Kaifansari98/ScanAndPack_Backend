-- AlterTable
ALTER TABLE "LeadMaster"
ADD COLUMN "is_amc_opted" BOOLEAN DEFAULT false,
ADD COLUMN "amc_opted_at" TIMESTAMP(3);
