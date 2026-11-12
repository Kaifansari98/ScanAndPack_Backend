-- CreateEnum
CREATE TYPE "ComplaintRegistrationChannel" AS ENUM ('CLIENT_PORTAL', 'WEBSITE', 'STAFF');

-- CreateEnum
CREATE TYPE "ComplaintClientType" AS ENUM ('CRM_LEAD', 'EXTERNAL', 'EXCEPTIONAL');

-- CreateEnum
CREATE TYPE "ComplaintActorType" AS ENUM ('STAFF', 'CLIENT', 'SYSTEM');

-- CreateEnum
CREATE TYPE "ComplaintCycleEndReason" AS ENUM ('CLOSED', 'REOPENED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ComplaintStatus" AS ENUM ('NEW', 'UNDER_VERIFICATION', 'MORE_INFORMATION_REQUIRED', 'REJECTED', 'APPROVED_FOR_VISIT', 'AWAITING_CLIENT_ACCEPTANCE', 'PAYMENT_PENDING', 'VISIT_SCHEDULED', 'INSPECTION_SUBMITTED', 'QUOTATION_PREPARATION', 'DEPARTMENT_HEAD_APPROVAL', 'QUOTATION_SHARED', 'AWAITING_CLIENT_APPROVAL', 'AWAITING_PAYMENT', 'PROCUREMENT_PENDING', 'MATERIAL_RECEIVED', 'REPAIR_SCHEDULED', 'WORK_IN_PROGRESS', 'AWAITING_CLIENT_CONFIRMATION', 'AWAITING_HO_CLOSURE_APPROVAL', 'CLOSED', 'REOPENED', 'ON_HOLD', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ComplaintComponent" AS ENUM ('SHUTTER', 'CARCASS', 'HARDWARE', 'ACCESSORY');

-- CreateEnum
CREATE TYPE "ComplaintPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "ComplaintWarrantyStatus" AS ENUM ('UNDETERMINED', 'COVERED', 'PARTIALLY_COVERED', 'NOT_COVERED');

-- CreateEnum
CREATE TYPE "ComplaintAssigneeRole" AS ENUM ('SITE_SUPERVISOR', 'DEPARTMENT_HEAD');

-- CreateEnum
CREATE TYPE "ComplaintMediaType" AS ENUM ('PHOTO', 'VIDEO', 'DOCUMENT');

-- CreateEnum
CREATE TYPE "ComplaintAttachmentCategory" AS ENUM ('REGISTRATION', 'ADDITIONAL_INFORMATION', 'INSPECTION', 'PAYMENT_PROOF', 'QUOTATION', 'BEFORE_EXECUTION', 'AFTER_EXECUTION', 'CLIENT_CONFIRMATION', 'OTHER');

-- CreateEnum
CREATE TYPE "ComplaintDecisionType" AS ENUM ('HO_VERIFICATION', 'WARRANTY_DECISION', 'EXCEPTIONAL_APPROVAL', 'EXTERNAL_LEAD_LINK', 'VISIT_CHARGE_ACCEPTANCE', 'FREE_REPEAT_VISIT', 'CHARGE_WAIVER', 'INSPECTION_SKIP', 'QUOTATION_SKIP', 'HSS_QUOTATION_APPROVAL', 'CLIENT_QUOTATION_RESPONSE', 'CLIENT_RESOLUTION_CONFIRMATION', 'REOPEN_REVIEW');

-- CreateEnum
CREATE TYPE "ComplaintDecisionOutcome" AS ENUM ('APPROVED_FOR_VISIT', 'MORE_INFORMATION_REQUIRED', 'REMOTE_RESOLUTION', 'REJECTED', 'ON_HOLD', 'APPROVED', 'DECLINED', 'SENT_FOR_REVISION', 'ACCEPTED', 'MODIFICATION_REQUESTED', 'SATISFIED', 'NOT_SATISFIED', 'SKIPPED', 'COVERED', 'PARTIALLY_COVERED', 'NOT_COVERED');

-- CreateEnum
CREATE TYPE "ComplaintVisitPurpose" AS ENUM ('INSPECTION', 'REPAIR');

-- CreateEnum
CREATE TYPE "ComplaintVisitStatus" AS ENUM ('PENDING_FREE_APPROVAL', 'AWAITING_CHARGE_ACCEPTANCE', 'AWAITING_PAYMENT', 'READY_TO_SCHEDULE', 'SCHEDULED', 'CONFIRMED', 'COMPLETED', 'CLIENT_NOT_AVAILABLE', 'SITE_NOT_ACCESSIBLE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ComplaintVisitChargeMode" AS ENUM ('CHARGEABLE', 'FREE_REPEAT');

-- CreateEnum
CREATE TYPE "ComplaintResponsibility" AS ENUM ('MANUFACTURING', 'INSTALLATION_TEAM', 'HARDWARE_VENDOR', 'MATERIAL_DEFECT', 'CLIENT_MISUSE', 'CIVIL_SITE_CONDITION', 'WATER_MOISTURE_DAMAGE', 'NORMAL_WEAR_AND_TEAR', 'OUT_OF_WARRANTY', 'OTHER');

-- CreateEnum
CREATE TYPE "ComplaintRepairAction" AS ENUM ('HARDWARE_REPLACEMENT', 'SHUTTER_REPLACEMENT', 'CARCASS_PANEL_REPLACEMENT', 'ACCESSORY_REPLACEMENT', 'NEW_MATERIAL_REQUIRED', 'REMOTE_RESOLUTION', 'NO_ACTION_REQUIRED');

-- CreateEnum
CREATE TYPE "ComplaintQuotationStatus" AS ENUM ('DRAFT', 'PENDING_HSS_APPROVAL', 'SENT_FOR_REVISION', 'HSS_APPROVED', 'SHARED', 'CLIENT_ACCEPTED', 'CLIENT_REJECTED', 'MODIFICATION_REQUESTED', 'SUPERSEDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ComplaintQuotationItemCategory" AS ENUM ('MATERIAL', 'HARDWARE', 'LABOUR', 'TRANSPORTATION', 'OTHER');

-- CreateEnum
CREATE TYPE "ComplaintChargeType" AS ENUM ('VISIT', 'REPAIR');

-- CreateEnum
CREATE TYPE "ComplaintChargeStatus" AS ENUM ('OPEN', 'WAIVED', 'VOIDED');

-- CreateEnum
CREATE TYPE "ComplaintPaymentMethod" AS ENUM ('CASH', 'UPI', 'BANK_TRANSFER', 'CARD', 'CHEQUE', 'OTHER');

-- CreateEnum
CREATE TYPE "ComplaintPaymentStatus" AS ENUM ('PENDING_VERIFICATION', 'VERIFIED', 'REJECTED', 'REFUNDED', 'VOIDED');

-- CreateEnum
CREATE TYPE "ComplaintExecutionStatus" AS ENUM ('MATERIAL_APPROVAL_PENDING', 'PROCUREMENT_PENDING', 'MATERIAL_ORDERED', 'MATERIAL_RECEIVED', 'MATERIAL_READY', 'REPAIR_SCHEDULED', 'WORK_IN_PROGRESS', 'WORK_COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ComplaintTaskType" AS ENUM ('VERIFICATION', 'INFORMATION_FOLLOW_UP', 'VISIT_CHARGE_FOLLOW_UP', 'PAYMENT_VERIFICATION', 'SITE_VISIT', 'INSPECTION_REPORT', 'QUOTATION_PREPARATION', 'QUOTATION_APPROVAL', 'CLIENT_APPROVAL_FOLLOW_UP', 'PROCUREMENT', 'REPAIR', 'CLIENT_CONFIRMATION_FOLLOW_UP', 'REOPEN_REVIEW', 'FINAL_CLOSURE');

-- CreateEnum
CREATE TYPE "ComplaintClosureStatus" AS ENUM ('PENDING', 'CLOSED');

-- CreateEnum
CREATE TYPE "ComplaintClientConfirmationStatus" AS ENUM ('PENDING', 'SATISFIED', 'NOT_SATISFIED', 'NO_RESPONSE_HO_AUTHORISED');

-- CreateEnum
CREATE TYPE "ComplaintNotificationEvent" AS ENUM ('COMPLAINT_REGISTERED', 'SUPERVISOR_ASSIGNED', 'INFORMATION_REQUIRED', 'COMPLAINT_APPROVED', 'COMPLAINT_REJECTED', 'VISIT_CHARGES_RAISED', 'PAYMENT_RECEIVED', 'VISIT_SCHEDULED', 'VISIT_RESCHEDULED', 'INSPECTION_SUBMITTED', 'QUOTATION_APPROVED', 'QUOTATION_ACCEPTED', 'MATERIAL_READY', 'WORK_COMPLETED', 'COMPLAINT_REOPENED', 'COMPLAINT_CLOSED', 'REMINDER', 'ESCALATION');

-- CreateEnum
CREATE TYPE "ComplaintNotificationChannel" AS ENUM ('IN_APP', 'EMAIL', 'CLIENT_PORTAL', 'COMPLAINTS_CHAT');

-- CreateEnum
CREATE TYPE "ComplaintNotificationRecipient" AS ENUM ('CLIENT', 'STAFF');

-- CreateEnum
CREATE TYPE "ComplaintNotificationDeliveryStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'CHANNEL_UNAVAILABLE');

-- AlterTable
ALTER TABLE "MiscellaneousMaster" ADD COLUMN     "complaint_execution_id" INTEGER,
ADD COLUMN     "complaint_id" INTEGER,
ALTER COLUMN "lead_id" DROP NOT NULL,
ALTER COLUMN "account_id" DROP NOT NULL;

-- CreateTable
CREATE TABLE "ComplaintCategoryMaster" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_by" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComplaintCategoryMaster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplaintExternalClient" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "external_client_code" VARCHAR(64) NOT NULL,
    "client_name" VARCHAR(200) NOT NULL,
    "mobile" VARCHAR(40) NOT NULL,
    "alternate_mobile" VARCHAR(40),
    "email" VARCHAR(320),
    "address" VARCHAR(2000) NOT NULL,
    "city" VARCHAR(120) NOT NULL,
    "product_type" VARCHAR(200),
    "installation_date" DATE,
    "email_verified_at" TIMESTAMP(3),
    "created_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComplaintExternalClient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplaintMaster" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "complaint_code" VARCHAR(100) NOT NULL,
    "sequence_no" INTEGER NOT NULL,
    "registration_channel" "ComplaintRegistrationChannel" NOT NULL,
    "client_type" "ComplaintClientType" NOT NULL,
    "lead_id" INTEGER,
    "account_id" INTEGER,
    "instance_id" INTEGER,
    "external_client_id" INTEGER,
    "client_name" VARCHAR(200) NOT NULL,
    "client_mobile" VARCHAR(40) NOT NULL,
    "client_alternate_mobile" VARCHAR(40),
    "client_email" VARCHAR(320),
    "site_address" VARCHAR(2000) NOT NULL,
    "city" VARCHAR(120),
    "product_type" VARCHAR(200),
    "component" "ComplaintComponent" NOT NULL,
    "category_id" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "additional_remarks" TEXT,
    "preferred_visit_date" DATE,
    "installation_date" DATE,
    "usable_handover_date" DATE,
    "final_handover_date" DATE,
    "priority" "ComplaintPriority",
    "warranty_status" "ComplaintWarrantyStatus" NOT NULL DEFAULT 'UNDETERMINED',
    "exceptional_reason" VARCHAR(4000),
    "possible_duplicate" BOOLEAN NOT NULL DEFAULT false,
    "duplicate_reviewed_by" INTEGER,
    "duplicate_reviewed_at" TIMESTAMP(3),
    "duplicate_review_remarks" VARCHAR(2000),
    "assigned_ss_id" INTEGER,
    "assigned_hss_id" INTEGER,
    "raised_by_actor_type" "ComplaintActorType" NOT NULL,
    "raised_by_user_id" INTEGER,
    "raised_by_client_reference" VARCHAR(255),
    "status" "ComplaintStatus" NOT NULL DEFAULT 'NEW',
    "status_changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "current_cycle_id" INTEGER,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComplaintMaster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplaintCycle" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "complaint_id" INTEGER NOT NULL,
    "cycle_number" INTEGER NOT NULL,
    "reopened_reason" VARCHAR(4000),
    "opened_by_actor_type" "ComplaintActorType" NOT NULL,
    "opened_by_user_id" INTEGER,
    "opened_by_client_reference" VARCHAR(255),
    "opened_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),
    "closed_at" TIMESTAMP(3),
    "ended_at" TIMESTAMP(3),
    "end_reason" "ComplaintCycleEndReason",

    CONSTRAINT "ComplaintCycle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplaintAssignment" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "complaint_id" INTEGER NOT NULL,
    "cycle_id" INTEGER NOT NULL,
    "role" "ComplaintAssigneeRole" NOT NULL,
    "previous_user_id" INTEGER,
    "new_user_id" INTEGER NOT NULL,
    "reason" VARCHAR(2000),
    "assigned_by_actor_type" "ComplaintActorType" NOT NULL,
    "assigned_by" INTEGER,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ComplaintAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplaintAttachment" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "complaint_id" INTEGER NOT NULL,
    "cycle_id" INTEGER NOT NULL,
    "storage_key" TEXT NOT NULL,
    "original_name" VARCHAR(255) NOT NULL,
    "mime_type" VARCHAR(127) NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "media_type" "ComplaintMediaType" NOT NULL,
    "category" "ComplaintAttachmentCategory" NOT NULL,
    "actor_type" "ComplaintActorType" NOT NULL,
    "actor_user_id" INTEGER,
    "actor_client_reference" VARCHAR(255),
    "visit_id" INTEGER,
    "inspection_report_id" INTEGER,
    "execution_id" INTEGER,
    "decision_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ComplaintAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplaintDecision" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "complaint_id" INTEGER NOT NULL,
    "cycle_id" INTEGER NOT NULL,
    "decision_type" "ComplaintDecisionType" NOT NULL,
    "outcome" "ComplaintDecisionOutcome" NOT NULL,
    "remarks" VARCHAR(4000),
    "remote_instructions" TEXT,
    "client_response" TEXT,
    "actor_type" "ComplaintActorType" NOT NULL,
    "actor_user_id" INTEGER,
    "actor_client_reference" VARCHAR(255),
    "acting_on_behalf_of_client" BOOLEAN NOT NULL DEFAULT false,
    "visit_id" INTEGER,
    "quotation_id" INTEGER,
    "decided_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ComplaintDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplaintVisit" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "complaint_id" INTEGER NOT NULL,
    "cycle_id" INTEGER NOT NULL,
    "visit_number" INTEGER NOT NULL,
    "purpose" "ComplaintVisitPurpose" NOT NULL,
    "status" "ComplaintVisitStatus" NOT NULL,
    "charge_mode" "ComplaintVisitChargeMode" NOT NULL DEFAULT 'CHARGEABLE',
    "standard_fee" DECIMAL(12,2) NOT NULL DEFAULT 800,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'INR',
    "assigned_ss_id" INTEGER,
    "team_details" VARCHAR(2000),
    "repeat_of_visit_id" INTEGER,
    "repeat_remarks" VARCHAR(2000),
    "free_approval_decision_id" INTEGER,
    "scheduled_for" TIMESTAMP(3),
    "reschedule_count" INTEGER NOT NULL DEFAULT 0,
    "completed_at" TIMESTAMP(3),
    "remarks" VARCHAR(4000),
    "created_by" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComplaintVisit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplaintInspectionReport" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "complaint_id" INTEGER NOT NULL,
    "cycle_id" INTEGER NOT NULL,
    "visit_id" INTEGER NOT NULL,
    "actual_visit_date" TIMESTAMP(3) NOT NULL,
    "client_available" BOOLEAN NOT NULL,
    "issue_observed" TEXT NOT NULL,
    "root_cause" TEXT NOT NULL,
    "affected_product" VARCHAR(200) NOT NULL,
    "affected_unit_number" VARCHAR(100) NOT NULL,
    "responsibility" "ComplaintResponsibility" NOT NULL,
    "responsibility_remarks" VARCHAR(2000),
    "repair_actions" "ComplaintRepairAction"[],
    "material_required" BOOLEAN NOT NULL,
    "remarks" TEXT,
    "estimated_work_days" INTEGER,
    "expected_completion_date" DATE,
    "additional_visit_required" BOOLEAN NOT NULL DEFAULT false,
    "further_approval_required" BOOLEAN NOT NULL DEFAULT false,
    "submitted_by" INTEGER NOT NULL,
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ComplaintInspectionReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplaintInspectionMaterial" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "complaint_id" INTEGER NOT NULL,
    "cycle_id" INTEGER NOT NULL,
    "inspection_report_id" INTEGER NOT NULL,
    "sequence" INTEGER NOT NULL,
    "material_name" VARCHAR(250) NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "unit" VARCHAR(40),
    "specification" VARCHAR(2000),
    "finish_colour" VARCHAR(200),
    "estimated_cost" DECIMAL(12,2),
    "remarks" VARCHAR(2000),

    CONSTRAINT "ComplaintInspectionMaterial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplaintQuotation" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "complaint_id" INTEGER NOT NULL,
    "cycle_id" INTEGER NOT NULL,
    "quotation_number" INTEGER NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "status" "ComplaintQuotationStatus" NOT NULL DEFAULT 'DRAFT',
    "inspection_report_id" INTEGER,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'INR',
    "subtotal" DECIMAL(12,2) NOT NULL,
    "tax_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "warranty_covered_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "client_payable_amount" DECIMAL(12,2) NOT NULL,
    "total_amount" DECIMAL(12,2) NOT NULL,
    "hss_approval_decision_id" INTEGER,
    "client_response_decision_id" INTEGER,
    "shared_at" TIMESTAMP(3),
    "created_by" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComplaintQuotation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplaintQuotationItem" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "complaint_id" INTEGER NOT NULL,
    "cycle_id" INTEGER NOT NULL,
    "quotation_id" INTEGER NOT NULL,
    "sequence" INTEGER NOT NULL,
    "category" "ComplaintQuotationItemCategory" NOT NULL,
    "description" VARCHAR(2000) NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "unit" VARCHAR(40),
    "unit_rate" DECIMAL(12,2) NOT NULL,
    "line_total" DECIMAL(12,2) NOT NULL,
    "warranty_covered_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "client_payable_amount" DECIMAL(12,2) NOT NULL,
    "chargeable_reason" VARCHAR(2000),

    CONSTRAINT "ComplaintQuotationItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplaintCharge" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "complaint_id" INTEGER NOT NULL,
    "cycle_id" INTEGER NOT NULL,
    "charge_type" "ComplaintChargeType" NOT NULL,
    "visit_id" INTEGER,
    "quotation_id" INTEGER,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'INR',
    "status" "ComplaintChargeStatus" NOT NULL DEFAULT 'OPEN',
    "waiver_decision_id" INTEGER,
    "due_at" TIMESTAMP(3),
    "created_by" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ComplaintCharge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplaintPayment" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "complaint_id" INTEGER NOT NULL,
    "cycle_id" INTEGER NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'INR',
    "method" "ComplaintPaymentMethod" NOT NULL,
    "transaction_reference" VARCHAR(255) NOT NULL,
    "payment_date" TIMESTAMP(3) NOT NULL,
    "status" "ComplaintPaymentStatus" NOT NULL DEFAULT 'PENDING_VERIFICATION',
    "proof_attachment_id" INTEGER NOT NULL,
    "actor_type" "ComplaintActorType" NOT NULL,
    "actor_user_id" INTEGER,
    "actor_client_reference" VARCHAR(255),
    "verified_by" INTEGER,
    "verified_at" TIMESTAMP(3),
    "rejection_remarks" VARCHAR(2000),
    "refunded_by" INTEGER,
    "refunded_at" TIMESTAMP(3),
    "refund_remarks" VARCHAR(2000),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComplaintPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplaintPaymentAllocation" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "complaint_id" INTEGER NOT NULL,
    "cycle_id" INTEGER NOT NULL,
    "payment_id" INTEGER NOT NULL,
    "charge_id" INTEGER NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "allocated_by" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ComplaintPaymentAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplaintExecution" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "complaint_id" INTEGER NOT NULL,
    "cycle_id" INTEGER NOT NULL,
    "quotation_id" INTEGER,
    "inspection_skip_decision_id" INTEGER,
    "quotation_skip_decision_id" INTEGER,
    "material_required" BOOLEAN NOT NULL DEFAULT false,
    "status" "ComplaintExecutionStatus" NOT NULL,
    "purchase_order_reference" VARCHAR(255),
    "material_expected_date" DATE,
    "material_received_date" DATE,
    "repair_visit_id" INTEGER,
    "assigned_ss_id" INTEGER,
    "team_details" VARCHAR(2000),
    "scheduled_for" TIMESTAMP(3),
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "completed_by" INTEGER,
    "material_used" TEXT,
    "replacement_details" TEXT,
    "client_remarks" TEXT,
    "completion_remarks" TEXT,
    "pending_work" TEXT,
    "created_by" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComplaintExecution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplaintTask" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "complaint_id" INTEGER NOT NULL,
    "cycle_id" INTEGER NOT NULL,
    "task_type" "ComplaintTaskType" NOT NULL,
    "task_key" VARCHAR(150) NOT NULL,
    "assigned_to" INTEGER NOT NULL,
    "status" "LeadTaskStatus" NOT NULL DEFAULT 'open',
    "due_date" TIMESTAMP(3),
    "visit_id" INTEGER,
    "execution_id" INTEGER,
    "remark" VARCHAR(4000),
    "created_by" INTEGER NOT NULL,
    "completed_by" INTEGER,
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComplaintTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplaintClosure" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "complaint_id" INTEGER NOT NULL,
    "cycle_id" INTEGER NOT NULL,
    "status" "ComplaintClosureStatus" NOT NULL DEFAULT 'PENDING',
    "client_confirmation_status" "ComplaintClientConfirmationStatus" NOT NULL DEFAULT 'PENDING',
    "client_confirmation_decision_id" INTEGER,
    "no_response_reason" VARCHAR(2000),
    "completion_verified_by" INTEGER,
    "completion_verified_at" TIMESTAMP(3),
    "financial_verified_by" INTEGER,
    "financial_verified_at" TIMESTAMP(3),
    "closed_by" INTEGER,
    "closed_at" TIMESTAMP(3),
    "closure_remarks" VARCHAR(4000),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ComplaintClosure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplaintNotification" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "complaint_id" INTEGER NOT NULL,
    "cycle_id" INTEGER,
    "event" "ComplaintNotificationEvent" NOT NULL,
    "channel" "ComplaintNotificationChannel" NOT NULL,
    "recipient_type" "ComplaintNotificationRecipient" NOT NULL,
    "recipient_user_id" INTEGER,
    "recipient_address" VARCHAR(320),
    "delivery_status" "ComplaintNotificationDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "failure_reason" VARCHAR(2000),
    "payload" JSONB,
    "sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ComplaintNotification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplaintSlaConfig" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "status" "ComplaintStatus" NOT NULL,
    "target_hours" INTEGER NOT NULL,
    "reminder_every_hours" INTEGER,
    "escalate_after_hours" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "updated_by" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComplaintSlaConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplaintActivityLog" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "complaint_id" INTEGER NOT NULL,
    "cycle_id" INTEGER NOT NULL,
    "action" VARCHAR(100) NOT NULL,
    "from_status" "ComplaintStatus",
    "to_status" "ComplaintStatus",
    "actor_type" "ComplaintActorType" NOT NULL,
    "actor_user_id" INTEGER,
    "actor_client_reference" VARCHAR(255),
    "acting_on_behalf_of_client" BOOLEAN NOT NULL DEFAULT false,
    "remarks" VARCHAR(4000),
    "decision_id" INTEGER,
    "assignment_id" INTEGER,
    "task_id" INTEGER,
    "visit_id" INTEGER,
    "quotation_id" INTEGER,
    "payment_id" INTEGER,
    "execution_id" INTEGER,
    "closure_id" INTEGER,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ComplaintActivityLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ComplaintCategoryMaster_vendor_id_is_active_sort_order_idx" ON "ComplaintCategoryMaster"("vendor_id", "is_active", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "ComplaintCategoryMaster_vendor_id_name_key" ON "ComplaintCategoryMaster"("vendor_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "ComplaintCategoryMaster_id_vendor_id_key" ON "ComplaintCategoryMaster"("id", "vendor_id");

-- CreateIndex
CREATE INDEX "ComplaintExternalClient_vendor_id_mobile_idx" ON "ComplaintExternalClient"("vendor_id", "mobile");

-- CreateIndex
CREATE INDEX "ComplaintExternalClient_vendor_id_email_idx" ON "ComplaintExternalClient"("vendor_id", "email");

-- CreateIndex
CREATE UNIQUE INDEX "ComplaintExternalClient_vendor_id_external_client_code_key" ON "ComplaintExternalClient"("vendor_id", "external_client_code");

-- CreateIndex
CREATE UNIQUE INDEX "ComplaintExternalClient_id_vendor_id_key" ON "ComplaintExternalClient"("id", "vendor_id");

-- CreateIndex
CREATE INDEX "ComplaintMaster_vendor_id_status_created_at_idx" ON "ComplaintMaster"("vendor_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "ComplaintMaster_vendor_id_assigned_ss_id_status_idx" ON "ComplaintMaster"("vendor_id", "assigned_ss_id", "status");

-- CreateIndex
CREATE INDEX "ComplaintMaster_vendor_id_assigned_hss_id_status_idx" ON "ComplaintMaster"("vendor_id", "assigned_hss_id", "status");

-- CreateIndex
CREATE INDEX "ComplaintMaster_vendor_id_lead_id_idx" ON "ComplaintMaster"("vendor_id", "lead_id");

-- CreateIndex
CREATE INDEX "ComplaintMaster_vendor_id_external_client_id_idx" ON "ComplaintMaster"("vendor_id", "external_client_id");

-- CreateIndex
CREATE INDEX "ComplaintMaster_vendor_id_client_mobile_idx" ON "ComplaintMaster"("vendor_id", "client_mobile");

-- CreateIndex
CREATE INDEX "ComplaintMaster_vendor_id_category_id_idx" ON "ComplaintMaster"("vendor_id", "category_id");

-- CreateIndex
CREATE UNIQUE INDEX "ComplaintMaster_vendor_id_complaint_code_key" ON "ComplaintMaster"("vendor_id", "complaint_code");

-- CreateIndex
CREATE UNIQUE INDEX "ComplaintMaster_current_cycle_id_id_vendor_id_key" ON "ComplaintMaster"("current_cycle_id", "id", "vendor_id");

-- CreateIndex
CREATE UNIQUE INDEX "ComplaintMaster_id_vendor_id_key" ON "ComplaintMaster"("id", "vendor_id");

-- CreateIndex
CREATE INDEX "ComplaintCycle_vendor_id_complaint_id_idx" ON "ComplaintCycle"("vendor_id", "complaint_id");

-- CreateIndex
CREATE UNIQUE INDEX "ComplaintCycle_id_complaint_id_vendor_id_key" ON "ComplaintCycle"("id", "complaint_id", "vendor_id");

-- CreateIndex
CREATE UNIQUE INDEX "ComplaintCycle_complaint_id_cycle_number_key" ON "ComplaintCycle"("complaint_id", "cycle_number");

-- CreateIndex
CREATE INDEX "ComplaintAssignment_vendor_id_complaint_id_cycle_id_idx" ON "ComplaintAssignment"("vendor_id", "complaint_id", "cycle_id");

-- CreateIndex
CREATE UNIQUE INDEX "ComplaintAssignment_id_cycle_id_key" ON "ComplaintAssignment"("id", "cycle_id");

-- CreateIndex
CREATE UNIQUE INDEX "ComplaintAttachment_storage_key_key" ON "ComplaintAttachment"("storage_key");

-- CreateIndex
CREATE INDEX "ComplaintAttachment_vendor_id_complaint_id_cycle_id_idx" ON "ComplaintAttachment"("vendor_id", "complaint_id", "cycle_id");

-- CreateIndex
CREATE INDEX "ComplaintAttachment_complaint_id_category_media_type_idx" ON "ComplaintAttachment"("complaint_id", "category", "media_type");

-- CreateIndex
CREATE UNIQUE INDEX "ComplaintAttachment_id_cycle_id_key" ON "ComplaintAttachment"("id", "cycle_id");

-- CreateIndex
CREATE INDEX "ComplaintDecision_vendor_id_complaint_id_cycle_id_idx" ON "ComplaintDecision"("vendor_id", "complaint_id", "cycle_id");

-- CreateIndex
CREATE INDEX "ComplaintDecision_vendor_id_complaint_id_decision_type_deci_idx" ON "ComplaintDecision"("vendor_id", "complaint_id", "decision_type", "decided_at");

-- CreateIndex
CREATE UNIQUE INDEX "ComplaintDecision_id_cycle_id_key" ON "ComplaintDecision"("id", "cycle_id");

-- CreateIndex
CREATE INDEX "ComplaintVisit_vendor_id_complaint_id_cycle_id_idx" ON "ComplaintVisit"("vendor_id", "complaint_id", "cycle_id");

-- CreateIndex
CREATE INDEX "ComplaintVisit_vendor_id_assigned_ss_id_status_scheduled_fo_idx" ON "ComplaintVisit"("vendor_id", "assigned_ss_id", "status", "scheduled_for");

-- CreateIndex
CREATE UNIQUE INDEX "ComplaintVisit_id_cycle_id_key" ON "ComplaintVisit"("id", "cycle_id");

-- CreateIndex
CREATE UNIQUE INDEX "ComplaintVisit_complaint_id_visit_number_key" ON "ComplaintVisit"("complaint_id", "visit_number");

-- CreateIndex
CREATE UNIQUE INDEX "ComplaintVisit_id_complaint_id_vendor_id_key" ON "ComplaintVisit"("id", "complaint_id", "vendor_id");

-- CreateIndex
CREATE INDEX "ComplaintInspectionReport_vendor_id_complaint_id_cycle_id_idx" ON "ComplaintInspectionReport"("vendor_id", "complaint_id", "cycle_id");

-- CreateIndex
CREATE UNIQUE INDEX "ComplaintInspectionReport_id_cycle_id_key" ON "ComplaintInspectionReport"("id", "cycle_id");

-- CreateIndex
CREATE UNIQUE INDEX "ComplaintInspectionReport_visit_id_key" ON "ComplaintInspectionReport"("visit_id");

-- CreateIndex
CREATE INDEX "ComplaintInspectionMaterial_vendor_id_complaint_id_cycle_id_idx" ON "ComplaintInspectionMaterial"("vendor_id", "complaint_id", "cycle_id");

-- CreateIndex
CREATE UNIQUE INDEX "ComplaintInspectionMaterial_id_cycle_id_key" ON "ComplaintInspectionMaterial"("id", "cycle_id");

-- CreateIndex
CREATE UNIQUE INDEX "ComplaintInspectionMaterial_inspection_report_id_sequence_key" ON "ComplaintInspectionMaterial"("inspection_report_id", "sequence");

-- CreateIndex
CREATE INDEX "ComplaintQuotation_vendor_id_complaint_id_cycle_id_idx" ON "ComplaintQuotation"("vendor_id", "complaint_id", "cycle_id");

-- CreateIndex
CREATE INDEX "ComplaintQuotation_vendor_id_status_created_at_idx" ON "ComplaintQuotation"("vendor_id", "status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "ComplaintQuotation_id_cycle_id_key" ON "ComplaintQuotation"("id", "cycle_id");

-- CreateIndex
CREATE UNIQUE INDEX "ComplaintQuotation_complaint_id_quotation_number_revision_key" ON "ComplaintQuotation"("complaint_id", "quotation_number", "revision");

-- CreateIndex
CREATE INDEX "ComplaintQuotationItem_vendor_id_complaint_id_cycle_id_idx" ON "ComplaintQuotationItem"("vendor_id", "complaint_id", "cycle_id");

-- CreateIndex
CREATE UNIQUE INDEX "ComplaintQuotationItem_id_cycle_id_key" ON "ComplaintQuotationItem"("id", "cycle_id");

-- CreateIndex
CREATE UNIQUE INDEX "ComplaintQuotationItem_quotation_id_sequence_key" ON "ComplaintQuotationItem"("quotation_id", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "ComplaintCharge_visit_id_key" ON "ComplaintCharge"("visit_id");

-- CreateIndex
CREATE UNIQUE INDEX "ComplaintCharge_quotation_id_key" ON "ComplaintCharge"("quotation_id");

-- CreateIndex
CREATE INDEX "ComplaintCharge_vendor_id_complaint_id_cycle_id_idx" ON "ComplaintCharge"("vendor_id", "complaint_id", "cycle_id");

-- CreateIndex
CREATE UNIQUE INDEX "ComplaintCharge_id_cycle_id_key" ON "ComplaintCharge"("id", "cycle_id");

-- CreateIndex
CREATE INDEX "ComplaintPayment_vendor_id_complaint_id_cycle_id_idx" ON "ComplaintPayment"("vendor_id", "complaint_id", "cycle_id");

-- CreateIndex
CREATE INDEX "ComplaintPayment_vendor_id_status_payment_date_idx" ON "ComplaintPayment"("vendor_id", "status", "payment_date");

-- CreateIndex
CREATE UNIQUE INDEX "ComplaintPayment_id_cycle_id_key" ON "ComplaintPayment"("id", "cycle_id");

-- CreateIndex
CREATE INDEX "ComplaintPaymentAllocation_vendor_id_complaint_id_cycle_id_idx" ON "ComplaintPaymentAllocation"("vendor_id", "complaint_id", "cycle_id");

-- CreateIndex
CREATE UNIQUE INDEX "ComplaintPaymentAllocation_id_cycle_id_key" ON "ComplaintPaymentAllocation"("id", "cycle_id");

-- CreateIndex
CREATE UNIQUE INDEX "ComplaintPaymentAllocation_payment_id_charge_id_key" ON "ComplaintPaymentAllocation"("payment_id", "charge_id");

-- CreateIndex
CREATE INDEX "ComplaintExecution_vendor_id_complaint_id_cycle_id_idx" ON "ComplaintExecution"("vendor_id", "complaint_id", "cycle_id");

-- CreateIndex
CREATE INDEX "ComplaintExecution_vendor_id_status_idx" ON "ComplaintExecution"("vendor_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ComplaintExecution_id_cycle_id_key" ON "ComplaintExecution"("id", "cycle_id");

-- CreateIndex
CREATE UNIQUE INDEX "ComplaintExecution_id_vendor_id_key" ON "ComplaintExecution"("id", "vendor_id");

-- CreateIndex
CREATE INDEX "ComplaintTask_vendor_id_complaint_id_cycle_id_idx" ON "ComplaintTask"("vendor_id", "complaint_id", "cycle_id");

-- CreateIndex
CREATE INDEX "ComplaintTask_vendor_id_assigned_to_status_due_date_idx" ON "ComplaintTask"("vendor_id", "assigned_to", "status", "due_date");

-- CreateIndex
CREATE UNIQUE INDEX "ComplaintTask_id_cycle_id_key" ON "ComplaintTask"("id", "cycle_id");

-- CreateIndex
CREATE UNIQUE INDEX "ComplaintTask_cycle_id_task_key_key" ON "ComplaintTask"("cycle_id", "task_key");

-- CreateIndex
CREATE INDEX "ComplaintClosure_vendor_id_complaint_id_cycle_id_idx" ON "ComplaintClosure"("vendor_id", "complaint_id", "cycle_id");

-- CreateIndex
CREATE UNIQUE INDEX "ComplaintClosure_id_cycle_id_key" ON "ComplaintClosure"("id", "cycle_id");

-- CreateIndex
CREATE UNIQUE INDEX "ComplaintClosure_cycle_id_key" ON "ComplaintClosure"("cycle_id");

-- CreateIndex
CREATE INDEX "ComplaintNotification_vendor_id_complaint_id_created_at_idx" ON "ComplaintNotification"("vendor_id", "complaint_id", "created_at");

-- CreateIndex
CREATE INDEX "ComplaintNotification_vendor_id_delivery_status_idx" ON "ComplaintNotification"("vendor_id", "delivery_status");

-- CreateIndex
CREATE UNIQUE INDEX "ComplaintSlaConfig_vendor_id_status_key" ON "ComplaintSlaConfig"("vendor_id", "status");

-- CreateIndex
CREATE INDEX "ComplaintActivityLog_vendor_id_complaint_id_cycle_id_idx" ON "ComplaintActivityLog"("vendor_id", "complaint_id", "cycle_id");

-- CreateIndex
CREATE INDEX "ComplaintActivityLog_vendor_id_complaint_id_created_at_id_idx" ON "ComplaintActivityLog"("vendor_id", "complaint_id", "created_at", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ComplaintActivityLog_id_cycle_id_key" ON "ComplaintActivityLog"("id", "cycle_id");

-- CreateIndex
CREATE UNIQUE INDEX "UserMaster_id_vendor_id_key" ON "UserMaster"("id", "vendor_id");

-- CreateIndex
CREATE UNIQUE INDEX "LeadMaster_id_account_id_vendor_id_key" ON "LeadMaster"("id", "account_id", "vendor_id");

-- CreateIndex
CREATE UNIQUE INDEX "AccountMaster_id_vendor_id_key" ON "AccountMaster"("id", "vendor_id");

-- CreateIndex
CREATE UNIQUE INDEX "LeadProductStructureInstance_id_lead_id_vendor_id_key" ON "LeadProductStructureInstance"("id", "lead_id", "vendor_id");

-- CreateIndex
CREATE INDEX "MiscellaneousMaster_vendor_id_complaint_id_idx" ON "MiscellaneousMaster"("vendor_id", "complaint_id");

-- CreateIndex
CREATE UNIQUE INDEX "MiscellaneousMaster_id_vendor_id_key" ON "MiscellaneousMaster"("id", "vendor_id");

-- AddForeignKey
ALTER TABLE "MiscellaneousMaster" ADD CONSTRAINT "MiscellaneousMaster_complaint_id_vendor_id_fkey" FOREIGN KEY ("complaint_id", "vendor_id") REFERENCES "ComplaintMaster"("id", "vendor_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MiscellaneousMaster" ADD CONSTRAINT "MiscellaneousMaster_complaint_execution_id_vendor_id_fkey" FOREIGN KEY ("complaint_execution_id", "vendor_id") REFERENCES "ComplaintExecution"("id", "vendor_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplaintCategoryMaster" ADD CONSTRAINT "ComplaintCategoryMaster_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplaintCategoryMaster" ADD CONSTRAINT "ComplaintCategoryMaster_created_by_vendor_id_fkey" FOREIGN KEY ("created_by", "vendor_id") REFERENCES "UserMaster"("id", "vendor_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplaintExternalClient" ADD CONSTRAINT "ComplaintExternalClient_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplaintExternalClient" ADD CONSTRAINT "ComplaintExternalClient_created_by_vendor_id_fkey" FOREIGN KEY ("created_by", "vendor_id") REFERENCES "UserMaster"("id", "vendor_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplaintMaster" ADD CONSTRAINT "ComplaintMaster_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplaintMaster" ADD CONSTRAINT "ComplaintMaster_current_cycle_id_id_vendor_id_fkey" FOREIGN KEY ("current_cycle_id", "id", "vendor_id") REFERENCES "ComplaintCycle"("id", "complaint_id", "vendor_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplaintMaster" ADD CONSTRAINT "ComplaintMaster_lead_id_account_id_vendor_id_fkey" FOREIGN KEY ("lead_id", "account_id", "vendor_id") REFERENCES "LeadMaster"("id", "account_id", "vendor_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplaintMaster" ADD CONSTRAINT "ComplaintMaster_account_id_vendor_id_fkey" FOREIGN KEY ("account_id", "vendor_id") REFERENCES "AccountMaster"("id", "vendor_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplaintMaster" ADD CONSTRAINT "ComplaintMaster_instance_id_lead_id_vendor_id_fkey" FOREIGN KEY ("instance_id", "lead_id", "vendor_id") REFERENCES "LeadProductStructureInstance"("id", "lead_id", "vendor_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplaintMaster" ADD CONSTRAINT "ComplaintMaster_external_client_id_vendor_id_fkey" FOREIGN KEY ("external_client_id", "vendor_id") REFERENCES "ComplaintExternalClient"("id", "vendor_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplaintMaster" ADD CONSTRAINT "ComplaintMaster_category_id_vendor_id_fkey" FOREIGN KEY ("category_id", "vendor_id") REFERENCES "ComplaintCategoryMaster"("id", "vendor_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplaintMaster" ADD CONSTRAINT "ComplaintMaster_assigned_ss_id_vendor_id_fkey" FOREIGN KEY ("assigned_ss_id", "vendor_id") REFERENCES "UserMaster"("id", "vendor_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplaintMaster" ADD CONSTRAINT "ComplaintMaster_assigned_hss_id_vendor_id_fkey" FOREIGN KEY ("assigned_hss_id", "vendor_id") REFERENCES "UserMaster"("id", "vendor_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplaintMaster" ADD CONSTRAINT "ComplaintMaster_raised_by_user_id_vendor_id_fkey" FOREIGN KEY ("raised_by_user_id", "vendor_id") REFERENCES "UserMaster"("id", "vendor_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplaintMaster" ADD CONSTRAINT "ComplaintMaster_duplicate_reviewed_by_vendor_id_fkey" FOREIGN KEY ("duplicate_reviewed_by", "vendor_id") REFERENCES "UserMaster"("id", "vendor_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplaintCycle" ADD CONSTRAINT "ComplaintCycle_complaint_id_vendor_id_fkey" FOREIGN KEY ("complaint_id", "vendor_id") REFERENCES "ComplaintMaster"("id", "vendor_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplaintCycle" ADD CONSTRAINT "ComplaintCycle_opened_by_user_id_vendor_id_fkey" FOREIGN KEY ("opened_by_user_id", "vendor_id") REFERENCES "UserMaster"("id", "vendor_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplaintAssignment" ADD CONSTRAINT "ComplaintAssignment_cycle_id_complaint_id_vendor_id_fkey" FOREIGN KEY ("cycle_id", "complaint_id", "vendor_id") REFERENCES "ComplaintCycle"("id", "complaint_id", "vendor_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplaintAssignment" ADD CONSTRAINT "ComplaintAssignment_previous_user_id_vendor_id_fkey" FOREIGN KEY ("previous_user_id", "vendor_id") REFERENCES "UserMaster"("id", "vendor_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplaintAssignment" ADD CONSTRAINT "ComplaintAssignment_new_user_id_vendor_id_fkey" FOREIGN KEY ("new_user_id", "vendor_id") REFERENCES "UserMaster"("id", "vendor_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplaintAssignment" ADD CONSTRAINT "ComplaintAssignment_assigned_by_vendor_id_fkey" FOREIGN KEY ("assigned_by", "vendor_id") REFERENCES "UserMaster"("id", "vendor_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplaintAttachment" ADD CONSTRAINT "ComplaintAttachment_cycle_id_complaint_id_vendor_id_fkey" FOREIGN KEY ("cycle_id", "complaint_id", "vendor_id") REFERENCES "ComplaintCycle"("id", "complaint_id", "vendor_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplaintAttachment" ADD CONSTRAINT "ComplaintAttachment_actor_user_id_vendor_id_fkey" FOREIGN KEY ("actor_user_id", "vendor_id") REFERENCES "UserMaster"("id", "vendor_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplaintAttachment" ADD CONSTRAINT "ComplaintAttachment_visit_id_cycle_id_fkey" FOREIGN KEY ("visit_id", "cycle_id") REFERENCES "ComplaintVisit"("id", "cycle_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplaintAttachment" ADD CONSTRAINT "ComplaintAttachment_inspection_report_id_cycle_id_fkey" FOREIGN KEY ("inspection_report_id", "cycle_id") REFERENCES "ComplaintInspectionReport"("id", "cycle_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplaintAttachment" ADD CONSTRAINT "ComplaintAttachment_execution_id_cycle_id_fkey" FOREIGN KEY ("execution_id", "cycle_id") REFERENCES "ComplaintExecution"("id", "cycle_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplaintAttachment" ADD CONSTRAINT "ComplaintAttachment_decision_id_cycle_id_fkey" FOREIGN KEY ("decision_id", "cycle_id") REFERENCES "ComplaintDecision"("id", "cycle_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplaintDecision" ADD CONSTRAINT "ComplaintDecision_cycle_id_complaint_id_vendor_id_fkey" FOREIGN KEY ("cycle_id", "complaint_id", "vendor_id") REFERENCES "ComplaintCycle"("id", "complaint_id", "vendor_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplaintDecision" ADD CONSTRAINT "ComplaintDecision_actor_user_id_vendor_id_fkey" FOREIGN KEY ("actor_user_id", "vendor_id") REFERENCES "UserMaster"("id", "vendor_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplaintDecision" ADD CONSTRAINT "ComplaintDecision_visit_id_cycle_id_fkey" FOREIGN KEY ("visit_id", "cycle_id") REFERENCES "ComplaintVisit"("id", "cycle_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplaintDecision" ADD CONSTRAINT "ComplaintDecision_quotation_id_cycle_id_fkey" FOREIGN KEY ("quotation_id", "cycle_id") REFERENCES "ComplaintQuotation"("id", "cycle_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplaintVisit" ADD CONSTRAINT "ComplaintVisit_cycle_id_complaint_id_vendor_id_fkey" FOREIGN KEY ("cycle_id", "complaint_id", "vendor_id") REFERENCES "ComplaintCycle"("id", "complaint_id", "vendor_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplaintVisit" ADD CONSTRAINT "ComplaintVisit_assigned_ss_id_vendor_id_fkey" FOREIGN KEY ("assigned_ss_id", "vendor_id") REFERENCES "UserMaster"("id", "vendor_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplaintVisit" ADD CONSTRAINT "ComplaintVisit_created_by_vendor_id_fkey" FOREIGN KEY ("created_by", "vendor_id") REFERENCES "UserMaster"("id", "vendor_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplaintVisit" ADD CONSTRAINT "ComplaintVisit_repeat_of_visit_id_complaint_id_vendor_id_fkey" FOREIGN KEY ("repeat_of_visit_id", "complaint_id", "vendor_id") REFERENCES "ComplaintVisit"("id", "complaint_id", "vendor_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplaintVisit" ADD CONSTRAINT "ComplaintVisit_free_approval_decision_id_cycle_id_fkey" FOREIGN KEY ("free_approval_decision_id", "cycle_id") REFERENCES "ComplaintDecision"("id", "cycle_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplaintInspectionReport" ADD CONSTRAINT "ComplaintInspectionReport_cycle_id_complaint_id_vendor_id_fkey" FOREIGN KEY ("cycle_id", "complaint_id", "vendor_id") REFERENCES "ComplaintCycle"("id", "complaint_id", "vendor_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplaintInspectionReport" ADD CONSTRAINT "ComplaintInspectionReport_submitted_by_vendor_id_fkey" FOREIGN KEY ("submitted_by", "vendor_id") REFERENCES "UserMaster"("id", "vendor_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplaintInspectionReport" ADD CONSTRAINT "ComplaintInspectionReport_visit_id_cycle_id_fkey" FOREIGN KEY ("visit_id", "cycle_id") REFERENCES "ComplaintVisit"("id", "cycle_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplaintInspectionMaterial" ADD CONSTRAINT "ComplaintInspectionMaterial_cycle_id_complaint_id_vendor_i_fkey" FOREIGN KEY ("cycle_id", "complaint_id", "vendor_id") REFERENCES "ComplaintCycle"("id", "complaint_id", "vendor_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplaintInspectionMaterial" ADD CONSTRAINT "ComplaintInspectionMaterial_inspection_report_id_cycle_id_fkey" FOREIGN KEY ("inspection_report_id", "cycle_id") REFERENCES "ComplaintInspectionReport"("id", "cycle_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplaintQuotation" ADD CONSTRAINT "ComplaintQuotation_cycle_id_complaint_id_vendor_id_fkey" FOREIGN KEY ("cycle_id", "complaint_id", "vendor_id") REFERENCES "ComplaintCycle"("id", "complaint_id", "vendor_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplaintQuotation" ADD CONSTRAINT "ComplaintQuotation_created_by_vendor_id_fkey" FOREIGN KEY ("created_by", "vendor_id") REFERENCES "UserMaster"("id", "vendor_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplaintQuotation" ADD CONSTRAINT "ComplaintQuotation_inspection_report_id_cycle_id_fkey" FOREIGN KEY ("inspection_report_id", "cycle_id") REFERENCES "ComplaintInspectionReport"("id", "cycle_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplaintQuotation" ADD CONSTRAINT "ComplaintQuotation_hss_approval_decision_id_cycle_id_fkey" FOREIGN KEY ("hss_approval_decision_id", "cycle_id") REFERENCES "ComplaintDecision"("id", "cycle_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplaintQuotation" ADD CONSTRAINT "ComplaintQuotation_client_response_decision_id_cycle_id_fkey" FOREIGN KEY ("client_response_decision_id", "cycle_id") REFERENCES "ComplaintDecision"("id", "cycle_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplaintQuotationItem" ADD CONSTRAINT "ComplaintQuotationItem_cycle_id_complaint_id_vendor_id_fkey" FOREIGN KEY ("cycle_id", "complaint_id", "vendor_id") REFERENCES "ComplaintCycle"("id", "complaint_id", "vendor_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplaintQuotationItem" ADD CONSTRAINT "ComplaintQuotationItem_quotation_id_cycle_id_fkey" FOREIGN KEY ("quotation_id", "cycle_id") REFERENCES "ComplaintQuotation"("id", "cycle_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplaintCharge" ADD CONSTRAINT "ComplaintCharge_cycle_id_complaint_id_vendor_id_fkey" FOREIGN KEY ("cycle_id", "complaint_id", "vendor_id") REFERENCES "ComplaintCycle"("id", "complaint_id", "vendor_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplaintCharge" ADD CONSTRAINT "ComplaintCharge_created_by_vendor_id_fkey" FOREIGN KEY ("created_by", "vendor_id") REFERENCES "UserMaster"("id", "vendor_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplaintCharge" ADD CONSTRAINT "ComplaintCharge_visit_id_cycle_id_fkey" FOREIGN KEY ("visit_id", "cycle_id") REFERENCES "ComplaintVisit"("id", "cycle_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplaintCharge" ADD CONSTRAINT "ComplaintCharge_quotation_id_cycle_id_fkey" FOREIGN KEY ("quotation_id", "cycle_id") REFERENCES "ComplaintQuotation"("id", "cycle_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplaintCharge" ADD CONSTRAINT "ComplaintCharge_waiver_decision_id_cycle_id_fkey" FOREIGN KEY ("waiver_decision_id", "cycle_id") REFERENCES "ComplaintDecision"("id", "cycle_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplaintPayment" ADD CONSTRAINT "ComplaintPayment_cycle_id_complaint_id_vendor_id_fkey" FOREIGN KEY ("cycle_id", "complaint_id", "vendor_id") REFERENCES "ComplaintCycle"("id", "complaint_id", "vendor_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplaintPayment" ADD CONSTRAINT "ComplaintPayment_actor_user_id_vendor_id_fkey" FOREIGN KEY ("actor_user_id", "vendor_id") REFERENCES "UserMaster"("id", "vendor_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplaintPayment" ADD CONSTRAINT "ComplaintPayment_verified_by_vendor_id_fkey" FOREIGN KEY ("verified_by", "vendor_id") REFERENCES "UserMaster"("id", "vendor_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplaintPayment" ADD CONSTRAINT "ComplaintPayment_refunded_by_vendor_id_fkey" FOREIGN KEY ("refunded_by", "vendor_id") REFERENCES "UserMaster"("id", "vendor_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplaintPayment" ADD CONSTRAINT "ComplaintPayment_proof_attachment_id_cycle_id_fkey" FOREIGN KEY ("proof_attachment_id", "cycle_id") REFERENCES "ComplaintAttachment"("id", "cycle_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplaintPaymentAllocation" ADD CONSTRAINT "ComplaintPaymentAllocation_cycle_id_complaint_id_vendor_id_fkey" FOREIGN KEY ("cycle_id", "complaint_id", "vendor_id") REFERENCES "ComplaintCycle"("id", "complaint_id", "vendor_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplaintPaymentAllocation" ADD CONSTRAINT "ComplaintPaymentAllocation_allocated_by_vendor_id_fkey" FOREIGN KEY ("allocated_by", "vendor_id") REFERENCES "UserMaster"("id", "vendor_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplaintPaymentAllocation" ADD CONSTRAINT "ComplaintPaymentAllocation_payment_id_cycle_id_fkey" FOREIGN KEY ("payment_id", "cycle_id") REFERENCES "ComplaintPayment"("id", "cycle_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplaintPaymentAllocation" ADD CONSTRAINT "ComplaintPaymentAllocation_charge_id_cycle_id_fkey" FOREIGN KEY ("charge_id", "cycle_id") REFERENCES "ComplaintCharge"("id", "cycle_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplaintExecution" ADD CONSTRAINT "ComplaintExecution_cycle_id_complaint_id_vendor_id_fkey" FOREIGN KEY ("cycle_id", "complaint_id", "vendor_id") REFERENCES "ComplaintCycle"("id", "complaint_id", "vendor_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplaintExecution" ADD CONSTRAINT "ComplaintExecution_assigned_ss_id_vendor_id_fkey" FOREIGN KEY ("assigned_ss_id", "vendor_id") REFERENCES "UserMaster"("id", "vendor_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplaintExecution" ADD CONSTRAINT "ComplaintExecution_completed_by_vendor_id_fkey" FOREIGN KEY ("completed_by", "vendor_id") REFERENCES "UserMaster"("id", "vendor_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplaintExecution" ADD CONSTRAINT "ComplaintExecution_created_by_vendor_id_fkey" FOREIGN KEY ("created_by", "vendor_id") REFERENCES "UserMaster"("id", "vendor_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplaintExecution" ADD CONSTRAINT "ComplaintExecution_quotation_id_cycle_id_fkey" FOREIGN KEY ("quotation_id", "cycle_id") REFERENCES "ComplaintQuotation"("id", "cycle_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplaintExecution" ADD CONSTRAINT "ComplaintExecution_repair_visit_id_cycle_id_fkey" FOREIGN KEY ("repair_visit_id", "cycle_id") REFERENCES "ComplaintVisit"("id", "cycle_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplaintExecution" ADD CONSTRAINT "ComplaintExecution_inspection_skip_decision_id_cycle_id_fkey" FOREIGN KEY ("inspection_skip_decision_id", "cycle_id") REFERENCES "ComplaintDecision"("id", "cycle_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplaintExecution" ADD CONSTRAINT "ComplaintExecution_quotation_skip_decision_id_cycle_id_fkey" FOREIGN KEY ("quotation_skip_decision_id", "cycle_id") REFERENCES "ComplaintDecision"("id", "cycle_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplaintTask" ADD CONSTRAINT "ComplaintTask_cycle_id_complaint_id_vendor_id_fkey" FOREIGN KEY ("cycle_id", "complaint_id", "vendor_id") REFERENCES "ComplaintCycle"("id", "complaint_id", "vendor_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplaintTask" ADD CONSTRAINT "ComplaintTask_assigned_to_vendor_id_fkey" FOREIGN KEY ("assigned_to", "vendor_id") REFERENCES "UserMaster"("id", "vendor_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplaintTask" ADD CONSTRAINT "ComplaintTask_created_by_vendor_id_fkey" FOREIGN KEY ("created_by", "vendor_id") REFERENCES "UserMaster"("id", "vendor_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplaintTask" ADD CONSTRAINT "ComplaintTask_completed_by_vendor_id_fkey" FOREIGN KEY ("completed_by", "vendor_id") REFERENCES "UserMaster"("id", "vendor_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplaintTask" ADD CONSTRAINT "ComplaintTask_visit_id_cycle_id_fkey" FOREIGN KEY ("visit_id", "cycle_id") REFERENCES "ComplaintVisit"("id", "cycle_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplaintTask" ADD CONSTRAINT "ComplaintTask_execution_id_cycle_id_fkey" FOREIGN KEY ("execution_id", "cycle_id") REFERENCES "ComplaintExecution"("id", "cycle_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplaintClosure" ADD CONSTRAINT "ComplaintClosure_cycle_id_complaint_id_vendor_id_fkey" FOREIGN KEY ("cycle_id", "complaint_id", "vendor_id") REFERENCES "ComplaintCycle"("id", "complaint_id", "vendor_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplaintClosure" ADD CONSTRAINT "ComplaintClosure_completion_verified_by_vendor_id_fkey" FOREIGN KEY ("completion_verified_by", "vendor_id") REFERENCES "UserMaster"("id", "vendor_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplaintClosure" ADD CONSTRAINT "ComplaintClosure_financial_verified_by_vendor_id_fkey" FOREIGN KEY ("financial_verified_by", "vendor_id") REFERENCES "UserMaster"("id", "vendor_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplaintClosure" ADD CONSTRAINT "ComplaintClosure_closed_by_vendor_id_fkey" FOREIGN KEY ("closed_by", "vendor_id") REFERENCES "UserMaster"("id", "vendor_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplaintClosure" ADD CONSTRAINT "ComplaintClosure_client_confirmation_decision_id_cycle_id_fkey" FOREIGN KEY ("client_confirmation_decision_id", "cycle_id") REFERENCES "ComplaintDecision"("id", "cycle_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplaintNotification" ADD CONSTRAINT "ComplaintNotification_complaint_id_vendor_id_fkey" FOREIGN KEY ("complaint_id", "vendor_id") REFERENCES "ComplaintMaster"("id", "vendor_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplaintNotification" ADD CONSTRAINT "ComplaintNotification_recipient_user_id_vendor_id_fkey" FOREIGN KEY ("recipient_user_id", "vendor_id") REFERENCES "UserMaster"("id", "vendor_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplaintSlaConfig" ADD CONSTRAINT "ComplaintSlaConfig_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplaintSlaConfig" ADD CONSTRAINT "ComplaintSlaConfig_updated_by_vendor_id_fkey" FOREIGN KEY ("updated_by", "vendor_id") REFERENCES "UserMaster"("id", "vendor_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplaintActivityLog" ADD CONSTRAINT "ComplaintActivityLog_cycle_id_complaint_id_vendor_id_fkey" FOREIGN KEY ("cycle_id", "complaint_id", "vendor_id") REFERENCES "ComplaintCycle"("id", "complaint_id", "vendor_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplaintActivityLog" ADD CONSTRAINT "ComplaintActivityLog_actor_user_id_vendor_id_fkey" FOREIGN KEY ("actor_user_id", "vendor_id") REFERENCES "UserMaster"("id", "vendor_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplaintActivityLog" ADD CONSTRAINT "ComplaintActivityLog_decision_id_cycle_id_fkey" FOREIGN KEY ("decision_id", "cycle_id") REFERENCES "ComplaintDecision"("id", "cycle_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplaintActivityLog" ADD CONSTRAINT "ComplaintActivityLog_assignment_id_cycle_id_fkey" FOREIGN KEY ("assignment_id", "cycle_id") REFERENCES "ComplaintAssignment"("id", "cycle_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplaintActivityLog" ADD CONSTRAINT "ComplaintActivityLog_task_id_cycle_id_fkey" FOREIGN KEY ("task_id", "cycle_id") REFERENCES "ComplaintTask"("id", "cycle_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplaintActivityLog" ADD CONSTRAINT "ComplaintActivityLog_visit_id_cycle_id_fkey" FOREIGN KEY ("visit_id", "cycle_id") REFERENCES "ComplaintVisit"("id", "cycle_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplaintActivityLog" ADD CONSTRAINT "ComplaintActivityLog_quotation_id_cycle_id_fkey" FOREIGN KEY ("quotation_id", "cycle_id") REFERENCES "ComplaintQuotation"("id", "cycle_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplaintActivityLog" ADD CONSTRAINT "ComplaintActivityLog_payment_id_cycle_id_fkey" FOREIGN KEY ("payment_id", "cycle_id") REFERENCES "ComplaintPayment"("id", "cycle_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplaintActivityLog" ADD CONSTRAINT "ComplaintActivityLog_execution_id_cycle_id_fkey" FOREIGN KEY ("execution_id", "cycle_id") REFERENCES "ComplaintExecution"("id", "cycle_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplaintActivityLog" ADD CONSTRAINT "ComplaintActivityLog_closure_id_cycle_id_fkey" FOREIGN KEY ("closure_id", "cycle_id") REFERENCES "ComplaintClosure"("id", "cycle_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Domain constraints not expressible in Prisma. Role checks and status transitions
-- still belong in transactional services; these guard the invariants regardless.

ALTER TABLE "ComplaintCategoryMaster"
  ADD CONSTRAINT "ComplaintCategoryMaster_name_check" CHECK (btrim(name) <> '');

ALTER TABLE "ComplaintExternalClient"
  ADD CONSTRAINT "ComplaintExternalClient_details_check" CHECK (
    btrim(external_client_code) <> '' AND btrim(client_name) <> '' AND
    btrim(mobile) <> '' AND btrim(address) <> '' AND btrim(city) <> ''
  );

-- Website complaints never carry a CRM lead at registration; a lead can be linked later
-- by HO, which keeps client_type EXTERNAL so the original classification survives.
ALTER TABLE "ComplaintMaster"
  ADD CONSTRAINT "ComplaintMaster_registration_context_check" CHECK (
    btrim(complaint_code) <> '' AND sequence_no > 0 AND version > 0 AND
    btrim(client_name) <> '' AND btrim(client_mobile) <> '' AND
    btrim(site_address) <> '' AND btrim(description) <> '' AND
    (client_type <> 'CRM_LEAD' OR (lead_id IS NOT NULL AND account_id IS NOT NULL)) AND
    (client_type = 'CRM_LEAD' OR external_client_id IS NOT NULL) AND
    (registration_channel <> 'WEBSITE' OR client_type <> 'CRM_LEAD') AND
    (registration_channel <> 'STAFF' OR raised_by_actor_type = 'STAFF') AND
    (lead_id IS NULL OR account_id IS NOT NULL) AND
    (instance_id IS NULL OR lead_id IS NOT NULL) AND
    (client_type <> 'EXCEPTIONAL' OR NULLIF(btrim(exceptional_reason), '') IS NOT NULL)
  ),
  ADD CONSTRAINT "ComplaintMaster_actor_check" CHECK (
    (raised_by_actor_type = 'STAFF' AND raised_by_user_id IS NOT NULL AND raised_by_client_reference IS NULL) OR
    (raised_by_actor_type = 'CLIENT' AND raised_by_user_id IS NULL AND NULLIF(btrim(raised_by_client_reference), '') IS NOT NULL)
  ),
  -- Once past HO verification a complaint must always have a Site Supervisor owner.
  ADD CONSTRAINT "ComplaintMaster_owner_check" CHECK (
    status IN ('NEW', 'UNDER_VERIFICATION', 'MORE_INFORMATION_REQUIRED', 'REJECTED', 'ON_HOLD', 'CANCELLED') OR
    assigned_ss_id IS NOT NULL
  ),
  ADD CONSTRAINT "ComplaintMaster_duplicate_review_check" CHECK (
    (duplicate_reviewed_by IS NULL) = (duplicate_reviewed_at IS NULL)
  );

ALTER TABLE "ComplaintCycle"
  ADD CONSTRAINT "ComplaintCycle_lifecycle_check" CHECK (
    cycle_number > 0 AND
    (cycle_number = 1 OR NULLIF(btrim(reopened_reason), '') IS NOT NULL) AND
    ((ended_at IS NULL AND end_reason IS NULL) OR (ended_at IS NOT NULL AND end_reason IS NOT NULL)) AND
    (ended_at IS NULL OR ended_at >= opened_at) AND
    (closed_at IS NULL OR (end_reason = 'CLOSED' AND ended_at IS NOT NULL))
  ),
  ADD CONSTRAINT "ComplaintCycle_actor_check" CHECK (
    (opened_by_actor_type = 'STAFF' AND opened_by_user_id IS NOT NULL AND opened_by_client_reference IS NULL) OR
    (opened_by_actor_type = 'CLIENT' AND opened_by_user_id IS NULL AND NULLIF(btrim(opened_by_client_reference), '') IS NOT NULL)
  );
CREATE UNIQUE INDEX "ComplaintCycle_one_active_per_complaint_idx"
  ON "ComplaintCycle" (complaint_id) WHERE ended_at IS NULL;

ALTER TABLE "ComplaintAssignment"
  ADD CONSTRAINT "ComplaintAssignment_reason_check" CHECK (
    previous_user_id IS DISTINCT FROM new_user_id AND
    (previous_user_id IS NULL OR NULLIF(btrim(reason), '') IS NOT NULL) AND
    assigned_by_actor_type <> 'CLIENT' AND
    ((assigned_by_actor_type = 'STAFF') = (assigned_by IS NOT NULL))
  );

ALTER TABLE "ComplaintAttachment"
  ADD CONSTRAINT "ComplaintAttachment_file_check" CHECK (
    size_bytes > 0 AND btrim(storage_key) <> '' AND btrim(original_name) <> '' AND
    (media_type <> 'PHOTO' OR mime_type LIKE 'image/%') AND
    (media_type <> 'VIDEO' OR mime_type LIKE 'video/%')
  );

ALTER TABLE "ComplaintDecision"
  ADD CONSTRAINT "ComplaintDecision_type_outcome_check" CHECK (
    (decision_type = 'HO_VERIFICATION' AND outcome IN ('APPROVED_FOR_VISIT', 'MORE_INFORMATION_REQUIRED', 'REMOTE_RESOLUTION', 'REJECTED', 'ON_HOLD')) OR
    (decision_type = 'WARRANTY_DECISION' AND outcome IN ('COVERED', 'PARTIALLY_COVERED', 'NOT_COVERED')) OR
    (decision_type IN ('EXCEPTIONAL_APPROVAL', 'FREE_REPEAT_VISIT', 'REOPEN_REVIEW') AND outcome IN ('APPROVED', 'DECLINED')) OR
    (decision_type IN ('EXTERNAL_LEAD_LINK', 'CHARGE_WAIVER') AND outcome = 'APPROVED') OR
    (decision_type IN ('INSPECTION_SKIP', 'QUOTATION_SKIP') AND outcome = 'SKIPPED') OR
    (decision_type = 'HSS_QUOTATION_APPROVAL' AND outcome IN ('APPROVED', 'SENT_FOR_REVISION')) OR
    (decision_type = 'VISIT_CHARGE_ACCEPTANCE' AND outcome IN ('ACCEPTED', 'DECLINED')) OR
    (decision_type = 'CLIENT_QUOTATION_RESPONSE' AND outcome IN ('ACCEPTED', 'REJECTED', 'MODIFICATION_REQUESTED')) OR
    (decision_type = 'CLIENT_RESOLUTION_CONFIRMATION' AND outcome IN ('SATISFIED', 'NOT_SATISFIED'))
  ),
  ADD CONSTRAINT "ComplaintDecision_references_check" CHECK (
    (outcome <> 'REMOTE_RESOLUTION' OR NULLIF(btrim(remote_instructions), '') IS NOT NULL) AND
    (decision_type NOT IN ('FREE_REPEAT_VISIT', 'VISIT_CHARGE_ACCEPTANCE') OR visit_id IS NOT NULL) AND
    (decision_type NOT IN ('HSS_QUOTATION_APPROVAL', 'CLIENT_QUOTATION_RESPONSE') OR quotation_id IS NOT NULL)
  ),
  -- Every staff decision needs remarks; client decisions need them when pushing back.
  ADD CONSTRAINT "ComplaintDecision_remarks_check" CHECK (
    NULLIF(btrim(remarks), '') IS NOT NULL OR
    (decision_type IN ('VISIT_CHARGE_ACCEPTANCE', 'CLIENT_QUOTATION_RESPONSE', 'CLIENT_RESOLUTION_CONFIRMATION') AND
     outcome NOT IN ('NOT_SATISFIED', 'MODIFICATION_REQUESTED', 'REJECTED', 'DECLINED'))
  ),
  ADD CONSTRAINT "ComplaintDecision_actor_scope_check" CHECK (
    actor_type <> 'SYSTEM' AND
    (NOT acting_on_behalf_of_client OR (actor_type = 'STAFF' AND NULLIF(btrim(actor_client_reference), '') IS NOT NULL)) AND
    (decision_type IN ('VISIT_CHARGE_ACCEPTANCE', 'CLIENT_QUOTATION_RESPONSE', 'CLIENT_RESOLUTION_CONFIRMATION') OR
     (actor_type = 'STAFF' AND NOT acting_on_behalf_of_client)) AND
    (decision_type NOT IN ('VISIT_CHARGE_ACCEPTANCE', 'CLIENT_QUOTATION_RESPONSE', 'CLIENT_RESOLUTION_CONFIRMATION') OR
     actor_type = 'CLIENT' OR acting_on_behalf_of_client)
  );

ALTER TABLE "ComplaintVisit"
  ADD CONSTRAINT "ComplaintVisit_charge_check" CHECK (
    visit_number > 0 AND standard_fee >= 0 AND currency ~ '^[A-Z]{3}$' AND reschedule_count >= 0 AND
    repeat_of_visit_id IS DISTINCT FROM id AND
    (charge_mode <> 'FREE_REPEAT' OR (
      repeat_of_visit_id IS NOT NULL AND NULLIF(btrim(repeat_remarks), '') IS NOT NULL AND
      status NOT IN ('AWAITING_CHARGE_ACCEPTANCE', 'AWAITING_PAYMENT') AND
      (status IN ('PENDING_FREE_APPROVAL', 'CANCELLED') OR free_approval_decision_id IS NOT NULL))) AND
    (charge_mode <> 'CHARGEABLE' OR status <> 'PENDING_FREE_APPROVAL')
  ),
  ADD CONSTRAINT "ComplaintVisit_outcome_check" CHECK (
    (status NOT IN ('SCHEDULED', 'CONFIRMED', 'COMPLETED', 'CLIENT_NOT_AVAILABLE', 'SITE_NOT_ACCESSIBLE') OR scheduled_for IS NOT NULL) AND
    (status <> 'COMPLETED' OR completed_at IS NOT NULL) AND
    (status NOT IN ('CANCELLED', 'CLIENT_NOT_AVAILABLE', 'SITE_NOT_ACCESSIBLE') OR NULLIF(btrim(remarks), '') IS NOT NULL)
  );

ALTER TABLE "ComplaintInspectionReport"
  ADD CONSTRAINT "ComplaintInspectionReport_fields_check" CHECK (
    btrim(issue_observed) <> '' AND btrim(root_cause) <> '' AND
    btrim(affected_product) <> '' AND btrim(affected_unit_number) <> '' AND
    cardinality(repair_actions) > 0 AND
    (estimated_work_days IS NULL OR estimated_work_days >= 0) AND
    (responsibility <> 'OTHER' OR NULLIF(btrim(responsibility_remarks), '') IS NOT NULL)
  );
ALTER TABLE "ComplaintInspectionMaterial"
  ADD CONSTRAINT "ComplaintInspectionMaterial_fields_check" CHECK (
    sequence > 0 AND btrim(material_name) <> '' AND quantity > 0 AND
    (estimated_cost IS NULL OR estimated_cost >= 0)
  );

ALTER TABLE "ComplaintQuotation"
  ADD CONSTRAINT "ComplaintQuotation_amount_check" CHECK (
    quotation_number > 0 AND revision > 0 AND subtotal >= 0 AND tax_amount >= 0 AND
    total_amount = subtotal + tax_amount AND warranty_covered_amount >= 0 AND
    client_payable_amount >= 0 AND warranty_covered_amount + client_payable_amount = total_amount AND
    currency ~ '^[A-Z]{3}$'
  ),
  ADD CONSTRAINT "ComplaintQuotation_approval_presence_check" CHECK (
    (status NOT IN ('HSS_APPROVED', 'SHARED', 'CLIENT_ACCEPTED', 'CLIENT_REJECTED', 'MODIFICATION_REQUESTED') OR hss_approval_decision_id IS NOT NULL) AND
    (status NOT IN ('SHARED', 'CLIENT_ACCEPTED', 'CLIENT_REJECTED', 'MODIFICATION_REQUESTED') OR shared_at IS NOT NULL) AND
    (status NOT IN ('CLIENT_ACCEPTED', 'CLIENT_REJECTED', 'MODIFICATION_REQUESTED') OR client_response_decision_id IS NOT NULL)
  );
ALTER TABLE "ComplaintQuotationItem"
  ADD CONSTRAINT "ComplaintQuotationItem_amount_check" CHECK (
    sequence > 0 AND quantity > 0 AND unit_rate >= 0 AND line_total >= 0 AND
    warranty_covered_amount >= 0 AND client_payable_amount >= 0 AND
    warranty_covered_amount + client_payable_amount = line_total
  );

-- The ₹800 visit charge and repair charges are always separate rows.
ALTER TABLE "ComplaintCharge"
  ADD CONSTRAINT "ComplaintCharge_source_amount_check" CHECK (
    amount >= 0 AND currency ~ '^[A-Z]{3}$' AND
    ((charge_type = 'VISIT' AND visit_id IS NOT NULL AND quotation_id IS NULL) OR
     (charge_type = 'REPAIR' AND quotation_id IS NOT NULL AND visit_id IS NULL)) AND
    (status <> 'WAIVED' OR waiver_decision_id IS NOT NULL)
  );
ALTER TABLE "ComplaintPayment"
  ADD CONSTRAINT "ComplaintPayment_verification_check" CHECK (
    amount > 0 AND currency ~ '^[A-Z]{3}$' AND btrim(transaction_reference) <> '' AND
    (status NOT IN ('VERIFIED', 'REFUNDED') OR (verified_by IS NOT NULL AND verified_at IS NOT NULL)) AND
    (status <> 'REJECTED' OR NULLIF(btrim(rejection_remarks), '') IS NOT NULL) AND
    (status <> 'REFUNDED' OR (refunded_by IS NOT NULL AND refunded_at IS NOT NULL AND NULLIF(btrim(refund_remarks), '') IS NOT NULL))
  );
ALTER TABLE "ComplaintPaymentAllocation"
  ADD CONSTRAINT "ComplaintPaymentAllocation_positive_check" CHECK (amount > 0);

ALTER TABLE "ComplaintExecution"
  ADD CONSTRAINT "ComplaintExecution_progress_check" CHECK (
    (status NOT IN ('MATERIAL_APPROVAL_PENDING', 'PROCUREMENT_PENDING', 'MATERIAL_ORDERED', 'MATERIAL_RECEIVED', 'MATERIAL_READY') OR material_required) AND
    (status NOT IN ('MATERIAL_RECEIVED', 'MATERIAL_READY') OR material_received_date IS NOT NULL) AND
    (status NOT IN ('REPAIR_SCHEDULED', 'WORK_IN_PROGRESS', 'WORK_COMPLETED') OR scheduled_for IS NOT NULL) AND
    (status <> 'WORK_COMPLETED' OR (completed_by IS NOT NULL AND completed_at IS NOT NULL AND NULLIF(btrim(completion_remarks), '') IS NOT NULL))
  );

-- Factory requests either belong to a lead (existing flow) or to a complaint.
ALTER TABLE "MiscellaneousMaster"
  ADD CONSTRAINT "MiscellaneousMaster_context_check" CHECK (
    ((lead_id IS NOT NULL AND account_id IS NOT NULL) OR complaint_id IS NOT NULL) AND
    (complaint_execution_id IS NULL OR complaint_id IS NOT NULL)
  );

-- HO may close without a client response, but it is recorded as such and never as confirmed.
ALTER TABLE "ComplaintClosure"
  ADD CONSTRAINT "ComplaintClosure_verification_check" CHECK (
    (client_confirmation_status <> 'NO_RESPONSE_HO_AUTHORISED' OR NULLIF(btrim(no_response_reason), '') IS NOT NULL) AND
    (client_confirmation_status NOT IN ('SATISFIED', 'NOT_SATISFIED') OR client_confirmation_decision_id IS NOT NULL) AND
    (status <> 'CLOSED' OR (
      completion_verified_by IS NOT NULL AND completion_verified_at IS NOT NULL AND
      financial_verified_by IS NOT NULL AND financial_verified_at IS NOT NULL AND
      closed_by IS NOT NULL AND closed_at IS NOT NULL AND
      client_confirmation_status IN ('SATISFIED', 'NO_RESPONSE_HO_AUTHORISED')
    ))
  );

ALTER TABLE "ComplaintNotification"
  ADD CONSTRAINT "ComplaintNotification_recipient_check" CHECK (
    ((recipient_type = 'STAFF') = (recipient_user_id IS NOT NULL)) AND
    (delivery_status <> 'SENT' OR sent_at IS NOT NULL) AND
    (delivery_status NOT IN ('FAILED', 'CHANNEL_UNAVAILABLE') OR NULLIF(btrim(failure_reason), '') IS NOT NULL)
  );

ALTER TABLE "ComplaintSlaConfig"
  ADD CONSTRAINT "ComplaintSlaConfig_hours_check" CHECK (
    target_hours > 0 AND
    (reminder_every_hours IS NULL OR reminder_every_hours > 0) AND
    (escalate_after_hours IS NULL OR escalate_after_hours > 0)
  );

-- An actor's authenticated client reference is distinct from a staff identity.
-- Proxy client decisions retain both the employee and the represented client.
DO $$
DECLARE tab text;
BEGIN
  FOREACH tab IN ARRAY ARRAY['ComplaintAttachment', 'ComplaintDecision', 'ComplaintPayment', 'ComplaintActivityLog'] LOOP
    EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I CHECK (
      (actor_type = ''STAFF'' AND actor_user_id IS NOT NULL) OR
      (actor_type = ''CLIENT'' AND actor_user_id IS NULL AND NULLIF(btrim(actor_client_reference), '''') IS NOT NULL) OR
      (actor_type = ''SYSTEM'' AND actor_user_id IS NULL AND actor_client_reference IS NULL)
    )', tab, tab || '_actor_identity_check');
  END LOOP;
END $$;
ALTER TABLE "ComplaintPayment" ADD CONSTRAINT "ComplaintPayment_human_actor_check" CHECK (actor_type <> 'SYSTEM');
ALTER TABLE "ComplaintActivityLog" ADD CONSTRAINT "ComplaintActivityLog_proxy_check" CHECK (
  NOT acting_on_behalf_of_client OR (actor_type = 'STAFF' AND NULLIF(btrim(actor_client_reference), '') IS NOT NULL)
);

-- Validated at commit so registration can insert the complaint, its first cycle and
-- its photos in one transaction.
CREATE FUNCTION complaint_require_registration() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target_id integer;
BEGIN
  IF TG_TABLE_NAME = 'ComplaintMaster' THEN
    target_id := NEW.id;
  ELSE
    target_id := OLD.complaint_id;
  END IF;
  IF EXISTS (SELECT 1 FROM "ComplaintMaster" WHERE id = target_id AND current_cycle_id IS NULL) THEN
    RAISE EXCEPTION 'A complaint requires an active cycle' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (SELECT 1 FROM "ComplaintMaster" WHERE id = target_id) AND
     NOT EXISTS (SELECT 1 FROM "ComplaintAttachment" WHERE complaint_id = target_id AND category = 'REGISTRATION' AND media_type = 'PHOTO') THEN
    RAISE EXCEPTION 'A complaint requires at least one registration photo' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER "ComplaintMaster_registration_trigger"
  AFTER INSERT OR UPDATE ON "ComplaintMaster" DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION complaint_require_registration();
CREATE CONSTRAINT TRIGGER "ComplaintAttachment_registration_trigger"
  AFTER UPDATE OR DELETE ON "ComplaintAttachment" DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION complaint_require_registration();

-- A chargeable visit can only be scheduled once its visit charge is fully covered by
-- verified payments, or formally waived.
CREATE FUNCTION complaint_require_visit_payment() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  gated text[] := ARRAY['SCHEDULED', 'CONFIRMED', 'COMPLETED', 'CLIENT_NOT_AVAILABLE', 'SITE_NOT_ACCESSIBLE'];
  charge_status text;
  charge_amount numeric;
  paid numeric;
BEGIN
  IF NEW.charge_mode <> 'CHARGEABLE' OR NOT (NEW.status::text = ANY (gated)) THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status::text = ANY (gated) THEN
    RETURN NEW;
  END IF;
  SELECT c.status::text, c.amount,
         COALESCE(SUM(a.amount) FILTER (WHERE p.status = 'VERIFIED'), 0)
    INTO charge_status, charge_amount, paid
    FROM "ComplaintCharge" c
    LEFT JOIN "ComplaintPaymentAllocation" a ON a.charge_id = c.id
    LEFT JOIN "ComplaintPayment" p ON p.id = a.payment_id
   WHERE c.visit_id = NEW.id
   GROUP BY c.id;
  IF charge_status IS NULL OR charge_status = 'VOIDED' OR
     (charge_status = 'OPEN' AND paid < charge_amount) THEN
    RAISE EXCEPTION 'Visit % cannot be scheduled before its visiting charge is paid and verified', NEW.id
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "ComplaintVisit_payment_gate_trigger"
  BEFORE INSERT OR UPDATE ON "ComplaintVisit" FOR EACH ROW EXECUTE FUNCTION complaint_require_visit_payment();

CREATE FUNCTION complaint_keep_audit_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Complaint activity history is append-only' USING ERRCODE = '23514';
END $$;
CREATE TRIGGER "ComplaintActivityLog_immutable_trigger"
  BEFORE UPDATE OR DELETE ON "ComplaintActivityLog" FOR EACH ROW EXECUTE FUNCTION complaint_keep_audit_history();

CREATE FUNCTION complaint_keep_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Complaints cannot be deleted after registration' USING ERRCODE = '23514';
  END IF;
  IF NEW.complaint_code IS DISTINCT FROM OLD.complaint_code OR
     NEW.sequence_no IS DISTINCT FROM OLD.sequence_no OR
     NEW.vendor_id IS DISTINCT FROM OLD.vendor_id THEN
    RAISE EXCEPTION 'Complaint ID and vendor cannot change' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "ComplaintMaster_immutable_identity_trigger"
  BEFORE UPDATE OR DELETE ON "ComplaintMaster" FOR EACH ROW EXECUTE FUNCTION complaint_keep_identity();
