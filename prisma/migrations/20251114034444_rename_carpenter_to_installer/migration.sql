/*
  Warnings:

  - You are about to drop the `CarpentersTeamsMapping` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `CarpentersTeamsMaster` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "public"."CarpentersTeamsMapping" DROP CONSTRAINT "CarpentersTeamsMapping_account_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."CarpentersTeamsMapping" DROP CONSTRAINT "CarpentersTeamsMapping_assigned_by_fkey";

-- DropForeignKey
ALTER TABLE "public"."CarpentersTeamsMapping" DROP CONSTRAINT "CarpentersTeamsMapping_lead_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."CarpentersTeamsMapping" DROP CONSTRAINT "CarpentersTeamsMapping_team_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."CarpentersTeamsMapping" DROP CONSTRAINT "CarpentersTeamsMapping_vendor_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."CarpentersTeamsMaster" DROP CONSTRAINT "CarpentersTeamsMaster_created_by_fkey";

-- DropForeignKey
ALTER TABLE "public"."CarpentersTeamsMaster" DROP CONSTRAINT "CarpentersTeamsMaster_vendor_id_fkey";

-- DropTable
DROP TABLE "public"."CarpentersTeamsMapping";

-- DropTable
DROP TABLE "public"."CarpentersTeamsMaster";

-- CreateTable
CREATE TABLE "InstallerUserMaster" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "installer_name" TEXT NOT NULL,
    "contact_number" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_by" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InstallerUserMaster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstallerUserMapping" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "account_id" INTEGER NOT NULL,
    "lead_id" INTEGER NOT NULL,
    "installer_id" INTEGER NOT NULL,
    "assigned_by" INTEGER NOT NULL,
    "assigned_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InstallerUserMapping_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "InstallerUserMaster" ADD CONSTRAINT "InstallerUserMaster_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstallerUserMaster" ADD CONSTRAINT "InstallerUserMaster_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "UserMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstallerUserMapping" ADD CONSTRAINT "InstallerUserMapping_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstallerUserMapping" ADD CONSTRAINT "InstallerUserMapping_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "AccountMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstallerUserMapping" ADD CONSTRAINT "InstallerUserMapping_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "LeadMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstallerUserMapping" ADD CONSTRAINT "InstallerUserMapping_installer_id_fkey" FOREIGN KEY ("installer_id") REFERENCES "InstallerUserMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstallerUserMapping" ADD CONSTRAINT "InstallerUserMapping_assigned_by_fkey" FOREIGN KEY ("assigned_by") REFERENCES "UserMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;
