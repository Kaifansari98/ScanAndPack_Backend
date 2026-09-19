-- CreateTable
CREATE TABLE "factory_out_revert_logs" (
    "id" SERIAL NOT NULL,
    "box_id" INTEGER NOT NULL,
    "project_id" INTEGER NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "factory_out_at" TIMESTAMP(3) NOT NULL,
    "factory_out_by" INTEGER,
    "reverted_by" INTEGER NOT NULL,
    "reverted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "factory_out_revert_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "factory_out_revert_logs_vendor_id_project_id_box_id_idx" ON "factory_out_revert_logs"("vendor_id", "project_id", "box_id");

-- CreateIndex
CREATE INDEX "factory_out_revert_logs_reverted_by_idx" ON "factory_out_revert_logs"("reverted_by");

-- CreateIndex
CREATE INDEX "factory_out_revert_logs_reverted_at_idx" ON "factory_out_revert_logs"("reverted_at");

-- AddForeignKey
ALTER TABLE "factory_out_revert_logs" ADD CONSTRAINT "factory_out_revert_logs_box_id_fkey" FOREIGN KEY ("box_id") REFERENCES "BoxMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "factory_out_revert_logs" ADD CONSTRAINT "factory_out_revert_logs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "ProjectMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "factory_out_revert_logs" ADD CONSTRAINT "factory_out_revert_logs_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "factory_out_revert_logs" ADD CONSTRAINT "factory_out_revert_logs_reverted_by_fkey" FOREIGN KEY ("reverted_by") REFERENCES "UserMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "factory_out_revert_logs" ADD CONSTRAINT "factory_out_revert_logs_factory_out_by_fkey" FOREIGN KEY ("factory_out_by") REFERENCES "UserMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;
