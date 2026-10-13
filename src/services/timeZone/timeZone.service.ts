import { prisma } from "../../prisma/client";

export function isValidIANATimeZone(timeZone: string): boolean {
  if (!timeZone || typeof timeZone !== "string") return false;
  try {
    Intl.DateTimeFormat(undefined, { timeZone });
    return true;
  } catch {
    return false;
  }
}

export interface ListTimeZonesParams {
  is_active?: boolean;
  search?: string;
}

export const listTimeZones = async (params: ListTimeZonesParams = {}) => {
  const where: any = {};

  if (typeof params.is_active === "boolean") {
    where.is_active = params.is_active;
  }

  if (params.search && params.search.trim()) {
    const s = params.search.trim();
    where.OR = [
      { name: { contains: s, mode: "insensitive" } },
      { time_zone_code: { contains: s, mode: "insensitive" } },
    ];
  }

  return prisma.time_zone_master.findMany({
    where,
    orderBy: [{ name: "asc" }, { time_zone_code: "asc" }],
  });
};

export const getTimeZoneById = async (id: number) => {
  return prisma.time_zone_master.findUnique({
    where: { id },
  });
};

export const getTimeZoneByCode = async (timeZoneCode: string) => {
  return prisma.time_zone_master.findUnique({
    where: { time_zone_code: timeZoneCode },
  });
};

export const createTimeZone = async (data: {
  name: string;
  time_zone_code: string;
  is_active?: boolean;
}) => {
  const name = data.name?.trim();
  const time_zone_code = data.time_zone_code?.trim();

  if (!name) {
    const err: any = new Error("Time zone name is required");
    err.statusCode = 400;
    throw err;
  }

  if (!time_zone_code) {
    const err: any = new Error("time_zone_code is required");
    err.statusCode = 400;
    throw err;
  }

  if (!isValidIANATimeZone(time_zone_code)) {
    const err: any = new Error(
      `'${time_zone_code}' is not a valid IANA time zone identifier`
    );
    err.statusCode = 400;
    throw err;
  }

  const existing = await prisma.time_zone_master.findUnique({
    where: { time_zone_code },
  });

  if (existing) {
    const err: any = new Error(
      `Time zone with code '${time_zone_code}' already exists`
    );
    err.statusCode = 409;
    throw err;
  }

  return prisma.time_zone_master.create({
    data: {
      name,
      time_zone_code,
      is_active: data.is_active !== undefined ? Boolean(data.is_active) : true,
    },
  });
};

export const updateTimeZone = async (
  id: number,
  data: {
    name?: string;
    is_active?: boolean;
  }
) => {
  const existing = await prisma.time_zone_master.findUnique({
    where: { id },
  });

  if (!existing) {
    const err: any = new Error("Time zone not found");
    err.statusCode = 404;
    throw err;
  }

  return prisma.time_zone_master.update({
    where: { id },
    data: {
      ...(data.name !== undefined && { name: data.name.trim() }),
      ...(data.is_active !== undefined && { is_active: Boolean(data.is_active) }),
    },
  });
};
