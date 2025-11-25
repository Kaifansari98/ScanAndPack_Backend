-- CreateTable
CREATE TABLE "InstallationIssueLogMaster" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "lead_id" INTEGER NOT NULL,
    "account_id" INTEGER NOT NULL,
    "issue_description" TEXT NOT NULL,
    "issue_impact" TEXT,
    "created_by" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InstallationIssueLogMaster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IssueLogTypeMaster" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "created_by" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IssueLogTypeMaster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IssueLogTypeMapping" (
    "id" SERIAL NOT NULL,
    "issue_log_id" INTEGER NOT NULL,
    "type_id" INTEGER NOT NULL,

    CONSTRAINT "IssueLogTypeMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IssueLogResponsibleTeamMapping" (
    "id" SERIAL NOT NULL,
    "issue_log_id" INTEGER NOT NULL,
    "team_id" INTEGER NOT NULL,

    CONSTRAINT "IssueLogResponsibleTeamMapping_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "IssueLogTypeMapping_issue_log_id_type_id_key" ON "IssueLogTypeMapping"("issue_log_id", "type_id");

-- CreateIndex
CREATE UNIQUE INDEX "IssueLogResponsibleTeamMapping_issue_log_id_team_id_key" ON "IssueLogResponsibleTeamMapping"("issue_log_id", "team_id");

-- AddForeignKey
ALTER TABLE "InstallationIssueLogMaster" ADD CONSTRAINT "InstallationIssueLogMaster_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstallationIssueLogMaster" ADD CONSTRAINT "InstallationIssueLogMaster_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "LeadMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstallationIssueLogMaster" ADD CONSTRAINT "InstallationIssueLogMaster_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "AccountMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstallationIssueLogMaster" ADD CONSTRAINT "InstallationIssueLogMaster_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "UserMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IssueLogTypeMaster" ADD CONSTRAINT "IssueLogTypeMaster_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IssueLogTypeMapping" ADD CONSTRAINT "IssueLogTypeMapping_issue_log_id_fkey" FOREIGN KEY ("issue_log_id") REFERENCES "InstallationIssueLogMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IssueLogTypeMapping" ADD CONSTRAINT "IssueLogTypeMapping_type_id_fkey" FOREIGN KEY ("type_id") REFERENCES "IssueLogTypeMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IssueLogResponsibleTeamMapping" ADD CONSTRAINT "IssueLogResponsibleTeamMapping_issue_log_id_fkey" FOREIGN KEY ("issue_log_id") REFERENCES "InstallationIssueLogMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IssueLogResponsibleTeamMapping" ADD CONSTRAINT "IssueLogResponsibleTeamMapping_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "MiscellaneousTeamMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;
