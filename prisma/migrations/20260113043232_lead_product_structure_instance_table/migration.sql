-- CreateEnum
CREATE TYPE "ProductInstanceStatus" AS ENUM ('open', 'onHold', 'lostApproval', 'lost');

-- CreateTable
CREATE TABLE "LeadProductStructureInstance" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "lead_id" INTEGER NOT NULL,
    "account_id" INTEGER NOT NULL,
    "product_type_id" INTEGER NOT NULL,
    "product_structure_id" INTEGER NOT NULL,
    "quantity_index" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "status" "ProductInstanceStatus" NOT NULL DEFAULT 'open',
    "description" VARCHAR(2000),
    "created_by" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" INTEGER,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeadProductStructureInstance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LeadProductStructureInstance_lead_id_vendor_id_product_stru_key" ON "LeadProductStructureInstance"("lead_id", "vendor_id", "product_structure_id", "quantity_index");

-- AddForeignKey
ALTER TABLE "LeadProductStructureInstance" ADD CONSTRAINT "LeadProductStructureInstance_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadProductStructureInstance" ADD CONSTRAINT "LeadProductStructureInstance_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "LeadMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadProductStructureInstance" ADD CONSTRAINT "LeadProductStructureInstance_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "AccountMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadProductStructureInstance" ADD CONSTRAINT "LeadProductStructureInstance_product_type_id_fkey" FOREIGN KEY ("product_type_id") REFERENCES "ProductTypeMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadProductStructureInstance" ADD CONSTRAINT "LeadProductStructureInstance_product_structure_id_fkey" FOREIGN KEY ("product_structure_id") REFERENCES "ProductStructure"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadProductStructureInstance" ADD CONSTRAINT "LeadProductStructureInstance_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "UserMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;
