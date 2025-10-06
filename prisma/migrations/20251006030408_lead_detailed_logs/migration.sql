-- CreateEnum
CREATE TYPE "ActionType" AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'UPLOAD', 'STATUS_CHANGE', 'OTHER');

-- CreateTable
CREATE TABLE "LeadDetailedLogs" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "lead_id" INTEGER NOT NULL,
    "account_id" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "action_type" "ActionType" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" INTEGER NOT NULL,

    CONSTRAINT "LeadDetailedLogs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadDocumentLogs" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "lead_id" INTEGER NOT NULL,
    "account_id" INTEGER NOT NULL,
    "doc_id" INTEGER NOT NULL,
    "lead_logs_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" INTEGER NOT NULL,

    CONSTRAINT "LeadDocumentLogs_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "LeadDetailedLogs" ADD CONSTRAINT "LeadDetailedLogs_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadDetailedLogs" ADD CONSTRAINT "LeadDetailedLogs_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "LeadMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadDetailedLogs" ADD CONSTRAINT "LeadDetailedLogs_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "AccountMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadDetailedLogs" ADD CONSTRAINT "LeadDetailedLogs_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "UserMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadDocumentLogs" ADD CONSTRAINT "LeadDocumentLogs_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadDocumentLogs" ADD CONSTRAINT "LeadDocumentLogs_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "LeadMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadDocumentLogs" ADD CONSTRAINT "LeadDocumentLogs_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "AccountMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadDocumentLogs" ADD CONSTRAINT "LeadDocumentLogs_doc_id_fkey" FOREIGN KEY ("doc_id") REFERENCES "LeadDocuments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadDocumentLogs" ADD CONSTRAINT "LeadDocumentLogs_lead_logs_id_fkey" FOREIGN KEY ("lead_logs_id") REFERENCES "LeadDetailedLogs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadDocumentLogs" ADD CONSTRAINT "LeadDocumentLogs_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "UserMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
