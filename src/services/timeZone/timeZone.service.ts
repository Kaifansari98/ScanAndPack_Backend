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
  active?: boolean;
  search?: string;
}

export const listTimeZones = async (params: ListTimeZonesParams = {}) => {
  const where: any = {};

  if (typeof params.active === "boolean") {
    where.active = params.active;
  }

  if (params.search && params.search.trim()) {
    const s = params.search.trim();
    where.OR = [
      { country: { contains: s, mode: "insensitive" } },
      { time_zone_name: { contains: s, mode: "insensitive" } },
    ];
  }

  return prisma.time_zone_master.findMany({
    where,
    orderBy: [{ country: "asc" }, { time_zone_name: "asc" }],
  });
};

export const getTimeZoneById = async (id: number) => {
  return prisma.time_zone_master.findUnique({
    where: { id },
  });
};

export const getTimeZoneByCode = async (timeZoneName: string) => {
  return prisma.time_zone_master.findUnique({
    where: { time_zone_name: timeZoneName },
  });
};

export const createTimeZone = async (data: {
  country: string;
  time_zone_name: string;
  time_zone?: string;
  active?: boolean;
  mins?: number;
}) => {
  const country = data.country?.trim();
  const time_zone_name = data.time_zone_name?.trim();

  if (!country) {
    const err: any = new Error("Country name is required");
    err.statusCode = 400;
    throw err;
  }

  if (!time_zone_name) {
    const err: any = new Error("time_zone_name is required");
    err.statusCode = 400;
    throw err;
  }

  if (!isValidIANATimeZone(time_zone_name)) {
    const err: any = new Error(
      `'${time_zone_name}' is not a valid IANA time zone identifier`
    );
    err.statusCode = 400;
    throw err;
  }

  const existing = await prisma.time_zone_master.findUnique({
    where: { time_zone_name },
  });

  if (existing) {
    const err: any = new Error(
      `Time zone with name '${time_zone_name}' already exists`
    );
    err.statusCode = 409;
    throw err;
  }

  return prisma.time_zone_master.create({
    data: {
      country,
      time_zone_name,
      time_zone: data.time_zone?.trim() || null,
      active: data.active !== undefined ? Boolean(data.active) : true,
      mins: data.mins !== undefined ? Number(data.mins) : null,
    },
  });
};

export const updateTimeZone = async (
  id: number,
  data: {
    country?: string;
    active?: boolean;
    time_zone?: string;
    mins?: number;
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
      ...(data.country !== undefined && { country: data.country.trim() }),
      ...(data.active !== undefined && { active: Boolean(data.active) }),
      ...(data.time_zone !== undefined && { time_zone: data.time_zone?.trim() || null }),
      ...(data.mins !== undefined && { mins: data.mins !== null ? Number(data.mins) : null }),
    },
  });
};
