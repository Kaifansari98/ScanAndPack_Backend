/*
  Warnings:

  - You are about to drop the column `doc_type` on the `LeadDocuments` table. All the data in the column will be lost.
  - Added the required column `doc_type_id` to the `LeadDocuments` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "public"."LeadDocuments" DROP COLUMN "doc_type",
ADD COLUMN     "doc_type_id" INTEGER NOT NULL;

-- AddForeignKey
ALTER TABLE "public"."LeadDocuments" ADD CONSTRAINT "LeadDocuments_doc_type_id_fkey" FOREIGN KEY ("doc_type_id") REFERENCES "public"."DocumentTypeMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;
