-- AlterTable
ALTER TABLE "LeadMaster" ADD COLUMN     "dispatch_date" TIMESTAMP(3),
ADD COLUMN     "dispatch_remark" VARCHAR(2000),
ADD COLUMN     "driver_name" VARCHAR(255),
ADD COLUMN     "driver_number" VARCHAR(50),
ADD COLUMN     "vehicle_no" VARCHAR(100);
