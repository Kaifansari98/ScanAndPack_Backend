-- Affected component is no longer collected when registering a complaint.
ALTER TABLE "ComplaintMaster" ALTER COLUMN "component" DROP NOT NULL;
