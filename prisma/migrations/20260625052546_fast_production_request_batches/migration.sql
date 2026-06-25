/*
  Warnings:

  - You are about to drop the column `client_id` on the `BoxMaster` table. All the data in the column will be lost.
  - You are about to drop the column `client_id` on the `ProjectDetails` table. All the data in the column will be lost.
  - You are about to drop the column `client_id` on the `ProjectItemsMaster` table. All the data in the column will be lost.
  - Made the column `is_blocked` on table `LeadMaster` required. This step will fail if there are existing NULL values in that column.

*/
-- CreateEnum
CREATE TYPE "PaymentMode" AS ENUM ('Cash', 'BankTransfer', 'Cheque', 'UPI', 'RTGS', 'NEFT');

-- CreateEnum
CREATE TYPE "PaymentScheduleStatus" AS ENUM ('Pending', 'PartiallyPaid', 'Paid', 'Overdue', 'Cancelled');

-- CreateEnum
CREATE TYPE "PaymentTriggerType" AS ENUM ('ADVANCE', 'ON_PO_APPROVAL', 'ON_DISPATCH', 'ON_GRN', 'ON_INSTALLATION', 'ON_DELIVERY', 'AFTER_INVOICE_DAYS', 'SPECIFIC_DATE', 'CUSTOM');

-- CreateEnum
CREATE TYPE "StockChangeSource" AS ENUM ('GRNConfirmation', 'ExcelUpload', 'ManualAdjustment');

-- CreateEnum
CREATE TYPE "GRNStatus" AS ENUM ('Draft', 'Confirmed', 'Closed');

-- CreateEnum
CREATE TYPE "GRNItemStatus" AS ENUM ('Accepted', 'PartiallyAccepted', 'Rejected');

-- CreateEnum
CREATE TYPE "DebitCreditNoteType" AS ENUM ('DebitNote', 'CreditNote');

-- CreateEnum
CREATE TYPE "DebitCreditNoteStatus" AS ENUM ('Open', 'Settled', 'Cancelled');

-- CreateEnum
CREATE TYPE "RedeliveryStatus" AS ENUM ('Requested', 'Scheduled', 'Received', 'Cancelled');

-- CreateEnum
CREATE TYPE "PurchaseOrderStatus" AS ENUM ('Draft', 'Approved', 'PartiallyReceived', 'Received', 'Cancelled');

-- CreateEnum
CREATE TYPE "PurchaseIntentStatus" AS ENUM ('Draft', 'PendingApproval', 'Approved', 'Rejected', 'ConvertedToPO', 'Cancelled');

-- CreateEnum
CREATE TYPE "PurchaseIntentPriority" AS ENUM ('Low', 'Medium', 'High', 'Urgent');

-- CreateEnum
CREATE TYPE "ProductActiveFlag" AS ENUM ('Yes', 'No');

-- CreateEnum
CREATE TYPE "BrandActiveFlag" AS ENUM ('Yes', 'No');

-- CreateEnum
CREATE TYPE "ProjectCategoriesStatus" AS ENUM ('Yes', 'No');

-- CreateEnum
CREATE TYPE "MachineTypeMasterStatus" AS ENUM ('YES', 'NO');

-- CreateEnum
CREATE TYPE "SuperAdminApprovalType" AS ENUM ('booking_done', 'order_login', 'dispatch_planning');

-- CreateEnum
CREATE TYPE "FastProductionRequestStatus" AS ENUM ('draft', 'pending_approvals', 'approved', 'rejected', 'revoked');

-- CreateEnum
CREATE TYPE "FastProductionApproverRole" AS ENUM ('SUPER_ADMIN', 'FACTORY_ADMIN');

-- CreateEnum
CREATE TYPE "FastProductionApprovalStatus" AS ENUM ('pending', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "FastProductionFinishComponent" AS ENUM ('CARCASS', 'SHUTTER', 'HANDLE');

-- CreateEnum
CREATE TYPE "ClientVisitType" AS ENUM ('physical_visit', 'follow_up_call');

-- CreateEnum
CREATE TYPE "ClientVisitDocumentRole" AS ENUM ('supporting_document', 'payment_proof');

-- CreateEnum
CREATE TYPE "ActiveStatus" AS ENUM ('Yes', 'No');

-- CreateEnum
CREATE TYPE "UserSessionStatus" AS ENUM ('active', 'logged_out', 'revoked', 'expired');

-- CreateEnum
CREATE TYPE "UserSessionLoginType" AS ENUM ('MASTER_LOGIN', 'USER_LOGIN');

-- CreateEnum
CREATE TYPE "ModulesVendorMappingActiveStatus" AS ENUM ('Yes', 'No');

-- CreateEnum
CREATE TYPE "MachineStatus" AS ENUM ('ACTIVE', 'MAINTENANCE', 'INACTIVE', 'RETIRED');

-- CreateEnum
CREATE TYPE "ScanType" AS ENUM ('IN', 'OUT', 'BOTH', 'PASS');

-- CreateEnum
CREATE TYPE "UserMachineStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "UserActivityType" AS ENUM ('RESET_PASSWORD', 'LOGIN', 'LOGOUT');

-- CreateEnum
CREATE TYPE "ServiceVisitStatus" AS ENUM ('open', 'completed', 'rejected');

-- CreateEnum
CREATE TYPE "ServiceVisitType" AS ENUM ('free', 'amc');

-- CreateEnum
CREATE TYPE "ServiceClosureReason" AS ENUM ('no_amc_after_free', 'converted_to_amc', 'manually_closed');

-- CreateEnum
CREATE TYPE "DefectStatus" AS ENUM ('Pending', 'Completed');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'APPROVAL';

-- AlterEnum
ALTER TYPE "TechCheckStatus" ADD VALUE 'REVISED';

-- DropForeignKey
ALTER TABLE "BoxMaster" DROP CONSTRAINT "BoxMaster_client_id_fkey";

-- DropForeignKey
ALTER TABLE "ProjectDetails" DROP CONSTRAINT "ProjectDetails_client_id_fkey";

-- DropForeignKey
ALTER TABLE "ProjectItemsMaster" DROP CONSTRAINT "ProjectItemsMaster_client_id_fkey";

-- DropIndex
DROP INDEX "UserLeadTask_small_order_request_id_idx";

-- AlterTable
ALTER TABLE "AccountMaster" ADD COLUMN     "franchise_id" INTEGER;

-- AlterTable
ALTER TABLE "BoxMaster" DROP COLUMN "client_id",
ADD COLUMN     "factory_out_at" TIMESTAMP(3),
ADD COLUMN     "factory_out_by" INTEGER,
ADD COLUMN     "lead_id" INTEGER,
ADD COLUMN     "site_in_at" TIMESTAMP(3),
ADD COLUMN     "site_in_by" INTEGER;

-- AlterTable
ALTER TABLE "CompanyVendorsMaster" ADD COLUMN     "default_payment_term_id" INTEGER,
ADD COLUMN     "state_id" INTEGER;

-- AlterTable
ALTER TABLE "DocumentTypeMaster" ADD COLUMN     "doc_title" TEXT,
ADD COLUMN     "stage" TEXT;

-- AlterTable
ALTER TABLE "IssueLogTypeMaster" ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'active';

-- AlterTable
ALTER TABLE "LeadDesignMeeting" ADD COLUMN     "meeting_type_id" INTEGER;

-- AlterTable
ALTER TABLE "LeadDetailedLogs" ADD COLUMN     "task_id" INTEGER;

-- AlterTable
ALTER TABLE "LeadMaster" ADD COLUMN     "actual_installation_completion_at" TIMESTAMP(3),
ADD COLUMN     "amc_plan_closed_at" TIMESTAMP(3),
ADD COLUMN     "amc_plan_started_at" TIMESTAMP(3),
ADD COLUMN     "fast_production_approved_at" TIMESTAMP(3),
ADD COLUMN     "fast_production_status" "FastProductionRequestStatus",
ADD COLUMN     "final_handover_marked_at" TIMESTAMP(3),
ADD COLUMN     "franchise_id" INTEGER,
ADD COLUMN     "is_fast_production" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "is_small_order_request" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "order_login_prod_files_remark" TEXT,
ADD COLUMN     "priority" TEXT,
ADD COLUMN     "tech_check_completed_at" TIMESTAMP(3),
ADD COLUMN     "tech_check_reached_at" TIMESTAMP(3),
ADD COLUMN     "total_required_chs_manufacturing_days" INTEGER,
ADD COLUMN     "usable_handover_completed" BOOLEAN DEFAULT false,
ADD COLUMN     "usable_handover_completed_at" TIMESTAMP(3),
ALTER COLUMN "material_lift_availability" DROP DEFAULT,
ALTER COLUMN "is_blocked" SET NOT NULL,
ALTER COLUMN "material_lift_size" SET DATA TYPE TEXT;

-- AlterTable
ALTER TABLE "LeadProductStructureInstance" ADD COLUMN     "is_order_login_filled" BOOLEAN DEFAULT false,
ADD COLUMN     "is_post_production" BOOLEAN,
ADD COLUMN     "is_pre_prod_done" BOOLEAN,
ADD COLUMN     "is_under_production" BOOLEAN,
ADD COLUMN     "pre_prod_done_at" TIMESTAMP(3),
ADD COLUMN     "production_erd_date" TIMESTAMP(3),
ADD COLUMN     "under_production_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "MiscellaneousMaster" ADD COLUMN     "exp_of_rejection" TEXT,
ADD COLUMN     "misc_approved" BOOLEAN,
ADD COLUMN     "required_delivery_date" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "MiscellaneousTeamMaster" ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'active';

-- AlterTable
ALTER TABLE "MiscellaneousTypeMaster" ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'active';

-- AlterTable
ALTER TABLE "PaymentInfo" ADD COLUMN     "status_id" INTEGER;

-- AlterTable
ALTER TABLE "ProjectDetails" DROP COLUMN "client_id",
ADD COLUMN     "lead_id" INTEGER,
ALTER COLUMN "estimated_completion_date" DROP NOT NULL;

-- AlterTable
ALTER TABLE "ProjectItemsMaster" DROP COLUMN "client_id";

-- AlterTable
ALTER TABLE "ProjectMaster" ADD COLUMN     "lead_id" INTEGER,
ADD COLUMN     "track_completed_at" TIMESTAMP(3),
ADD COLUMN     "track_started_at" TIMESTAMP(3),
ADD COLUMN     "track_trace_status" TEXT NOT NULL DEFAULT 'Not Started',
ALTER COLUMN "client_id" DROP NOT NULL,
ALTER COLUMN "client_id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "UserLeadTask" ADD COLUMN     "franchise_id" INTEGER,
ADD COLUMN     "instance_id" INTEGER;

-- AlterTable
ALTER TABLE "UserMaster" ADD COLUMN     "franchise_id" INTEGER;

-- AlterTable
ALTER TABLE "VendorMaster" ADD COLUMN     "IsAccountLocInEnabled" BOOLEAN DEFAULT false,
ADD COLUMN     "is_client_visit_enabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "is_year_wise_lead_code_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "state_id" INTEGER,
ADD COLUMN     "subdomain_url" TEXT,
ADD COLUMN     "vendor-report-code" TEXT;

-- AlterTable
ALTER TABLE "smallOrderRequests" ADD COLUMN     "is_request_resolved" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "small_order_request_type_master" ALTER COLUMN "updated_at" DROP DEFAULT;

-- CreateTable
CREATE TABLE "PrivilegeMaster" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "parent_module" TEXT NOT NULL,
    "child_module" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PrivilegeMaster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserSession" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "refresh_token_hash" TEXT NOT NULL,
    "access_jti" TEXT,
    "device_id" TEXT,
    "device_name" TEXT,
    "platform" TEXT,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "login_type" "UserSessionLoginType" NOT NULL DEFAULT 'USER_LOGIN',
    "status" "UserSessionStatus" NOT NULL DEFAULT 'active',
    "is_current" BOOLEAN DEFAULT true,
    "last_seen_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "logged_out_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "revoked_by" INTEGER,
    "revoke_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserPrivilegeMapping" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "privilege_id" INTEGER NOT NULL,
    "is_allowed" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserPrivilegeMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadSuperAdminApprovalLocIns" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "franchise_id" INTEGER,
    "lead_id" INTEGER NOT NULL,
    "approval_type" "SuperAdminApprovalType" NOT NULL,
    "created_by" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_approved" BOOLEAN NOT NULL DEFAULT false,
    "approved_at" TIMESTAMP(3),
    "approved_by" INTEGER,
    "approval_remark" TEXT,

    CONSTRAINT "LeadSuperAdminApprovalLocIns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CarcassTypeMaster" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "vendor_id" INTEGER NOT NULL,

    CONSTRAINT "CarcassTypeMaster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShutterTypeMaster" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "vendor_id" INTEGER NOT NULL,

    CONSTRAINT "ShutterTypeMaster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShutterSubTypeMaster" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "shutter_type_id" INTEGER NOT NULL,

    CONSTRAINT "ShutterSubTypeMaster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HandleTypeMaster" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "vendor_id" INTEGER NOT NULL,

    CONSTRAINT "HandleTypeMaster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimelineRule" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "carcass_id" INTEGER NOT NULL,
    "shutter_id" INTEGER,
    "kitchen_manufacturing_days" INTEGER NOT NULL,
    "other_manufacturing_days" INTEGER NOT NULL,
    "kitchen_manufacturing_days_for_fast_production" INTEGER,
    "other_manufacturing_days_for_fast_production" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TimelineRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadAmcContract" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "lead_id" INTEGER NOT NULL,
    "account_id" INTEGER NOT NULL,
    "contract_start_date" TIMESTAMP(3) NOT NULL,
    "contract_end_date" TIMESTAMP(3),
    "document_id" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_by" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" INTEGER,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeadAmcContract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadServiceSchedule" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "lead_id" INTEGER NOT NULL,
    "account_id" INTEGER NOT NULL,
    "service_no" INTEGER NOT NULL,
    "service_type" "ServiceVisitType" NOT NULL DEFAULT 'free',
    "scheduled_for" TIMESTAMP(3) NOT NULL,
    "original_scheduled_for" TIMESTAMP(3) NOT NULL,
    "status" "ServiceVisitStatus" NOT NULL DEFAULT 'open',
    "rescheduled_once" BOOLEAN NOT NULL DEFAULT false,
    "rescheduled_from" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "completed_by" INTEGER,
    "completion_remark" VARCHAR(2000),
    "completion_document_id" INTEGER,
    "rejected_at" TIMESTAMP(3),
    "rejected_by" INTEGER,
    "rejection_remark" VARCHAR(2000),
    "closure_reason" "ServiceClosureReason",
    "created_by" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" INTEGER,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeadServiceSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadClientVisit" (
    "id" SERIAL NOT NULL,
    "lead_id" INTEGER NOT NULL,
    "account_id" INTEGER NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "meeting_type_id" INTEGER,
    "visit_type" "ClientVisitType" NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "location" VARCHAR(2000),
    "remark" VARCHAR(2000) NOT NULL,
    "expense_incurred" DOUBLE PRECISION,
    "created_by" INTEGER NOT NULL,
    "updated_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeadClientVisit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeetingTypeMaster" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MeetingTypeMaster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadClientVisitDocumentMapping" (
    "id" SERIAL NOT NULL,
    "lead_id" INTEGER NOT NULL,
    "account_id" INTEGER NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "client_visit_id" INTEGER NOT NULL,
    "document_id" INTEGER NOT NULL,
    "document_role" "ClientVisitDocumentRole" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" INTEGER NOT NULL,

    CONSTRAINT "LeadClientVisitDocumentMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chs_selection_type_mapping" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "lead_id" INTEGER NOT NULL,
    "selection_id" INTEGER NOT NULL,
    "carcass_type_id" INTEGER,
    "shutter_type_id" INTEGER,
    "shutter_sub_type_id" INTEGER,
    "handle_type_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" INTEGER NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" INTEGER,

    CONSTRAINT "chs_selection_type_mapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FastProductionRequestBatch" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "lead_id" INTEGER NOT NULL,
    "account_id" INTEGER NOT NULL,
    "franchise_id" INTEGER,
    "requester_user_id" INTEGER NOT NULL,
    "month_bucket" TIMESTAMP(3) NOT NULL,
    "status" "FastProductionRequestStatus" NOT NULL DEFAULT 'draft',
    "terms_accepted_at" TIMESTAMP(3) NOT NULL,
    "terms_version" VARCHAR(100),
    "approved_at" TIMESTAMP(3),
    "rejected_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "revoked_by" INTEGER,
    "revocation_remark" VARCHAR(2000),
    "created_by" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" INTEGER,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FastProductionRequestBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FastProductionRequest" (
    "id" SERIAL NOT NULL,
    "batch_id" INTEGER NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "lead_id" INTEGER NOT NULL,
    "account_id" INTEGER NOT NULL,
    "instance_id" INTEGER NOT NULL,
    "franchise_id" INTEGER,
    "task_id" INTEGER,
    "requester_user_id" INTEGER NOT NULL,
    "month_bucket" TIMESTAMP(3) NOT NULL,
    "status" "FastProductionRequestStatus" NOT NULL DEFAULT 'draft',
    "hardware_selection" VARCHAR(4000) NOT NULL,
    "accessory_selection" VARCHAR(4000) NOT NULL,
    "special_requirements" VARCHAR(4000) NOT NULL,
    "client_required_delivery_date" TIMESTAMP(3) NOT NULL,
    "remarks" VARCHAR(2000),
    "terms_accepted_at" TIMESTAMP(3) NOT NULL,
    "terms_version" VARCHAR(100),
    "approved_at" TIMESTAMP(3),
    "rejected_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "revoked_by" INTEGER,
    "revocation_remark" VARCHAR(2000),
    "created_by" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" INTEGER,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FastProductionRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FastProductionFinish" (
    "id" SERIAL NOT NULL,
    "request_id" INTEGER NOT NULL,
    "component" "FastProductionFinishComponent" NOT NULL,
    "finish_category" VARCHAR(255) NOT NULL,
    "finish_description" VARCHAR(2000) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FastProductionFinish_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FastProductionApproval" (
    "id" SERIAL NOT NULL,
    "batch_id" INTEGER NOT NULL,
    "approver_role" "FastProductionApproverRole" NOT NULL,
    "approver_user_id" INTEGER,
    "status" "FastProductionApprovalStatus" NOT NULL DEFAULT 'pending',
    "remark" VARCHAR(2000),
    "acted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FastProductionApproval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FastProductionRequestDocument" (
    "id" SERIAL NOT NULL,
    "request_id" INTEGER NOT NULL,
    "document_id" INTEGER NOT NULL,
    "created_by" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FastProductionRequestDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FastProductionStatusLog" (
    "id" SERIAL NOT NULL,
    "batch_id" INTEGER NOT NULL,
    "from_status" "FastProductionRequestStatus",
    "to_status" "FastProductionRequestStatus" NOT NULL,
    "actor_user_id" INTEGER NOT NULL,
    "remark" VARCHAR(2000),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FastProductionStatusLog_pkey" PRIMARY KEY ("id")
);

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
    "group_name" TEXT,
    "procurement" TEXT,
    "category_name" TEXT,

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
    "box_id" INTEGER,
    "site_in_at" TIMESTAMP(3),
    "site_in_by" INTEGER,

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
    "action" TEXT,
    "rework_machine_id" INTEGER,
    "defect_status" "DefectStatus" NOT NULL DEFAULT 'Pending',
    "defect_completed_by" INTEGER,
    "defect_completed_at" TIMESTAMP(3),

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

-- CreateTable
CREATE TABLE "UserActivityLog" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "activity_type" "UserActivityType" NOT NULL,
    "metadata" JSONB,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserActivityLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ThemeMaster" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ThemeMaster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ThemeMapping" (
    "id" SERIAL NOT NULL,
    "theme_id" INTEGER NOT NULL,
    "key" TEXT NOT NULL,
    "light" TEXT NOT NULL,
    "dark" TEXT NOT NULL,

    CONSTRAINT "ThemeMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiRequestLog" (
    "id" SERIAL NOT NULL,
    "endpoint" TEXT NOT NULL,
    "vendor_token" TEXT,
    "vendor_id" INTEGER,
    "payload" JSONB NOT NULL,
    "success" BOOLEAN NOT NULL,
    "response" JSONB NOT NULL,
    "error" TEXT,
    "project_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiRequestLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DefectedItemImage" (
    "id" SERIAL NOT NULL,
    "defected_item_id" INTEGER NOT NULL,
    "doc_og_name" TEXT NOT NULL,
    "doc_sys_name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DefectedItemImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DefectCompletionPhoto" (
    "id" SERIAL NOT NULL,
    "cut_list_machine_mapping_id" INTEGER NOT NULL,
    "cut_list_id" INTEGER NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "defected_item_id" INTEGER,
    "doc_og_name" TEXT NOT NULL,
    "doc_sys_name" TEXT NOT NULL,
    "created_by" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DefectCompletionPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectCategoriesTypeMaster" (
    "id" SERIAL NOT NULL,
    "module_name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectCategoriesTypeMaster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectCategoriesMaster" (
    "id" SERIAL NOT NULL,
    "category_name" TEXT NOT NULL,
    "status" "ProjectCategoriesStatus" NOT NULL DEFAULT 'Yes',
    "vendor_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "external_category_id" INTEGER,

    CONSTRAINT "ProjectCategoriesMaster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectCategoriesMasterVendorMapping" (
    "id" SERIAL NOT NULL,
    "project_categories_master_id" INTEGER NOT NULL,
    "project_categories_type_master_id" INTEGER NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" INTEGER NOT NULL,
    "updated_by" INTEGER NOT NULL,

    CONSTRAINT "ProjectCategoriesMasterVendorMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrandMaster" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "brand_name" TEXT NOT NULL,
    "active" "BrandActiveFlag" NOT NULL DEFAULT 'Yes',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BrandMaster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductMaster" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "item_id" INTEGER NOT NULL,
    "rotation" INTEGER NOT NULL DEFAULT 0,
    "alt_conv_factor" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "board_length" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "board_width" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "dimension_1" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "dimension_2" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "dimension_3" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "installation_charges" DECIMAL(12,2),
    "item1_weight" DECIMAL(12,2),
    "level1_price" DECIMAL(12,2),
    "level2_price" DECIMAL(12,2),
    "level3_price" DECIMAL(12,2),
    "moq" INTEGER NOT NULL DEFAULT 0,
    "no_of_drill_holes" INTEGER NOT NULL DEFAULT 0,
    "pre_mill_width" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "alt_uom_text" TEXT,
    "brand_id" INTEGER,
    "category_id" INTEGER NOT NULL,
    "article_code" TEXT,
    "core_material" TEXT,
    "edge_banding_color" TEXT,
    "finish" TEXT,
    "group" TEXT,
    "hsn_code" TEXT,
    "hsn_id" INTEGER,
    "product_name" TEXT NOT NULL,
    "procurement" TEXT,
    "unit_of_measure" TEXT,
    "vendor_code" TEXT,
    "custom_field_1" TEXT,
    "custom_field_2" TEXT,
    "custom_field_3" TEXT,
    "created_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" INTEGER,
    "active" "ProductActiveFlag" NOT NULL DEFAULT 'Yes',
    "current_stock" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "stock_updated_at" TIMESTAMP(3),

    CONSTRAINT "ProductMaster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseIntentMaster" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "intent_no" TEXT NOT NULL,
    "category_id" INTEGER NOT NULL,
    "status" "PurchaseIntentStatus" NOT NULL DEFAULT 'Draft',
    "priority" "PurchaseIntentPriority" NOT NULL DEFAULT 'Medium',
    "remarks" TEXT,
    "created_by" INTEGER NOT NULL,
    "updated_by" INTEGER,
    "approved_by" INTEGER,
    "approved_at" TIMESTAMP(3),
    "rejected_by" INTEGER,
    "rejected_at" TIMESTAMP(3),
    "rejection_reason" TEXT,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(18,2),
    "tax_amount" DECIMAL(18,2),
    "total_amount" DECIMAL(18,2),

    CONSTRAINT "PurchaseIntentMaster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseIntentItem" (
    "id" SERIAL NOT NULL,
    "purchase_intent_id" INTEGER NOT NULL,
    "product_id" INTEGER NOT NULL,
    "uom" TEXT,
    "remarks" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseIntentItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseIntentItemVendorMapping" (
    "id" SERIAL NOT NULL,
    "purchase_intent_item_id" INTEGER NOT NULL,
    "company_vendor_id" INTEGER NOT NULL,
    "required_qty" DECIMAL(12,2) NOT NULL,
    "required_by_date" TIMESTAMP(3),
    "estimated_price" DECIMAL(12,2),
    "remarks" TEXT,
    "is_selected" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "mrp" DECIMAL(12,2),
    "discount_pct" DECIMAL(5,2),
    "rate" DECIMAL(12,2),
    "tax_pct" DECIMAL(5,2),
    "cgst_pct" DECIMAL(5,2),
    "sgst_pct" DECIMAL(5,2),
    "igst_pct" DECIMAL(5,2),
    "tax_amount" DECIMAL(12,2),
    "amount" DECIMAL(12,2),
    "total_amount" DECIMAL(12,2),
    "payment_term_id" INTEGER,

    CONSTRAINT "PurchaseIntentItemVendorMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseIntentStatusLog" (
    "id" SERIAL NOT NULL,
    "purchase_intent_id" INTEGER NOT NULL,
    "from_status" "PurchaseIntentStatus",
    "to_status" "PurchaseIntentStatus" NOT NULL,
    "changed_by" INTEGER NOT NULL,
    "remarks" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PurchaseIntentStatusLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseOrderMaster" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "po_no" TEXT NOT NULL,
    "purchase_intent_id" INTEGER NOT NULL,
    "company_vendor_id" INTEGER NOT NULL,
    "status" "PurchaseOrderStatus" NOT NULL DEFAULT 'Draft',
    "remarks" TEXT,
    "expected_delivery_date" TIMESTAMP(3),
    "created_by" INTEGER NOT NULL,
    "updated_by" INTEGER,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(18,2),
    "tax_amount" DECIMAL(18,2),
    "total_amount" DECIMAL(18,2),
    "payment_term_id" INTEGER,

    CONSTRAINT "PurchaseOrderMaster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseOrderItem" (
    "id" SERIAL NOT NULL,
    "purchase_order_id" INTEGER NOT NULL,
    "product_id" INTEGER NOT NULL,
    "pi_item_vendor_mapping_id" INTEGER,
    "ordered_qty" DECIMAL(12,2) NOT NULL,
    "received_qty" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "unit_price" DECIMAL(12,2),
    "uom" TEXT,
    "expected_delivery_date" TIMESTAMP(3),
    "remarks" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" INTEGER,
    "updated_by" INTEGER,
    "mrp" DECIMAL(12,2),
    "discount_pct" DECIMAL(5,2),
    "rate" DECIMAL(12,2),
    "tax_pct" DECIMAL(5,2),
    "cgst_pct" DECIMAL(5,2),
    "sgst_pct" DECIMAL(5,2),
    "igst_pct" DECIMAL(5,2),
    "tax_amount" DECIMAL(12,2),
    "amount" DECIMAL(12,2),
    "total_amount" DECIMAL(12,2),
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" INTEGER,

    CONSTRAINT "PurchaseOrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GRNMaster" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "grn_no" TEXT NOT NULL,
    "purchase_order_id" INTEGER NOT NULL,
    "company_vendor_id" INTEGER NOT NULL,
    "status" "GRNStatus" NOT NULL DEFAULT 'Draft',
    "received_date" TIMESTAMP(3) NOT NULL,
    "vehicle_no" TEXT,
    "gate_entry_no" TEXT,
    "invoice_no" TEXT,
    "invoice_date" TIMESTAMP(3),
    "invoice_amount" DECIMAL(12,2),
    "remarks" TEXT,
    "created_by" INTEGER NOT NULL,
    "updated_by" INTEGER,
    "confirmed_by" INTEGER,
    "confirmed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "subtotal_amount" DECIMAL(18,2),
    "cgst_amount" DECIMAL(18,2) DEFAULT 0,
    "sgst_amount" DECIMAL(18,2) DEFAULT 0,
    "igst_amount" DECIMAL(18,2) DEFAULT 0,
    "cess_amount" DECIMAL(18,2) DEFAULT 0,
    "discount_amount" DECIMAL(18,2) DEFAULT 0,
    "packing_amount" DECIMAL(18,2) DEFAULT 0,
    "freight_amount" DECIMAL(18,2) DEFAULT 0,
    "other_charges_amount" DECIMAL(18,2) DEFAULT 0,
    "roundoff_amount" DECIMAL(18,2) DEFAULT 0,
    "taxable_amount" DECIMAL(18,2),
    "total_amount" DECIMAL(18,2),
    "eway_bill_no" TEXT,
    "transporter_name" TEXT,
    "lr_no" TEXT,
    "lr_date" TIMESTAMP(3),

    CONSTRAINT "GRNMaster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GRNItem" (
    "id" SERIAL NOT NULL,
    "grn_id" INTEGER NOT NULL,
    "po_item_id" INTEGER NOT NULL,
    "product_id" INTEGER NOT NULL,
    "received_qty" DECIMAL(12,2) NOT NULL,
    "accepted_qty" DECIMAL(12,2) NOT NULL,
    "rejected_qty" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "unit_price" DECIMAL(12,2),
    "uom" TEXT,
    "status" "GRNItemStatus" NOT NULL DEFAULT 'Accepted',
    "rejection_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "mrp" DECIMAL(12,2),
    "discount_pct" DECIMAL(5,2),
    "rate" DECIMAL(12,2),
    "tax_pct" DECIMAL(5,2),
    "cgst_pct" DECIMAL(5,2),
    "sgst_pct" DECIMAL(5,2),
    "igst_pct" DECIMAL(5,2),
    "tax_amount" DECIMAL(12,2),
    "amount" DECIMAL(12,2),
    "total_amount" DECIMAL(12,2),
    "hsn_code" TEXT,
    "gst_percentage" DECIMAL(5,2),
    "taxable_amount" DECIMAL(18,2),
    "cgst_percentage" DECIMAL(5,2),
    "sgst_percentage" DECIMAL(5,2),
    "igst_percentage" DECIMAL(5,2),
    "cgst_amount" DECIMAL(18,2) DEFAULT 0,
    "sgst_amount" DECIMAL(18,2) DEFAULT 0,
    "igst_amount" DECIMAL(18,2) DEFAULT 0,
    "discount_percentage" DECIMAL(5,2) DEFAULT 0,
    "discount_amount" DECIMAL(18,2) DEFAULT 0,
    "line_total" DECIMAL(18,2),

    CONSTRAINT "GRNItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DebitCreditNote" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "note_no" TEXT NOT NULL,
    "grn_id" INTEGER NOT NULL,
    "company_vendor_id" INTEGER NOT NULL,
    "type" "DebitCreditNoteType" NOT NULL,
    "status" "DebitCreditNoteStatus" NOT NULL DEFAULT 'Open',
    "amount" DECIMAL(12,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "remarks" TEXT,
    "settled_at" TIMESTAMP(3),
    "settled_by" INTEGER,
    "created_by" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DebitCreditNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RedeliveryRequest" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "grn_item_id" INTEGER NOT NULL,
    "company_vendor_id" INTEGER NOT NULL,
    "requested_qty" DECIMAL(12,2) NOT NULL,
    "expected_date" TIMESTAMP(3),
    "received_date" TIMESTAMP(3),
    "status" "RedeliveryStatus" NOT NULL DEFAULT 'Requested',
    "remarks" TEXT,
    "created_by" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RedeliveryRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HsnProductMapping" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "hsn_code" TEXT NOT NULL,
    "description" TEXT,
    "cgst_rate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "sgst_rate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "igst_rate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "cess_rate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "effective_from" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HsnProductMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductStockHistory" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "product_id" INTEGER NOT NULL,
    "old_stock" DECIMAL(12,2) NOT NULL,
    "new_stock" DECIMAL(12,2) NOT NULL,
    "change" DECIMAL(12,2) NOT NULL,
    "source" "StockChangeSource" NOT NULL,
    "changed_by" INTEGER,
    "upload_batch_id" TEXT,
    "remarks" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductStockHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentTermMaster" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "company_vendor_id" INTEGER,
    "term_name" TEXT NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" INTEGER,
    "updated_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentTermMaster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentTermStage" (
    "id" SERIAL NOT NULL,
    "payment_term_id" INTEGER NOT NULL,
    "stage_no" INTEGER NOT NULL,
    "stage_name" TEXT NOT NULL,
    "trigger_type" "PaymentTriggerType" NOT NULL,
    "percentage" DECIMAL(5,2),
    "fixed_amount" DECIMAL(12,2),
    "due_after_days" INTEGER,
    "specific_date" TIMESTAMP(3),
    "requires_approval" BOOLEAN NOT NULL DEFAULT false,
    "remarks" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentTermStage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "POPaymentSchedule" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "purchase_order_id" INTEGER NOT NULL,
    "stage_no" INTEGER NOT NULL,
    "stage_name" TEXT NOT NULL,
    "trigger_type" "PaymentTriggerType" NOT NULL,
    "percentage" DECIMAL(5,2),
    "scheduled_amount" DECIMAL(12,2),
    "paid_amount" DECIMAL(12,2) DEFAULT 0,
    "pending_amount" DECIMAL(12,2) DEFAULT 0,
    "due_date" TIMESTAMP(3),
    "status" "PaymentScheduleStatus" NOT NULL DEFAULT 'Pending',
    "remarks" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "POPaymentSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "POPayment" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "po_payment_schedule_id" INTEGER NOT NULL,
    "payment_date" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "payment_mode" "PaymentMode" NOT NULL,
    "reference_no" TEXT,
    "remarks" TEXT,
    "created_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "POPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_BoxMasterToLeadMaster" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL,

    CONSTRAINT "_BoxMasterToLeadMaster_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "PrivilegeMaster_vendor_id_idx" ON "PrivilegeMaster"("vendor_id");

-- CreateIndex
CREATE UNIQUE INDEX "PrivilegeMaster_vendor_id_code_key" ON "PrivilegeMaster"("vendor_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "UserSession_access_jti_key" ON "UserSession"("access_jti");

-- CreateIndex
CREATE INDEX "UserSession_user_id_status_idx" ON "UserSession"("user_id", "status");

-- CreateIndex
CREATE INDEX "UserSession_user_id_created_at_idx" ON "UserSession"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "UserSession_vendor_id_status_idx" ON "UserSession"("vendor_id", "status");

-- CreateIndex
CREATE INDEX "UserSession_device_id_idx" ON "UserSession"("device_id");

-- CreateIndex
CREATE INDEX "UserPrivilegeMapping_vendor_id_idx" ON "UserPrivilegeMapping"("vendor_id");

-- CreateIndex
CREATE INDEX "UserPrivilegeMapping_user_id_idx" ON "UserPrivilegeMapping"("user_id");

-- CreateIndex
CREATE INDEX "UserPrivilegeMapping_privilege_id_idx" ON "UserPrivilegeMapping"("privilege_id");

-- CreateIndex
CREATE UNIQUE INDEX "UserPrivilegeMapping_vendor_id_user_id_privilege_id_key" ON "UserPrivilegeMapping"("vendor_id", "user_id", "privilege_id");

-- CreateIndex
CREATE INDEX "LeadSuperAdminApprovalLocIns_vendor_id_idx" ON "LeadSuperAdminApprovalLocIns"("vendor_id");

-- CreateIndex
CREATE INDEX "LeadSuperAdminApprovalLocIns_franchise_id_idx" ON "LeadSuperAdminApprovalLocIns"("franchise_id");

-- CreateIndex
CREATE INDEX "LeadSuperAdminApprovalLocIns_lead_id_idx" ON "LeadSuperAdminApprovalLocIns"("lead_id");

-- CreateIndex
CREATE INDEX "LeadSuperAdminApprovalLocIns_created_by_idx" ON "LeadSuperAdminApprovalLocIns"("created_by");

-- CreateIndex
CREATE INDEX "LeadSuperAdminApprovalLocIns_approved_by_idx" ON "LeadSuperAdminApprovalLocIns"("approved_by");

-- CreateIndex
CREATE UNIQUE INDEX "LeadSuperAdminApprovalLocIns_vendor_id_lead_id_approval_typ_key" ON "LeadSuperAdminApprovalLocIns"("vendor_id", "lead_id", "approval_type");

-- CreateIndex
CREATE INDEX "TimelineRule_carcass_id_idx" ON "TimelineRule"("carcass_id");

-- CreateIndex
CREATE INDEX "TimelineRule_shutter_id_idx" ON "TimelineRule"("shutter_id");

-- CreateIndex
CREATE UNIQUE INDEX "TimelineRule_vendor_id_carcass_id_shutter_id_key" ON "TimelineRule"("vendor_id", "carcass_id", "shutter_id");

-- CreateIndex
CREATE INDEX "LeadAmcContract_vendor_id_lead_id_idx" ON "LeadAmcContract"("vendor_id", "lead_id");

-- CreateIndex
CREATE INDEX "LeadServiceSchedule_vendor_id_status_scheduled_for_idx" ON "LeadServiceSchedule"("vendor_id", "status", "scheduled_for");

-- CreateIndex
CREATE INDEX "LeadServiceSchedule_lead_id_service_no_idx" ON "LeadServiceSchedule"("lead_id", "service_no");

-- CreateIndex
CREATE INDEX "LeadServiceSchedule_completed_at_idx" ON "LeadServiceSchedule"("completed_at");

-- CreateIndex
CREATE INDEX "LeadServiceSchedule_rejected_at_idx" ON "LeadServiceSchedule"("rejected_at");

-- CreateIndex
CREATE UNIQUE INDEX "LeadServiceSchedule_lead_id_service_no_service_type_key" ON "LeadServiceSchedule"("lead_id", "service_no", "service_type");

-- CreateIndex
CREATE INDEX "LeadClientVisit_vendor_id_idx" ON "LeadClientVisit"("vendor_id");

-- CreateIndex
CREATE INDEX "LeadClientVisit_lead_id_idx" ON "LeadClientVisit"("lead_id");

-- CreateIndex
CREATE INDEX "LeadClientVisit_account_id_idx" ON "LeadClientVisit"("account_id");

-- CreateIndex
CREATE INDEX "LeadClientVisit_meeting_type_id_idx" ON "LeadClientVisit"("meeting_type_id");

-- CreateIndex
CREATE INDEX "LeadClientVisit_visit_type_idx" ON "LeadClientVisit"("visit_type");

-- CreateIndex
CREATE INDEX "LeadClientVisit_date_idx" ON "LeadClientVisit"("date");

-- CreateIndex
CREATE INDEX "MeetingTypeMaster_vendor_id_idx" ON "MeetingTypeMaster"("vendor_id");

-- CreateIndex
CREATE INDEX "LeadClientVisitDocumentMapping_vendor_id_idx" ON "LeadClientVisitDocumentMapping"("vendor_id");

-- CreateIndex
CREATE INDEX "LeadClientVisitDocumentMapping_lead_id_idx" ON "LeadClientVisitDocumentMapping"("lead_id");

-- CreateIndex
CREATE INDEX "LeadClientVisitDocumentMapping_account_id_idx" ON "LeadClientVisitDocumentMapping"("account_id");

-- CreateIndex
CREATE INDEX "LeadClientVisitDocumentMapping_client_visit_id_idx" ON "LeadClientVisitDocumentMapping"("client_visit_id");

-- CreateIndex
CREATE INDEX "LeadClientVisitDocumentMapping_document_id_idx" ON "LeadClientVisitDocumentMapping"("document_id");

-- CreateIndex
CREATE INDEX "LeadClientVisitDocumentMapping_document_role_idx" ON "LeadClientVisitDocumentMapping"("document_role");

-- CreateIndex
CREATE UNIQUE INDEX "LeadClientVisitDocumentMapping_client_visit_id_document_id__key" ON "LeadClientVisitDocumentMapping"("client_visit_id", "document_id", "document_role");

-- CreateIndex
CREATE INDEX "FastProductionRequestBatch_vendor_id_lead_id_idx" ON "FastProductionRequestBatch"("vendor_id", "lead_id");

-- CreateIndex
CREATE INDEX "FastProductionRequestBatch_vendor_id_requester_user_id_mont_idx" ON "FastProductionRequestBatch"("vendor_id", "requester_user_id", "month_bucket");

-- CreateIndex
CREATE INDEX "FastProductionRequestBatch_vendor_id_status_idx" ON "FastProductionRequestBatch"("vendor_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "FastProductionRequest_task_id_key" ON "FastProductionRequest"("task_id");

-- CreateIndex
CREATE INDEX "FastProductionRequest_batch_id_idx" ON "FastProductionRequest"("batch_id");

-- CreateIndex
CREATE INDEX "FastProductionRequest_vendor_id_lead_id_idx" ON "FastProductionRequest"("vendor_id", "lead_id");

-- CreateIndex
CREATE INDEX "FastProductionRequest_instance_id_idx" ON "FastProductionRequest"("instance_id");

-- CreateIndex
CREATE INDEX "FastProductionRequest_vendor_id_lead_id_instance_id_idx" ON "FastProductionRequest"("vendor_id", "lead_id", "instance_id");

-- CreateIndex
CREATE INDEX "FastProductionRequest_vendor_id_requester_user_id_month_buc_idx" ON "FastProductionRequest"("vendor_id", "requester_user_id", "month_bucket");

-- CreateIndex
CREATE INDEX "FastProductionRequest_vendor_id_status_idx" ON "FastProductionRequest"("vendor_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "FastProductionRequest_batch_id_instance_id_key" ON "FastProductionRequest"("batch_id", "instance_id");

-- CreateIndex
CREATE INDEX "FastProductionFinish_request_id_idx" ON "FastProductionFinish"("request_id");

-- CreateIndex
CREATE UNIQUE INDEX "FastProductionFinish_request_id_component_key" ON "FastProductionFinish"("request_id", "component");

-- CreateIndex
CREATE INDEX "FastProductionApproval_approver_user_id_idx" ON "FastProductionApproval"("approver_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "FastProductionApproval_batch_id_approver_role_key" ON "FastProductionApproval"("batch_id", "approver_role");

-- CreateIndex
CREATE INDEX "FastProductionRequestDocument_request_id_idx" ON "FastProductionRequestDocument"("request_id");

-- CreateIndex
CREATE INDEX "FastProductionRequestDocument_document_id_idx" ON "FastProductionRequestDocument"("document_id");

-- CreateIndex
CREATE INDEX "FastProductionStatusLog_batch_id_idx" ON "FastProductionStatusLog"("batch_id");

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

-- CreateIndex
CREATE INDEX "ThemeMaster_vendor_id_idx" ON "ThemeMaster"("vendor_id");

-- CreateIndex
CREATE UNIQUE INDEX "ThemeMapping_theme_id_key_key" ON "ThemeMapping"("theme_id", "key");

-- CreateIndex
CREATE INDEX "ApiRequestLog_vendor_id_idx" ON "ApiRequestLog"("vendor_id");

-- CreateIndex
CREATE INDEX "ApiRequestLog_created_at_idx" ON "ApiRequestLog"("created_at");

-- CreateIndex
CREATE INDEX "DefectCompletionPhoto_cut_list_machine_mapping_id_idx" ON "DefectCompletionPhoto"("cut_list_machine_mapping_id");

-- CreateIndex
CREATE INDEX "DefectCompletionPhoto_cut_list_id_idx" ON "DefectCompletionPhoto"("cut_list_id");

-- CreateIndex
CREATE INDEX "DefectCompletionPhoto_vendor_id_idx" ON "DefectCompletionPhoto"("vendor_id");

-- CreateIndex
CREATE INDEX "BrandMaster_vendor_id_idx" ON "BrandMaster"("vendor_id");

-- CreateIndex
CREATE INDEX "ProductMaster_vendor_id_idx" ON "ProductMaster"("vendor_id");

-- CreateIndex
CREATE INDEX "ProductMaster_brand_id_idx" ON "ProductMaster"("brand_id");

-- CreateIndex
CREATE INDEX "ProductMaster_category_id_idx" ON "ProductMaster"("category_id");

-- CreateIndex
CREATE INDEX "ProductMaster_item_id_idx" ON "ProductMaster"("item_id");

-- CreateIndex
CREATE INDEX "ProductMaster_hsn_id_idx" ON "ProductMaster"("hsn_id");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseIntentMaster_intent_no_key" ON "PurchaseIntentMaster"("intent_no");

-- CreateIndex
CREATE INDEX "PurchaseIntentMaster_vendor_id_idx" ON "PurchaseIntentMaster"("vendor_id");

-- CreateIndex
CREATE INDEX "PurchaseIntentMaster_category_id_idx" ON "PurchaseIntentMaster"("category_id");

-- CreateIndex
CREATE INDEX "PurchaseIntentMaster_status_idx" ON "PurchaseIntentMaster"("status");

-- CreateIndex
CREATE INDEX "PurchaseIntentMaster_created_by_idx" ON "PurchaseIntentMaster"("created_by");

-- CreateIndex
CREATE INDEX "PurchaseIntentItem_purchase_intent_id_idx" ON "PurchaseIntentItem"("purchase_intent_id");

-- CreateIndex
CREATE INDEX "PurchaseIntentItem_product_id_idx" ON "PurchaseIntentItem"("product_id");

-- CreateIndex
CREATE INDEX "PurchaseIntentItemVendorMapping_payment_term_id_idx" ON "PurchaseIntentItemVendorMapping"("payment_term_id");

-- CreateIndex
CREATE INDEX "PurchaseIntentItemVendorMapping_purchase_intent_item_id_idx" ON "PurchaseIntentItemVendorMapping"("purchase_intent_item_id");

-- CreateIndex
CREATE INDEX "PurchaseIntentItemVendorMapping_company_vendor_id_idx" ON "PurchaseIntentItemVendorMapping"("company_vendor_id");

-- CreateIndex
CREATE INDEX "PurchaseIntentStatusLog_purchase_intent_id_idx" ON "PurchaseIntentStatusLog"("purchase_intent_id");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseOrderMaster_po_no_key" ON "PurchaseOrderMaster"("po_no");

-- CreateIndex
CREATE INDEX "PurchaseOrderMaster_payment_term_id_idx" ON "PurchaseOrderMaster"("payment_term_id");

-- CreateIndex
CREATE INDEX "PurchaseOrderMaster_vendor_id_idx" ON "PurchaseOrderMaster"("vendor_id");

-- CreateIndex
CREATE INDEX "PurchaseOrderMaster_purchase_intent_id_idx" ON "PurchaseOrderMaster"("purchase_intent_id");

-- CreateIndex
CREATE INDEX "PurchaseOrderMaster_company_vendor_id_idx" ON "PurchaseOrderMaster"("company_vendor_id");

-- CreateIndex
CREATE INDEX "PurchaseOrderMaster_status_idx" ON "PurchaseOrderMaster"("status");

-- CreateIndex
CREATE INDEX "PurchaseOrderItem_purchase_order_id_idx" ON "PurchaseOrderItem"("purchase_order_id");

-- CreateIndex
CREATE INDEX "PurchaseOrderItem_product_id_idx" ON "PurchaseOrderItem"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "GRNMaster_grn_no_key" ON "GRNMaster"("grn_no");

-- CreateIndex
CREATE INDEX "GRNMaster_vendor_id_idx" ON "GRNMaster"("vendor_id");

-- CreateIndex
CREATE INDEX "GRNMaster_purchase_order_id_idx" ON "GRNMaster"("purchase_order_id");

-- CreateIndex
CREATE INDEX "GRNMaster_company_vendor_id_idx" ON "GRNMaster"("company_vendor_id");

-- CreateIndex
CREATE INDEX "GRNMaster_grn_no_idx" ON "GRNMaster"("grn_no");

-- CreateIndex
CREATE INDEX "GRNItem_grn_id_idx" ON "GRNItem"("grn_id");

-- CreateIndex
CREATE INDEX "GRNItem_po_item_id_idx" ON "GRNItem"("po_item_id");

-- CreateIndex
CREATE INDEX "GRNItem_product_id_idx" ON "GRNItem"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "DebitCreditNote_note_no_key" ON "DebitCreditNote"("note_no");

-- CreateIndex
CREATE INDEX "DebitCreditNote_vendor_id_idx" ON "DebitCreditNote"("vendor_id");

-- CreateIndex
CREATE INDEX "DebitCreditNote_grn_id_idx" ON "DebitCreditNote"("grn_id");

-- CreateIndex
CREATE INDEX "DebitCreditNote_company_vendor_id_idx" ON "DebitCreditNote"("company_vendor_id");

-- CreateIndex
CREATE INDEX "RedeliveryRequest_vendor_id_idx" ON "RedeliveryRequest"("vendor_id");

-- CreateIndex
CREATE INDEX "RedeliveryRequest_grn_item_id_idx" ON "RedeliveryRequest"("grn_item_id");

-- CreateIndex
CREATE INDEX "HsnProductMapping_vendor_id_idx" ON "HsnProductMapping"("vendor_id");

-- CreateIndex
CREATE INDEX "HsnProductMapping_hsn_code_idx" ON "HsnProductMapping"("hsn_code");

-- CreateIndex
CREATE UNIQUE INDEX "HsnProductMapping_vendor_id_hsn_code_key" ON "HsnProductMapping"("vendor_id", "hsn_code");

-- CreateIndex
CREATE INDEX "ProductStockHistory_vendor_id_idx" ON "ProductStockHistory"("vendor_id");

-- CreateIndex
CREATE INDEX "ProductStockHistory_product_id_idx" ON "ProductStockHistory"("product_id");

-- CreateIndex
CREATE INDEX "ProductStockHistory_upload_batch_id_idx" ON "ProductStockHistory"("upload_batch_id");

-- CreateIndex
CREATE INDEX "ProductStockHistory_created_at_idx" ON "ProductStockHistory"("created_at");

-- CreateIndex
CREATE INDEX "PaymentTermMaster_vendor_id_idx" ON "PaymentTermMaster"("vendor_id");

-- CreateIndex
CREATE INDEX "PaymentTermMaster_company_vendor_id_idx" ON "PaymentTermMaster"("company_vendor_id");

-- CreateIndex
CREATE INDEX "PaymentTermStage_payment_term_id_idx" ON "PaymentTermStage"("payment_term_id");

-- CreateIndex
CREATE INDEX "POPaymentSchedule_vendor_id_idx" ON "POPaymentSchedule"("vendor_id");

-- CreateIndex
CREATE INDEX "POPaymentSchedule_purchase_order_id_idx" ON "POPaymentSchedule"("purchase_order_id");

-- CreateIndex
CREATE INDEX "POPayment_vendor_id_idx" ON "POPayment"("vendor_id");

-- CreateIndex
CREATE INDEX "POPayment_po_payment_schedule_id_idx" ON "POPayment"("po_payment_schedule_id");

-- CreateIndex
CREATE INDEX "_BoxMasterToLeadMaster_B_index" ON "_BoxMasterToLeadMaster"("B");

-- CreateIndex
CREATE INDEX "CompanyVendorsMaster_default_payment_term_id_idx" ON "CompanyVendorsMaster"("default_payment_term_id");

-- CreateIndex
CREATE INDEX "CompanyVendorsMaster_state_id_idx" ON "CompanyVendorsMaster"("state_id");

-- CreateIndex
CREATE INDEX "LeadDesignMeeting_meeting_type_id_idx" ON "LeadDesignMeeting"("meeting_type_id");

-- CreateIndex
CREATE INDEX "LeadDetailedLogs_task_id_idx" ON "LeadDetailedLogs"("task_id");

-- CreateIndex
CREATE INDEX "VendorMaster_state_id_idx" ON "VendorMaster"("state_id");

-- RenameForeignKey
ALTER TABLE "LeadExternalPlatformCustomerMapping" RENAME CONSTRAINT "LeadExternalPlatformCustomerMapping_external_platform_token_id_" TO "LeadExternalPlatformCustomerMapping_external_platform_toke_fkey";

-- AddForeignKey
ALTER TABLE "VendorMaster" ADD CONSTRAINT "VendorMaster_state_id_fkey" FOREIGN KEY ("state_id") REFERENCES "StateMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrivilegeMaster" ADD CONSTRAINT "PrivilegeMaster_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserMaster" ADD CONSTRAINT "UserMaster_franchise_id_fkey" FOREIGN KEY ("franchise_id") REFERENCES "FranchiseMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSession" ADD CONSTRAINT "UserSession_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "UserMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSession" ADD CONSTRAINT "UserSession_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSession" ADD CONSTRAINT "UserSession_revoked_by_fkey" FOREIGN KEY ("revoked_by") REFERENCES "UserMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPrivilegeMapping" ADD CONSTRAINT "UserPrivilegeMapping_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPrivilegeMapping" ADD CONSTRAINT "UserPrivilegeMapping_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "UserMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPrivilegeMapping" ADD CONSTRAINT "UserPrivilegeMapping_privilege_id_fkey" FOREIGN KEY ("privilege_id") REFERENCES "PrivilegeMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMaster" ADD CONSTRAINT "ProjectMaster_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "LeadMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectDetails" ADD CONSTRAINT "ProjectDetails_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "LeadMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoxMaster" ADD CONSTRAINT "BoxMaster_factory_out_by_fkey" FOREIGN KEY ("factory_out_by") REFERENCES "UserMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoxMaster" ADD CONSTRAINT "BoxMaster_site_in_by_fkey" FOREIGN KEY ("site_in_by") REFERENCES "UserMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadMaster" ADD CONSTRAINT "LeadMaster_franchise_id_fkey" FOREIGN KEY ("franchise_id") REFERENCES "FranchiseMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadSuperAdminApprovalLocIns" ADD CONSTRAINT "LeadSuperAdminApprovalLocIns_franchise_id_fkey" FOREIGN KEY ("franchise_id") REFERENCES "FranchiseMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadSuperAdminApprovalLocIns" ADD CONSTRAINT "LeadSuperAdminApprovalLocIns_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "LeadMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadSuperAdminApprovalLocIns" ADD CONSTRAINT "LeadSuperAdminApprovalLocIns_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "UserMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadSuperAdminApprovalLocIns" ADD CONSTRAINT "LeadSuperAdminApprovalLocIns_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "UserMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadSuperAdminApprovalLocIns" ADD CONSTRAINT "LeadSuperAdminApprovalLocIns_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountMaster" ADD CONSTRAINT "AccountMaster_franchise_id_fkey" FOREIGN KEY ("franchise_id") REFERENCES "FranchiseMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarcassTypeMaster" ADD CONSTRAINT "CarcassTypeMaster_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShutterTypeMaster" ADD CONSTRAINT "ShutterTypeMaster_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShutterSubTypeMaster" ADD CONSTRAINT "ShutterSubTypeMaster_shutter_type_id_fkey" FOREIGN KEY ("shutter_type_id") REFERENCES "ShutterTypeMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HandleTypeMaster" ADD CONSTRAINT "HandleTypeMaster_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimelineRule" ADD CONSTRAINT "TimelineRule_carcass_id_fkey" FOREIGN KEY ("carcass_id") REFERENCES "CarcassTypeMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimelineRule" ADD CONSTRAINT "TimelineRule_shutter_id_fkey" FOREIGN KEY ("shutter_id") REFERENCES "ShutterTypeMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimelineRule" ADD CONSTRAINT "TimelineRule_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentInfo" ADD CONSTRAINT "PaymentInfo_status_id_fkey" FOREIGN KEY ("status_id") REFERENCES "StatusTypeMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadAmcContract" ADD CONSTRAINT "LeadAmcContract_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "AccountMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadAmcContract" ADD CONSTRAINT "LeadAmcContract_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "UserMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadAmcContract" ADD CONSTRAINT "LeadAmcContract_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "LeadDocuments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadAmcContract" ADD CONSTRAINT "LeadAmcContract_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "LeadMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadAmcContract" ADD CONSTRAINT "LeadAmcContract_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "UserMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadAmcContract" ADD CONSTRAINT "LeadAmcContract_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadServiceSchedule" ADD CONSTRAINT "LeadServiceSchedule_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "AccountMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadServiceSchedule" ADD CONSTRAINT "LeadServiceSchedule_completed_by_fkey" FOREIGN KEY ("completed_by") REFERENCES "UserMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadServiceSchedule" ADD CONSTRAINT "LeadServiceSchedule_completion_document_id_fkey" FOREIGN KEY ("completion_document_id") REFERENCES "LeadDocuments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadServiceSchedule" ADD CONSTRAINT "LeadServiceSchedule_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "UserMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadServiceSchedule" ADD CONSTRAINT "LeadServiceSchedule_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "LeadMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadServiceSchedule" ADD CONSTRAINT "LeadServiceSchedule_rejected_by_fkey" FOREIGN KEY ("rejected_by") REFERENCES "UserMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadServiceSchedule" ADD CONSTRAINT "LeadServiceSchedule_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "UserMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadServiceSchedule" ADD CONSTRAINT "LeadServiceSchedule_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadDesignMeeting" ADD CONSTRAINT "LeadDesignMeeting_meeting_type_id_fkey" FOREIGN KEY ("meeting_type_id") REFERENCES "MeetingTypeMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadClientVisit" ADD CONSTRAINT "LeadClientVisit_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "AccountMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadClientVisit" ADD CONSTRAINT "LeadClientVisit_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "UserMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadClientVisit" ADD CONSTRAINT "LeadClientVisit_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "LeadMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadClientVisit" ADD CONSTRAINT "LeadClientVisit_meeting_type_id_fkey" FOREIGN KEY ("meeting_type_id") REFERENCES "MeetingTypeMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadClientVisit" ADD CONSTRAINT "LeadClientVisit_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "UserMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadClientVisit" ADD CONSTRAINT "LeadClientVisit_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingTypeMaster" ADD CONSTRAINT "MeetingTypeMaster_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadClientVisitDocumentMapping" ADD CONSTRAINT "LeadClientVisitDocumentMapping_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "AccountMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadClientVisitDocumentMapping" ADD CONSTRAINT "LeadClientVisitDocumentMapping_client_visit_id_fkey" FOREIGN KEY ("client_visit_id") REFERENCES "LeadClientVisit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadClientVisitDocumentMapping" ADD CONSTRAINT "LeadClientVisitDocumentMapping_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "UserMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadClientVisitDocumentMapping" ADD CONSTRAINT "LeadClientVisitDocumentMapping_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "LeadDocuments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadClientVisitDocumentMapping" ADD CONSTRAINT "LeadClientVisitDocumentMapping_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "LeadMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadClientVisitDocumentMapping" ADD CONSTRAINT "LeadClientVisitDocumentMapping_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chs_selection_type_mapping" ADD CONSTRAINT "chs_selection_type_mapping_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chs_selection_type_mapping" ADD CONSTRAINT "chs_selection_type_mapping_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "LeadMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chs_selection_type_mapping" ADD CONSTRAINT "chs_selection_type_mapping_selection_id_fkey" FOREIGN KEY ("selection_id") REFERENCES "LeadDesignSelection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chs_selection_type_mapping" ADD CONSTRAINT "chs_selection_type_mapping_carcass_type_id_fkey" FOREIGN KEY ("carcass_type_id") REFERENCES "CarcassTypeMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chs_selection_type_mapping" ADD CONSTRAINT "chs_selection_type_mapping_shutter_type_id_fkey" FOREIGN KEY ("shutter_type_id") REFERENCES "ShutterTypeMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chs_selection_type_mapping" ADD CONSTRAINT "chs_selection_type_mapping_shutter_sub_type_id_fkey" FOREIGN KEY ("shutter_sub_type_id") REFERENCES "ShutterSubTypeMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chs_selection_type_mapping" ADD CONSTRAINT "chs_selection_type_mapping_handle_type_id_fkey" FOREIGN KEY ("handle_type_id") REFERENCES "HandleTypeMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chs_selection_type_mapping" ADD CONSTRAINT "chs_selection_type_mapping_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "UserMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chs_selection_type_mapping" ADD CONSTRAINT "chs_selection_type_mapping_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "UserMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserLeadTask" ADD CONSTRAINT "UserLeadTask_instance_id_fkey" FOREIGN KEY ("instance_id") REFERENCES "LeadProductStructureInstance"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FastProductionRequestBatch" ADD CONSTRAINT "FastProductionRequestBatch_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FastProductionRequestBatch" ADD CONSTRAINT "FastProductionRequestBatch_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "LeadMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FastProductionRequestBatch" ADD CONSTRAINT "FastProductionRequestBatch_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "AccountMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FastProductionRequestBatch" ADD CONSTRAINT "FastProductionRequestBatch_franchise_id_fkey" FOREIGN KEY ("franchise_id") REFERENCES "FranchiseMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FastProductionRequestBatch" ADD CONSTRAINT "FastProductionRequestBatch_requester_user_id_fkey" FOREIGN KEY ("requester_user_id") REFERENCES "UserMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FastProductionRequestBatch" ADD CONSTRAINT "FastProductionRequestBatch_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "UserMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FastProductionRequestBatch" ADD CONSTRAINT "FastProductionRequestBatch_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "UserMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FastProductionRequestBatch" ADD CONSTRAINT "FastProductionRequestBatch_revoked_by_fkey" FOREIGN KEY ("revoked_by") REFERENCES "UserMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FastProductionRequest" ADD CONSTRAINT "FastProductionRequest_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "FastProductionRequestBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FastProductionRequest" ADD CONSTRAINT "FastProductionRequest_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FastProductionRequest" ADD CONSTRAINT "FastProductionRequest_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "LeadMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FastProductionRequest" ADD CONSTRAINT "FastProductionRequest_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "AccountMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FastProductionRequest" ADD CONSTRAINT "FastProductionRequest_instance_id_fkey" FOREIGN KEY ("instance_id") REFERENCES "LeadProductStructureInstance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FastProductionRequest" ADD CONSTRAINT "FastProductionRequest_franchise_id_fkey" FOREIGN KEY ("franchise_id") REFERENCES "FranchiseMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FastProductionRequest" ADD CONSTRAINT "FastProductionRequest_requester_user_id_fkey" FOREIGN KEY ("requester_user_id") REFERENCES "UserMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FastProductionRequest" ADD CONSTRAINT "FastProductionRequest_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "UserMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FastProductionRequest" ADD CONSTRAINT "FastProductionRequest_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "UserMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FastProductionRequest" ADD CONSTRAINT "FastProductionRequest_revoked_by_fkey" FOREIGN KEY ("revoked_by") REFERENCES "UserMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FastProductionRequest" ADD CONSTRAINT "FastProductionRequest_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "UserLeadTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FastProductionFinish" ADD CONSTRAINT "FastProductionFinish_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "FastProductionRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FastProductionApproval" ADD CONSTRAINT "FastProductionApproval_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "FastProductionRequestBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FastProductionApproval" ADD CONSTRAINT "FastProductionApproval_approver_user_id_fkey" FOREIGN KEY ("approver_user_id") REFERENCES "UserMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FastProductionRequestDocument" ADD CONSTRAINT "FastProductionRequestDocument_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "FastProductionRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FastProductionRequestDocument" ADD CONSTRAINT "FastProductionRequestDocument_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "LeadDocuments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FastProductionRequestDocument" ADD CONSTRAINT "FastProductionRequestDocument_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "UserMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FastProductionStatusLog" ADD CONSTRAINT "FastProductionStatusLog_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "FastProductionRequestBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FastProductionStatusLog" ADD CONSTRAINT "FastProductionStatusLog_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "UserMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadDetailedLogs" ADD CONSTRAINT "LeadDetailedLogs_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "UserLeadTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadApprovalRequestDocumentMapping" ADD CONSTRAINT "LeadApprovalRequestDocumentMapping_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "AccountMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadApprovalRequestDocumentMapping" ADD CONSTRAINT "LeadApprovalRequestDocumentMapping_approval_request_id_fkey" FOREIGN KEY ("approval_request_id") REFERENCES "LeadApprovalRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadApprovalRequestDocumentMapping" ADD CONSTRAINT "LeadApprovalRequestDocumentMapping_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "UserMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadApprovalRequestDocumentMapping" ADD CONSTRAINT "LeadApprovalRequestDocumentMapping_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "LeadDocuments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadApprovalRequestDocumentMapping" ADD CONSTRAINT "LeadApprovalRequestDocumentMapping_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "LeadMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadApprovalRequestDocumentMapping" ADD CONSTRAINT "LeadApprovalRequestDocumentMapping_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyVendorsMaster" ADD CONSTRAINT "CompanyVendorsMaster_state_id_fkey" FOREIGN KEY ("state_id") REFERENCES "StateMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyVendorsMaster" ADD CONSTRAINT "CompanyVendorsMaster_default_payment_term_id_fkey" FOREIGN KEY ("default_payment_term_id") REFERENCES "PaymentTermMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorModulesMapping" ADD CONSTRAINT "VendorModulesMapping_module_id_fkey" FOREIGN KEY ("module_id") REFERENCES "ModulesMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorModulesMapping" ADD CONSTRAINT "VendorModulesMapping_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MachineMaster" ADD CONSTRAINT "MachineMaster_machine_type_id_fkey" FOREIGN KEY ("machine_type_id") REFERENCES "MachineTypeMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MachineMaster" ADD CONSTRAINT "MachineMaster_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CutList" ADD CONSTRAINT "CutList_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "LeadMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CutList" ADD CONSTRAINT "CutList_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "ProjectMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CutList" ADD CONSTRAINT "CutList_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CutListMachineMapping" ADD CONSTRAINT "CutListMachineMapping_cut_list_id_fkey" FOREIGN KEY ("cut_list_id") REFERENCES "CutList"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CutListMachineMapping" ADD CONSTRAINT "CutListMachineMapping_in_operator_fkey" FOREIGN KEY ("in_operator") REFERENCES "UserMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CutListMachineMapping" ADD CONSTRAINT "CutListMachineMapping_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "LeadMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CutListMachineMapping" ADD CONSTRAINT "CutListMachineMapping_machine_id_fkey" FOREIGN KEY ("machine_id") REFERENCES "MachineMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CutListMachineMapping" ADD CONSTRAINT "CutListMachineMapping_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "ProjectMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CutListMachineMapping" ADD CONSTRAINT "CutListMachineMapping_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CutListMachineMapping" ADD CONSTRAINT "CutListMachineMapping_box_id_fkey" FOREIGN KEY ("box_id") REFERENCES "BoxMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CutListMachineMapping" ADD CONSTRAINT "CutListMachineMapping_site_in_by_fkey" FOREIGN KEY ("site_in_by") REFERENCES "UserMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserMachineMapping" ADD CONSTRAINT "UserMachineMapping_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "UserMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserMachineMapping" ADD CONSTRAINT "UserMachineMapping_machine_id_fkey" FOREIGN KEY ("machine_id") REFERENCES "MachineMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserMachineMapping" ADD CONSTRAINT "UserMachineMapping_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "UserMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserMachineMapping" ADD CONSTRAINT "UserMachineMapping_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "UserMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserMachineMapping" ADD CONSTRAINT "UserMachineMapping_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderLoginPoFileMapping" ADD CONSTRAINT "OrderLoginPoFileMapping_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "UserMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderLoginPoFileMapping" ADD CONSTRAINT "OrderLoginPoFileMapping_deleted_by_fkey" FOREIGN KEY ("deleted_by") REFERENCES "UserMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderLoginPoFileMapping" ADD CONSTRAINT "OrderLoginPoFileMapping_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "LeadDocuments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderLoginPoFileMapping" ADD CONSTRAINT "OrderLoginPoFileMapping_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "LeadMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderLoginPoFileMapping" ADD CONSTRAINT "OrderLoginPoFileMapping_orderlogin_id_fkey" FOREIGN KEY ("orderlogin_id") REFERENCES "OrderLoginDetails"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorSetting" ADD CONSTRAINT "VendorSetting_setting_id_fkey" FOREIGN KEY ("setting_id") REFERENCES "VendorSettingKey"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorSetting" ADD CONSTRAINT "VendorSetting_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DefectMaster" ADD CONSTRAINT "DefectMaster_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DefectedItem" ADD CONSTRAINT "DefectedItem_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "UserMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DefectedItem" ADD CONSTRAINT "DefectedItem_cut_list_id_fkey" FOREIGN KEY ("cut_list_id") REFERENCES "CutList"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DefectedItem" ADD CONSTRAINT "DefectedItem_cut_list_machine_mapping_id_fkey" FOREIGN KEY ("cut_list_machine_mapping_id") REFERENCES "CutListMachineMapping"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DefectedItem" ADD CONSTRAINT "DefectedItem_defect_id_fkey" FOREIGN KEY ("defect_id") REFERENCES "DefectMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DefectedItem" ADD CONSTRAINT "DefectedItem_machine_id_fkey" FOREIGN KEY ("machine_id") REFERENCES "MachineMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DefectedItem" ADD CONSTRAINT "DefectedItem_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "ProjectMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DefectedItem" ADD CONSTRAINT "DefectedItem_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FranchiseMaster" ADD CONSTRAINT "FranchiseMaster_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HeadSiteSupervisorFranchiseMapping" ADD CONSTRAINT "HeadSiteSupervisorFranchiseMapping_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "UserMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HeadSiteSupervisorFranchiseMapping" ADD CONSTRAINT "HeadSiteSupervisorFranchiseMapping_franchise_id_fkey" FOREIGN KEY ("franchise_id") REFERENCES "FranchiseMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HeadSiteSupervisorFranchiseMapping" ADD CONSTRAINT "HeadSiteSupervisorFranchiseMapping_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "UserMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HeadSiteSupervisorFranchiseMapping" ADD CONSTRAINT "HeadSiteSupervisorFranchiseMapping_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegionMaster" ADD CONSTRAINT "RegionMaster_country_id_fkey" FOREIGN KEY ("country_id") REFERENCES "CountryMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StateMaster" ADD CONSTRAINT "StateMaster_region_id_fkey" FOREIGN KEY ("region_id") REFERENCES "RegionMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CityMaster" ADD CONSTRAINT "CityMaster_state_id_fkey" FOREIGN KEY ("state_id") REFERENCES "StateMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AreaMaster" ADD CONSTRAINT "AreaMaster_city_id_fkey" FOREIGN KEY ("city_id") REFERENCES "CityMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserGeographicalMapping" ADD CONSTRAINT "UserGeographicalMapping_geographical_id_fkey" FOREIGN KEY ("geographical_id") REFERENCES "GeographicalMapping"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserGeographicalMapping" ADD CONSTRAINT "UserGeographicalMapping_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "UserMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserActivityLog" ADD CONSTRAINT "UserActivityLog_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "UserMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ThemeMaster" ADD CONSTRAINT "ThemeMaster_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ThemeMapping" ADD CONSTRAINT "ThemeMapping_theme_id_fkey" FOREIGN KEY ("theme_id") REFERENCES "ThemeMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DefectedItemImage" ADD CONSTRAINT "DefectedItemImage_defected_item_id_fkey" FOREIGN KEY ("defected_item_id") REFERENCES "DefectedItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DefectCompletionPhoto" ADD CONSTRAINT "DefectCompletionPhoto_cut_list_machine_mapping_id_fkey" FOREIGN KEY ("cut_list_machine_mapping_id") REFERENCES "CutListMachineMapping"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DefectCompletionPhoto" ADD CONSTRAINT "DefectCompletionPhoto_cut_list_id_fkey" FOREIGN KEY ("cut_list_id") REFERENCES "CutList"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DefectCompletionPhoto" ADD CONSTRAINT "DefectCompletionPhoto_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DefectCompletionPhoto" ADD CONSTRAINT "DefectCompletionPhoto_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "UserMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DefectCompletionPhoto" ADD CONSTRAINT "DefectCompletionPhoto_defected_item_id_fkey" FOREIGN KEY ("defected_item_id") REFERENCES "DefectedItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectCategoriesMaster" ADD CONSTRAINT "ProjectCategoriesMaster_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectCategoriesMasterVendorMapping" ADD CONSTRAINT "ProjectCategoriesMasterVendorMapping_project_categories_ma_fkey" FOREIGN KEY ("project_categories_master_id") REFERENCES "ProjectCategoriesMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectCategoriesMasterVendorMapping" ADD CONSTRAINT "ProjectCategoriesMasterVendorMapping_project_categories_ty_fkey" FOREIGN KEY ("project_categories_type_master_id") REFERENCES "ProjectCategoriesTypeMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectCategoriesMasterVendorMapping" ADD CONSTRAINT "ProjectCategoriesMasterVendorMapping_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectCategoriesMasterVendorMapping" ADD CONSTRAINT "ProjectCategoriesMasterVendorMapping_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "UserMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectCategoriesMasterVendorMapping" ADD CONSTRAINT "ProjectCategoriesMasterVendorMapping_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "UserMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrandMaster" ADD CONSTRAINT "BrandMaster_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductMaster" ADD CONSTRAINT "ProductMaster_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductMaster" ADD CONSTRAINT "ProductMaster_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "BrandMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductMaster" ADD CONSTRAINT "ProductMaster_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "ProjectCategoriesMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductMaster" ADD CONSTRAINT "ProductMaster_hsn_id_fkey" FOREIGN KEY ("hsn_id") REFERENCES "HsnProductMapping"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseIntentMaster" ADD CONSTRAINT "PurchaseIntentMaster_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseIntentMaster" ADD CONSTRAINT "PurchaseIntentMaster_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "ProjectCategoriesMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseIntentMaster" ADD CONSTRAINT "PurchaseIntentMaster_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "UserMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseIntentMaster" ADD CONSTRAINT "PurchaseIntentMaster_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "UserMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseIntentMaster" ADD CONSTRAINT "PurchaseIntentMaster_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "UserMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseIntentMaster" ADD CONSTRAINT "PurchaseIntentMaster_rejected_by_fkey" FOREIGN KEY ("rejected_by") REFERENCES "UserMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseIntentMaster" ADD CONSTRAINT "PurchaseIntentMaster_deleted_by_fkey" FOREIGN KEY ("deleted_by") REFERENCES "UserMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseIntentItem" ADD CONSTRAINT "PurchaseIntentItem_purchase_intent_id_fkey" FOREIGN KEY ("purchase_intent_id") REFERENCES "PurchaseIntentMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseIntentItem" ADD CONSTRAINT "PurchaseIntentItem_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "ProductMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseIntentItemVendorMapping" ADD CONSTRAINT "PurchaseIntentItemVendorMapping_purchase_intent_item_id_fkey" FOREIGN KEY ("purchase_intent_item_id") REFERENCES "PurchaseIntentItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseIntentItemVendorMapping" ADD CONSTRAINT "PurchaseIntentItemVendorMapping_company_vendor_id_fkey" FOREIGN KEY ("company_vendor_id") REFERENCES "CompanyVendorsMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseIntentItemVendorMapping" ADD CONSTRAINT "PurchaseIntentItemVendorMapping_payment_term_id_fkey" FOREIGN KEY ("payment_term_id") REFERENCES "PaymentTermMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseIntentStatusLog" ADD CONSTRAINT "PurchaseIntentStatusLog_purchase_intent_id_fkey" FOREIGN KEY ("purchase_intent_id") REFERENCES "PurchaseIntentMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseIntentStatusLog" ADD CONSTRAINT "PurchaseIntentStatusLog_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "UserMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderMaster" ADD CONSTRAINT "PurchaseOrderMaster_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderMaster" ADD CONSTRAINT "PurchaseOrderMaster_purchase_intent_id_fkey" FOREIGN KEY ("purchase_intent_id") REFERENCES "PurchaseIntentMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderMaster" ADD CONSTRAINT "PurchaseOrderMaster_company_vendor_id_fkey" FOREIGN KEY ("company_vendor_id") REFERENCES "CompanyVendorsMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderMaster" ADD CONSTRAINT "PurchaseOrderMaster_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "UserMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderMaster" ADD CONSTRAINT "PurchaseOrderMaster_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "UserMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderMaster" ADD CONSTRAINT "PurchaseOrderMaster_payment_term_id_fkey" FOREIGN KEY ("payment_term_id") REFERENCES "PaymentTermMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderItem" ADD CONSTRAINT "PurchaseOrderItem_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "PurchaseOrderMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderItem" ADD CONSTRAINT "PurchaseOrderItem_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "ProductMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderItem" ADD CONSTRAINT "PurchaseOrderItem_pi_item_vendor_mapping_id_fkey" FOREIGN KEY ("pi_item_vendor_mapping_id") REFERENCES "PurchaseIntentItemVendorMapping"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderItem" ADD CONSTRAINT "PurchaseOrderItem_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "UserMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderItem" ADD CONSTRAINT "PurchaseOrderItem_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "UserMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderItem" ADD CONSTRAINT "PurchaseOrderItem_deleted_by_fkey" FOREIGN KEY ("deleted_by") REFERENCES "UserMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GRNMaster" ADD CONSTRAINT "GRNMaster_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GRNMaster" ADD CONSTRAINT "GRNMaster_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "PurchaseOrderMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GRNMaster" ADD CONSTRAINT "GRNMaster_company_vendor_id_fkey" FOREIGN KEY ("company_vendor_id") REFERENCES "CompanyVendorsMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GRNMaster" ADD CONSTRAINT "GRNMaster_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "UserMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GRNMaster" ADD CONSTRAINT "GRNMaster_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "UserMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GRNMaster" ADD CONSTRAINT "GRNMaster_confirmed_by_fkey" FOREIGN KEY ("confirmed_by") REFERENCES "UserMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GRNItem" ADD CONSTRAINT "GRNItem_grn_id_fkey" FOREIGN KEY ("grn_id") REFERENCES "GRNMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GRNItem" ADD CONSTRAINT "GRNItem_po_item_id_fkey" FOREIGN KEY ("po_item_id") REFERENCES "PurchaseOrderItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GRNItem" ADD CONSTRAINT "GRNItem_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "ProductMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DebitCreditNote" ADD CONSTRAINT "DebitCreditNote_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DebitCreditNote" ADD CONSTRAINT "DebitCreditNote_grn_id_fkey" FOREIGN KEY ("grn_id") REFERENCES "GRNMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DebitCreditNote" ADD CONSTRAINT "DebitCreditNote_company_vendor_id_fkey" FOREIGN KEY ("company_vendor_id") REFERENCES "CompanyVendorsMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DebitCreditNote" ADD CONSTRAINT "DebitCreditNote_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "UserMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DebitCreditNote" ADD CONSTRAINT "DebitCreditNote_settled_by_fkey" FOREIGN KEY ("settled_by") REFERENCES "UserMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RedeliveryRequest" ADD CONSTRAINT "RedeliveryRequest_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RedeliveryRequest" ADD CONSTRAINT "RedeliveryRequest_grn_item_id_fkey" FOREIGN KEY ("grn_item_id") REFERENCES "GRNItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RedeliveryRequest" ADD CONSTRAINT "RedeliveryRequest_company_vendor_id_fkey" FOREIGN KEY ("company_vendor_id") REFERENCES "CompanyVendorsMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RedeliveryRequest" ADD CONSTRAINT "RedeliveryRequest_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "UserMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HsnProductMapping" ADD CONSTRAINT "HsnProductMapping_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductStockHistory" ADD CONSTRAINT "ProductStockHistory_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductStockHistory" ADD CONSTRAINT "ProductStockHistory_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "ProductMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductStockHistory" ADD CONSTRAINT "ProductStockHistory_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "UserMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentTermMaster" ADD CONSTRAINT "PaymentTermMaster_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentTermMaster" ADD CONSTRAINT "PaymentTermMaster_company_vendor_id_fkey" FOREIGN KEY ("company_vendor_id") REFERENCES "CompanyVendorsMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentTermStage" ADD CONSTRAINT "PaymentTermStage_payment_term_id_fkey" FOREIGN KEY ("payment_term_id") REFERENCES "PaymentTermMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "POPaymentSchedule" ADD CONSTRAINT "POPaymentSchedule_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "POPaymentSchedule" ADD CONSTRAINT "POPaymentSchedule_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "PurchaseOrderMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "POPayment" ADD CONSTRAINT "POPayment_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "POPayment" ADD CONSTRAINT "POPayment_po_payment_schedule_id_fkey" FOREIGN KEY ("po_payment_schedule_id") REFERENCES "POPaymentSchedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_BoxMasterToLeadMaster" ADD CONSTRAINT "_BoxMasterToLeadMaster_A_fkey" FOREIGN KEY ("A") REFERENCES "BoxMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_BoxMasterToLeadMaster" ADD CONSTRAINT "_BoxMasterToLeadMaster_B_fkey" FOREIGN KEY ("B") REFERENCES "LeadMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "uniq_vendor_lead_external_platform_customer_mapping" RENAME TO "LeadExternalPlatformCustomerMapping_vendor_id_lead_id_exter_key";

-- RenameIndex
ALTER INDEX "uniq_vendor_lead_small_order_sequence" RENAME TO "smallOrderRequests_vendor_id_lead_id_small_order_sequence_key";

-- RenameIndex
ALTER INDEX "uniq_vendor_small_order_so_code" RENAME TO "smallOrderRequests_vendor_id_so_code_key";

-- RenameIndex
ALTER INDEX "uniq_vendor_small_order_request_type_key" RENAME TO "small_order_request_type_master_vendor_id_type_key_key";
