-- CreateTable
CREATE TABLE "WalkinLeadQuestionnaire" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "product_type_id" INTEGER NOT NULL,
    "questions" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by" INTEGER NOT NULL,
    "updated_by" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WalkinLeadQuestionnaire_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WalkinLeadResponse" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "lead_id" INTEGER NOT NULL,
    "product_type_id" INTEGER NOT NULL,
    "questionnaire_key" TEXT NOT NULL,
    "questionnaire_version" INTEGER NOT NULL,
    "question_snapshot" JSONB NOT NULL,
    "answers" JSONB NOT NULL,
    "is_complete" BOOLEAN NOT NULL DEFAULT false,
    "created_by" INTEGER NOT NULL,
    "updated_by" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WalkinLeadResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WalkinLeadUpload" (
    "id" TEXT NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "created_by" INTEGER NOT NULL,
    "original_name" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WalkinLeadUpload_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WalkinLeadQuestionnaire_vendor_id_product_type_id_key" ON "WalkinLeadQuestionnaire"("vendor_id", "product_type_id");

-- CreateIndex
CREATE INDEX "WalkinLeadResponse_vendor_id_lead_id_idx" ON "WalkinLeadResponse"("vendor_id", "lead_id");

-- CreateIndex
CREATE UNIQUE INDEX "WalkinLeadResponse_lead_id_product_type_id_key" ON "WalkinLeadResponse"("lead_id", "product_type_id");

-- CreateIndex
CREATE UNIQUE INDEX "WalkinLeadUpload_storage_key_key" ON "WalkinLeadUpload"("storage_key");

-- CreateIndex
CREATE INDEX "WalkinLeadUpload_vendor_id_created_by_idx" ON "WalkinLeadUpload"("vendor_id", "created_by");

-- AddForeignKey
ALTER TABLE "WalkinLeadQuestionnaire" ADD CONSTRAINT "WalkinLeadQuestionnaire_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalkinLeadQuestionnaire" ADD CONSTRAINT "WalkinLeadQuestionnaire_product_type_id_fkey" FOREIGN KEY ("product_type_id") REFERENCES "ProductTypeMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalkinLeadResponse" ADD CONSTRAINT "WalkinLeadResponse_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalkinLeadResponse" ADD CONSTRAINT "WalkinLeadResponse_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "LeadMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalkinLeadResponse" ADD CONSTRAINT "WalkinLeadResponse_product_type_id_fkey" FOREIGN KEY ("product_type_id") REFERENCES "ProductTypeMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalkinLeadUpload" ADD CONSTRAINT "WalkinLeadUpload_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;
