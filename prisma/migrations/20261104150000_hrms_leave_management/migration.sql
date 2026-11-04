BEGIN;
-- CreateEnum
CREATE TYPE "LeaveType" AS ENUM ('PAID', 'SICK', 'CASUAL', 'UNPAID');

-- CreateEnum
CREATE TYPE "LeaveRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "LeaveHoliday" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "franchise_id" INTEGER,
    "scope_key" TEXT NOT NULL,
    "holiday_date" DATE NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "remark" VARCHAR(500) NOT NULL DEFAULT '',
    "created_by" INTEGER NOT NULL,
    "updated_by" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeaveHoliday_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaveWeeklyOff" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "franchise_id" INTEGER,
    "scope_key" TEXT NOT NULL,
    "days" INTEGER[],
    "updated_by" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeaveWeeklyOff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaveRequest" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "franchise_id" INTEGER,
    "title" VARCHAR(100) NOT NULL,
    "type" "LeaveType" NOT NULL,
    "remark" VARCHAR(1000) NOT NULL,
    "leave_date" DATE NOT NULL,
    "status" "LeaveRequestStatus" NOT NULL DEFAULT 'PENDING',
    "rejection_reason" VARCHAR(1000),
    "reviewed_by" INTEGER,
    "reviewed_at" TIMESTAMP(3),
    "attachment_key" TEXT,
    "attachment_name" TEXT,
    "attachment_mime" TEXT,
    "attachment_size" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeaveRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LeaveHoliday_vendor_id_holiday_date_idx" ON "LeaveHoliday"("vendor_id", "holiday_date");

-- CreateIndex
CREATE INDEX "LeaveHoliday_franchise_id_idx" ON "LeaveHoliday"("franchise_id");

-- CreateIndex
CREATE UNIQUE INDEX "LeaveHoliday_vendor_id_scope_key_holiday_date_key" ON "LeaveHoliday"("vendor_id", "scope_key", "holiday_date");

-- CreateIndex
CREATE INDEX "LeaveWeeklyOff_franchise_id_idx" ON "LeaveWeeklyOff"("franchise_id");

-- CreateIndex
CREATE UNIQUE INDEX "LeaveWeeklyOff_vendor_id_scope_key_key" ON "LeaveWeeklyOff"("vendor_id", "scope_key");

-- CreateIndex
CREATE INDEX "LeaveRequest_vendor_id_leave_date_status_idx" ON "LeaveRequest"("vendor_id", "leave_date", "status");

-- CreateIndex
CREATE INDEX "LeaveRequest_vendor_id_user_id_leave_date_idx" ON "LeaveRequest"("vendor_id", "user_id", "leave_date");

-- CreateIndex
CREATE INDEX "LeaveRequest_franchise_id_idx" ON "LeaveRequest"("franchise_id");

-- CreateIndex
CREATE INDEX "LeaveRequest_reviewed_by_idx" ON "LeaveRequest"("reviewed_by");

-- AddForeignKey
ALTER TABLE "LeaveHoliday" ADD CONSTRAINT "LeaveHoliday_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveHoliday" ADD CONSTRAINT "LeaveHoliday_franchise_id_fkey" FOREIGN KEY ("franchise_id") REFERENCES "FranchiseMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveHoliday" ADD CONSTRAINT "LeaveHoliday_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "UserMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveHoliday" ADD CONSTRAINT "LeaveHoliday_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "UserMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveWeeklyOff" ADD CONSTRAINT "LeaveWeeklyOff_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveWeeklyOff" ADD CONSTRAINT "LeaveWeeklyOff_franchise_id_fkey" FOREIGN KEY ("franchise_id") REFERENCES "FranchiseMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveWeeklyOff" ADD CONSTRAINT "LeaveWeeklyOff_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "UserMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "UserMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_franchise_id_fkey" FOREIGN KEY ("franchise_id") REFERENCES "FranchiseMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "UserMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Company defaults and per-franchise overrides use explicit, unique scope keys.
ALTER TABLE "LeaveHoliday" ADD CONSTRAINT "LeaveHoliday_scope_check" CHECK (
  (franchise_id IS NULL AND scope_key = 'company') OR (franchise_id IS NOT NULL AND scope_key = franchise_id::text)
);
ALTER TABLE "LeaveWeeklyOff" ADD CONSTRAINT "LeaveWeeklyOff_scope_check" CHECK (
  (franchise_id IS NULL AND scope_key = 'company') OR (franchise_id IS NOT NULL AND scope_key = franchise_id::text)
);
ALTER TABLE "LeaveWeeklyOff" ADD CONSTRAINT "LeaveWeeklyOff_days_check" CHECK (
  days IS NOT NULL AND cardinality(days) <= 7 AND days <@ ARRAY[0,1,2,3,4,5,6]::integer[]
);
ALTER TABLE "LeaveHoliday" ADD CONSTRAINT "LeaveHoliday_name_check" CHECK (length(trim(name)) > 0);
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_text_check" CHECK (length(trim(title)) > 0 AND length(trim(remark)) > 0);
-- Rejected requests may be resubmitted, but concurrent active requests cannot overlap.
CREATE UNIQUE INDEX "LeaveRequest_one_active_date" ON "LeaveRequest" (vendor_id, user_id, leave_date) WHERE status IN ('PENDING', 'APPROVED');
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_review_check" CHECK (
  (status = 'PENDING' AND reviewed_by IS NULL AND reviewed_at IS NULL AND rejection_reason IS NULL)
  OR (status = 'APPROVED' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL AND reviewed_by <> user_id AND rejection_reason IS NULL)
  OR (status = 'REJECTED' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL AND reviewed_by <> user_id AND rejection_reason IS NOT NULL AND length(trim(rejection_reason)) > 0)
);
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_attachment_check" CHECK (
  (attachment_key IS NULL AND attachment_name IS NULL AND attachment_mime IS NULL AND attachment_size IS NULL)
  OR (attachment_key IS NOT NULL AND attachment_name IS NOT NULL AND attachment_mime IS NOT NULL AND attachment_size IS NOT NULL AND attachment_mime IN ('application/pdf','image/png','image/jpeg') AND attachment_size BETWEEN 1 AND 5242880
      AND attachment_key LIKE 'hrms/leaves/' || vendor_id::text || '/' || user_id::text || '/%')
);

COMMIT;
