-- CreateTable
CREATE TABLE "ProductsRequiredForProduction" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "franchise_id" INTEGER NOT NULL,
    "lead_id" INTEGER NOT NULL,
    "product_type_id" INTEGER,
    "instance_id" INTEGER,
    "product_id" INTEGER NOT NULL,
    "article_code" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "qty" DECIMAL(12,2) NOT NULL,
    "unit" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" INTEGER NOT NULL,

    CONSTRAINT "ProductsRequiredForProduction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductsRequiredForProduction_vendor_id_franchise_id_lead_i_idx" ON "ProductsRequiredForProduction"("vendor_id", "franchise_id", "lead_id");

-- CreateIndex
CREATE INDEX "ProductsRequiredForProduction_franchise_id_idx" ON "ProductsRequiredForProduction"("franchise_id");

-- CreateIndex
CREATE INDEX "ProductsRequiredForProduction_lead_id_idx" ON "ProductsRequiredForProduction"("lead_id");

-- CreateIndex
CREATE INDEX "ProductsRequiredForProduction_product_type_id_idx" ON "ProductsRequiredForProduction"("product_type_id");

-- CreateIndex
CREATE INDEX "ProductsRequiredForProduction_instance_id_idx" ON "ProductsRequiredForProduction"("instance_id");

-- CreateIndex
CREATE INDEX "ProductsRequiredForProduction_product_id_idx" ON "ProductsRequiredForProduction"("product_id");

-- CreateIndex
CREATE INDEX "ProductsRequiredForProduction_created_by_idx" ON "ProductsRequiredForProduction"("created_by");

-- AddForeignKey
ALTER TABLE "ProductsRequiredForProduction" ADD CONSTRAINT "ProductsRequiredForProduction_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductsRequiredForProduction" ADD CONSTRAINT "ProductsRequiredForProduction_franchise_id_fkey" FOREIGN KEY ("franchise_id") REFERENCES "FranchiseMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductsRequiredForProduction" ADD CONSTRAINT "ProductsRequiredForProduction_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "LeadMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductsRequiredForProduction" ADD CONSTRAINT "ProductsRequiredForProduction_product_type_id_fkey" FOREIGN KEY ("product_type_id") REFERENCES "ProductTypeMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductsRequiredForProduction" ADD CONSTRAINT "ProductsRequiredForProduction_instance_id_fkey" FOREIGN KEY ("instance_id") REFERENCES "LeadProductStructureInstance"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductsRequiredForProduction" ADD CONSTRAINT "ProductsRequiredForProduction_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "ProductMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductsRequiredForProduction" ADD CONSTRAINT "ProductsRequiredForProduction_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "UserMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
