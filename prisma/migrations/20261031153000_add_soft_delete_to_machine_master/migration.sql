-- Add soft delete fields to MachineMaster
ALTER TABLE "MachineMaster" ADD COLUMN IF NOT EXISTS "is_deleted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "MachineMaster" ADD COLUMN IF NOT EXISTS "deleted_by" INTEGER;
ALTER TABLE "MachineMaster" ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMP(3);

-- Add foreign key constraint for deleted_by
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'MachineMaster_deleted_by_fkey'
  ) THEN
    ALTER TABLE "MachineMaster" ADD CONSTRAINT "MachineMaster_deleted_by_fkey" FOREIGN KEY ("deleted_by") REFERENCES "UserMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Add index
CREATE INDEX IF NOT EXISTS "MachineMaster_vendor_id_is_deleted_idx" ON "MachineMaster"("vendor_id", "is_deleted");

