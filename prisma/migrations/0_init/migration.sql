-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('LEAD_ASSIGNED', 'TASK_ASSIGNED', 'CHAT_MENTION', 'LEAD_MILESTONE', 'LEAD_ACTION');

-- CreateEnum
CREATE TYPE "BoxStatus" AS ENUM ('packed', 'unpacked');

-- CreateEnum
CREATE TYPE "ItemStatus" AS ENUM ('packed', 'unpacked');

-- CreateEnum
CREATE TYPE "ActivityStatus" AS ENUM ('onGoing', 'onHold', 'lost', 'lostApproval');

-- CreateEnum
CREATE TYPE "LeadUserStatus" AS ENUM ('inactive', 'active');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('site_photo');

-- CreateEnum
CREATE TYPE "TechCheckStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'REVISED');

-- CreateEnum
CREATE TYPE "LedgerType" AS ENUM ('debit', 'credit');

-- CreateEnum
CREATE TYPE "SupervisorStatus" AS ENUM ('active', 'inactive');

-- CreateEnum
CREATE TYPE "LeadTaskStatus" AS ENUM ('open', 'closed', 'in_progress', 'completed', 'cancelled');

-- CreateEnum
CREATE TYPE "ActionType" AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'UPLOAD', 'STATUS_CHANGE', 'OTHER');

-- CreateEnum
CREATE TYPE "LeadChatMessageType" AS ENUM ('text', 'attachment', 'system', 'textWithAttachment');

-- CreateEnum
CREATE TYPE "ProductInstanceStatus" AS ENUM ('open', 'onHold', 'lostApproval', 'lost');

-- CreateTable
CREATE TABLE "VendorMaster" (
    "id" SERIAL NOT NULL,
    "vendor_name" TEXT NOT NULL,
    "vendor_code" TEXT NOT NULL,
    "primary_contact_number" TEXT NOT NULL,
    "primary_contact_email" TEXT NOT NULL,
    "primary_contact_name" TEXT NOT NULL,
    "country_code" TEXT NOT NULL,
    "head_office_id" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'inactive',
    "logo" TEXT NOT NULL,
    "time_zone" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VendorMaster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorAddress" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "address" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "pincode" TEXT NOT NULL,
    "landmark" TEXT NOT NULL,

    CONSTRAINT "VendorAddress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorTaxInfo" (
    "id" SERIAL NOT NULL,
    "tax_no" TEXT NOT NULL,
    "tax_status" TEXT NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "tax_country" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VendorTaxInfo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserTypeMaster" (
    "id" SERIAL NOT NULL,
    "user_type" TEXT NOT NULL,

    CONSTRAINT "UserTypeMaster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserMaster" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "user_name" TEXT NOT NULL,
    "user_contact" TEXT NOT NULL,
    "user_email" TEXT NOT NULL,
    "user_timezone" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "user_type_id" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'inactive',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserMaster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserDocument" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "document_name" TEXT NOT NULL,
    "document_number" TEXT NOT NULL,
    "filename" TEXT NOT NULL,

    CONSTRAINT "UserDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectMaster" (
    "id" SERIAL NOT NULL,
    "project_name" TEXT NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "client_id" INTEGER NOT NULL DEFAULT 1,
    "created_by" INTEGER NOT NULL,
    "project_status" TEXT NOT NULL DEFAULT 'Initiated',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unique_project_id" TEXT NOT NULL,
    "is_grouping" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ProjectMaster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectDetails" (
    "id" SERIAL NOT NULL,
    "project_id" INTEGER NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "client_id" INTEGER NOT NULL,
    "total_items" INTEGER NOT NULL DEFAULT 0,
    "total_packed" INTEGER NOT NULL DEFAULT 0,
    "total_unpacked" INTEGER NOT NULL DEFAULT 0,
    "actual_completion_date" TIMESTAMP(3),
    "estimated_completion_date" TIMESTAMP(3) NOT NULL,
    "start_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_grouping" BOOLEAN NOT NULL DEFAULT false,
    "room_name" TEXT NOT NULL,

    CONSTRAINT "ProjectDetails_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectItemsMaster" (
    "id" SERIAL NOT NULL,
    "project_id" INTEGER NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "client_id" INTEGER NOT NULL,
    "category" TEXT NOT NULL,
    "unique_id" TEXT NOT NULL,
    "item_name" TEXT NOT NULL,
    "L1" TEXT NOT NULL,
    "L2" TEXT NOT NULL,
    "L3" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "project_details_id" INTEGER NOT NULL,
    "group" TEXT NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "ProjectItemsMaster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BoxMaster" (
    "id" SERIAL NOT NULL,
    "project_id" INTEGER NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "client_id" INTEGER NOT NULL,
    "box_name" TEXT NOT NULL,
    "box_status" "BoxStatus" NOT NULL,
    "created_by" INTEGER NOT NULL,
    "created_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" INTEGER,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "project_details_id" INTEGER NOT NULL,

    CONSTRAINT "BoxMaster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScanAndPackItem" (
    "id" SERIAL NOT NULL,
    "project_id" INTEGER NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "client_id" INTEGER NOT NULL,
    "box_id" INTEGER NOT NULL,
    "unique_id" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "created_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" INTEGER NOT NULL,
    "status" "ItemStatus" NOT NULL,
    "project_details_id" INTEGER NOT NULL,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "ScanAndPackItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorTokens" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "token" TEXT NOT NULL,
    "expiry_date" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VendorTokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientMaster" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "contact" TEXT NOT NULL,
    "alt_contact" TEXT,
    "email" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "pincode" TEXT NOT NULL,
    "clientCode" TEXT NOT NULL,

    CONSTRAINT "ClientMaster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadMaster" (
    "id" SERIAL NOT NULL,
    "firstname" TEXT NOT NULL,
    "lastname" TEXT NOT NULL,
    "country_code" TEXT NOT NULL,
    "contact_no" TEXT NOT NULL,
    "alt_contact_no" TEXT,
    "email" TEXT,
    "site_address" TEXT,
    "site_type_id" INTEGER,
    "source_id" INTEGER,
    "archetech_name" TEXT,
    "designer_remark" TEXT,
    "created_by" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" INTEGER,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "assign_to" INTEGER,
    "assigned_by" INTEGER,
    "account_id" INTEGER,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" INTEGER,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "status_id" INTEGER,
    "initial_site_measurement_date" TIMESTAMP(3),
    "final_desc_note" VARCHAR(2000),
    "advance_payment_date" TIMESTAMP(3),
    "site_map_link" TEXT,
    "activity_status" "ActivityStatus" NOT NULL DEFAULT 'onGoing',
    "activity_status_remark" VARCHAR(2000),
    "booking_amount" DOUBLE PRECISION,
    "pending_amount" DOUBLE PRECISION,
    "total_project_amount" DOUBLE PRECISION,
    "is_draft" BOOLEAN NOT NULL DEFAULT false,
    "lead_code" TEXT NOT NULL,
    "is_client_approval_submitted" BOOLEAN NOT NULL DEFAULT false,
    "client_required_order_login_complition_date" TIMESTAMP(3),
    "expected_order_login_ready_date" TIMESTAMP(3),
    "no_of_client_documents_initially_submitted" INTEGER,
    "hardware_packing_details_remark" VARCHAR(2000),
    "woodwork_packing_details_remark" VARCHAR(2000),
    "no_of_boxes" INTEGER,
    "dispatch_planning_remark" VARCHAR(2000),
    "material_lift_availability" BOOLEAN DEFAULT false,
    "onsite_contact_person_name" TEXT,
    "onsite_contact_person_number" TEXT,
    "required_date_for_dispatch" TIMESTAMP(3),
    "alt_onsite_contact_person_name" TEXT,
    "alt_onsite_contact_person_number" TEXT,
    "dispatch_date" TIMESTAMP(3),
    "dispatch_remark" VARCHAR(2000),
    "driver_name" VARCHAR(255),
    "driver_number" VARCHAR(50),
    "vehicle_no" VARCHAR(100),
    "actual_installation_start_date" TIMESTAMP(3),
    "carcass_installation_completion_date" TIMESTAMP(3),
    "expected_installation_end_date" TIMESTAMP(3),
    "is_carcass_installation_completed" BOOLEAN DEFAULT false,
    "is_shutter_installation_completed" BOOLEAN DEFAULT false,
    "shutter_installation_completion_date" TIMESTAMP(3),
    "usable_handover_pending_work_details" TEXT,
    "mrp_value" DOUBLE PRECISION,

    CONSTRAINT "LeadMaster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadUserMapping" (
    "id" SERIAL NOT NULL,
    "account_id" INTEGER NOT NULL,
    "lead_id" INTEGER NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "status" "LeadUserStatus" NOT NULL DEFAULT 'active',
    "created_by" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" INTEGER,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeadUserMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadActivityStatusLog" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "account_id" INTEGER NOT NULL,
    "lead_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "activity_status" "ActivityStatus" NOT NULL,
    "activity_status_remark" VARCHAR(2000),
    "created_by" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadActivityStatusLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiteTypeMaster" (
    "id" SERIAL NOT NULL,
    "type" TEXT NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',

    CONSTRAINT "SiteTypeMaster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceMaster" (
    "id" SERIAL NOT NULL,
    "type" TEXT NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',

    CONSTRAINT "SourceMaster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountMaster" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "country_code" TEXT NOT NULL,
    "contact_no" TEXT NOT NULL,
    "alt_contact_no" TEXT,
    "email" TEXT,
    "vendor_id" INTEGER NOT NULL,
    "created_by" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" INTEGER,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" INTEGER,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "AccountMaster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadProductMapping" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "lead_id" INTEGER NOT NULL,
    "account_id" INTEGER NOT NULL,
    "product_type_id" INTEGER NOT NULL,
    "created_by" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadProductMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductTypeMaster" (
    "id" SERIAL NOT NULL,
    "type" TEXT NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "tag" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',

    CONSTRAINT "ProductTypeMaster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadDocuments" (
    "id" SERIAL NOT NULL,
    "doc_og_name" TEXT NOT NULL,
    "doc_sys_name" TEXT NOT NULL,
    "created_by" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_by" INTEGER,
    "deleted_at" TIMESTAMP(3),
    "account_id" INTEGER,
    "lead_id" INTEGER,
    "vendor_id" INTEGER NOT NULL,
    "doc_type_id" INTEGER NOT NULL,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "tech_check_status" "TechCheckStatus",
    "product_structure_instance_id" INTEGER,

    CONSTRAINT "LeadDocuments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadChatRoom" (
    "id" SERIAL NOT NULL,
    "lead_id" INTEGER NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadChatRoom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadChatMember" (
    "id" SERIAL NOT NULL,
    "chat_room_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "added_by" INTEGER,

    CONSTRAINT "LeadChatMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadChatMessage" (
    "id" SERIAL NOT NULL,
    "chat_room_id" INTEGER NOT NULL,
    "sender_id" INTEGER NOT NULL,
    "message_type" "LeadChatMessageType" NOT NULL DEFAULT 'text',
    "message_text" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadChatAttachment" (
    "id" SERIAL NOT NULL,
    "msg_id" INTEGER NOT NULL,
    "doc_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadChatAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadChatMention" (
    "id" SERIAL NOT NULL,
    "msg_id" INTEGER NOT NULL,
    "mentioned_user_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadChatMention_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadChatDocument" (
    "id" SERIAL NOT NULL,
    "doc_og_name" TEXT NOT NULL,
    "doc_sys_name" TEXT NOT NULL,
    "created_by" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_by" INTEGER,
    "deleted_at" TIMESTAMP(3),
    "account_id" INTEGER,
    "lead_id" INTEGER,
    "vendor_id" INTEGER NOT NULL,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "LeadChatDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductStructure" (
    "id" SERIAL NOT NULL,
    "type" TEXT NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "parent" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',

    CONSTRAINT "ProductStructure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadProductStructureMapping" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "lead_id" INTEGER NOT NULL,
    "account_id" INTEGER NOT NULL,
    "product_structure_id" INTEGER NOT NULL,
    "created_by" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadProductStructureMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadProductStructureInstance" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "lead_id" INTEGER NOT NULL,
    "account_id" INTEGER NOT NULL,
    "product_type_id" INTEGER NOT NULL,
    "product_structure_id" INTEGER NOT NULL,
    "quantity_index" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "status" "ProductInstanceStatus" NOT NULL DEFAULT 'open',
    "description" VARCHAR(2000),
    "created_by" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" INTEGER,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "is_tech_check_completed" BOOLEAN,
    "tech_check_completed_at" TIMESTAMP(3),

    CONSTRAINT "LeadProductStructureInstance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentInfo" (
    "id" SERIAL NOT NULL,
    "lead_id" INTEGER NOT NULL,
    "account_id" INTEGER NOT NULL,
    "amount" DOUBLE PRECISION,
    "payment_date" TIMESTAMP(3),
    "payment_text" VARCHAR(2000),
    "payment_file_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" INTEGER NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "payment_type_id" INTEGER NOT NULL,

    CONSTRAINT "PaymentInfo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ledger" (
    "id" SERIAL NOT NULL,
    "lead_id" INTEGER NOT NULL,
    "account_id" INTEGER NOT NULL,
    "client_id" INTEGER,
    "vendor_id" INTEGER NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "payment_date" TIMESTAMP(3) NOT NULL,
    "type" "LedgerType" NOT NULL,
    "created_by" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Ledger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentTypeMaster" (
    "id" SERIAL NOT NULL,
    "type" TEXT NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "tag" TEXT NOT NULL,

    CONSTRAINT "DocumentTypeMaster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StatusTypeMaster" (
    "id" SERIAL NOT NULL,
    "type" TEXT NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "tag" TEXT NOT NULL,

    CONSTRAINT "StatusTypeMaster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadStatusLogs" (
    "id" SERIAL NOT NULL,
    "lead_id" INTEGER NOT NULL,
    "account_id" INTEGER NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "status_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" INTEGER NOT NULL,

    CONSTRAINT "LeadStatusLogs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadDesignMeeting" (
    "id" SERIAL NOT NULL,
    "lead_id" INTEGER NOT NULL,
    "account_id" INTEGER NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "desc" VARCHAR(2000) NOT NULL,
    "created_by" INTEGER NOT NULL,
    "updated_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeadDesignMeeting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadDesignMeetingDocumentsMapping" (
    "id" SERIAL NOT NULL,
    "lead_id" INTEGER NOT NULL,
    "account_id" INTEGER NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "meeting_id" INTEGER NOT NULL,
    "document_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" INTEGER NOT NULL,

    CONSTRAINT "LeadDesignMeetingDocumentsMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadDesignSelection" (
    "id" SERIAL NOT NULL,
    "lead_id" INTEGER NOT NULL,
    "account_id" INTEGER NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "type" VARCHAR(1000) NOT NULL,
    "desc" VARCHAR(2000) NOT NULL,
    "created_by" INTEGER NOT NULL,
    "updated_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "product_structure_instance_id" INTEGER,

    CONSTRAINT "LeadDesignSelection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentTypeMaster" (
    "id" SERIAL NOT NULL,
    "type" TEXT NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "tag" TEXT NOT NULL,

    CONSTRAINT "PaymentTypeMaster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadSiteSupervisorMapping" (
    "id" SERIAL NOT NULL,
    "lead_id" INTEGER NOT NULL,
    "account_id" INTEGER NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "status" "SupervisorStatus" NOT NULL DEFAULT 'active',
    "created_by" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadSiteSupervisorMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserLeadTask" (
    "id" SERIAL NOT NULL,
    "lead_id" INTEGER NOT NULL,
    "account_id" INTEGER NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "task_type" TEXT NOT NULL,
    "due_date" TIMESTAMP(3) NOT NULL,
    "remark" VARCHAR(2000),
    "status" "LeadTaskStatus" NOT NULL DEFAULT 'open',
    "closed_by" INTEGER,
    "closed_at" TIMESTAMP(3),
    "created_by" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" INTEGER,
    "lead_stage" TEXT,

    CONSTRAINT "UserLeadTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadDetailedLogs" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "lead_id" INTEGER NOT NULL,
    "account_id" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "action_type" "ActionType" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" INTEGER NOT NULL,

    CONSTRAINT "LeadDetailedLogs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadDocumentLogs" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "lead_id" INTEGER NOT NULL,
    "account_id" INTEGER NOT NULL,
    "doc_id" INTEGER NOT NULL,
    "lead_logs_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" INTEGER NOT NULL,

    CONSTRAINT "LeadDocumentLogs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyVendorsMaster" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "vendor_code" TEXT NOT NULL,
    "company_name" TEXT NOT NULL,
    "point_of_contact" TEXT NOT NULL,
    "contact_no" TEXT NOT NULL,
    "email" TEXT,
    "address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" INTEGER NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" INTEGER NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" INTEGER,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "in_house" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "CompanyVendorsMaster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderLoginDetails" (
    "id" SERIAL NOT NULL,
    "lead_id" INTEGER NOT NULL,
    "account_id" INTEGER NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "item_type" TEXT NOT NULL,
    "item_desc" TEXT NOT NULL,
    "estimated_completion_date" TIMESTAMP(3),
    "completion_date" TIMESTAMP(3),
    "is_completed" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" INTEGER NOT NULL,
    "company_vendor_id" INTEGER,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" INTEGER,
    "factory_user_vendor_selection_remark" TEXT,

    CONSTRAINT "OrderLoginDetails_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiteReadiness" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "account_id" INTEGER NOT NULL,
    "lead_id" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "remark" VARCHAR(2000),
    "value" BOOLEAN,
    "created_by" INTEGER NOT NULL,
    "updated_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiteReadiness_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstallerUserMaster" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "installer_name" TEXT NOT NULL,
    "contact_number" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_by" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InstallerUserMaster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstallerUserMapping" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "account_id" INTEGER NOT NULL,
    "lead_id" INTEGER NOT NULL,
    "installer_id" INTEGER NOT NULL,
    "assigned_by" INTEGER NOT NULL,
    "assigned_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InstallerUserMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstallationUpdate" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "account_id" INTEGER NOT NULL,
    "lead_id" INTEGER NOT NULL,
    "update_date" TIMESTAMP(3) NOT NULL,
    "remark" VARCHAR(2000),
    "created_by" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InstallationUpdate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstallationUpdateDocuments" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "installation_update_id" INTEGER NOT NULL,
    "document_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InstallationUpdateDocuments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MiscellaneousMaster" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "lead_id" INTEGER NOT NULL,
    "account_id" INTEGER NOT NULL,
    "misc_type_id" INTEGER NOT NULL,
    "problem_description" TEXT NOT NULL,
    "reorder_material_details" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION,
    "cost" DOUBLE PRECISION,
    "supervisor_remark" TEXT,
    "expected_ready_date" TIMESTAMP(3),
    "is_resolved" BOOLEAN NOT NULL DEFAULT false,
    "resolved_at" TIMESTAMP(3),
    "created_by" INTEGER NOT NULL,
    "updated_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MiscellaneousMaster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MiscellaneousTypeMaster" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "created_by" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MiscellaneousTypeMaster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MiscellaneousTeamMaster" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "created_by" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MiscellaneousTeamMaster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MiscellaneousTeamMapping" (
    "id" SERIAL NOT NULL,
    "miscellaneous_id" INTEGER NOT NULL,
    "team_id" INTEGER NOT NULL,

    CONSTRAINT "MiscellaneousTeamMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MiscellaneousDocument" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "miscellaneous_id" INTEGER NOT NULL,
    "document_id" INTEGER NOT NULL,
    "created_by" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MiscellaneousDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstallationIssueLogMaster" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "lead_id" INTEGER NOT NULL,
    "account_id" INTEGER NOT NULL,
    "issue_description" TEXT NOT NULL,
    "issue_impact" TEXT,
    "created_by" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InstallationIssueLogMaster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IssueLogTypeMaster" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "created_by" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IssueLogTypeMaster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IssueLogTypeMapping" (
    "id" SERIAL NOT NULL,
    "issue_log_id" INTEGER NOT NULL,
    "type_id" INTEGER NOT NULL,

    CONSTRAINT "IssueLogTypeMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IssueLogResponsibleTeamMapping" (
    "id" SERIAL NOT NULL,
    "issue_log_id" INTEGER NOT NULL,
    "team_id" INTEGER NOT NULL,

    CONSTRAINT "IssueLogResponsibleTeamMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailNotificationMaster" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "html" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "template_key" TEXT NOT NULL,

    CONSTRAINT "EmailNotificationMaster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "sender_id" INTEGER,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "entity_type" TEXT,
    "entity_id" INTEGER,
    "redirect_url" TEXT,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserPushToken" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "token" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "browser" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used" TIMESTAMP(3),
    "device_id" TEXT,

    CONSTRAINT "UserPushToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationDeliveryLogs" (
    "id" SERIAL NOT NULL,
    "notification_id" INTEGER NOT NULL,
    "push_token_id" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationDeliveryLogs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VloqEmailLogs" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "to_email" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VloqEmailLogs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_LeadDocumentsToSiteReadiness" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL,

    CONSTRAINT "_LeadDocumentsToSiteReadiness_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserMaster_user_contact_key" ON "UserMaster"("user_contact");

-- CreateIndex
CREATE UNIQUE INDEX "VendorTokens_token_key" ON "VendorTokens"("token");

-- CreateIndex
CREATE UNIQUE INDEX "LeadMaster_vendor_id_lead_code_key" ON "LeadMaster"("vendor_id", "lead_code");

-- CreateIndex
CREATE UNIQUE INDEX "LeadChatRoom_lead_id_vendor_id_key" ON "LeadChatRoom"("lead_id", "vendor_id");

-- CreateIndex
CREATE UNIQUE INDEX "LeadChatMember_chat_room_id_user_id_key" ON "LeadChatMember"("chat_room_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "LeadChatAttachment_msg_id_doc_id_key" ON "LeadChatAttachment"("msg_id", "doc_id");

-- CreateIndex
CREATE UNIQUE INDEX "LeadChatMention_msg_id_mentioned_user_id_key" ON "LeadChatMention"("msg_id", "mentioned_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "LeadProductStructureInstance_lead_id_vendor_id_product_stru_key" ON "LeadProductStructureInstance"("lead_id", "vendor_id", "product_structure_id", "quantity_index");

-- CreateIndex
CREATE INDEX "SiteReadiness_lead_id_vendor_id_type_idx" ON "SiteReadiness"("lead_id", "vendor_id", "type");

-- CreateIndex
CREATE UNIQUE INDEX "MiscellaneousTeamMapping_miscellaneous_id_team_id_key" ON "MiscellaneousTeamMapping"("miscellaneous_id", "team_id");

-- CreateIndex
CREATE UNIQUE INDEX "IssueLogTypeMapping_issue_log_id_type_id_key" ON "IssueLogTypeMapping"("issue_log_id", "type_id");

-- CreateIndex
CREATE UNIQUE INDEX "IssueLogResponsibleTeamMapping_issue_log_id_team_id_key" ON "IssueLogResponsibleTeamMapping"("issue_log_id", "team_id");

-- CreateIndex
CREATE INDEX "EmailNotificationMaster_vendor_id_idx" ON "EmailNotificationMaster"("vendor_id");

-- CreateIndex
CREATE UNIQUE INDEX "EmailNotificationMaster_vendor_id_template_key_key" ON "EmailNotificationMaster"("vendor_id", "template_key");

-- CreateIndex
CREATE INDEX "Notification_user_id_is_read_idx" ON "Notification"("user_id", "is_read");

-- CreateIndex
CREATE INDEX "Notification_vendor_id_idx" ON "Notification"("vendor_id");

-- CreateIndex
CREATE UNIQUE INDEX "UserPushToken_token_key" ON "UserPushToken"("token");

-- CreateIndex
CREATE INDEX "UserPushToken_user_id_vendor_id_idx" ON "UserPushToken"("user_id", "vendor_id");

-- CreateIndex
CREATE INDEX "_LeadDocumentsToSiteReadiness_B_index" ON "_LeadDocumentsToSiteReadiness"("B");

-- AddForeignKey
ALTER TABLE "VendorAddress" ADD CONSTRAINT "VendorAddress_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorTaxInfo" ADD CONSTRAINT "VendorTaxInfo_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserMaster" ADD CONSTRAINT "UserMaster_user_type_id_fkey" FOREIGN KEY ("user_type_id") REFERENCES "UserTypeMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserMaster" ADD CONSTRAINT "UserMaster_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserDocument" ADD CONSTRAINT "UserDocument_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "UserMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMaster" ADD CONSTRAINT "ProjectMaster_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "ClientMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMaster" ADD CONSTRAINT "ProjectMaster_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "UserMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMaster" ADD CONSTRAINT "ProjectMaster_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectDetails" ADD CONSTRAINT "ProjectDetails_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "ClientMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectDetails" ADD CONSTRAINT "ProjectDetails_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "ProjectMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectDetails" ADD CONSTRAINT "ProjectDetails_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectItemsMaster" ADD CONSTRAINT "ProjectItemsMaster_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "ClientMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectItemsMaster" ADD CONSTRAINT "ProjectItemsMaster_project_details_id_fkey" FOREIGN KEY ("project_details_id") REFERENCES "ProjectDetails"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectItemsMaster" ADD CONSTRAINT "ProjectItemsMaster_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "ProjectMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectItemsMaster" ADD CONSTRAINT "ProjectItemsMaster_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoxMaster" ADD CONSTRAINT "BoxMaster_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "ClientMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoxMaster" ADD CONSTRAINT "BoxMaster_project_details_id_fkey" FOREIGN KEY ("project_details_id") REFERENCES "ProjectDetails"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoxMaster" ADD CONSTRAINT "BoxMaster_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "ProjectMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoxMaster" ADD CONSTRAINT "BoxMaster_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScanAndPackItem" ADD CONSTRAINT "ScanAndPackItem_box_id_fkey" FOREIGN KEY ("box_id") REFERENCES "BoxMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScanAndPackItem" ADD CONSTRAINT "ScanAndPackItem_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "ClientMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScanAndPackItem" ADD CONSTRAINT "ScanAndPackItem_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "UserMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScanAndPackItem" ADD CONSTRAINT "ScanAndPackItem_project_details_id_fkey" FOREIGN KEY ("project_details_id") REFERENCES "ProjectDetails"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScanAndPackItem" ADD CONSTRAINT "ScanAndPackItem_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "ProjectMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScanAndPackItem" ADD CONSTRAINT "ScanAndPackItem_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorTokens" ADD CONSTRAINT "VendorTokens_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadMaster" ADD CONSTRAINT "LeadMaster_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "AccountMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadMaster" ADD CONSTRAINT "LeadMaster_assign_to_fkey" FOREIGN KEY ("assign_to") REFERENCES "UserMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadMaster" ADD CONSTRAINT "LeadMaster_assigned_by_fkey" FOREIGN KEY ("assigned_by") REFERENCES "UserMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadMaster" ADD CONSTRAINT "LeadMaster_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "UserMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadMaster" ADD CONSTRAINT "LeadMaster_site_type_id_fkey" FOREIGN KEY ("site_type_id") REFERENCES "SiteTypeMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadMaster" ADD CONSTRAINT "LeadMaster_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "SourceMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadMaster" ADD CONSTRAINT "LeadMaster_status_id_fkey" FOREIGN KEY ("status_id") REFERENCES "StatusTypeMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadMaster" ADD CONSTRAINT "LeadMaster_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "UserMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadMaster" ADD CONSTRAINT "LeadMaster_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadUserMapping" ADD CONSTRAINT "LeadUserMapping_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "AccountMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadUserMapping" ADD CONSTRAINT "LeadUserMapping_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "UserMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadUserMapping" ADD CONSTRAINT "LeadUserMapping_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "LeadMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadUserMapping" ADD CONSTRAINT "LeadUserMapping_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "UserMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadUserMapping" ADD CONSTRAINT "LeadUserMapping_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "UserMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadUserMapping" ADD CONSTRAINT "LeadUserMapping_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadActivityStatusLog" ADD CONSTRAINT "LeadActivityStatusLog_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "AccountMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadActivityStatusLog" ADD CONSTRAINT "LeadActivityStatusLog_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "UserMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadActivityStatusLog" ADD CONSTRAINT "LeadActivityStatusLog_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "LeadMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadActivityStatusLog" ADD CONSTRAINT "LeadActivityStatusLog_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteTypeMaster" ADD CONSTRAINT "SiteTypeMaster_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceMaster" ADD CONSTRAINT "SourceMaster_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountMaster" ADD CONSTRAINT "AccountMaster_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "UserMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountMaster" ADD CONSTRAINT "AccountMaster_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "UserMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountMaster" ADD CONSTRAINT "AccountMaster_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadProductMapping" ADD CONSTRAINT "LeadProductMapping_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "AccountMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadProductMapping" ADD CONSTRAINT "LeadProductMapping_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "UserMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadProductMapping" ADD CONSTRAINT "LeadProductMapping_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "LeadMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadProductMapping" ADD CONSTRAINT "LeadProductMapping_product_type_id_fkey" FOREIGN KEY ("product_type_id") REFERENCES "ProductTypeMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadProductMapping" ADD CONSTRAINT "LeadProductMapping_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductTypeMaster" ADD CONSTRAINT "ProductTypeMaster_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadDocuments" ADD CONSTRAINT "LeadDocuments_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "AccountMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadDocuments" ADD CONSTRAINT "LeadDocuments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "UserMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadDocuments" ADD CONSTRAINT "LeadDocuments_deleted_by_fkey" FOREIGN KEY ("deleted_by") REFERENCES "UserMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadDocuments" ADD CONSTRAINT "LeadDocuments_doc_type_id_fkey" FOREIGN KEY ("doc_type_id") REFERENCES "DocumentTypeMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadDocuments" ADD CONSTRAINT "LeadDocuments_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "LeadMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadDocuments" ADD CONSTRAINT "LeadDocuments_product_structure_instance_id_fkey" FOREIGN KEY ("product_structure_instance_id") REFERENCES "LeadProductStructureInstance"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadDocuments" ADD CONSTRAINT "LeadDocuments_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadChatRoom" ADD CONSTRAINT "LeadChatRoom_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "LeadMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadChatRoom" ADD CONSTRAINT "LeadChatRoom_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadChatMember" ADD CONSTRAINT "LeadChatMember_added_by_fkey" FOREIGN KEY ("added_by") REFERENCES "UserMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadChatMember" ADD CONSTRAINT "LeadChatMember_chat_room_id_fkey" FOREIGN KEY ("chat_room_id") REFERENCES "LeadChatRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadChatMember" ADD CONSTRAINT "LeadChatMember_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "UserMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadChatMessage" ADD CONSTRAINT "LeadChatMessage_chat_room_id_fkey" FOREIGN KEY ("chat_room_id") REFERENCES "LeadChatRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadChatMessage" ADD CONSTRAINT "LeadChatMessage_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "UserMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadChatAttachment" ADD CONSTRAINT "LeadChatAttachment_doc_id_fkey" FOREIGN KEY ("doc_id") REFERENCES "LeadChatDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadChatAttachment" ADD CONSTRAINT "LeadChatAttachment_msg_id_fkey" FOREIGN KEY ("msg_id") REFERENCES "LeadChatMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadChatMention" ADD CONSTRAINT "LeadChatMention_mentioned_user_id_fkey" FOREIGN KEY ("mentioned_user_id") REFERENCES "UserMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadChatMention" ADD CONSTRAINT "LeadChatMention_msg_id_fkey" FOREIGN KEY ("msg_id") REFERENCES "LeadChatMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadChatDocument" ADD CONSTRAINT "LeadChatDocument_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "AccountMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadChatDocument" ADD CONSTRAINT "LeadChatDocument_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "UserMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadChatDocument" ADD CONSTRAINT "LeadChatDocument_deleted_by_fkey" FOREIGN KEY ("deleted_by") REFERENCES "UserMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadChatDocument" ADD CONSTRAINT "LeadChatDocument_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "LeadMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadChatDocument" ADD CONSTRAINT "LeadChatDocument_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductStructure" ADD CONSTRAINT "ProductStructure_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadProductStructureMapping" ADD CONSTRAINT "LeadProductStructureMapping_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "AccountMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadProductStructureMapping" ADD CONSTRAINT "LeadProductStructureMapping_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "LeadMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadProductStructureMapping" ADD CONSTRAINT "LeadProductStructureMapping_product_structure_id_fkey" FOREIGN KEY ("product_structure_id") REFERENCES "ProductStructure"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadProductStructureMapping" ADD CONSTRAINT "LeadProductStructureMapping_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadProductStructureInstance" ADD CONSTRAINT "LeadProductStructureInstance_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "AccountMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadProductStructureInstance" ADD CONSTRAINT "LeadProductStructureInstance_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "LeadMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadProductStructureInstance" ADD CONSTRAINT "LeadProductStructureInstance_product_structure_id_fkey" FOREIGN KEY ("product_structure_id") REFERENCES "ProductStructure"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadProductStructureInstance" ADD CONSTRAINT "LeadProductStructureInstance_product_type_id_fkey" FOREIGN KEY ("product_type_id") REFERENCES "ProductTypeMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadProductStructureInstance" ADD CONSTRAINT "LeadProductStructureInstance_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "UserMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadProductStructureInstance" ADD CONSTRAINT "LeadProductStructureInstance_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentInfo" ADD CONSTRAINT "PaymentInfo_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "AccountMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentInfo" ADD CONSTRAINT "PaymentInfo_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "UserMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentInfo" ADD CONSTRAINT "PaymentInfo_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "LeadMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentInfo" ADD CONSTRAINT "PaymentInfo_payment_file_id_fkey" FOREIGN KEY ("payment_file_id") REFERENCES "LeadDocuments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentInfo" ADD CONSTRAINT "PaymentInfo_payment_type_id_fkey" FOREIGN KEY ("payment_type_id") REFERENCES "PaymentTypeMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentInfo" ADD CONSTRAINT "PaymentInfo_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ledger" ADD CONSTRAINT "Ledger_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "AccountMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ledger" ADD CONSTRAINT "Ledger_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "ClientMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ledger" ADD CONSTRAINT "Ledger_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "UserMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ledger" ADD CONSTRAINT "Ledger_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "LeadMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ledger" ADD CONSTRAINT "Ledger_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentTypeMaster" ADD CONSTRAINT "DocumentTypeMaster_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StatusTypeMaster" ADD CONSTRAINT "StatusTypeMaster_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadStatusLogs" ADD CONSTRAINT "LeadStatusLogs_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "AccountMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadStatusLogs" ADD CONSTRAINT "LeadStatusLogs_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "UserMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadStatusLogs" ADD CONSTRAINT "LeadStatusLogs_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "LeadMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadStatusLogs" ADD CONSTRAINT "LeadStatusLogs_status_id_fkey" FOREIGN KEY ("status_id") REFERENCES "StatusTypeMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadStatusLogs" ADD CONSTRAINT "LeadStatusLogs_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadDesignMeeting" ADD CONSTRAINT "LeadDesignMeeting_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "AccountMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadDesignMeeting" ADD CONSTRAINT "LeadDesignMeeting_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "UserMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadDesignMeeting" ADD CONSTRAINT "LeadDesignMeeting_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "LeadMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadDesignMeeting" ADD CONSTRAINT "LeadDesignMeeting_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "UserMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadDesignMeeting" ADD CONSTRAINT "LeadDesignMeeting_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadDesignMeetingDocumentsMapping" ADD CONSTRAINT "LeadDesignMeetingDocumentsMapping_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "AccountMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadDesignMeetingDocumentsMapping" ADD CONSTRAINT "LeadDesignMeetingDocumentsMapping_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "UserMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadDesignMeetingDocumentsMapping" ADD CONSTRAINT "LeadDesignMeetingDocumentsMapping_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "LeadMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadDesignMeetingDocumentsMapping" ADD CONSTRAINT "LeadDesignMeetingDocumentsMapping_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "LeadDesignMeeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadDesignMeetingDocumentsMapping" ADD CONSTRAINT "LeadDesignMeetingDocumentsMapping_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadDesignSelection" ADD CONSTRAINT "LeadDesignSelection_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "AccountMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadDesignSelection" ADD CONSTRAINT "LeadDesignSelection_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "UserMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadDesignSelection" ADD CONSTRAINT "LeadDesignSelection_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "LeadMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadDesignSelection" ADD CONSTRAINT "LeadDesignSelection_product_structure_instance_id_fkey" FOREIGN KEY ("product_structure_instance_id") REFERENCES "LeadProductStructureInstance"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadDesignSelection" ADD CONSTRAINT "LeadDesignSelection_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "UserMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadDesignSelection" ADD CONSTRAINT "LeadDesignSelection_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentTypeMaster" ADD CONSTRAINT "PaymentTypeMaster_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadSiteSupervisorMapping" ADD CONSTRAINT "LeadSiteSupervisorMapping_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "AccountMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadSiteSupervisorMapping" ADD CONSTRAINT "LeadSiteSupervisorMapping_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "UserMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadSiteSupervisorMapping" ADD CONSTRAINT "LeadSiteSupervisorMapping_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "LeadMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadSiteSupervisorMapping" ADD CONSTRAINT "LeadSiteSupervisorMapping_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "UserMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadSiteSupervisorMapping" ADD CONSTRAINT "LeadSiteSupervisorMapping_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserLeadTask" ADD CONSTRAINT "UserLeadTask_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "AccountMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserLeadTask" ADD CONSTRAINT "UserLeadTask_closed_by_fkey" FOREIGN KEY ("closed_by") REFERENCES "UserMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserLeadTask" ADD CONSTRAINT "UserLeadTask_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "UserMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserLeadTask" ADD CONSTRAINT "UserLeadTask_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "LeadMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserLeadTask" ADD CONSTRAINT "UserLeadTask_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "UserMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserLeadTask" ADD CONSTRAINT "UserLeadTask_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadDetailedLogs" ADD CONSTRAINT "LeadDetailedLogs_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "AccountMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadDetailedLogs" ADD CONSTRAINT "LeadDetailedLogs_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "UserMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadDetailedLogs" ADD CONSTRAINT "LeadDetailedLogs_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "LeadMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadDetailedLogs" ADD CONSTRAINT "LeadDetailedLogs_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadDocumentLogs" ADD CONSTRAINT "LeadDocumentLogs_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "AccountMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadDocumentLogs" ADD CONSTRAINT "LeadDocumentLogs_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "UserMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadDocumentLogs" ADD CONSTRAINT "LeadDocumentLogs_doc_id_fkey" FOREIGN KEY ("doc_id") REFERENCES "LeadDocuments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadDocumentLogs" ADD CONSTRAINT "LeadDocumentLogs_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "LeadMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadDocumentLogs" ADD CONSTRAINT "LeadDocumentLogs_lead_logs_id_fkey" FOREIGN KEY ("lead_logs_id") REFERENCES "LeadDetailedLogs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadDocumentLogs" ADD CONSTRAINT "LeadDocumentLogs_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyVendorsMaster" ADD CONSTRAINT "CompanyVendorsMaster_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "UserMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyVendorsMaster" ADD CONSTRAINT "CompanyVendorsMaster_deleted_by_fkey" FOREIGN KEY ("deleted_by") REFERENCES "UserMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyVendorsMaster" ADD CONSTRAINT "CompanyVendorsMaster_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "UserMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyVendorsMaster" ADD CONSTRAINT "CompanyVendorsMaster_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderLoginDetails" ADD CONSTRAINT "OrderLoginDetails_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "AccountMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderLoginDetails" ADD CONSTRAINT "OrderLoginDetails_company_vendor_id_fkey" FOREIGN KEY ("company_vendor_id") REFERENCES "CompanyVendorsMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderLoginDetails" ADD CONSTRAINT "OrderLoginDetails_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "UserMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderLoginDetails" ADD CONSTRAINT "OrderLoginDetails_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "LeadMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderLoginDetails" ADD CONSTRAINT "OrderLoginDetails_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "UserMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderLoginDetails" ADD CONSTRAINT "OrderLoginDetails_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteReadiness" ADD CONSTRAINT "SiteReadiness_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "AccountMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteReadiness" ADD CONSTRAINT "SiteReadiness_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "UserMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteReadiness" ADD CONSTRAINT "SiteReadiness_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "LeadMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteReadiness" ADD CONSTRAINT "SiteReadiness_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "UserMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteReadiness" ADD CONSTRAINT "SiteReadiness_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstallerUserMaster" ADD CONSTRAINT "InstallerUserMaster_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "UserMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstallerUserMaster" ADD CONSTRAINT "InstallerUserMaster_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstallerUserMapping" ADD CONSTRAINT "InstallerUserMapping_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "AccountMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstallerUserMapping" ADD CONSTRAINT "InstallerUserMapping_assigned_by_fkey" FOREIGN KEY ("assigned_by") REFERENCES "UserMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstallerUserMapping" ADD CONSTRAINT "InstallerUserMapping_installer_id_fkey" FOREIGN KEY ("installer_id") REFERENCES "InstallerUserMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstallerUserMapping" ADD CONSTRAINT "InstallerUserMapping_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "LeadMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstallerUserMapping" ADD CONSTRAINT "InstallerUserMapping_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstallationUpdate" ADD CONSTRAINT "InstallationUpdate_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "AccountMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstallationUpdate" ADD CONSTRAINT "InstallationUpdate_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "UserMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstallationUpdate" ADD CONSTRAINT "InstallationUpdate_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "LeadMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstallationUpdate" ADD CONSTRAINT "InstallationUpdate_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstallationUpdateDocuments" ADD CONSTRAINT "InstallationUpdateDocuments_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "LeadDocuments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstallationUpdateDocuments" ADD CONSTRAINT "InstallationUpdateDocuments_installation_update_id_fkey" FOREIGN KEY ("installation_update_id") REFERENCES "InstallationUpdate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstallationUpdateDocuments" ADD CONSTRAINT "InstallationUpdateDocuments_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MiscellaneousMaster" ADD CONSTRAINT "MiscellaneousMaster_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "AccountMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MiscellaneousMaster" ADD CONSTRAINT "MiscellaneousMaster_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "UserMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MiscellaneousMaster" ADD CONSTRAINT "MiscellaneousMaster_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "LeadMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MiscellaneousMaster" ADD CONSTRAINT "MiscellaneousMaster_misc_type_id_fkey" FOREIGN KEY ("misc_type_id") REFERENCES "MiscellaneousTypeMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MiscellaneousMaster" ADD CONSTRAINT "MiscellaneousMaster_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "UserMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MiscellaneousMaster" ADD CONSTRAINT "MiscellaneousMaster_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MiscellaneousTypeMaster" ADD CONSTRAINT "MiscellaneousTypeMaster_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MiscellaneousTeamMaster" ADD CONSTRAINT "MiscellaneousTeamMaster_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MiscellaneousTeamMapping" ADD CONSTRAINT "MiscellaneousTeamMapping_miscellaneous_id_fkey" FOREIGN KEY ("miscellaneous_id") REFERENCES "MiscellaneousMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MiscellaneousTeamMapping" ADD CONSTRAINT "MiscellaneousTeamMapping_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "MiscellaneousTeamMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MiscellaneousDocument" ADD CONSTRAINT "MiscellaneousDocument_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "UserMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MiscellaneousDocument" ADD CONSTRAINT "MiscellaneousDocument_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "LeadDocuments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MiscellaneousDocument" ADD CONSTRAINT "MiscellaneousDocument_miscellaneous_id_fkey" FOREIGN KEY ("miscellaneous_id") REFERENCES "MiscellaneousMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MiscellaneousDocument" ADD CONSTRAINT "MiscellaneousDocument_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstallationIssueLogMaster" ADD CONSTRAINT "InstallationIssueLogMaster_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "AccountMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstallationIssueLogMaster" ADD CONSTRAINT "InstallationIssueLogMaster_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "UserMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstallationIssueLogMaster" ADD CONSTRAINT "InstallationIssueLogMaster_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "LeadMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstallationIssueLogMaster" ADD CONSTRAINT "InstallationIssueLogMaster_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IssueLogTypeMaster" ADD CONSTRAINT "IssueLogTypeMaster_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IssueLogTypeMapping" ADD CONSTRAINT "IssueLogTypeMapping_issue_log_id_fkey" FOREIGN KEY ("issue_log_id") REFERENCES "InstallationIssueLogMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IssueLogTypeMapping" ADD CONSTRAINT "IssueLogTypeMapping_type_id_fkey" FOREIGN KEY ("type_id") REFERENCES "IssueLogTypeMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IssueLogResponsibleTeamMapping" ADD CONSTRAINT "IssueLogResponsibleTeamMapping_issue_log_id_fkey" FOREIGN KEY ("issue_log_id") REFERENCES "InstallationIssueLogMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IssueLogResponsibleTeamMapping" ADD CONSTRAINT "IssueLogResponsibleTeamMapping_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "MiscellaneousTeamMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailNotificationMaster" ADD CONSTRAINT "EmailNotificationMaster_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "UserMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "UserMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPushToken" ADD CONSTRAINT "UserPushToken_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "UserMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPushToken" ADD CONSTRAINT "UserPushToken_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationDeliveryLogs" ADD CONSTRAINT "NotificationDeliveryLogs_notification_id_fkey" FOREIGN KEY ("notification_id") REFERENCES "Notification"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationDeliveryLogs" ADD CONSTRAINT "NotificationDeliveryLogs_push_token_id_fkey" FOREIGN KEY ("push_token_id") REFERENCES "UserPushToken"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_LeadDocumentsToSiteReadiness" ADD CONSTRAINT "_LeadDocumentsToSiteReadiness_A_fkey" FOREIGN KEY ("A") REFERENCES "LeadDocuments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_LeadDocumentsToSiteReadiness" ADD CONSTRAINT "_LeadDocumentsToSiteReadiness_B_fkey" FOREIGN KEY ("B") REFERENCES "SiteReadiness"("id") ON DELETE CASCADE ON UPDATE CASCADE;

