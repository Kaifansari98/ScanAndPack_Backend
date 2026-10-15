CREATE TYPE "FabricationType" AS ENUM ('METALWORK', 'WOODWORK');

ALTER TABLE "CutList" ADD COLUMN "fabrication" "FabricationType" NOT NULL DEFAULT 'WOODWORK';
ALTER TABLE "CutList" ADD COLUMN "image_key" TEXT;

CREATE INDEX "CutList_project_id_fabrication_idx" ON "CutList"("project_id", "fabrication");
