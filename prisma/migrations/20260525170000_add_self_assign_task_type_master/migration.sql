ALTER TABLE "VendorMaster"
ADD COLUMN "is_self_assign_task_type_master_enabed" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE "SelfAssignTaskTypeMaster" (
  "id" SERIAL NOT NULL,
  "vendor_id" INTEGER NOT NULL,
  "type" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "SelfAssignTaskTypeMaster_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SelfAssignTaskTypeMaster_vendor_id_idx"
ON "SelfAssignTaskTypeMaster"("vendor_id");

ALTER TABLE "SelfAssignTaskTypeMaster"
ADD CONSTRAINT "SelfAssignTaskTypeMaster_vendor_id_fkey"
FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
