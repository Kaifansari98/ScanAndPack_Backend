import { prisma } from "../../prisma/client";
import {
  CarcassType,
  HandleType,
  ShutterType,
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
