-- AlterTable
ALTER TABLE "LeadDocuments" ADD COLUMN     "product_structure_instance_id" INTEGER;

-- AddForeignKey
ALTER TABLE "LeadDocuments" ADD CONSTRAINT "LeadDocuments_product_structure_instance_id_fkey" FOREIGN KEY ("product_structure_instance_id") REFERENCES "LeadProductStructureInstance"("id") ON DELETE SET NULL ON UPDATE CASCADE;
