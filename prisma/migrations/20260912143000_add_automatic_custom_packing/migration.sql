ALTER TABLE "BoxMaster"
ADD COLUMN "sequence_no" INTEGER,
ADD COLUMN "product_group_name" TEXT,
ADD COLUMN "packing_group_name" TEXT,
ADD COLUMN "product_set_no" INTEGER,
ADD COLUMN "box_position" INTEGER,
ADD COLUMN "boxes_per_product" INTEGER,
ADD COLUMN "is_auto_created" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "CutListMachineMapping"
ADD COLUMN "project_location_product_quantity_id" INTEGER;

CREATE UNIQUE INDEX "BoxMaster_project_id_sequence_no_key"
ON "BoxMaster"("project_id", "sequence_no");

CREATE INDEX "idx_box_auto_packing_lookup"
ON "BoxMaster"("project_id", "product_group_name", "packing_group_name", "box_status");

CREATE INDEX "idx_clmm_location_product_scan"
ON "CutListMachineMapping"(
  "project_location_product_quantity_id",
  "cut_list_id",
  "actual_in_at"
);

ALTER TABLE "CutListMachineMapping"
ADD CONSTRAINT "CutListMachineMapping_project_location_product_quantity_id_fkey"
FOREIGN KEY ("project_location_product_quantity_id")
REFERENCES "ProjectLocationProductQuantity"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
