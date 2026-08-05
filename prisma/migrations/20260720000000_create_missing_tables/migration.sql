/*
  Warnings:

  - A unique constraint covering the columns `[vendor_id,vendor_code]` on the table `CompanyVendorsMaster` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "BoxInfoFieldType" AS ENUM ('TEXT', 'NUMBER', 'DATE', 'TEXTAREA');

-- CreateEnum
CREATE TYPE "PackingType" AS ENUM ('DEFAULT', 'GROUPWISE');

-- CreateEnum
CREATE TYPE "AdditionalCostCalculationType" AS ENUM ('Fixed', 'Percentage');

-- CreateEnum
CREATE TYPE "CostingMethod" AS ENUM ('FIFO', 'MANUAL');

-- CreateEnum
CREATE TYPE "ProductItemType" AS ENUM ('CapitalGoods', 'Goods', 'Services');

-- CreateEnum
CREATE TYPE "PaymentScheduleAction" AS ENUM ('Created', 'Rescheduled', 'PaymentMarked', 'StatusChanged', 'Cancelled');

-- CreateEnum
CREATE TYPE "BroadcastType" AS ENUM ('CIRCULAR', 'DOCUMENT');

-- CreateEnum
CREATE TYPE "BroadcastStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "AudienceType" AS ENUM ('ALL', 'ROLE', 'USER', 'FRANCHISE');

-- CreateEnum
CREATE TYPE "AttachmentType" AS ENUM ('FILE', 'YOUTUBE');

-- CreateEnum
CREATE TYPE "NotificationSource" AS ENUM ('IN_APP', 'EMAIL');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "OtherApplianceType" AS ENUM ('Appliances', 'Stone', 'Sinks', 'Faucets');

-- DropForeignKey
ALTER TABLE "PurchaseIntentMaster" DROP CONSTRAINT "PurchaseIntentMaster_category_id_fkey";

-- DropIndex
DROP INDEX "CutListMachineMapping_sequence_no_idx";

-- AlterTable
ALTER TABLE "BoxMaster" ADD COLUMN     "packed_at" TIMESTAMP(3),
ADD COLUMN     "packed_by" INTEGER;

-- AlterTable
ALTER TABLE "ClientMaster" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "CompanyVendorsMaster" ADD COLUMN     "alternate_email" TEXT,
ADD COLUMN     "alternate_mobile_no" TEXT,
ADD COLUMN     "gst_no" TEXT,
ADD COLUMN     "is_active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "pan_no" TEXT,
ADD COLUMN     "primary_contact_id" INTEGER,
ADD COLUMN     "vendor_name" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "CutList" ADD COLUMN     "weight" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "FranchiseMaster" ADD COLUMN     "moduled_for_b2b" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "LeadMaster" ADD COLUMN     "architect_id" INTEGER,
ADD COLUMN     "isLargeScaleProjectLead" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "LeadProductStructureInstance" ADD COLUMN     "isLargeScaleProjectInstance" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "product_item_code_id" INTEGER,
ADD COLUMN     "quantity" INTEGER,
ADD COLUMN     "sub_product_structure_id" INTEGER;

-- AlterTable
ALTER TABLE "POPaymentSchedule" ADD COLUMN     "grn_id" INTEGER,
ADD COLUMN     "payment_term_stage_id" INTEGER;

-- AlterTable
ALTER TABLE "ProductMaster" ADD COLUMN     "consumption_unit_id" INTEGER,
ADD COLUMN     "costing_method" "CostingMethod" NOT NULL DEFAULT 'FIFO',
ADD COLUMN     "item_group_id" INTEGER,
ADD COLUMN     "item_type" "ProductItemType" NOT NULL DEFAULT 'Goods',
ADD COLUMN     "max_stock_qty" DECIMAL(18,3),
ADD COLUMN     "max_stock_unit_id" INTEGER,
ADD COLUMN     "min_stock_qty" DECIMAL(18,3),
ADD COLUMN     "min_stock_unit_id" INTEGER,
ADD COLUMN     "primary_unit_id" INTEGER,
ADD COLUMN     "reorder_batch_qty" DECIMAL(18,3),
ADD COLUMN     "reorder_batch_unit_id" INTEGER,
ADD COLUMN     "reorder_level_qty" DECIMAL(18,3),
ADD COLUMN     "reorder_level_unit_id" INTEGER,
ADD COLUMN     "shelf_life_days" INTEGER,
ADD COLUMN     "stock_unit_id" INTEGER,
ALTER COLUMN "item_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "ProductStructure" ADD COLUMN     "product_type_id" INTEGER;

-- AlterTable
ALTER TABLE "ProjectMaster" ADD COLUMN     "client_address" TEXT,
ADD COLUMN     "client_contact_no" TEXT,
ADD COLUMN     "client_name" TEXT,
ADD COLUMN     "order_no" TEXT,
ADD COLUMN     "packing_type" "PackingType" NOT NULL DEFAULT 'DEFAULT',
ADD COLUMN     "updated_at" TIMESTAMP(3),
ADD COLUMN     "updated_by" INTEGER;

-- AlterTable
ALTER TABLE "PurchaseIntentMaster" ALTER COLUMN "category_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "VendorMaster" ADD COLUMN     "address" TEXT,
ADD COLUMN     "city" TEXT,
ADD COLUMN     "gst_no" TEXT,
ADD COLUMN     "handlesLargeScaleProjects" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "icon" TEXT,
ADD COLUMN     "is_broadcast_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "is_email_noti_enabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "is_in_app_noti_enabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "login_image" TEXT,
ADD COLUMN     "pincode" TEXT,
ADD COLUMN     "tag_line" TEXT,
ADD COLUMN     "toll_free_no" TEXT,
ADD COLUMN     "website_link" TEXT;

-- CreateTable
CREATE TABLE "LeadSpecificationsMaster" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "lead_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "lights_remark" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" INTEGER NOT NULL,

    CONSTRAINT "LeadSpecificationsMaster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadCarcassMaterialMapping" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "lead_id" INTEGER NOT NULL,
    "carcass_type_id" INTEGER NOT NULL,
    "carcas_material_id" INTEGER NOT NULL,
    "carcass_material_finish_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" INTEGER NOT NULL,

    CONSTRAINT "LeadCarcassMaterialMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadShutterMaterialMapping" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "lead_id" INTEGER NOT NULL,
    "shutter_type_id" INTEGER NOT NULL,
    "shutter_material_id" INTEGER NOT NULL,
    "shutter_material_finish_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" INTEGER NOT NULL,

    CONSTRAINT "LeadShutterMaterialMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CarcasMaterialMaster" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "vendor_id" INTEGER NOT NULL,

    CONSTRAINT "CarcasMaterialMaster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CarcassMaterialFinishMaster" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "carcas_material_id" INTEGER NOT NULL,

    CONSTRAINT "CarcassMaterialFinishMaster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShutterMaterialMaster" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "vendor_id" INTEGER NOT NULL,

    CONSTRAINT "ShutterMaterialMaster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShutterMaterialFinishMaster" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "shutter_material_id" INTEGER NOT NULL,

    CONSTRAINT "ShutterMaterialFinishMaster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CarcassLegsMaster" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "vendor_id" INTEGER NOT NULL,

    CONSTRAINT "CarcassLegsMaster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SkirtingCarcassLegsMaster" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "carcass_legs_id" INTEGER NOT NULL,
    "inScope" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "SkirtingCarcassLegsMaster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SkirtingCarcassLegsColorMaster" (
    "id" SERIAL NOT NULL,
    "carcass_legs_id" INTEGER NOT NULL,
    "skirting_carcass_legs_id" INTEGER NOT NULL,
    "color" TEXT NOT NULL,

    CONSTRAINT "SkirtingCarcassLegsColorMaster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadHardwareMapping" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "lead_id" INTEGER NOT NULL,
    "carcass_legs_id" INTEGER NOT NULL,
    "skirting_carcass_legs_id" INTEGER NOT NULL,
    "skirting_carcass_legs_color_id" INTEGER,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" INTEGER NOT NULL,

    CONSTRAINT "LeadHardwareMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LightCarcasTypeMaster" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LightCarcasTypeMaster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LightCarcasUnitMaster" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "light_carcas_type_id" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LightCarcasUnitMaster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadLightCarcasUnitMapping" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "lead_id" INTEGER NOT NULL,
    "specs_id" INTEGER NOT NULL,
    "light_carcas_unit_master_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" INTEGER NOT NULL,

    CONSTRAINT "LeadLightCarcasUnitMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OtherAppliancesMaster" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "type" "OtherApplianceType" NOT NULL,
    "article_number" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OtherAppliancesMaster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadOtherAppliancesMapping" (
    "id" SERIAL NOT NULL,
    "lead_id" INTEGER NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "specs_id" INTEGER NOT NULL,
    "other_appliances_master_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" INTEGER NOT NULL,

    CONSTRAINT "LeadOtherAppliancesMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "specificationDocumentMapping" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "lead_id" INTEGER NOT NULL,
    "specs_id" INTEGER NOT NULL,
    "document_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" INTEGER NOT NULL,

    CONSTRAINT "specificationDocumentMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductSubStructure" (
    "id" SERIAL NOT NULL,
    "type" TEXT NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "product_structure_id" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductSubStructure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductItemCode" (
    "id" SERIAL NOT NULL,
    "item_code" TEXT NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "product_structure_id" INTEGER NOT NULL,
    "sub_product_structure_id" INTEGER,
    "description" VARCHAR(2000),
    "specification" VARCHAR(2000),
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductItemCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UnitMaster" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "unit_name" TEXT NOT NULL,
    "unit_class" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" INTEGER,
    "updated_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UnitMaster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemGroupMaster" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "group_name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" INTEGER,
    "updated_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ItemGroupMaster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductSupplierMapping" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "product_id" INTEGER NOT NULL,
    "company_vendor_id" INTEGER NOT NULL,
    "supplier_item_code" TEXT,
    "amount" DECIMAL(18,2),
    "procurement_expense_amount" DECIMAL(18,2),
    "procurement_expense_pct" DECIMAL(8,2),
    "procurement_expense_total" DECIMAL(18,2),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" INTEGER,
    "updated_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductSupplierMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "POPaymentScheduleHistory" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "po_payment_schedule_id" INTEGER NOT NULL,
    "action" "PaymentScheduleAction" NOT NULL,
    "old_due_date" TIMESTAMP(3),
    "new_due_date" TIMESTAMP(3),
    "old_status" "PaymentScheduleStatus",
    "new_status" "PaymentScheduleStatus",
    "old_scheduled_amount" DECIMAL(12,2),
    "new_scheduled_amount" DECIMAL(12,2),
    "paid_amount" DECIMAL(12,2),
    "payment_id" INTEGER,
    "remarks" TEXT,
    "created_by" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "POPaymentScheduleHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Architechuremaster" (
    "id" SERIAL NOT NULL,
    "vendorId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "mobile" TEXT NOT NULL,
    "alt_mobile" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" INTEGER NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Architechuremaster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdditionalCostMaster" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "cost_name" TEXT NOT NULL,
    "cost_code" TEXT,
    "description" TEXT,
    "is_taxable" BOOLEAN NOT NULL DEFAULT false,
    "tax_pct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "created_by" INTEGER,
    "updated_by" INTEGER,
    "deleted_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "AdditionalCostMaster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseIntentSupplierAdditionalCost" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "purchase_intent_id" INTEGER NOT NULL,
    "company_vendor_id" INTEGER NOT NULL,
    "additional_cost_id" INTEGER NOT NULL,
    "cost_name" TEXT NOT NULL,
    "calculation_type" "AdditionalCostCalculationType" NOT NULL DEFAULT 'Fixed',
    "amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "percentage" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "base_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "taxable_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "tax_pct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "tax_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "total_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "remarks" TEXT,
    "created_by" INTEGER,
    "updated_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseIntentSupplierAdditionalCost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseOrderSupplierAdditionalCost" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "purchase_order_id" INTEGER NOT NULL,
    "company_vendor_id" INTEGER NOT NULL,
    "additional_cost_id" INTEGER NOT NULL,
    "source_pi_additional_cost_id" INTEGER,
    "cost_name" TEXT NOT NULL,
    "calculation_type" "AdditionalCostCalculationType" NOT NULL DEFAULT 'Fixed',
    "amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "percentage" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "base_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "taxable_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "tax_pct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "tax_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "total_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "remarks" TEXT,
    "created_by" INTEGER,
    "updated_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseOrderSupplierAdditionalCost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectBoxInfoField" (
    "id" SERIAL NOT NULL,
    "project_id" INTEGER NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "field_label" TEXT NOT NULL,
    "field_key" TEXT NOT NULL,
    "field_type" "BoxInfoFieldType" NOT NULL DEFAULT 'TEXT',
    "is_required" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" INTEGER,
    "updated_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectBoxInfoField_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BoxInfoFieldValue" (
    "id" SERIAL NOT NULL,
    "box_id" INTEGER NOT NULL,
    "project_id" INTEGER NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "field_id" INTEGER NOT NULL,
    "field_value" TEXT,
    "created_by" INTEGER,
    "updated_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BoxInfoFieldValue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorTypeMaster" (
    "vendor_type_id" SERIAL NOT NULL,
    "vendor_type_name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" INTEGER NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" INTEGER NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" INTEGER,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "VendorTypeMaster_pkey" PRIMARY KEY ("vendor_type_id")
);

-- CreateTable
CREATE TABLE "CompanyVendorTypeMapping" (
    "mapping_id" SERIAL NOT NULL,
    "company_vendor_id" INTEGER NOT NULL,
    "vendor_type_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" INTEGER NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" INTEGER NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" INTEGER,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "CompanyVendorTypeMapping_pkey" PRIMARY KEY ("mapping_id")
);

-- CreateTable
CREATE TABLE "CompanyVendorContactPerson" (
    "contact_id" SERIAL NOT NULL,
    "company_vendor_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "department" TEXT,
    "phone" TEXT NOT NULL,
    "designation" TEXT,
    "email" TEXT,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" INTEGER NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" INTEGER NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" INTEGER,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "CompanyVendorContactPerson_pkey" PRIMARY KEY ("contact_id")
);

-- CreateTable
CREATE TABLE "CompanyVendorBankAccount" (
    "bank_id" SERIAL NOT NULL,
    "company_vendor_id" INTEGER NOT NULL,
    "holder_name" TEXT NOT NULL,
    "account_no" TEXT NOT NULL,
    "ifsc" TEXT NOT NULL,
    "swift" TEXT,
    "branch" TEXT NOT NULL,
    "cancelled_cheque_path" TEXT,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" INTEGER NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" INTEGER NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" INTEGER,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "CompanyVendorBankAccount_pkey" PRIMARY KEY ("bank_id")
);

-- CreateTable
CREATE TABLE "CompanyVendorDocumentMaster" (
    "document_type_id" SERIAL NOT NULL,
    "document_name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" INTEGER NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" INTEGER NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" INTEGER,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "CompanyVendorDocumentMaster_pkey" PRIMARY KEY ("document_type_id")
);

-- CreateTable
CREATE TABLE "CompanyVendorDocumentMapping" (
    "document_id" SERIAL NOT NULL,
    "company_vendor_id" INTEGER NOT NULL,
    "document_type_id" INTEGER NOT NULL,
    "file_path" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" INTEGER NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" INTEGER NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" INTEGER,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "CompanyVendorDocumentMapping_pkey" PRIMARY KEY ("document_id")
);

-- CreateTable
CREATE TABLE "CompanyVendorAddress" (
    "address_id" SERIAL NOT NULL,
    "company_vendor_id" INTEGER NOT NULL,
    "address_line_1" TEXT NOT NULL,
    "address_line_2" TEXT,
    "landmark" TEXT,
    "pincode" TEXT NOT NULL,
    "state_id" INTEGER NOT NULL,
    "city_id" INTEGER NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" INTEGER NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" INTEGER NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" INTEGER,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "CompanyVendorAddress_pkey" PRIMARY KEY ("address_id")
);

-- CreateTable
CREATE TABLE "BroadcastMaster" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "status" "BroadcastStatus" NOT NULL DEFAULT 'ACTIVE',
    "type" "BroadcastType" NOT NULL,
    "category_id" INTEGER,
    "publish_at" TIMESTAMP(3),
    "vendor_id" INTEGER,
    "created_by" INTEGER NOT NULL,
    "updated_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BroadcastMaster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BroadcastCategoryMaster" (
    "id" SERIAL NOT NULL,
    "category" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BroadcastCategoryMaster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BroadcastAudienceMapping" (
    "id" SERIAL NOT NULL,
    "broadcast_id" INTEGER NOT NULL,
    "audience_type" "AudienceType" NOT NULL,
    "target_id" INTEGER,
    "created_by" INTEGER NOT NULL,
    "updated_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BroadcastAudienceMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BroadcastAttachment" (
    "id" SERIAL NOT NULL,
    "broadcast_id" INTEGER NOT NULL,
    "attachment_type" "AttachmentType" NOT NULL,
    "title" TEXT NOT NULL,
    "file_name" TEXT,
    "original_file_name" TEXT,
    "file_url" TEXT NOT NULL,
    "file_type" TEXT,
    "file_size" BIGINT,
    "created_by" INTEGER NOT NULL,
    "updated_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BroadcastAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BroadcastRead" (
    "id" SERIAL NOT NULL,
    "broadcast_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "read_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" INTEGER NOT NULL,
    "updated_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BroadcastRead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationQueue" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "redirect_url" TEXT,
    "image" TEXT,
    "notification_source" "NotificationSource" NOT NULL,
    "notification_status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
    "send_at" TIMESTAMP(3) NOT NULL,
    "request_body" JSONB,
    "created_by" INTEGER NOT NULL,
    "updated_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationQueue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LeadSpecificationsMaster_vendor_id_idx" ON "LeadSpecificationsMaster"("vendor_id");

-- CreateIndex
CREATE INDEX "LeadSpecificationsMaster_lead_id_idx" ON "LeadSpecificationsMaster"("lead_id");

-- CreateIndex
CREATE INDEX "LeadSpecificationsMaster_created_by_idx" ON "LeadSpecificationsMaster"("created_by");



-- CreateIndex
CREATE INDEX "LeadCarcassMaterialMapping_vendor_id_idx" ON "LeadCarcassMaterialMapping"("vendor_id");

-- CreateIndex
CREATE INDEX "LeadCarcassMaterialMapping_lead_id_idx" ON "LeadCarcassMaterialMapping"("lead_id");

-- CreateIndex
CREATE INDEX "LeadCarcassMaterialMapping_carcass_type_id_idx" ON "LeadCarcassMaterialMapping"("carcass_type_id");

-- CreateIndex
CREATE INDEX "LeadCarcassMaterialMapping_carcas_material_id_idx" ON "LeadCarcassMaterialMapping"("carcas_material_id");

-- CreateIndex
CREATE INDEX "LeadCarcassMaterialMapping_carcass_material_finish_id_idx" ON "LeadCarcassMaterialMapping"("carcass_material_finish_id");

-- CreateIndex
CREATE INDEX "LeadCarcassMaterialMapping_created_by_idx" ON "LeadCarcassMaterialMapping"("created_by");

-- CreateIndex
CREATE INDEX "LeadShutterMaterialMapping_vendor_id_idx" ON "LeadShutterMaterialMapping"("vendor_id");

-- CreateIndex
CREATE INDEX "LeadShutterMaterialMapping_lead_id_idx" ON "LeadShutterMaterialMapping"("lead_id");

-- CreateIndex
CREATE INDEX "LeadShutterMaterialMapping_shutter_type_id_idx" ON "LeadShutterMaterialMapping"("shutter_type_id");

-- CreateIndex
CREATE INDEX "LeadShutterMaterialMapping_shutter_material_id_idx" ON "LeadShutterMaterialMapping"("shutter_material_id");

-- CreateIndex
CREATE INDEX "LeadShutterMaterialMapping_shutter_material_finish_id_idx" ON "LeadShutterMaterialMapping"("shutter_material_finish_id");

-- CreateIndex
CREATE INDEX "LeadShutterMaterialMapping_created_by_idx" ON "LeadShutterMaterialMapping"("created_by");

-- CreateIndex
CREATE INDEX "LeadHardwareMapping_vendor_id_idx" ON "LeadHardwareMapping"("vendor_id");

-- CreateIndex
CREATE INDEX "LeadHardwareMapping_lead_id_idx" ON "LeadHardwareMapping"("lead_id");

-- CreateIndex
CREATE INDEX "LeadHardwareMapping_carcass_legs_id_idx" ON "LeadHardwareMapping"("carcass_legs_id");

-- CreateIndex
CREATE INDEX "LeadHardwareMapping_skirting_carcass_legs_id_idx" ON "LeadHardwareMapping"("skirting_carcass_legs_id");

-- CreateIndex
CREATE INDEX "LeadHardwareMapping_skirting_carcass_legs_color_id_idx" ON "LeadHardwareMapping"("skirting_carcass_legs_color_id");

-- CreateIndex
CREATE INDEX "LeadHardwareMapping_created_by_idx" ON "LeadHardwareMapping"("created_by");

-- CreateIndex
CREATE INDEX "LightCarcasTypeMaster_vendor_id_idx" ON "LightCarcasTypeMaster"("vendor_id");

-- CreateIndex
CREATE INDEX "LightCarcasUnitMaster_vendor_id_idx" ON "LightCarcasUnitMaster"("vendor_id");

-- CreateIndex
CREATE INDEX "LightCarcasUnitMaster_light_carcas_type_id_idx" ON "LightCarcasUnitMaster"("light_carcas_type_id");

-- CreateIndex
CREATE INDEX "LeadLightCarcasUnitMapping_vendor_id_idx" ON "LeadLightCarcasUnitMapping"("vendor_id");

-- CreateIndex
CREATE INDEX "LeadLightCarcasUnitMapping_lead_id_idx" ON "LeadLightCarcasUnitMapping"("lead_id");

-- CreateIndex
CREATE INDEX "LeadLightCarcasUnitMapping_specs_id_idx" ON "LeadLightCarcasUnitMapping"("specs_id");

-- CreateIndex
CREATE INDEX "LeadLightCarcasUnitMapping_light_carcas_unit_master_id_idx" ON "LeadLightCarcasUnitMapping"("light_carcas_unit_master_id");

-- CreateIndex
CREATE INDEX "LeadLightCarcasUnitMapping_created_by_idx" ON "LeadLightCarcasUnitMapping"("created_by");

-- CreateIndex
CREATE INDEX "OtherAppliancesMaster_vendor_id_idx" ON "OtherAppliancesMaster"("vendor_id");

-- CreateIndex
CREATE INDEX "LeadOtherAppliancesMapping_lead_id_idx" ON "LeadOtherAppliancesMapping"("lead_id");

-- CreateIndex
CREATE INDEX "LeadOtherAppliancesMapping_vendor_id_idx" ON "LeadOtherAppliancesMapping"("vendor_id");

-- CreateIndex
CREATE INDEX "LeadOtherAppliancesMapping_specs_id_idx" ON "LeadOtherAppliancesMapping"("specs_id");

-- CreateIndex
CREATE INDEX "LeadOtherAppliancesMapping_other_appliances_master_id_idx" ON "LeadOtherAppliancesMapping"("other_appliances_master_id");

-- CreateIndex
CREATE INDEX "LeadOtherAppliancesMapping_created_by_idx" ON "LeadOtherAppliancesMapping"("created_by");

-- CreateIndex
CREATE INDEX "specificationDocumentMapping_vendor_id_idx" ON "specificationDocumentMapping"("vendor_id");

-- CreateIndex
CREATE INDEX "specificationDocumentMapping_lead_id_idx" ON "specificationDocumentMapping"("lead_id");

-- CreateIndex
CREATE INDEX "specificationDocumentMapping_specs_id_idx" ON "specificationDocumentMapping"("specs_id");

-- CreateIndex
CREATE INDEX "specificationDocumentMapping_document_id_idx" ON "specificationDocumentMapping"("document_id");

-- CreateIndex
CREATE INDEX "specificationDocumentMapping_created_by_idx" ON "specificationDocumentMapping"("created_by");

-- CreateIndex
CREATE INDEX "ProductSubStructure_vendor_id_idx" ON "ProductSubStructure"("vendor_id");

-- CreateIndex
CREATE INDEX "ProductSubStructure_product_structure_id_idx" ON "ProductSubStructure"("product_structure_id");

-- CreateIndex
CREATE INDEX "ProductItemCode_vendor_id_idx" ON "ProductItemCode"("vendor_id");

-- CreateIndex
CREATE INDEX "ProductItemCode_product_structure_id_idx" ON "ProductItemCode"("product_structure_id");

-- CreateIndex
CREATE INDEX "ProductItemCode_sub_product_structure_id_idx" ON "ProductItemCode"("sub_product_structure_id");

-- CreateIndex
CREATE UNIQUE INDEX "ProductItemCode_vendor_id_item_code_description_specificati_key" ON "ProductItemCode"("vendor_id", "item_code", "description", "specification");

-- CreateIndex
CREATE INDEX "UnitMaster_vendor_id_idx" ON "UnitMaster"("vendor_id");

-- CreateIndex
CREATE UNIQUE INDEX "UnitMaster_vendor_id_unit_name_key" ON "UnitMaster"("vendor_id", "unit_name");

-- CreateIndex
CREATE INDEX "ItemGroupMaster_vendor_id_idx" ON "ItemGroupMaster"("vendor_id");

-- CreateIndex
CREATE UNIQUE INDEX "ItemGroupMaster_vendor_id_group_name_key" ON "ItemGroupMaster"("vendor_id", "group_name");

-- CreateIndex
CREATE INDEX "ProductSupplierMapping_vendor_id_idx" ON "ProductSupplierMapping"("vendor_id");

-- CreateIndex
CREATE INDEX "ProductSupplierMapping_product_id_idx" ON "ProductSupplierMapping"("product_id");

-- CreateIndex
CREATE INDEX "ProductSupplierMapping_company_vendor_id_idx" ON "ProductSupplierMapping"("company_vendor_id");

-- CreateIndex
CREATE INDEX "ProductSupplierMapping_supplier_item_code_idx" ON "ProductSupplierMapping"("supplier_item_code");

-- CreateIndex
CREATE UNIQUE INDEX "ProductSupplierMapping_vendor_id_product_id_company_vendor__key" ON "ProductSupplierMapping"("vendor_id", "product_id", "company_vendor_id");

-- CreateIndex
CREATE INDEX "POPaymentScheduleHistory_vendor_id_idx" ON "POPaymentScheduleHistory"("vendor_id");

-- CreateIndex
CREATE INDEX "POPaymentScheduleHistory_po_payment_schedule_id_idx" ON "POPaymentScheduleHistory"("po_payment_schedule_id");

-- CreateIndex
CREATE INDEX "add_cost_master_vendor_idx" ON "AdditionalCostMaster"("vendor_id");

-- CreateIndex
CREATE INDEX "add_cost_master_code_idx" ON "AdditionalCostMaster"("cost_code");

-- CreateIndex
CREATE INDEX "add_cost_master_active_idx" ON "AdditionalCostMaster"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "add_cost_master_vendor_cost_name_uq" ON "AdditionalCostMaster"("vendor_id", "cost_name");

-- CreateIndex
CREATE INDEX "pi_sup_cost_vendor_idx" ON "PurchaseIntentSupplierAdditionalCost"("vendor_id");

-- CreateIndex
CREATE INDEX "pi_sup_cost_pi_idx" ON "PurchaseIntentSupplierAdditionalCost"("purchase_intent_id");

-- CreateIndex
CREATE INDEX "pi_sup_cost_company_vendor_idx" ON "PurchaseIntentSupplierAdditionalCost"("company_vendor_id");

-- CreateIndex
CREATE INDEX "pi_sup_cost_master_idx" ON "PurchaseIntentSupplierAdditionalCost"("additional_cost_id");

-- CreateIndex
CREATE INDEX "po_sup_cost_vendor_idx" ON "PurchaseOrderSupplierAdditionalCost"("vendor_id");

-- CreateIndex
CREATE INDEX "po_sup_cost_po_idx" ON "PurchaseOrderSupplierAdditionalCost"("purchase_order_id");

-- CreateIndex
CREATE INDEX "po_sup_cost_company_vendor_idx" ON "PurchaseOrderSupplierAdditionalCost"("company_vendor_id");

-- CreateIndex
CREATE INDEX "po_sup_cost_master_idx" ON "PurchaseOrderSupplierAdditionalCost"("additional_cost_id");

-- CreateIndex
CREATE INDEX "po_sup_cost_source_pi_idx" ON "PurchaseOrderSupplierAdditionalCost"("source_pi_additional_cost_id");

-- CreateIndex
CREATE INDEX "ProjectBoxInfoField_project_id_vendor_id_idx" ON "ProjectBoxInfoField"("project_id", "vendor_id");

-- CreateIndex
CREATE INDEX "BoxInfoFieldValue_box_id_idx" ON "BoxInfoFieldValue"("box_id");

-- CreateIndex
CREATE INDEX "BoxInfoFieldValue_project_id_vendor_id_idx" ON "BoxInfoFieldValue"("project_id", "vendor_id");

-- CreateIndex
CREATE UNIQUE INDEX "BoxInfoFieldValue_box_id_field_id_key" ON "BoxInfoFieldValue"("box_id", "field_id");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyVendorBankAccount_company_vendor_id_account_no_key" ON "CompanyVendorBankAccount"("company_vendor_id", "account_no");

-- CreateIndex
CREATE INDEX "BroadcastMaster_vendor_id_idx" ON "BroadcastMaster"("vendor_id");

-- CreateIndex
CREATE INDEX "BroadcastMaster_category_id_idx" ON "BroadcastMaster"("category_id");

-- CreateIndex
CREATE INDEX "BroadcastMaster_created_by_idx" ON "BroadcastMaster"("created_by");

-- CreateIndex
CREATE INDEX "BroadcastMaster_updated_by_idx" ON "BroadcastMaster"("updated_by");

-- CreateIndex
CREATE INDEX "BroadcastCategoryMaster_vendor_id_idx" ON "BroadcastCategoryMaster"("vendor_id");

-- CreateIndex
CREATE INDEX "BroadcastAudienceMapping_broadcast_id_idx" ON "BroadcastAudienceMapping"("broadcast_id");

-- CreateIndex
CREATE INDEX "BroadcastAudienceMapping_audience_type_target_id_idx" ON "BroadcastAudienceMapping"("audience_type", "target_id");

-- CreateIndex
CREATE INDEX "BroadcastAttachment_broadcast_id_idx" ON "BroadcastAttachment"("broadcast_id");

-- CreateIndex
CREATE INDEX "BroadcastAttachment_created_by_idx" ON "BroadcastAttachment"("created_by");

-- CreateIndex
CREATE INDEX "BroadcastAttachment_updated_by_idx" ON "BroadcastAttachment"("updated_by");

-- CreateIndex
CREATE INDEX "BroadcastRead_broadcast_id_idx" ON "BroadcastRead"("broadcast_id");

-- CreateIndex
CREATE INDEX "BroadcastRead_user_id_idx" ON "BroadcastRead"("user_id");

-- CreateIndex
CREATE INDEX "BroadcastRead_created_by_idx" ON "BroadcastRead"("created_by");

-- CreateIndex
CREATE INDEX "BroadcastRead_updated_by_idx" ON "BroadcastRead"("updated_by");

-- CreateIndex
CREATE UNIQUE INDEX "BroadcastRead_broadcast_id_user_id_key" ON "BroadcastRead"("broadcast_id", "user_id");

-- CreateIndex
CREATE INDEX "NotificationQueue_created_by_idx" ON "NotificationQueue"("created_by");

-- CreateIndex
CREATE INDEX "NotificationQueue_updated_by_idx" ON "NotificationQueue"("updated_by");

-- CreateIndex
CREATE INDEX "NotificationQueue_notification_status_send_at_idx" ON "NotificationQueue"("notification_status", "send_at");

-- CreateIndex
CREATE INDEX "CompanyVendorsMaster_primary_contact_id_idx" ON "CompanyVendorsMaster"("primary_contact_id");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyVendorsMaster_vendor_id_vendor_code_key" ON "CompanyVendorsMaster"("vendor_id", "vendor_code");

-- CreateIndex
CREATE INDEX "CutListMachineMapping_vendor_id_project_id_machine_id_expec_idx" ON "CutListMachineMapping"("vendor_id", "project_id", "machine_id", "expected_in");

-- CreateIndex
CREATE INDEX "CutListMachineMapping_vendor_id_project_id_expected_in_idx" ON "CutListMachineMapping"("vendor_id", "project_id", "expected_in");

-- CreateIndex
CREATE INDEX "CutListMachineMapping_vendor_id_project_id_cut_list_id_sequ_idx" ON "CutListMachineMapping"("vendor_id", "project_id", "cut_list_id", "sequence_no", "expected_in");

-- CreateIndex
CREATE INDEX "CutListMachineMapping_project_id_machine_id_expected_in_box_idx" ON "CutListMachineMapping"("project_id", "machine_id", "expected_in", "box_id");

-- CreateIndex
CREATE INDEX "LeadProductStructureInstance_sub_product_structure_id_idx" ON "LeadProductStructureInstance"("sub_product_structure_id");

-- CreateIndex
CREATE INDEX "LeadProductStructureInstance_product_item_code_id_idx" ON "LeadProductStructureInstance"("product_item_code_id");

-- CreateIndex
CREATE INDEX "POPaymentSchedule_grn_id_idx" ON "POPaymentSchedule"("grn_id");

-- CreateIndex
CREATE INDEX "POPaymentSchedule_payment_term_stage_id_idx" ON "POPaymentSchedule"("payment_term_stage_id");

-- CreateIndex
CREATE INDEX "POPaymentSchedule_status_idx" ON "POPaymentSchedule"("status");

-- CreateIndex
CREATE INDEX "POPaymentSchedule_due_date_idx" ON "POPaymentSchedule"("due_date");

-- CreateIndex
CREATE INDEX "ProductMaster_item_group_id_idx" ON "ProductMaster"("item_group_id");

-- CreateIndex
CREATE INDEX "ProductMaster_primary_unit_id_idx" ON "ProductMaster"("primary_unit_id");

-- CreateIndex
CREATE INDEX "ProductMaster_stock_unit_id_idx" ON "ProductMaster"("stock_unit_id");

-- CreateIndex
CREATE INDEX "ProductMaster_consumption_unit_id_idx" ON "ProductMaster"("consumption_unit_id");

-- CreateIndex
CREATE INDEX "ProductMaster_min_stock_unit_id_idx" ON "ProductMaster"("min_stock_unit_id");

-- CreateIndex
CREATE INDEX "ProductMaster_max_stock_unit_id_idx" ON "ProductMaster"("max_stock_unit_id");

-- CreateIndex
CREATE INDEX "ProductMaster_reorder_level_unit_id_idx" ON "ProductMaster"("reorder_level_unit_id");

-- CreateIndex
CREATE INDEX "ProductMaster_reorder_batch_unit_id_idx" ON "ProductMaster"("reorder_batch_unit_id");

-- CreateIndex
CREATE INDEX "ProductStructure_product_type_id_idx" ON "ProductStructure"("product_type_id");

-- AddForeignKey
ALTER TABLE "BoxMaster" ADD CONSTRAINT "BoxMaster_packed_by_fkey" FOREIGN KEY ("packed_by") REFERENCES "UserMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadMaster" ADD CONSTRAINT "LeadMaster_architect_id_fkey" FOREIGN KEY ("architect_id") REFERENCES "Architechuremaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadSpecificationsMaster" ADD CONSTRAINT "LeadSpecificationsMaster_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadSpecificationsMaster" ADD CONSTRAINT "LeadSpecificationsMaster_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "LeadMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadSpecificationsMaster" ADD CONSTRAINT "LeadSpecificationsMaster_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "UserMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;



-- AddForeignKey
ALTER TABLE "LeadCarcassMaterialMapping" ADD CONSTRAINT "LeadCarcassMaterialMapping_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadCarcassMaterialMapping" ADD CONSTRAINT "LeadCarcassMaterialMapping_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "LeadMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadCarcassMaterialMapping" ADD CONSTRAINT "LeadCarcassMaterialMapping_carcass_type_id_fkey" FOREIGN KEY ("carcass_type_id") REFERENCES "CarcassTypeMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadCarcassMaterialMapping" ADD CONSTRAINT "LeadCarcassMaterialMapping_carcas_material_id_fkey" FOREIGN KEY ("carcas_material_id") REFERENCES "CarcasMaterialMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadCarcassMaterialMapping" ADD CONSTRAINT "LeadCarcassMaterialMapping_carcass_material_finish_id_fkey" FOREIGN KEY ("carcass_material_finish_id") REFERENCES "CarcassMaterialFinishMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadCarcassMaterialMapping" ADD CONSTRAINT "LeadCarcassMaterialMapping_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "UserMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadShutterMaterialMapping" ADD CONSTRAINT "LeadShutterMaterialMapping_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadShutterMaterialMapping" ADD CONSTRAINT "LeadShutterMaterialMapping_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "LeadMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadShutterMaterialMapping" ADD CONSTRAINT "LeadShutterMaterialMapping_shutter_type_id_fkey" FOREIGN KEY ("shutter_type_id") REFERENCES "ShutterTypeMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadShutterMaterialMapping" ADD CONSTRAINT "LeadShutterMaterialMapping_shutter_material_id_fkey" FOREIGN KEY ("shutter_material_id") REFERENCES "ShutterMaterialMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadShutterMaterialMapping" ADD CONSTRAINT "LeadShutterMaterialMapping_shutter_material_finish_id_fkey" FOREIGN KEY ("shutter_material_finish_id") REFERENCES "ShutterMaterialFinishMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadShutterMaterialMapping" ADD CONSTRAINT "LeadShutterMaterialMapping_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "UserMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarcasMaterialMaster" ADD CONSTRAINT "CarcasMaterialMaster_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarcassMaterialFinishMaster" ADD CONSTRAINT "CarcassMaterialFinishMaster_carcas_material_id_fkey" FOREIGN KEY ("carcas_material_id") REFERENCES "CarcasMaterialMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShutterMaterialMaster" ADD CONSTRAINT "ShutterMaterialMaster_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShutterMaterialFinishMaster" ADD CONSTRAINT "ShutterMaterialFinishMaster_shutter_material_id_fkey" FOREIGN KEY ("shutter_material_id") REFERENCES "ShutterMaterialMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarcassLegsMaster" ADD CONSTRAINT "CarcassLegsMaster_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SkirtingCarcassLegsMaster" ADD CONSTRAINT "SkirtingCarcassLegsMaster_carcass_legs_id_fkey" FOREIGN KEY ("carcass_legs_id") REFERENCES "CarcassLegsMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SkirtingCarcassLegsColorMaster" ADD CONSTRAINT "SkirtingCarcassLegsColorMaster_carcass_legs_id_fkey" FOREIGN KEY ("carcass_legs_id") REFERENCES "CarcassLegsMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SkirtingCarcassLegsColorMaster" ADD CONSTRAINT "SkirtingCarcassLegsColorMaster_skirting_carcass_legs_id_fkey" FOREIGN KEY ("skirting_carcass_legs_id") REFERENCES "SkirtingCarcassLegsMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadHardwareMapping" ADD CONSTRAINT "LeadHardwareMapping_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadHardwareMapping" ADD CONSTRAINT "LeadHardwareMapping_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "LeadMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadHardwareMapping" ADD CONSTRAINT "LeadHardwareMapping_carcass_legs_id_fkey" FOREIGN KEY ("carcass_legs_id") REFERENCES "CarcassLegsMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadHardwareMapping" ADD CONSTRAINT "LeadHardwareMapping_skirting_carcass_legs_id_fkey" FOREIGN KEY ("skirting_carcass_legs_id") REFERENCES "SkirtingCarcassLegsMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadHardwareMapping" ADD CONSTRAINT "LeadHardwareMapping_skirting_carcass_legs_color_id_fkey" FOREIGN KEY ("skirting_carcass_legs_color_id") REFERENCES "SkirtingCarcassLegsColorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadHardwareMapping" ADD CONSTRAINT "LeadHardwareMapping_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "UserMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LightCarcasTypeMaster" ADD CONSTRAINT "LightCarcasTypeMaster_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LightCarcasUnitMaster" ADD CONSTRAINT "LightCarcasUnitMaster_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LightCarcasUnitMaster" ADD CONSTRAINT "LightCarcasUnitMaster_light_carcas_type_id_fkey" FOREIGN KEY ("light_carcas_type_id") REFERENCES "LightCarcasTypeMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadLightCarcasUnitMapping" ADD CONSTRAINT "LeadLightCarcasUnitMapping_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadLightCarcasUnitMapping" ADD CONSTRAINT "LeadLightCarcasUnitMapping_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "LeadMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadLightCarcasUnitMapping" ADD CONSTRAINT "LeadLightCarcasUnitMapping_specs_id_fkey" FOREIGN KEY ("specs_id") REFERENCES "LeadSpecificationsMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadLightCarcasUnitMapping" ADD CONSTRAINT "LeadLightCarcasUnitMapping_light_carcas_unit_master_id_fkey" FOREIGN KEY ("light_carcas_unit_master_id") REFERENCES "LightCarcasUnitMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadLightCarcasUnitMapping" ADD CONSTRAINT "LeadLightCarcasUnitMapping_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "UserMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OtherAppliancesMaster" ADD CONSTRAINT "OtherAppliancesMaster_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadOtherAppliancesMapping" ADD CONSTRAINT "LeadOtherAppliancesMapping_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "LeadMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadOtherAppliancesMapping" ADD CONSTRAINT "LeadOtherAppliancesMapping_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadOtherAppliancesMapping" ADD CONSTRAINT "LeadOtherAppliancesMapping_specs_id_fkey" FOREIGN KEY ("specs_id") REFERENCES "LeadSpecificationsMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadOtherAppliancesMapping" ADD CONSTRAINT "LeadOtherAppliancesMapping_other_appliances_master_id_fkey" FOREIGN KEY ("other_appliances_master_id") REFERENCES "OtherAppliancesMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadOtherAppliancesMapping" ADD CONSTRAINT "LeadOtherAppliancesMapping_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "UserMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "specificationDocumentMapping" ADD CONSTRAINT "specificationDocumentMapping_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "specificationDocumentMapping" ADD CONSTRAINT "specificationDocumentMapping_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "LeadMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "specificationDocumentMapping" ADD CONSTRAINT "specificationDocumentMapping_specs_id_fkey" FOREIGN KEY ("specs_id") REFERENCES "LeadSpecificationsMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "specificationDocumentMapping" ADD CONSTRAINT "specificationDocumentMapping_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "LeadDocuments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "specificationDocumentMapping" ADD CONSTRAINT "specificationDocumentMapping_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "UserMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductStructure" ADD CONSTRAINT "ProductStructure_product_type_id_fkey" FOREIGN KEY ("product_type_id") REFERENCES "ProductTypeMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductSubStructure" ADD CONSTRAINT "ProductSubStructure_product_structure_id_fkey" FOREIGN KEY ("product_structure_id") REFERENCES "ProductStructure"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductSubStructure" ADD CONSTRAINT "ProductSubStructure_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductItemCode" ADD CONSTRAINT "ProductItemCode_product_structure_id_fkey" FOREIGN KEY ("product_structure_id") REFERENCES "ProductStructure"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductItemCode" ADD CONSTRAINT "ProductItemCode_sub_product_structure_id_fkey" FOREIGN KEY ("sub_product_structure_id") REFERENCES "ProductSubStructure"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductItemCode" ADD CONSTRAINT "ProductItemCode_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadProductStructureInstance" ADD CONSTRAINT "LeadProductStructureInstance_product_item_code_id_fkey" FOREIGN KEY ("product_item_code_id") REFERENCES "ProductItemCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadProductStructureInstance" ADD CONSTRAINT "LeadProductStructureInstance_sub_product_structure_id_fkey" FOREIGN KEY ("sub_product_structure_id") REFERENCES "ProductSubStructure"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyVendorsMaster" ADD CONSTRAINT "CompanyVendorsMaster_primary_contact_id_fkey" FOREIGN KEY ("primary_contact_id") REFERENCES "CompanyVendorContactPerson"("contact_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductMaster" ADD CONSTRAINT "ProductMaster_item_group_id_fkey" FOREIGN KEY ("item_group_id") REFERENCES "ItemGroupMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductMaster" ADD CONSTRAINT "ProductMaster_primary_unit_id_fkey" FOREIGN KEY ("primary_unit_id") REFERENCES "UnitMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductMaster" ADD CONSTRAINT "ProductMaster_stock_unit_id_fkey" FOREIGN KEY ("stock_unit_id") REFERENCES "UnitMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductMaster" ADD CONSTRAINT "ProductMaster_consumption_unit_id_fkey" FOREIGN KEY ("consumption_unit_id") REFERENCES "UnitMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductMaster" ADD CONSTRAINT "ProductMaster_min_stock_unit_id_fkey" FOREIGN KEY ("min_stock_unit_id") REFERENCES "UnitMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductMaster" ADD CONSTRAINT "ProductMaster_max_stock_unit_id_fkey" FOREIGN KEY ("max_stock_unit_id") REFERENCES "UnitMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductMaster" ADD CONSTRAINT "ProductMaster_reorder_level_unit_id_fkey" FOREIGN KEY ("reorder_level_unit_id") REFERENCES "UnitMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductMaster" ADD CONSTRAINT "ProductMaster_reorder_batch_unit_id_fkey" FOREIGN KEY ("reorder_batch_unit_id") REFERENCES "UnitMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseIntentMaster" ADD CONSTRAINT "PurchaseIntentMaster_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "ProjectCategoriesMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "POPaymentSchedule" ADD CONSTRAINT "POPaymentSchedule_grn_id_fkey" FOREIGN KEY ("grn_id") REFERENCES "GRNMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "POPaymentSchedule" ADD CONSTRAINT "POPaymentSchedule_payment_term_stage_id_fkey" FOREIGN KEY ("payment_term_stage_id") REFERENCES "PaymentTermStage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnitMaster" ADD CONSTRAINT "UnitMaster_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemGroupMaster" ADD CONSTRAINT "ItemGroupMaster_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductSupplierMapping" ADD CONSTRAINT "ProductSupplierMapping_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductSupplierMapping" ADD CONSTRAINT "ProductSupplierMapping_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "ProductMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductSupplierMapping" ADD CONSTRAINT "ProductSupplierMapping_company_vendor_id_fkey" FOREIGN KEY ("company_vendor_id") REFERENCES "CompanyVendorsMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "POPaymentScheduleHistory" ADD CONSTRAINT "POPaymentScheduleHistory_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "POPaymentScheduleHistory" ADD CONSTRAINT "POPaymentScheduleHistory_po_payment_schedule_id_fkey" FOREIGN KEY ("po_payment_schedule_id") REFERENCES "POPaymentSchedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "POPaymentScheduleHistory" ADD CONSTRAINT "POPaymentScheduleHistory_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "POPayment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "POPaymentScheduleHistory" ADD CONSTRAINT "POPaymentScheduleHistory_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "UserMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Architechuremaster" ADD CONSTRAINT "Architechuremaster_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Architechuremaster" ADD CONSTRAINT "Architechuremaster_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "UserMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdditionalCostMaster" ADD CONSTRAINT "AdditionalCostMaster_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseIntentSupplierAdditionalCost" ADD CONSTRAINT "pi_sup_cost_vendor_fk" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseIntentSupplierAdditionalCost" ADD CONSTRAINT "pi_sup_cost_pi_fk" FOREIGN KEY ("purchase_intent_id") REFERENCES "PurchaseIntentMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseIntentSupplierAdditionalCost" ADD CONSTRAINT "pi_sup_cost_company_vendor_fk" FOREIGN KEY ("company_vendor_id") REFERENCES "CompanyVendorsMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseIntentSupplierAdditionalCost" ADD CONSTRAINT "pi_sup_cost_master_fk" FOREIGN KEY ("additional_cost_id") REFERENCES "AdditionalCostMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderSupplierAdditionalCost" ADD CONSTRAINT "po_sup_cost_vendor_fk" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderSupplierAdditionalCost" ADD CONSTRAINT "po_sup_cost_po_fk" FOREIGN KEY ("purchase_order_id") REFERENCES "PurchaseOrderMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderSupplierAdditionalCost" ADD CONSTRAINT "po_sup_cost_company_vendor_fk" FOREIGN KEY ("company_vendor_id") REFERENCES "CompanyVendorsMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderSupplierAdditionalCost" ADD CONSTRAINT "po_sup_cost_master_fk" FOREIGN KEY ("additional_cost_id") REFERENCES "AdditionalCostMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderSupplierAdditionalCost" ADD CONSTRAINT "po_sup_cost_source_pi_fk" FOREIGN KEY ("source_pi_additional_cost_id") REFERENCES "PurchaseIntentSupplierAdditionalCost"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectBoxInfoField" ADD CONSTRAINT "ProjectBoxInfoField_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "ProjectMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectBoxInfoField" ADD CONSTRAINT "ProjectBoxInfoField_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoxInfoFieldValue" ADD CONSTRAINT "BoxInfoFieldValue_box_id_fkey" FOREIGN KEY ("box_id") REFERENCES "BoxMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoxInfoFieldValue" ADD CONSTRAINT "BoxInfoFieldValue_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "ProjectMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoxInfoFieldValue" ADD CONSTRAINT "BoxInfoFieldValue_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoxInfoFieldValue" ADD CONSTRAINT "BoxInfoFieldValue_field_id_fkey" FOREIGN KEY ("field_id") REFERENCES "ProjectBoxInfoField"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyVendorTypeMapping" ADD CONSTRAINT "CompanyVendorTypeMapping_company_vendor_id_fkey" FOREIGN KEY ("company_vendor_id") REFERENCES "CompanyVendorsMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyVendorTypeMapping" ADD CONSTRAINT "CompanyVendorTypeMapping_vendor_type_id_fkey" FOREIGN KEY ("vendor_type_id") REFERENCES "VendorTypeMaster"("vendor_type_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyVendorContactPerson" ADD CONSTRAINT "CompanyVendorContactPerson_company_vendor_id_fkey" FOREIGN KEY ("company_vendor_id") REFERENCES "CompanyVendorsMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyVendorBankAccount" ADD CONSTRAINT "CompanyVendorBankAccount_company_vendor_id_fkey" FOREIGN KEY ("company_vendor_id") REFERENCES "CompanyVendorsMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyVendorDocumentMapping" ADD CONSTRAINT "CompanyVendorDocumentMapping_company_vendor_id_fkey" FOREIGN KEY ("company_vendor_id") REFERENCES "CompanyVendorsMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyVendorDocumentMapping" ADD CONSTRAINT "CompanyVendorDocumentMapping_document_type_id_fkey" FOREIGN KEY ("document_type_id") REFERENCES "CompanyVendorDocumentMaster"("document_type_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyVendorAddress" ADD CONSTRAINT "CompanyVendorAddress_company_vendor_id_fkey" FOREIGN KEY ("company_vendor_id") REFERENCES "CompanyVendorsMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyVendorAddress" ADD CONSTRAINT "CompanyVendorAddress_state_id_fkey" FOREIGN KEY ("state_id") REFERENCES "StateMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyVendorAddress" ADD CONSTRAINT "CompanyVendorAddress_city_id_fkey" FOREIGN KEY ("city_id") REFERENCES "CityMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BroadcastMaster" ADD CONSTRAINT "BroadcastMaster_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BroadcastMaster" ADD CONSTRAINT "BroadcastMaster_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "BroadcastCategoryMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BroadcastMaster" ADD CONSTRAINT "BroadcastMaster_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "UserMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BroadcastMaster" ADD CONSTRAINT "BroadcastMaster_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "UserMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BroadcastCategoryMaster" ADD CONSTRAINT "BroadcastCategoryMaster_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BroadcastCategoryMaster" ADD CONSTRAINT "BroadcastCategoryMaster_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "UserMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BroadcastAudienceMapping" ADD CONSTRAINT "BroadcastAudienceMapping_broadcast_id_fkey" FOREIGN KEY ("broadcast_id") REFERENCES "BroadcastMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BroadcastAudienceMapping" ADD CONSTRAINT "BroadcastAudienceMapping_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "UserMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BroadcastAudienceMapping" ADD CONSTRAINT "BroadcastAudienceMapping_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "UserMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BroadcastAttachment" ADD CONSTRAINT "BroadcastAttachment_broadcast_id_fkey" FOREIGN KEY ("broadcast_id") REFERENCES "BroadcastMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BroadcastAttachment" ADD CONSTRAINT "BroadcastAttachment_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "UserMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BroadcastAttachment" ADD CONSTRAINT "BroadcastAttachment_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "UserMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BroadcastRead" ADD CONSTRAINT "BroadcastRead_broadcast_id_fkey" FOREIGN KEY ("broadcast_id") REFERENCES "BroadcastMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BroadcastRead" ADD CONSTRAINT "BroadcastRead_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "UserMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BroadcastRead" ADD CONSTRAINT "BroadcastRead_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "UserMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BroadcastRead" ADD CONSTRAINT "BroadcastRead_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "UserMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationQueue" ADD CONSTRAINT "NotificationQueue_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "UserMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationQueue" ADD CONSTRAINT "NotificationQueue_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "UserMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;
