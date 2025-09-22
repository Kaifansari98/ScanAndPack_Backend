-- AlterTable
ALTER TABLE "public"."UserLeadTask" ADD COLUMN     "updated_at" TIMESTAMP(3),
ADD COLUMN     "updated_by" INTEGER;
