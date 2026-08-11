ALTER TABLE "LeadMaster"
ADD COLUMN "is_so_value_received" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "so_value_received_at" TIMESTAMP(3);
