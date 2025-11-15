-- CreateTable
CREATE TABLE "MiscellaneousMaster" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "lead_id" INTEGER NOT NULL,
    "account_id" INTEGER NOT NULL,
    "misc_type_id" INTEGER NOT NULL,
    "problem_description" TEXT NOT NULL,
    "reorder_material_details" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION,
    "cost" DOUBLE PRECISION,
    "supervisor_remark" TEXT,
    "expected_ready_date" TIMESTAMP(3),
    "is_resolved" BOOLEAN NOT NULL DEFAULT false,
    "resolved_at" TIMESTAMP(3),
    "created_by" INTEGER NOT NULL,
    "updated_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MiscellaneousMaster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MiscellaneousTypeMaster" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "created_by" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MiscellaneousTypeMaster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MiscellaneousTeamMaster" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "created_by" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MiscellaneousTeamMaster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MiscellaneousTeamMapping" (
    "id" SERIAL NOT NULL,
    "miscellaneous_id" INTEGER NOT NULL,
    "team_id" INTEGER NOT NULL,

    CONSTRAINT "MiscellaneousTeamMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MiscellaneousDocument" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "miscellaneous_id" INTEGER NOT NULL,
    "document_id" INTEGER NOT NULL,
    "created_by" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MiscellaneousDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MiscellaneousTeamMapping_miscellaneous_id_team_id_key" ON "MiscellaneousTeamMapping"("miscellaneous_id", "team_id");

-- AddForeignKey
ALTER TABLE "MiscellaneousMaster" ADD CONSTRAINT "MiscellaneousMaster_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MiscellaneousMaster" ADD CONSTRAINT "MiscellaneousMaster_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "LeadMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MiscellaneousMaster" ADD CONSTRAINT "MiscellaneousMaster_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "AccountMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MiscellaneousMaster" ADD CONSTRAINT "MiscellaneousMaster_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "UserMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MiscellaneousMaster" ADD CONSTRAINT "MiscellaneousMaster_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "UserMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MiscellaneousMaster" ADD CONSTRAINT "MiscellaneousMaster_misc_type_id_fkey" FOREIGN KEY ("misc_type_id") REFERENCES "MiscellaneousTypeMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MiscellaneousTypeMaster" ADD CONSTRAINT "MiscellaneousTypeMaster_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MiscellaneousTeamMaster" ADD CONSTRAINT "MiscellaneousTeamMaster_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MiscellaneousTeamMapping" ADD CONSTRAINT "MiscellaneousTeamMapping_miscellaneous_id_fkey" FOREIGN KEY ("miscellaneous_id") REFERENCES "MiscellaneousMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MiscellaneousTeamMapping" ADD CONSTRAINT "MiscellaneousTeamMapping_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "MiscellaneousTeamMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MiscellaneousDocument" ADD CONSTRAINT "MiscellaneousDocument_miscellaneous_id_fkey" FOREIGN KEY ("miscellaneous_id") REFERENCES "MiscellaneousMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MiscellaneousDocument" ADD CONSTRAINT "MiscellaneousDocument_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "LeadDocuments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MiscellaneousDocument" ADD CONSTRAINT "MiscellaneousDocument_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MiscellaneousDocument" ADD CONSTRAINT "MiscellaneousDocument_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "UserMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;
