-- CreateTable
CREATE TABLE "SiteReadiness" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "account_id" INTEGER NOT NULL,
    "lead_id" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "remark" VARCHAR(2000),
    "value" BOOLEAN NOT NULL DEFAULT false,
    "created_by" INTEGER NOT NULL,
    "updated_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiteReadiness_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_LeadDocumentsToSiteReadiness" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL,

    CONSTRAINT "_LeadDocumentsToSiteReadiness_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "SiteReadiness_lead_id_vendor_id_type_idx" ON "SiteReadiness"("lead_id", "vendor_id", "type");

-- CreateIndex
CREATE INDEX "_LeadDocumentsToSiteReadiness_B_index" ON "_LeadDocumentsToSiteReadiness"("B");

-- AddForeignKey
ALTER TABLE "SiteReadiness" ADD CONSTRAINT "SiteReadiness_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteReadiness" ADD CONSTRAINT "SiteReadiness_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "AccountMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteReadiness" ADD CONSTRAINT "SiteReadiness_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "LeadMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteReadiness" ADD CONSTRAINT "SiteReadiness_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "UserMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteReadiness" ADD CONSTRAINT "SiteReadiness_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "UserMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_LeadDocumentsToSiteReadiness" ADD CONSTRAINT "_LeadDocumentsToSiteReadiness_A_fkey" FOREIGN KEY ("A") REFERENCES "LeadDocuments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_LeadDocumentsToSiteReadiness" ADD CONSTRAINT "_LeadDocumentsToSiteReadiness_B_fkey" FOREIGN KEY ("B") REFERENCES "SiteReadiness"("id") ON DELETE CASCADE ON UPDATE CASCADE;
