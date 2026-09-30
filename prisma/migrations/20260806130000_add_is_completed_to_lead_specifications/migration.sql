ALTER TABLE "LeadSpecificationsMaster"
ADD COLUMN "is_completed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "completed_marked_at" TIMESTAMP(3);
