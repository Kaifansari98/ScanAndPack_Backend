-- DropIndex
DROP INDEX "public"."LeadMaster_email_vendor_id_key";

-- AlterTable
ALTER TABLE "public"."LeadMaster" ALTER COLUMN "email" DROP NOT NULL;
