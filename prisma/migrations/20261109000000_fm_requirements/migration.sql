-- CreateTable
CREATE TABLE "FMRequirementMaster" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "product_type_id" INTEGER NOT NULL,
    "fields" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by" INTEGER NOT NULL,
    "updated_by" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FMRequirementMaster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FMRequirementResponse" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "lead_id" INTEGER NOT NULL,
    "product_type_id" INTEGER NOT NULL,
    "revision" TEXT NOT NULL,
    "field_snapshot" JSONB NOT NULL,
    "answers" JSONB NOT NULL,
    "is_complete" BOOLEAN NOT NULL DEFAULT false,
    "created_by" INTEGER NOT NULL,
    "updated_by" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FMRequirementResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FMRequirementUpload" (
    "id" TEXT NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "lead_id" INTEGER NOT NULL,
    "created_by" INTEGER NOT NULL,
    "original_name" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FMRequirementUpload_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FMRequirementMaster_vendor_id_product_type_id_key" ON "FMRequirementMaster"("vendor_id", "product_type_id");

-- CreateIndex
CREATE INDEX "FMRequirementResponse_vendor_id_lead_id_idx" ON "FMRequirementResponse"("vendor_id", "lead_id");

-- CreateIndex
CREATE UNIQUE INDEX "FMRequirementResponse_lead_id_product_type_id_key" ON "FMRequirementResponse"("lead_id", "product_type_id");

-- CreateIndex
CREATE UNIQUE INDEX "FMRequirementUpload_storage_key_key" ON "FMRequirementUpload"("storage_key");

-- CreateIndex
CREATE INDEX "FMRequirementUpload_vendor_id_lead_id_idx" ON "FMRequirementUpload"("vendor_id", "lead_id");

-- AddForeignKey
ALTER TABLE "FMRequirementMaster" ADD CONSTRAINT "FMRequirementMaster_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FMRequirementMaster" ADD CONSTRAINT "FMRequirementMaster_product_type_id_fkey" FOREIGN KEY ("product_type_id") REFERENCES "ProductTypeMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FMRequirementResponse" ADD CONSTRAINT "FMRequirementResponse_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FMRequirementResponse" ADD CONSTRAINT "FMRequirementResponse_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "LeadMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FMRequirementResponse" ADD CONSTRAINT "FMRequirementResponse_product_type_id_fkey" FOREIGN KEY ("product_type_id") REFERENCES "ProductTypeMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FMRequirementUpload" ADD CONSTRAINT "FMRequirementUpload_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FMRequirementUpload" ADD CONSTRAINT "FMRequirementUpload_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "LeadMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;
