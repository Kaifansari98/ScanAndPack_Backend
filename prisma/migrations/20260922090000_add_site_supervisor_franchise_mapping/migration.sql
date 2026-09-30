-- IF NOT EXISTS also supports installations where this model was added with db push.
CREATE TABLE IF NOT EXISTS "SiteSupervisorFranchiseMapping" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "franchise_id" INTEGER NOT NULL,
    "supervisor_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" INTEGER,
    "updated_by" INTEGER,
    CONSTRAINT "SiteSupervisorFranchiseMapping_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "SiteSupervisorFranchiseMapping_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SiteSupervisorFranchiseMapping_franchise_id_fkey" FOREIGN KEY ("franchise_id") REFERENCES "FranchiseMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SiteSupervisorFranchiseMapping_supervisor_id_fkey" FOREIGN KEY ("supervisor_id") REFERENCES "UserMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SiteSupervisorFranchiseMapping_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "UserMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "SiteSupervisorFranchiseMapping_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "UserMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
DROP INDEX IF EXISTS "SiteSupervisorFranchiseMapping_vendor_id_supervisor_id_key";
CREATE UNIQUE INDEX IF NOT EXISTS "SiteSupervisorFranchiseMapping_vendor_id_supervisor_id_fran_key"
    ON "SiteSupervisorFranchiseMapping"("vendor_id", "supervisor_id", "franchise_id");
CREATE INDEX IF NOT EXISTS "SiteSupervisorFranchiseMapping_vendor_id_idx" ON "SiteSupervisorFranchiseMapping"("vendor_id");
