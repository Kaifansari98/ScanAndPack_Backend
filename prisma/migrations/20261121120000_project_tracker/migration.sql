-- Client Project Tracker: client-facing stage status, expected dates with
-- approved revisions, published updates and an internal audit log.
DO $$ BEGIN
  CREATE TYPE "ProjectTrackerStageKey" AS ENUM ('BOOKING','FINAL_MEASUREMENT','TECH_CHECK','PRODUCTION','DISPATCH','DELIVERY','INSTALLATION','HANDOVER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE "ProjectTrackerHoldStatus" AS ENUM ('ON_HOLD','DELAYED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE "ProjectTrackerRevisionStatus" AS ENUM ('PENDING','APPROVED','REJECTED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "ProjectTrackerStage" (
  "id" SERIAL PRIMARY KEY,
  "vendor_id" INTEGER NOT NULL,
  "lead_id" INTEGER NOT NULL,
  "stage" "ProjectTrackerStageKey" NOT NULL,
  "original_expected_date" DATE,
  "original_set_at" TIMESTAMP(3),
  "original_set_by" INTEGER,
  "approved_expected_date" DATE,
  "hold_status" "ProjectTrackerHoldStatus",
  "hold_reason" VARCHAR(2000),
  "hold_action" VARCHAR(2000),
  "hold_resume_date" DATE,
  "hold_since" TIMESTAMP(3),
  "client_remark" VARCHAR(2000),
  "client_remark_at" TIMESTAMP(3),
  "updated_by" INTEGER,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "ProjectTrackerStage_lead_id_stage_key" ON "ProjectTrackerStage"("lead_id", "stage");
CREATE INDEX IF NOT EXISTS "ProjectTrackerStage_vendor_id_hold_status_idx" ON "ProjectTrackerStage"("vendor_id", "hold_status");

CREATE TABLE IF NOT EXISTS "ProjectTrackerDateRevision" (
  "id" SERIAL PRIMARY KEY,
  "vendor_id" INTEGER NOT NULL,
  "lead_id" INTEGER NOT NULL,
  "stage" "ProjectTrackerStageKey" NOT NULL,
  "previous_date" DATE,
  "proposed_date" DATE NOT NULL,
  "approved_date" DATE,
  "reason" VARCHAR(2000) NOT NULL,
  "status" "ProjectTrackerRevisionStatus" NOT NULL DEFAULT 'PENDING',
  "requested_by" INTEGER NOT NULL,
  "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "decided_by" INTEGER,
  "decided_at" TIMESTAMP(3),
  "decision_remarks" VARCHAR(2000)
);
CREATE INDEX IF NOT EXISTS "ProjectTrackerDateRevision_vendor_id_status_idx" ON "ProjectTrackerDateRevision"("vendor_id", "status");
CREATE INDEX IF NOT EXISTS "ProjectTrackerDateRevision_lead_id_stage_idx" ON "ProjectTrackerDateRevision"("lead_id", "stage");

CREATE TABLE IF NOT EXISTS "ProjectTrackerLog" (
  "id" SERIAL PRIMARY KEY,
  "vendor_id" INTEGER NOT NULL,
  "lead_id" INTEGER NOT NULL,
  "stage" "ProjectTrackerStageKey",
  "action" VARCHAR(60) NOT NULL,
  "details" JSONB,
  "created_by" INTEGER NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "ProjectTrackerLog_lead_id_created_at_idx" ON "ProjectTrackerLog"("lead_id", "created_at");

CREATE TABLE IF NOT EXISTS "ProjectTrackerUpdate" (
  "id" SERIAL PRIMARY KEY,
  "vendor_id" INTEGER NOT NULL,
  "lead_id" INTEGER NOT NULL,
  "stage" "ProjectTrackerStageKey" NOT NULL,
  "kind" VARCHAR(20) NOT NULL DEFAULT 'MANUAL',
  "title" VARCHAR(200) NOT NULL,
  "description" VARCHAR(4000),
  "published_by" INTEGER NOT NULL,
  "published_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "ProjectTrackerUpdate_lead_id_published_at_idx" ON "ProjectTrackerUpdate"("lead_id", "published_at");

CREATE TABLE IF NOT EXISTS "ProjectTrackerUpdateFile" (
  "id" SERIAL PRIMARY KEY,
  "vendor_id" INTEGER NOT NULL,
  "update_id" INTEGER NOT NULL,
  "storage_key" VARCHAR(500) NOT NULL,
  "original_name" VARCHAR(255) NOT NULL,
  "mime_type" VARCHAR(100) NOT NULL,
  "size_bytes" INTEGER NOT NULL,
  "media_type" VARCHAR(20) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProjectTrackerUpdateFile_update_id_fkey" FOREIGN KEY ("update_id") REFERENCES "ProjectTrackerUpdate"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "ProjectTrackerUpdateFile_update_id_idx" ON "ProjectTrackerUpdateFile"("update_id");
