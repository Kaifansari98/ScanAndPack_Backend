CREATE TYPE "FastProductionRequestStatus_new" AS ENUM (
  'draft',
  'pending_approvals',
  'approved',
  'rejected',
  'revoked'
);

ALTER TABLE "FastProductionRequest"
ALTER COLUMN "status" DROP DEFAULT;

ALTER TABLE "FastProductionRequest"
ALTER COLUMN "status" TYPE "FastProductionRequestStatus_new"
USING ("status"::text::"FastProductionRequestStatus_new");

ALTER TABLE "LeadMaster"
ALTER COLUMN "fast_production_status" TYPE "FastProductionRequestStatus_new"
USING ("fast_production_status"::text::"FastProductionRequestStatus_new");

ALTER TABLE "FastProductionStatusLog"
ALTER COLUMN "from_status" TYPE "FastProductionRequestStatus_new"
USING ("from_status"::text::"FastProductionRequestStatus_new");

ALTER TABLE "FastProductionStatusLog"
ALTER COLUMN "to_status" TYPE "FastProductionRequestStatus_new"
USING ("to_status"::text::"FastProductionRequestStatus_new");

DROP TYPE "FastProductionRequestStatus";
ALTER TYPE "FastProductionRequestStatus_new" RENAME TO "FastProductionRequestStatus";

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
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "FastProductionRequestBatch_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "FastProductionRequest"
ADD COLUMN "batch_id" INTEGER,
ADD COLUMN "instance_id" INTEGER,
ALTER COLUMN "status" SET DEFAULT 'draft';

UPDATE "FastProductionRequest"
SET "instance_id" = COALESCE(
  "instance_id",
  (
    SELECT lpsi."id"
    FROM "LeadProductStructureInstance" lpsi
    WHERE lpsi."lead_id" = "FastProductionRequest"."lead_id"
      AND lpsi."vendor_id" = "FastProductionRequest"."vendor_id"
    ORDER BY lpsi."id" ASC
    LIMIT 1
  )
);

INSERT INTO "FastProductionRequestBatch" (
  "vendor_id",
  "lead_id",
  "account_id",
  "franchise_id",
  "requester_user_id",
  "month_bucket",
  "status",
  "terms_accepted_at",
  "terms_version",
  "approved_at",
  "rejected_at",
  "revoked_at",
  "revoked_by",
  "revocation_remark",
  "created_by",
  "created_at",
  "updated_by",
  "updated_at"
)
SELECT
  "vendor_id",
  "lead_id",
  "account_id",
  "franchise_id",
  "requester_user_id",
  "month_bucket",
  "status",
  "terms_accepted_at",
  "terms_version",
  "approved_at",
  "rejected_at",
  "revoked_at",
  "revoked_by",
  "revocation_remark",
  "created_by",
  "created_at",
  "updated_by",
  "updated_at"
FROM "FastProductionRequest";

UPDATE "FastProductionRequest" fpr
SET "batch_id" = fprb."id"
FROM "FastProductionRequestBatch" fprb
WHERE fpr."vendor_id" = fprb."vendor_id"
  AND fpr."lead_id" = fprb."lead_id"
  AND fpr."requester_user_id" = fprb."requester_user_id"
  AND fpr."created_at" = fprb."created_at";

ALTER TABLE "FastProductionRequest"
ALTER COLUMN "batch_id" SET NOT NULL,
ALTER COLUMN "instance_id" SET NOT NULL;

ALTER TABLE "FastProductionApproval"
ADD COLUMN "batch_id" INTEGER;

UPDATE "FastProductionApproval" fpa
SET "batch_id" = fpr."batch_id"
FROM "FastProductionRequest" fpr
WHERE fpa."request_id" = fpr."id";

ALTER TABLE "FastProductionApproval"
ALTER COLUMN "batch_id" SET NOT NULL;

ALTER TABLE "FastProductionStatusLog"
ADD COLUMN "batch_id" INTEGER;

UPDATE "FastProductionStatusLog" fpsl
SET "batch_id" = fpr."batch_id"
FROM "FastProductionRequest" fpr
WHERE fpsl."request_id" = fpr."id";

ALTER TABLE "FastProductionStatusLog"
ALTER COLUMN "batch_id" SET NOT NULL;

ALTER TABLE "FastProductionApproval" DROP CONSTRAINT "FastProductionApproval_request_id_fkey";
ALTER TABLE "FastProductionStatusLog" DROP CONSTRAINT "FastProductionStatusLog_request_id_fkey";

ALTER TABLE "FastProductionApproval" DROP COLUMN "request_id";
ALTER TABLE "FastProductionStatusLog" DROP COLUMN "request_id";

ALTER TABLE "FastProductionRequestBatch"
ADD CONSTRAINT "FastProductionRequestBatch_vendor_id_fkey"
FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FastProductionRequestBatch"
ADD CONSTRAINT "FastProductionRequestBatch_lead_id_fkey"
FOREIGN KEY ("lead_id") REFERENCES "LeadMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FastProductionRequestBatch"
ADD CONSTRAINT "FastProductionRequestBatch_account_id_fkey"
FOREIGN KEY ("account_id") REFERENCES "AccountMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FastProductionRequestBatch"
ADD CONSTRAINT "FastProductionRequestBatch_franchise_id_fkey"
FOREIGN KEY ("franchise_id") REFERENCES "FranchiseMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "FastProductionRequestBatch"
ADD CONSTRAINT "FastProductionRequestBatch_requester_user_id_fkey"
FOREIGN KEY ("requester_user_id") REFERENCES "UserMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FastProductionRequestBatch"
ADD CONSTRAINT "FastProductionRequestBatch_created_by_fkey"
FOREIGN KEY ("created_by") REFERENCES "UserMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FastProductionRequestBatch"
ADD CONSTRAINT "FastProductionRequestBatch_updated_by_fkey"
FOREIGN KEY ("updated_by") REFERENCES "UserMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "FastProductionRequestBatch"
ADD CONSTRAINT "FastProductionRequestBatch_revoked_by_fkey"
FOREIGN KEY ("revoked_by") REFERENCES "UserMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "FastProductionRequest"
ADD CONSTRAINT "FastProductionRequest_batch_id_fkey"
FOREIGN KEY ("batch_id") REFERENCES "FastProductionRequestBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FastProductionRequest"
ADD CONSTRAINT "FastProductionRequest_instance_id_fkey"
FOREIGN KEY ("instance_id") REFERENCES "LeadProductStructureInstance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "FastProductionApproval"
ADD CONSTRAINT "FastProductionApproval_batch_id_fkey"
FOREIGN KEY ("batch_id") REFERENCES "FastProductionRequestBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FastProductionStatusLog"
ADD CONSTRAINT "FastProductionStatusLog_batch_id_fkey"
FOREIGN KEY ("batch_id") REFERENCES "FastProductionRequestBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "FastProductionRequestBatch_vendor_id_lead_id_idx"
ON "FastProductionRequestBatch"("vendor_id", "lead_id");

CREATE INDEX "FastProductionRequestBatch_vendor_id_requester_user_id_month_bucket_idx"
ON "FastProductionRequestBatch"("vendor_id", "requester_user_id", "month_bucket");

CREATE INDEX "FastProductionRequestBatch_vendor_id_status_idx"
ON "FastProductionRequestBatch"("vendor_id", "status");

CREATE INDEX "FastProductionRequest_batch_id_idx"
ON "FastProductionRequest"("batch_id");

CREATE INDEX "FastProductionApproval_batch_id_idx"
ON "FastProductionApproval"("batch_id");

CREATE INDEX "FastProductionStatusLog_batch_id_idx"
ON "FastProductionStatusLog"("batch_id");

CREATE UNIQUE INDEX "FastProductionRequest_batch_id_instance_id_key"
ON "FastProductionRequest"("batch_id", "instance_id");

CREATE UNIQUE INDEX "FastProductionApproval_batch_id_approver_role_key"
ON "FastProductionApproval"("batch_id", "approver_role");
