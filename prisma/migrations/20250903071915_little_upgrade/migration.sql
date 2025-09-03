/*
  Warnings:

  - You are about to drop the column `doc_id` on the `LeadDesignMeeting` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "public"."LeadDesignMeeting" DROP CONSTRAINT "LeadDesignMeeting_doc_id_fkey";

-- AlterTable
ALTER TABLE "public"."LeadDesignMeeting" DROP COLUMN "doc_id";
