ALTER TABLE "FranchiseMaster" ADD COLUMN "online_lead_sales_executive_id" INTEGER;
CREATE INDEX "FranchiseMaster_online_lead_sales_executive_id_idx" ON "FranchiseMaster"("online_lead_sales_executive_id");
ALTER TABLE "FranchiseMaster" ADD CONSTRAINT "FranchiseMaster_online_lead_sales_executive_id_fkey" FOREIGN KEY ("online_lead_sales_executive_id") REFERENCES "UserMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;
