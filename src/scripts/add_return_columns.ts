import { prisma } from "../prisma/client";

async function main() {
  console.log("Checking columns in MiscellaneousMaster...");
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "MiscellaneousMaster" 
    ADD COLUMN IF NOT EXISTS "is_returned" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS "returned_at" TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "returned_by" INTEGER,
    ADD COLUMN IF NOT EXISTS "return_handover_remark" TEXT;
  `);

  try {
    await prisma.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'MiscellaneousMaster_returned_by_fkey'
        ) THEN
          ALTER TABLE "MiscellaneousMaster" 
          ADD CONSTRAINT "MiscellaneousMaster_returned_by_fkey" 
          FOREIGN KEY ("returned_by") REFERENCES "UserMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;
        END IF;
      END $$;
    `);
  } catch (e: any) {
    console.log("Foreign key notice:", e.message);
  }

  console.log("Columns added successfully!");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
