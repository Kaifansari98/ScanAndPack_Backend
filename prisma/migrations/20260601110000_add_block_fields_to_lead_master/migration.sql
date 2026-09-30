-- AlterTable
ALTER TABLE "LeadMaster"
ADD COLUMN "is_blocked" BOOLEAN DEFAULT false,
ADD COLUMN "lead_blocked_at" TIMESTAMP(3);
