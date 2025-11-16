-- AlterTable
ALTER TABLE "LeadMaster" ADD COLUMN     "actual_installation_start_date" TIMESTAMP(3),
ADD COLUMN     "carcass_installation_completion_date" TIMESTAMP(3),
ADD COLUMN     "expected_installation_end_date" TIMESTAMP(3),
ADD COLUMN     "is_carcass_installation_completed" BOOLEAN DEFAULT false,
ADD COLUMN     "is_shutter_installation_completed" BOOLEAN DEFAULT false,
ADD COLUMN     "shutter_installation_completion_date" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "CarpentersTeamsMaster" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "team_name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_by" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CarpentersTeamsMaster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CarpentersTeamsMapping" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "account_id" INTEGER NOT NULL,
    "lead_id" INTEGER NOT NULL,
    "team_id" INTEGER NOT NULL,
    "assigned_by" INTEGER NOT NULL,
    "assigned_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CarpentersTeamsMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstallationUpdate" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "account_id" INTEGER NOT NULL,
    "lead_id" INTEGER NOT NULL,
    "update_date" TIMESTAMP(3) NOT NULL,
    "remark" VARCHAR(2000),
    "created_by" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InstallationUpdate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstallationUpdateDocuments" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "installation_update_id" INTEGER NOT NULL,
    "document_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InstallationUpdateDocuments_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "CarpentersTeamsMaster" ADD CONSTRAINT "CarpentersTeamsMaster_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarpentersTeamsMaster" ADD CONSTRAINT "CarpentersTeamsMaster_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "UserMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarpentersTeamsMapping" ADD CONSTRAINT "CarpentersTeamsMapping_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarpentersTeamsMapping" ADD CONSTRAINT "CarpentersTeamsMapping_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "AccountMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarpentersTeamsMapping" ADD CONSTRAINT "CarpentersTeamsMapping_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "LeadMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarpentersTeamsMapping" ADD CONSTRAINT "CarpentersTeamsMapping_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "CarpentersTeamsMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarpentersTeamsMapping" ADD CONSTRAINT "CarpentersTeamsMapping_assigned_by_fkey" FOREIGN KEY ("assigned_by") REFERENCES "UserMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstallationUpdate" ADD CONSTRAINT "InstallationUpdate_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstallationUpdate" ADD CONSTRAINT "InstallationUpdate_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "AccountMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstallationUpdate" ADD CONSTRAINT "InstallationUpdate_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "LeadMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstallationUpdate" ADD CONSTRAINT "InstallationUpdate_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "UserMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstallationUpdateDocuments" ADD CONSTRAINT "InstallationUpdateDocuments_installation_update_id_fkey" FOREIGN KEY ("installation_update_id") REFERENCES "InstallationUpdate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstallationUpdateDocuments" ADD CONSTRAINT "InstallationUpdateDocuments_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "LeadDocuments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstallationUpdateDocuments" ADD CONSTRAINT "InstallationUpdateDocuments_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;
