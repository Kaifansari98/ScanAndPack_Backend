-- AlterTable
ALTER TABLE "LeadProcessBriefMapping" ADD COLUMN IF NOT EXISTS "machine_id" INTEGER;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "LeadProcessBriefMapping_machine_id_idx" ON "LeadProcessBriefMapping"("machine_id");

-- AddForeignKey
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'LeadProcessBriefMapping_machine_id_fkey'
    ) THEN
        ALTER TABLE "LeadProcessBriefMapping" 
        ADD CONSTRAINT "LeadProcessBriefMapping_machine_id_fkey" 
        FOREIGN KEY ("machine_id") REFERENCES "MachineMaster"("id") 
        ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;
