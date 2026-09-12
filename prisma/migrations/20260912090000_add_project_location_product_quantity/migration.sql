CREATE TABLE "ProjectLocationProductQuantity" (
    "id" SERIAL NOT NULL,
    "project_id" INTEGER NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "location_name" TEXT NOT NULL,
    "group_name" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectLocationProductQuantity_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ProjectLocationProductQuantity_qty_check" CHECK ("qty" >= 0)
);

CREATE UNIQUE INDEX "ProjectLocationProductQuantity_project_id_location_name_group_name_key"
ON "ProjectLocationProductQuantity"("project_id", "location_name", "group_name");

CREATE INDEX "ProjectLocationProductQuantity_vendor_id_project_id_idx"
ON "ProjectLocationProductQuantity"("vendor_id", "project_id");

ALTER TABLE "ProjectLocationProductQuantity"
ADD CONSTRAINT "ProjectLocationProductQuantity_project_id_fkey"
FOREIGN KEY ("project_id") REFERENCES "ProjectMaster"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
