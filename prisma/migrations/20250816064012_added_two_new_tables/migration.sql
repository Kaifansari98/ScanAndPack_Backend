-- CreateTable
CREATE TABLE "public"."ProductStructure" (
    "id" SERIAL NOT NULL,
    "type" TEXT NOT NULL,
    "vendor_id" INTEGER NOT NULL,

    CONSTRAINT "ProductStructure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."LeadProductStructureMapping" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "lead_id" INTEGER NOT NULL,
    "account_id" INTEGER NOT NULL,
    "product_structure_id" INTEGER NOT NULL,
    "created_by" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadProductStructureMapping_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."ProductStructure" ADD CONSTRAINT "ProductStructure_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "public"."VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LeadProductStructureMapping" ADD CONSTRAINT "LeadProductStructureMapping_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "public"."VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LeadProductStructureMapping" ADD CONSTRAINT "LeadProductStructureMapping_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."LeadMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LeadProductStructureMapping" ADD CONSTRAINT "LeadProductStructureMapping_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."AccountMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LeadProductStructureMapping" ADD CONSTRAINT "LeadProductStructureMapping_product_structure_id_fkey" FOREIGN KEY ("product_structure_id") REFERENCES "public"."ProductStructure"("id") ON DELETE CASCADE ON UPDATE CASCADE;
