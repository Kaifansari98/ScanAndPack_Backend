ALTER TYPE "HistoryType" ADD VALUE IF NOT EXISTS 'Approval';

CREATE TYPE "ApprovalRequestStatus" AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE "LeadApprovalRequestDocumentRole" AS ENUM ('request', 'response');

CREATE TABLE "LeadApprovalRequest" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "lead_id" INTEGER NOT NULL,
    "account_id" INTEGER NOT NULL,
    "franchise_id" INTEGER,
    "task_id" INTEGER NOT NULL,
    "requester_user_id" INTEGER NOT NULL,
    "approver_user_id" INTEGER NOT NULL,
    "request_remark" VARCHAR(2000) NOT NULL,
    "status" "ApprovalRequestStatus" NOT NULL DEFAULT 'pending',
    "response_remark" VARCHAR(2000),
    "responded_at" TIMESTAMP(3),
    "responded_by" INTEGER,
    "created_by" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeadApprovalRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LeadApprovalRequest_task_id_key" ON "LeadApprovalRequest"("task_id");

CREATE TABLE "LeadApprovalRequestDocumentMapping" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "lead_id" INTEGER NOT NULL,
    "account_id" INTEGER NOT NULL,
    "approval_request_id" INTEGER NOT NULL,
    "document_id" INTEGER NOT NULL,
    "document_role" "LeadApprovalRequestDocumentRole" NOT NULL DEFAULT 'request',
    "created_by" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadApprovalRequestDocumentMapping_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LeadApprovalRequestDocumentMapping_approval_request_id_idx" ON "LeadApprovalRequestDocumentMapping"("approval_request_id");
CREATE INDEX "LeadApprovalRequestDocumentMapping_document_id_idx" ON "LeadApprovalRequestDocumentMapping"("document_id");
