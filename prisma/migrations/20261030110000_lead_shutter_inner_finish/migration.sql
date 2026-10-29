-- Lead specification shutter rows can record a Shutter Inner Finish (optional)
ALTER TABLE "LeadShutterMaterialMapping" ADD COLUMN "shutter_inner_finish_id" INTEGER;

CREATE INDEX "LeadShutterMaterialMapping_shutter_inner_finish_id_idx" ON "LeadShutterMaterialMapping"("shutter_inner_finish_id");

ALTER TABLE "LeadShutterMaterialMapping" ADD CONSTRAINT "LeadShutterMaterialMapping_shutter_inner_finish_id_fkey" FOREIGN KEY ("shutter_inner_finish_id") REFERENCES "ShutterInnerFinishMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;
