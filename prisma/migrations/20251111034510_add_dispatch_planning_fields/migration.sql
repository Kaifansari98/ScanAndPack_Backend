-- AlterTable
ALTER TABLE "LeadMaster" ADD COLUMN     "dispatch_planning_remark" VARCHAR(2000),
ADD COLUMN     "material_lift_availability" BOOLEAN DEFAULT false,
ADD COLUMN     "onsite_contact_person_name" TEXT,
ADD COLUMN     "onsite_contact_person_number" TEXT,
ADD COLUMN     "required_date_for_dispatch" TIMESTAMP(3);
