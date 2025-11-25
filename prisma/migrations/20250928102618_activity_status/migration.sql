-- CreateEnum
CREATE TYPE "public"."ActivityStatus" AS ENUM ('onGoing', 'onHold', 'lost');

-- AlterTable
ALTER TABLE "public"."LeadMaster" ADD COLUMN     "activity_status" "public"."ActivityStatus" NOT NULL DEFAULT 'onGoing',
ADD COLUMN     "activity_status_remark" VARCHAR(2000);
