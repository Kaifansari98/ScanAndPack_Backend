import { prisma } from "../../prisma/client";
import {
  CarcassType,
  CarcasMaterial,
  CarcasMaterialFinish,
  HandleType,
  ShutterType,
  ShutterMaterial,
  ShutterMaterialFinish,
  CarcassLegs,
  SkirtingCarcassLegs,
  SkirtingCarcassLegsColor,
  LightCarcasType,
  LightCarcasUnit,
  OtherAppliances,
} from "../../types/leadModule.types";

const ensureVendorExists = async (vendor_id: number) => {
  const vendor = await prisma.vendorMaster.findUnique({
    where: { id: vendor_id },
    select: { id: true },
  });

  if (!vendor) {
    throw new Error("Invalid vendor_id");
  }
};

export const getAllCarcassTypes = async (
  vendor_id: number,
): Promise<CarcassType[]> => {
  await ensureVendorExists(vendor_id);

  const types = await prisma.carcassTypeMaster.findMany({
    where: { vendor_id },
    orderBy: { name: "asc" },
  });

  return types as CarcassType[];
};

export const getAllShutterTypes = async (
  vendor_id: number,
): Promise<ShutterType[]> => {
  await ensureVendorExists(vendor_id);

  const types = await prisma.shutterTypeMaster.findMany({
    where: { vendor_id },
    include: {
      subTypes: {
        orderBy: { name: "asc" },
      },
    },
    orderBy: { name: "asc" },
  });

  return types as ShutterType[];
};

export const getAllCarcasMaterials = async (
  vendor_id: number,
): Promise<CarcasMaterial[]> => {
  await ensureVendorExists(vendor_id);

  const materials = await prisma.carcasMaterialMaster.findMany({
    where: { vendor_id },
    orderBy: { name: "asc" },
  });

  return materials as CarcasMaterial[];
};

export const getCarcassMaterialFinishes = async (
  carcas_material_id: number,
): Promise<CarcasMaterialFinish[]> => {
  const material = await prisma.carcasMaterialMaster.findUnique({
    where: { id: carcas_material_id },
    select: { id: true },
  });

  if (!material) {
    throw new Error("Invalid carcas_material_id");
  }

  const finishes = await prisma.carcassMaterialFinishMaster.findMany({
    where: { carcas_material_id },
    orderBy: { name: "asc" },
  });

  return finishes as CarcasMaterialFinish[];
};

export const getAllShutterMaterials = async (
  vendor_id: number,
): Promise<ShutterMaterial[]> => {
  await ensureVendorExists(vendor_id);

  const materials = await prisma.shutterMaterialMaster.findMany({
    where: { vendor_id },
    orderBy: { name: "asc" },
  });

  return materials as ShutterMaterial[];
};

export const getShutterMaterialFinishes = async (
  shutter_material_id: number,
): Promise<ShutterMaterialFinish[]> => {
  const material = await prisma.shutterMaterialMaster.findUnique({
    where: { id: shutter_material_id },
    select: { id: true },
  });

  if (!material) {
    throw new Error("Invalid shutter_material_id");
  }

  const finishes = await prisma.shutterMaterialFinishMaster.findMany({
    where: { shutter_material_id },
    orderBy: { name: "asc" },
  });

  return finishes as ShutterMaterialFinish[];
};

export const getAllCarcassLegs = async (
  vendor_id: number,
): Promise<CarcassLegs[]> => {
  await ensureVendorExists(vendor_id);

  const legs = await prisma.carcassLegsMaster.findMany({
    where: { vendor_id },
    orderBy: { name: "asc" },
  });

  return legs as CarcassLegs[];
};

export const getSkirtingCarcassLegs = async (
  carcass_legs_id: number,
): Promise<SkirtingCarcassLegs[]> => {
  const legs = await prisma.carcassLegsMaster.findUnique({
    where: { id: carcass_legs_id },
    select: { id: true },
  });

  if (!legs) {
    throw new Error("Invalid carcass_legs_id");
  }

  const skirtings = await prisma.skirtingCarcassLegsMaster.findMany({
    where: { carcass_legs_id },
    orderBy: { name: "asc" },
  });

  return skirtings as SkirtingCarcassLegs[];
};

export const getSkirtingCarcassLegsColors = async (
  skirting_carcass_legs_id: number,
): Promise<SkirtingCarcassLegsColor[]> => {
  const skirting = await prisma.skirtingCarcassLegsMaster.findUnique({
    where: { id: skirting_carcass_legs_id },
    select: { id: true },
  });

  if (!skirting) {
    throw new Error("Invalid skirting_carcass_legs_id");
  }

  const colors = await prisma.skirtingCarcassLegsColorMaster.findMany({
    where: { skirting_carcass_legs_id },
    orderBy: { color: "asc" },
  });

  return colors as SkirtingCarcassLegsColor[];
};

export const getAllLightCarcasTypes = async (
  vendor_id: number,
): Promise<LightCarcasType[]> => {
  await ensureVendorExists(vendor_id);

  const types = await prisma.lightCarcasTypeMaster.findMany({
    where: { vendor_id, is_active: true },
    orderBy: { type: "asc" },
  });

  return types as LightCarcasType[];
};

export const getLightCarcasUnits = async (
  light_carcas_type_id: number,
): Promise<LightCarcasUnit[]> => {
  const type = await prisma.lightCarcasTypeMaster.findUnique({
    where: { id: light_carcas_type_id },
    select: { id: true },
  });

  if (!type) {
    throw new Error("Invalid light_carcas_type_id");
  }

  const units = await prisma.lightCarcasUnitMaster.findMany({
    where: { light_carcas_type_id, is_active: true },
    orderBy: { type: "asc" },
  });

  return units as LightCarcasUnit[];
};

export const getAllOtherAppliances = async (
  vendor_id: number,
): Promise<OtherAppliances[]> => {
  await ensureVendorExists(vendor_id);

  const appliances = await prisma.otherAppliancesMaster.findMany({
    where: { vendor_id },
    orderBy: [{ type: "asc" }, { article_number: "asc" }],
  });

  return appliances as OtherAppliances[];
};

export const getAllHandleTypes = async (
  vendor_id: number,
): Promise<HandleType[]> => {
  await ensureVendorExists(vendor_id);

  const types = await prisma.handleTypeMaster.findMany({
    where: { vendor_id },
    orderBy: { name: "asc" },
  });

  return types as HandleType[];
};

export const getFastProductionTimelineRules = async (vendor_id: number) => {
  await ensureVendorExists(vendor_id);

  return prisma.timelineRule.findMany({
    where: {
      vendor_id,
      OR: [
        { kitchen_manufacturing_days_for_fast_production: { not: null } },
        { other_manufacturing_days_for_fast_production: { not: null } },
      ],
    },
    select: {
      id: true,
      vendor_id: true,
      carcass_id: true,
      shutter_id: true,
      kitchen_manufacturing_days_for_fast_production: true,
      other_manufacturing_days_for_fast_production: true,
      carcass: {
        select: {
          id: true,
          name: true,
        },
      },
      shutter: {
        select: {
          id: true,
          name: true,
          subTypes: {
            select: {
              id: true,
              name: true,
            },
            orderBy: { name: "asc" },
          },
        },
      },
    },
    orderBy: [
      { carcass: { name: "asc" } },
      { shutter: { name: "asc" } },
    ],
  });
};
