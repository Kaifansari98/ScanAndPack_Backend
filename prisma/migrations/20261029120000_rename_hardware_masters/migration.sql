-- Rename hardware spec masters in place (data is kept):
--   CarcassLegsMaster              -> HardwareTypeMaster
--   SkirtingCarcassLegsMaster      -> HardwareItemMaster
--   SkirtingCarcassLegsColorMaster -> HardwareItemOptionMaster

BEGIN;

-- Tables
ALTER TABLE "CarcassLegsMaster" RENAME TO "HardwareTypeMaster";
ALTER TABLE "SkirtingCarcassLegsMaster" RENAME TO "HardwareItemMaster";
ALTER TABLE "SkirtingCarcassLegsColorMaster" RENAME TO "HardwareItemOptionMaster";

-- Columns
ALTER TABLE "HardwareItemMaster" RENAME COLUMN "carcass_legs_id" TO "hardware_type_id";
ALTER TABLE "HardwareItemOptionMaster" RENAME COLUMN "carcass_legs_id" TO "hardware_type_id";
ALTER TABLE "HardwareItemOptionMaster" RENAME COLUMN "skirting_carcass_legs_id" TO "hardware_item_id";
ALTER TABLE "HardwareItemOptionMaster" RENAME COLUMN "color" TO "name";
ALTER TABLE "LeadHardwareMapping" RENAME COLUMN "carcass_legs_id" TO "hardware_type_id";
ALTER TABLE "LeadHardwareMapping" RENAME COLUMN "skirting_carcass_legs_id" TO "hardware_item_id";
ALTER TABLE "LeadHardwareMapping" RENAME COLUMN "skirting_carcass_legs_color_id" TO "hardware_item_option_id";

-- Sequences
ALTER SEQUENCE "CarcassLegsMaster_id_seq" RENAME TO "HardwareTypeMaster_id_seq";
ALTER SEQUENCE "SkirtingCarcassLegsMaster_id_seq" RENAME TO "HardwareItemMaster_id_seq";
ALTER SEQUENCE "SkirtingCarcassLegsColorMaster_id_seq" RENAME TO "HardwareItemOptionMaster_id_seq";

-- Primary keys
ALTER TABLE "HardwareTypeMaster" RENAME CONSTRAINT "CarcassLegsMaster_pkey" TO "HardwareTypeMaster_pkey";
ALTER TABLE "HardwareItemMaster" RENAME CONSTRAINT "SkirtingCarcassLegsMaster_pkey" TO "HardwareItemMaster_pkey";
ALTER TABLE "HardwareItemOptionMaster" RENAME CONSTRAINT "SkirtingCarcassLegsColorMaster_pkey" TO "HardwareItemOptionMaster_pkey";

-- Foreign keys
ALTER TABLE "HardwareTypeMaster" RENAME CONSTRAINT "CarcassLegsMaster_vendor_id_fkey" TO "HardwareTypeMaster_vendor_id_fkey";
ALTER TABLE "HardwareItemMaster" RENAME CONSTRAINT "SkirtingCarcassLegsMaster_carcass_legs_id_fkey" TO "HardwareItemMaster_hardware_type_id_fkey";
ALTER TABLE "HardwareItemOptionMaster" RENAME CONSTRAINT "SkirtingCarcassLegsColorMaster_carcass_legs_id_fkey" TO "HardwareItemOptionMaster_hardware_type_id_fkey";
ALTER TABLE "HardwareItemOptionMaster" RENAME CONSTRAINT "SkirtingCarcassLegsColorMaster_skirting_carcass_legs_id_fkey" TO "HardwareItemOptionMaster_hardware_item_id_fkey";
ALTER TABLE "LeadHardwareMapping" RENAME CONSTRAINT "LeadHardwareMapping_carcass_legs_id_fkey" TO "LeadHardwareMapping_hardware_type_id_fkey";
ALTER TABLE "LeadHardwareMapping" RENAME CONSTRAINT "LeadHardwareMapping_skirting_carcass_legs_id_fkey" TO "LeadHardwareMapping_hardware_item_id_fkey";
ALTER TABLE "LeadHardwareMapping" RENAME CONSTRAINT "LeadHardwareMapping_skirting_carcass_legs_color_id_fkey" TO "LeadHardwareMapping_hardware_item_option_id_fkey";

-- Indexes
ALTER INDEX "LeadHardwareMapping_carcass_legs_id_idx" RENAME TO "LeadHardwareMapping_hardware_type_id_idx";
ALTER INDEX "LeadHardwareMapping_skirting_carcass_legs_id_idx" RENAME TO "LeadHardwareMapping_hardware_item_id_idx";
ALTER INDEX "LeadHardwareMapping_skirting_carcass_legs_color_id_idx" RENAME TO "LeadHardwareMapping_hardware_item_option_id_idx";

COMMIT;
