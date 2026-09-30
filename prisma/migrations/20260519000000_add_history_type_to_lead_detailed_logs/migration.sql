CREATE TYPE "HistoryType" AS ENUM ('Lead', 'Task', 'FollowUp');

ALTER TABLE "LeadDetailedLogs"
ADD COLUMN "HistoryType" "HistoryType" NOT NULL DEFAULT 'Lead';
