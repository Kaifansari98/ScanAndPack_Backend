-- AlterTable
ALTER TABLE "LeadSpecificationsMaster" ADD COLUMN     "item_code_id" INTEGER;

-- CreateIndex
CREATE INDEX "LeadSpecificationsMaster_item_code_id_idx" ON "LeadSpecificationsMaster"("item_code_id");

-- AddForeignKey
ALTER TABLE "LeadSpecificationsMaster" ADD CONSTRAINT "LeadSpecificationsMaster_item_code_id_fkey" FOREIGN KEY ("item_code_id") REFERENCES "ProductItemCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;
