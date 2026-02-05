-- AlterTable
ALTER TABLE "LeadDesignSelection"
ADD COLUMN "product_structure_instance_id" INTEGER;

-- AddForeignKey
ALTER TABLE "LeadDesignSelection"
ADD CONSTRAINT "LeadDesignSelection_product_structure_instance_id_fkey"
FOREIGN KEY ("product_structure_instance_id") REFERENCES "LeadProductStructureInstance"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
