-- CreateTable
CREATE TABLE IF NOT EXISTS "BoxUnpackLog" (
    "id" SERIAL NOT NULL,
    "box_id" INTEGER NOT NULL,
    "project_id" INTEGER NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "packed_at" TIMESTAMP(3),
    "packed_by" INTEGER,
    "box_created_by" INTEGER,
    "box_created_at" TIMESTAMP(3),
    "unpacked_by" INTEGER NOT NULL,
    "unpacked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BoxUnpackLog_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "BoxItemDeleteLog" ADD COLUMN IF NOT EXISTS "reason" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "BoxUnpackLog_vendor_id_project_id_box_id_idx" ON "BoxUnpackLog"("vendor_id", "project_id", "box_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "BoxUnpackLog_unpacked_by_idx" ON "BoxUnpackLog"("unpacked_by");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "BoxUnpackLog_unpacked_at_idx" ON "BoxUnpackLog"("unpacked_at");

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'BoxUnpackLog_box_id_fkey'
    ) THEN
        ALTER TABLE "BoxUnpackLog" ADD CONSTRAINT "BoxUnpackLog_box_id_fkey" FOREIGN KEY ("box_id") REFERENCES "BoxMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'BoxUnpackLog_project_id_fkey'
    ) THEN
        ALTER TABLE "BoxUnpackLog" ADD CONSTRAINT "BoxUnpackLog_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "ProjectMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'BoxUnpackLog_vendor_id_fkey'
    ) THEN
        ALTER TABLE "BoxUnpackLog" ADD CONSTRAINT "BoxUnpackLog_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'BoxUnpackLog_unpacked_by_fkey'
    ) THEN
        ALTER TABLE "BoxUnpackLog" ADD CONSTRAINT "BoxUnpackLog_unpacked_by_fkey" FOREIGN KEY ("unpacked_by") REFERENCES "UserMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'BoxUnpackLog_packed_by_fkey'
    ) THEN
        ALTER TABLE "BoxUnpackLog" ADD CONSTRAINT "BoxUnpackLog_packed_by_fkey" FOREIGN KEY ("packed_by") REFERENCES "UserMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'BoxUnpackLog_box_created_by_fkey'
    ) THEN
        ALTER TABLE "BoxUnpackLog" ADD CONSTRAINT "BoxUnpackLog_box_created_by_fkey" FOREIGN KEY ("box_created_by") REFERENCES "UserMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;
