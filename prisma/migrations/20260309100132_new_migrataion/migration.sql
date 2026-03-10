-- CreateEnum
CREATE TYPE "MachineTypeMasterStatus" AS ENUM ('YES', 'NO');

-- CreateEnum
CREATE TYPE "ActiveStatus" AS ENUM ('Yes', 'No');

-- CreateEnum
CREATE TYPE "ModulesVendorMappingActiveStatus" AS ENUM ('Yes', 'No');

-- CreateEnum
CREATE TYPE "MachineStatus" AS ENUM ('ACTIVE', 'MAINTENANCE', 'INACTIVE', 'RETIRED');

-- CreateEnum
CREATE TYPE "ScanType" AS ENUM ('IN', 'OUT', 'BOTH', 'PASS');

-- CreateEnum
CREATE TYPE "UserMachineStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- AlterEnum
ALTER TYPE "TechCheckStatus" ADD VALUE 'REVISED';

-- AlterTable
ALTER TABLE "AccountMaster" ADD COLUMN     "franchise_id" INTEGER;

-- AlterTable
ALTER TABLE "LeadMaster" ADD COLUMN     "franchise_id" INTEGER,
ADD COLUMN     "order_login_prod_files_remark" TEXT,
ADD COLUMN     "usable_handover_completed" BOOLEAN DEFAULT false,
ALTER COLUMN "material_lift_availability" DROP DEFAULT;

-- AlterTable
ALTER TABLE "LeadProductStructureInstance" ADD COLUMN     "is_order_login_filled" BOOLEAN DEFAULT false;

-- AlterTable
ALTER TABLE "MiscellaneousMaster" ADD COLUMN     "exp_of_rejection" TEXT,
ADD COLUMN     "misc_approved" BOOLEAN,
ADD COLUMN     "required_delivery_date" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "ProjectMaster" ADD COLUMN     "lead_id" INTEGER,
ADD COLUMN     "track_trace_status" TEXT NOT NULL DEFAULT 'Not Started',
ALTER COLUMN "client_id" DROP NOT NULL,
ALTER COLUMN "client_id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "UserLeadTask" ADD COLUMN     "franchise_id" INTEGER,
ADD COLUMN     "instance_id" INTEGER;

-- AlterTable
ALTER TABLE "UserMaster" ADD COLUMN     "franchise_id" INTEGER;

-- CreateTable
CREATE TABLE "ModulesMaster" (
    "id" SERIAL NOT NULL,
    "module_name" TEXT NOT NULL,
    "module_code" TEXT NOT NULL,
    "active" "ActiveStatus" NOT NULL DEFAULT 'Yes',

    CONSTRAINT "ModulesMaster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorModulesMapping" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "module_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" INTEGER NOT NULL,
    "updated_by" INTEGER,
    "updated_at" TIMESTAMP(3),
    "active" "ModulesVendorMappingActiveStatus" NOT NULL DEFAULT 'Yes',

    CONSTRAINT "VendorModulesMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MachineMaster" (
    "id" SERIAL NOT NULL,
    "machine_name" TEXT NOT NULL,
    "machine_code" TEXT NOT NULL,
    "machine_type" TEXT,
    "machine_type_id" INTEGER,
    "status" "MachineStatus" NOT NULL DEFAULT 'ACTIVE',
    "scan_type" "ScanType" NOT NULL,
    "description" TEXT,
    "vendor_id" INTEGER NOT NULL,
    "factory_id" INTEGER,
    "sequence_no" INTEGER,
    "target_per_hour" DECIMAL(65,30),
    "image_path" TEXT,
    "created_by" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" INTEGER NOT NULL,

    CONSTRAINT "MachineMaster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CutList" (
    "id" SERIAL NOT NULL,
    "project_id" INTEGER NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "lead_id" INTEGER,
    "description" TEXT NOT NULL,
    "length" DECIMAL(18,2),
    "width" DECIMAL(18,2),
    "thickness" DECIMAL(18,2),
    "qty" INTEGER NOT NULL,
    "material_details" TEXT NOT NULL,
    "item_name" TEXT NOT NULL,
    "unique_code" TEXT,
    "unique_code_2" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_by" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" INTEGER,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "elf" TEXT,
    "elb" TEXT,
    "esl" TEXT,
    "esr" TEXT,

    CONSTRAINT "CutList_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CutListMachineMapping" (
    "id" SERIAL NOT NULL,
    "cut_list_id" INTEGER NOT NULL,
    "machine_id" INTEGER NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "lead_id" INTEGER,
    "project_id" INTEGER NOT NULL,
    "sequence_no" INTEGER NOT NULL,
    "is_optional" BOOLEAN NOT NULL DEFAULT false,
    "expected_in" BOOLEAN NOT NULL DEFAULT false,
    "expected_out" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL,
    "actual_in_at" TIMESTAMP(3),
    "actual_out_at" TIMESTAMP(3),
    "in_operator" INTEGER,
    "out_operator" INTEGER,
    "created_by" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CutListMachineMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserMachineMapping" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "machine_id" INTEGER NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "status" "UserMachineStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_by" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" INTEGER NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserMachineMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderLoginPoFileMapping" (
    "id" SERIAL NOT NULL,
    "orderlogin_id" INTEGER NOT NULL,
    "lead_id" INTEGER NOT NULL,
    "document_id" INTEGER NOT NULL,
    "created_by" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" INTEGER,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "OrderLoginPoFileMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MachineTypeMaster" (
    "id" SERIAL NOT NULL,
    "machine_type" TEXT NOT NULL,
    "active" "MachineTypeMasterStatus" NOT NULL DEFAULT 'YES',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MachineTypeMaster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorSettingKey" (
    "id" SERIAL NOT NULL,
    "key" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "default_value" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VendorSettingKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorSetting" (
    "id" SERIAL NOT NULL,
    "setting_id" INTEGER NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "value" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VendorSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DefectMaster" (
    "id" SERIAL NOT NULL,
    "defect_name" TEXT NOT NULL,
    "vendor_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DefectMaster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DefectedItem" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "project_id" INTEGER NOT NULL,
    "cut_list_machine_mapping_id" INTEGER NOT NULL,
    "cut_list_id" INTEGER,
    "machine_id" INTEGER NOT NULL,
    "defect_id" INTEGER,
    "previous_scanned_by" INTEGER,
    "previous_scanned_at" TIMESTAMP(3),
    "previous_scanned_machine_id" INTEGER,
    "remark" TEXT,
    "created_by" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DefectedItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FranchiseMaster" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "franchise_name" TEXT NOT NULL,
    "franchise_code" TEXT,
    "contact_number" TEXT,
    "contact_email" TEXT,
    "contact_person" TEXT,
    "is_head_office" BOOLEAN NOT NULL DEFAULT false,
    "zone_id" INTEGER,
    "country_id" INTEGER,
    "region_id" INTEGER,
    "state_id" INTEGER,
    "city_id" INTEGER,
    "area_id" INTEGER,
    "address" TEXT,
    "pincode" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FranchiseMaster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HeadSiteSupervisorFranchiseMapping" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "franchise_id" INTEGER NOT NULL,
    "status" BOOLEAN NOT NULL DEFAULT true,
    "created_by" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HeadSiteSupervisorFranchiseMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CountryMaster" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "CountryMaster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegionMaster" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "country_id" INTEGER NOT NULL,

    CONSTRAINT "RegionMaster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StateMaster" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "region_id" INTEGER NOT NULL,

    CONSTRAINT "StateMaster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CityMaster" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "state_id" INTEGER NOT NULL,

    CONSTRAINT "CityMaster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AreaMaster" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "city_id" INTEGER NOT NULL,

    CONSTRAINT "AreaMaster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GeographicalMapping" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "country_id" INTEGER,
    "region_id" INTEGER,
    "state_id" INTEGER,
    "city_id" INTEGER,
    "area_id" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GeographicalMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserGeographicalMapping" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "geographical_id" INTEGER NOT NULL,

    CONSTRAINT "UserGeographicalMapping_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ModulesMaster_module_code_key" ON "ModulesMaster"("module_code");

-- CreateIndex
CREATE UNIQUE INDEX "MachineMaster_machine_code_key" ON "MachineMaster"("machine_code");

-- CreateIndex
CREATE INDEX "CutList_unique_code_idx" ON "CutList"("unique_code");

-- CreateIndex
CREATE INDEX "CutListMachineMapping_cut_list_id_idx" ON "CutListMachineMapping"("cut_list_id");

-- CreateIndex
CREATE INDEX "CutListMachineMapping_machine_id_idx" ON "CutListMachineMapping"("machine_id");

-- CreateIndex
CREATE INDEX "CutListMachineMapping_project_id_idx" ON "CutListMachineMapping"("project_id");

-- CreateIndex
CREATE INDEX "CutListMachineMapping_vendor_id_idx" ON "CutListMachineMapping"("vendor_id");

-- CreateIndex
CREATE INDEX "CutListMachineMapping_sequence_no_idx" ON "CutListMachineMapping"("sequence_no");

-- CreateIndex
CREATE INDEX "OrderLoginPoFileMapping_orderlogin_id_idx" ON "OrderLoginPoFileMapping"("orderlogin_id");

-- CreateIndex
CREATE INDEX "OrderLoginPoFileMapping_lead_id_idx" ON "OrderLoginPoFileMapping"("lead_id");

-- CreateIndex
CREATE INDEX "OrderLoginPoFileMapping_document_id_idx" ON "OrderLoginPoFileMapping"("document_id");

-- CreateIndex
CREATE UNIQUE INDEX "VendorSettingKey_key_key" ON "VendorSettingKey"("key");

-- CreateIndex
CREATE UNIQUE INDEX "VendorSetting_setting_id_vendor_id_key" ON "VendorSetting"("setting_id", "vendor_id");

-- CreateIndex
CREATE INDEX "DefectMaster_vendor_id_idx" ON "DefectMaster"("vendor_id");

-- CreateIndex
CREATE INDEX "DefectedItem_vendor_id_idx" ON "DefectedItem"("vendor_id");

-- CreateIndex
CREATE INDEX "DefectedItem_project_id_idx" ON "DefectedItem"("project_id");

-- CreateIndex
CREATE INDEX "DefectedItem_machine_id_idx" ON "DefectedItem"("machine_id");

-- CreateIndex
CREATE INDEX "DefectedItem_cut_list_machine_mapping_id_idx" ON "DefectedItem"("cut_list_machine_mapping_id");

-- CreateIndex
CREATE INDEX "DefectedItem_cut_list_id_idx" ON "DefectedItem"("cut_list_id");

-- CreateIndex
CREATE UNIQUE INDEX "FranchiseMaster_vendor_id_franchise_code_key" ON "FranchiseMaster"("vendor_id", "franchise_code");

-- CreateIndex
CREATE INDEX "HeadSiteSupervisorFranchiseMapping_vendor_id_idx" ON "HeadSiteSupervisorFranchiseMapping"("vendor_id");

-- CreateIndex
CREATE INDEX "HeadSiteSupervisorFranchiseMapping_user_id_idx" ON "HeadSiteSupervisorFranchiseMapping"("user_id");

-- CreateIndex
CREATE INDEX "HeadSiteSupervisorFranchiseMapping_franchise_id_idx" ON "HeadSiteSupervisorFranchiseMapping"("franchise_id");

-- CreateIndex
CREATE UNIQUE INDEX "HeadSiteSupervisorFranchiseMapping_vendor_id_user_id_franch_key" ON "HeadSiteSupervisorFranchiseMapping"("vendor_id", "user_id", "franchise_id");

-- CreateIndex
CREATE UNIQUE INDEX "HeadSiteSupervisorFranchiseMapping_vendor_id_franchise_id_key" ON "HeadSiteSupervisorFranchiseMapping"("vendor_id", "franchise_id");

-- CreateIndex
CREATE UNIQUE INDEX "UserGeographicalMapping_user_id_geographical_id_key" ON "UserGeographicalMapping"("user_id", "geographical_id");

-- AddForeignKey
ALTER TABLE "UserMaster" ADD CONSTRAINT "UserMaster_franchise_id_fkey" FOREIGN KEY ("franchise_id") REFERENCES "FranchiseMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMaster" ADD CONSTRAINT "ProjectMaster_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "LeadMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadMaster" ADD CONSTRAINT "LeadMaster_franchise_id_fkey" FOREIGN KEY ("franchise_id") REFERENCES "FranchiseMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountMaster" ADD CONSTRAINT "AccountMaster_franchise_id_fkey" FOREIGN KEY ("franchise_id") REFERENCES "FranchiseMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserLeadTask" ADD CONSTRAINT "UserLeadTask_instance_id_fkey" FOREIGN KEY ("instance_id") REFERENCES "LeadProductStructureInstance"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorModulesMapping" ADD CONSTRAINT "VendorModulesMapping_module_id_fkey" FOREIGN KEY ("module_id") REFERENCES "ModulesMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorModulesMapping" ADD CONSTRAINT "VendorModulesMapping_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MachineMaster" ADD CONSTRAINT "MachineMaster_machine_type_id_fkey" FOREIGN KEY ("machine_type_id") REFERENCES "MachineTypeMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MachineMaster" ADD CONSTRAINT "MachineMaster_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CutList" ADD CONSTRAINT "CutList_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "ProjectMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CutList" ADD CONSTRAINT "CutList_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CutList" ADD CONSTRAINT "CutList_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "LeadMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CutListMachineMapping" ADD CONSTRAINT "CutListMachineMapping_cut_list_id_fkey" FOREIGN KEY ("cut_list_id") REFERENCES "CutList"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CutListMachineMapping" ADD CONSTRAINT "CutListMachineMapping_machine_id_fkey" FOREIGN KEY ("machine_id") REFERENCES "MachineMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CutListMachineMapping" ADD CONSTRAINT "CutListMachineMapping_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "ProjectMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CutListMachineMapping" ADD CONSTRAINT "CutListMachineMapping_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CutListMachineMapping" ADD CONSTRAINT "CutListMachineMapping_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "LeadMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CutListMachineMapping" ADD CONSTRAINT "CutListMachineMapping_in_operator_fkey" FOREIGN KEY ("in_operator") REFERENCES "UserMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserMachineMapping" ADD CONSTRAINT "UserMachineMapping_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "UserMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserMachineMapping" ADD CONSTRAINT "UserMachineMapping_machine_id_fkey" FOREIGN KEY ("machine_id") REFERENCES "MachineMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserMachineMapping" ADD CONSTRAINT "UserMachineMapping_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "UserMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserMachineMapping" ADD CONSTRAINT "UserMachineMapping_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "UserMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserMachineMapping" ADD CONSTRAINT "UserMachineMapping_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderLoginPoFileMapping" ADD CONSTRAINT "OrderLoginPoFileMapping_orderlogin_id_fkey" FOREIGN KEY ("orderlogin_id") REFERENCES "OrderLoginDetails"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderLoginPoFileMapping" ADD CONSTRAINT "OrderLoginPoFileMapping_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "LeadMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderLoginPoFileMapping" ADD CONSTRAINT "OrderLoginPoFileMapping_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "LeadDocuments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderLoginPoFileMapping" ADD CONSTRAINT "OrderLoginPoFileMapping_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "UserMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderLoginPoFileMapping" ADD CONSTRAINT "OrderLoginPoFileMapping_deleted_by_fkey" FOREIGN KEY ("deleted_by") REFERENCES "UserMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorSetting" ADD CONSTRAINT "VendorSetting_setting_id_fkey" FOREIGN KEY ("setting_id") REFERENCES "VendorSettingKey"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorSetting" ADD CONSTRAINT "VendorSetting_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DefectMaster" ADD CONSTRAINT "DefectMaster_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DefectedItem" ADD CONSTRAINT "DefectedItem_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DefectedItem" ADD CONSTRAINT "DefectedItem_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "ProjectMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DefectedItem" ADD CONSTRAINT "DefectedItem_cut_list_machine_mapping_id_fkey" FOREIGN KEY ("cut_list_machine_mapping_id") REFERENCES "CutListMachineMapping"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DefectedItem" ADD CONSTRAINT "DefectedItem_cut_list_id_fkey" FOREIGN KEY ("cut_list_id") REFERENCES "CutList"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DefectedItem" ADD CONSTRAINT "DefectedItem_machine_id_fkey" FOREIGN KEY ("machine_id") REFERENCES "MachineMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DefectedItem" ADD CONSTRAINT "DefectedItem_defect_id_fkey" FOREIGN KEY ("defect_id") REFERENCES "DefectMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DefectedItem" ADD CONSTRAINT "DefectedItem_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "UserMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FranchiseMaster" ADD CONSTRAINT "FranchiseMaster_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HeadSiteSupervisorFranchiseMapping" ADD CONSTRAINT "HeadSiteSupervisorFranchiseMapping_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HeadSiteSupervisorFranchiseMapping" ADD CONSTRAINT "HeadSiteSupervisorFranchiseMapping_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "UserMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HeadSiteSupervisorFranchiseMapping" ADD CONSTRAINT "HeadSiteSupervisorFranchiseMapping_franchise_id_fkey" FOREIGN KEY ("franchise_id") REFERENCES "FranchiseMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HeadSiteSupervisorFranchiseMapping" ADD CONSTRAINT "HeadSiteSupervisorFranchiseMapping_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "UserMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegionMaster" ADD CONSTRAINT "RegionMaster_country_id_fkey" FOREIGN KEY ("country_id") REFERENCES "CountryMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StateMaster" ADD CONSTRAINT "StateMaster_region_id_fkey" FOREIGN KEY ("region_id") REFERENCES "RegionMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CityMaster" ADD CONSTRAINT "CityMaster_state_id_fkey" FOREIGN KEY ("state_id") REFERENCES "StateMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AreaMaster" ADD CONSTRAINT "AreaMaster_city_id_fkey" FOREIGN KEY ("city_id") REFERENCES "CityMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserGeographicalMapping" ADD CONSTRAINT "UserGeographicalMapping_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "UserMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserGeographicalMapping" ADD CONSTRAINT "UserGeographicalMapping_geographical_id_fkey" FOREIGN KEY ("geographical_id") REFERENCES "GeographicalMapping"("id") ON DELETE CASCADE ON UPDATE CASCADE;
