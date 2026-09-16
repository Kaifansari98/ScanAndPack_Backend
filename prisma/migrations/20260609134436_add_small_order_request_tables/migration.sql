CREATE TYPE "SmallOrderRequestSource" AS ENUM ('post_dispatch', 'final_handover');
CREATE TYPE "SmallOrderTypeKey" AS ENUM ('additional_panel', 'additional_hardware', 'one_cabinet', 'additional_accessory');
CREATE TYPE "SmallOrderRequestDocumentCategory" AS ENUM ('supporting_document');

CREATE TABLE "small_order_request_type_master" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "type_key" "SmallOrderTypeKey" NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "small_order_request_type_master_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "smallOrderRequests" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "lead_id" INTEGER NOT NULL,
    "parent_lead_code" TEXT NOT NULL,
    "so_code" TEXT,
    "customer_name" TEXT NOT NULL,
    "request_source" "SmallOrderRequestSource" NOT NULL,
    "request_type_id" INTEGER NOT NULL,
    "required_date" TIMESTAMP(3) NOT NULL,
    "remarks" VARCHAR(2000),
    "supervisor_approved" BOOLEAN NOT NULL DEFAULT false,
    "supervisor_approved_at" TIMESTAMP(3),
    "admin_approved" BOOLEAN NOT NULL DEFAULT false,
    "admin_approved_at" TIMESTAMP(3),
    "created_by" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" INTEGER,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_merge_to_parent_on_installation" BOOLEAN NOT NULL,
    "usable_handover_date_snapshot" TIMESTAMP(3),
    "small_order_sequence" INTEGER,
    "rejection_reason" VARCHAR(2000),

    CONSTRAINT "smallOrderRequests_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "small_order_request_documents" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "small_order_request_id" INTEGER NOT NULL,
    "document_id" INTEGER NOT NULL,
    "document_category" "SmallOrderRequestDocumentCategory" NOT NULL DEFAULT 'supporting_document',
    "created_by" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "small_order_request_documents_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "uniq_vendor_small_order_request_type_key" ON "small_order_request_type_master"("vendor_id", "type_key");
CREATE INDEX "small_order_request_type_master_vendor_id_idx" ON "small_order_request_type_master"("vendor_id");

CREATE UNIQUE INDEX "uniq_vendor_small_order_so_code" ON "smallOrderRequests"("vendor_id", "so_code");
CREATE UNIQUE INDEX "uniq_vendor_lead_small_order_sequence" ON "smallOrderRequests"("vendor_id", "lead_id", "small_order_sequence");
CREATE INDEX "smallOrderRequests_vendor_id_idx" ON "smallOrderRequests"("vendor_id");
CREATE INDEX "smallOrderRequests_lead_id_idx" ON "smallOrderRequests"("lead_id");
CREATE INDEX "smallOrderRequests_request_type_id_idx" ON "smallOrderRequests"("request_type_id");
CREATE INDEX "smallOrderRequests_request_source_idx" ON "smallOrderRequests"("request_source");

CREATE INDEX "small_order_request_documents_vendor_id_idx" ON "small_order_request_documents"("vendor_id");
CREATE INDEX "small_order_request_documents_small_order_request_id_idx" ON "small_order_request_documents"("small_order_request_id");
CREATE INDEX "small_order_request_documents_document_id_idx" ON "small_order_request_documents"("document_id");

ALTER TABLE "small_order_request_type_master"
ADD CONSTRAINT "small_order_request_type_master_vendor_id_fkey"
FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "smallOrderRequests"
ADD CONSTRAINT "smallOrderRequests_vendor_id_fkey"
FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "smallOrderRequests"
ADD CONSTRAINT "smallOrderRequests_lead_id_fkey"
FOREIGN KEY ("lead_id") REFERENCES "LeadMaster"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "smallOrderRequests"
ADD CONSTRAINT "smallOrderRequests_request_type_id_fkey"
FOREIGN KEY ("request_type_id") REFERENCES "small_order_request_type_master"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "smallOrderRequests"
ADD CONSTRAINT "smallOrderRequests_created_by_fkey"
FOREIGN KEY ("created_by") REFERENCES "UserMaster"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "smallOrderRequests"
ADD CONSTRAINT "smallOrderRequests_updated_by_fkey"
FOREIGN KEY ("updated_by") REFERENCES "UserMaster"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "small_order_request_documents"
ADD CONSTRAINT "small_order_request_documents_vendor_id_fkey"
FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "small_order_request_documents"
ADD CONSTRAINT "small_order_request_documents_small_order_request_id_fkey"
FOREIGN KEY ("small_order_request_id") REFERENCES "smallOrderRequests"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "small_order_request_documents"
ADD CONSTRAINT "small_order_request_documents_document_id_fkey"
FOREIGN KEY ("document_id") REFERENCES "LeadDocuments"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "small_order_request_documents"
ADD CONSTRAINT "small_order_request_documents_created_by_fkey"
FOREIGN KEY ("created_by") REFERENCES "UserMaster"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "small_order_request_type_master" ("vendor_id", "type", "type_key", "status", "created_at", "updated_at")
SELECT v."id", x."type", x."type_key"::"SmallOrderTypeKey", 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "VendorMaster" v
CROSS JOIN (
    VALUES
      ('Additional Panel Order', 'additional_panel'),
      ('Additional Hardware Order', 'additional_hardware'),
      ('One Cabinet Order', 'one_cabinet'),
      ('Additional Accessory Order', 'additional_accessory')
) AS x("type", "type_key")
WHERE NOT EXISTS (
    SELECT 1
    FROM "small_order_request_type_master" s
    WHERE s."vendor_id" = v."id"
      AND s."type_key" = x."type_key"::"SmallOrderTypeKey"
);
