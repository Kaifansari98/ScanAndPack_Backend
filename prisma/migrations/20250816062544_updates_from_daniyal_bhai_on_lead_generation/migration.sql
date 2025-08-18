/*
  Warnings:

  - You are about to drop the column `deleted_at` on the `LeadProductMapping` table. All the data in the column will be lost.
  - You are about to drop the column `deleted_by` on the `LeadProductMapping` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "public"."LeadProductMapping" DROP CONSTRAINT "LeadProductMapping_deleted_by_fkey";

-- AlterTable
ALTER TABLE "public"."AccountMaster" ALTER COLUMN "email" DROP NOT NULL;

-- AlterTable
ALTER TABLE "public"."LeadMaster" ALTER COLUMN "email" DROP NOT NULL,
ALTER COLUMN "site_type_id" DROP NOT NULL,
ALTER COLUMN "archetech_name" DROP NOT NULL,
ALTER COLUMN "designer_remark" DROP NOT NULL;

-- AlterTable
ALTER TABLE "public"."LeadProductMapping" DROP COLUMN "deleted_at",
DROP COLUMN "deleted_by";
