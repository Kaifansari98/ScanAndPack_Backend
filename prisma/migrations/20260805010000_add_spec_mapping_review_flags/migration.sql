ALTER TABLE "LeadCarcassMaterialMapping"
ADD COLUMN "is_approved" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "approved_at" TIMESTAMP(3),
ADD COLUMN "is_amended" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "amended_at" TIMESTAMP(3),
ADD COLUMN "is_deleted_item" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "deleted_item_at" TIMESTAMP(3);

ALTER TABLE "LeadShutterMaterialMapping"
ADD COLUMN "is_approved" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "approved_at" TIMESTAMP(3),
ADD COLUMN "is_amended" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "amended_at" TIMESTAMP(3),
ADD COLUMN "is_deleted_item" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "deleted_item_at" TIMESTAMP(3);

ALTER TABLE "LeadHardwareMapping"
ADD COLUMN "is_approved" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "approved_at" TIMESTAMP(3),
ADD COLUMN "is_amended" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "amended_at" TIMESTAMP(3),
ADD COLUMN "is_deleted_item" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "deleted_item_at" TIMESTAMP(3);

ALTER TABLE "LeadLightCarcasUnitMapping"
ADD COLUMN "is_approved" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "approved_at" TIMESTAMP(3),
ADD COLUMN "is_amended" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "amended_at" TIMESTAMP(3),
ADD COLUMN "is_deleted_item" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "deleted_item_at" TIMESTAMP(3);

ALTER TABLE "LeadOtherAppliancesMapping"
ADD COLUMN "is_approved" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "approved_at" TIMESTAMP(3),
ADD COLUMN "is_amended" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "amended_at" TIMESTAMP(3),
ADD COLUMN "is_deleted_item" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "deleted_item_at" TIMESTAMP(3);
