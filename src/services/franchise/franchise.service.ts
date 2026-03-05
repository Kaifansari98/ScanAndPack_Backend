import { prisma } from "../../prisma/client";

export type CreateFranchisePayload = {
  vendor_id: number;
  franchise_name: string;
  franchise_code?: string | null;
  contact_number?: string | null;
  contact_email?: string | null;
  contact_person?: string | null;
  is_head_office?: boolean;
  zone_id?: number | null;
  country_id?: number | null;
  region_id?: number | null;
  state_id?: number | null;
  city_id?: number | null;
  area_id?: number | null;
  address?: string | null;
  pincode?: string | null;
  status?: string | null;
};

export const createFranchise = async (payload: CreateFranchisePayload) => {
  const missingFields: string[] = [];
  if (!payload.vendor_id) missingFields.push("vendor_id");
  if (!payload.franchise_name) missingFields.push("franchise_name");

  if (missingFields.length > 0) {
    const error = new Error(
      `Missing required field(s): ${missingFields.join(", ")}`
    );
    (error as any).statusCode = 400;
    throw error;
  }

  if (payload.franchise_code) {
    const existing = await prisma.franchiseMaster.findFirst({
      where: {
        vendor_id: Number(payload.vendor_id),
        franchise_code: payload.franchise_code,
      },
      select: { id: true },
    });

    if (existing) {
      const error = new Error(
        "Franchise with this franchise_code already exists for this vendor."
      );
      (error as any).statusCode = 409;
      throw error;
    }
  }

  const isHeadOffice = payload.is_head_office ?? false;
  if (isHeadOffice) {
    const existingHeadOffice = await prisma.franchiseMaster.findFirst({
      where: {
        vendor_id: Number(payload.vendor_id),
        is_head_office: true,
      },
      select: { id: true },
    });

    if (existingHeadOffice) {
      const error = new Error(
        "Head office already exists for this vendor."
      );
      (error as any).statusCode = 409;
      throw error;
    }
  }

  return await prisma.franchiseMaster.create({
    data: {
      vendor_id: Number(payload.vendor_id),
      franchise_name: payload.franchise_name,
      franchise_code: payload.franchise_code ?? null,
      contact_number: payload.contact_number ?? null,
      contact_email: payload.contact_email ?? null,
      contact_person: payload.contact_person ?? null,
      is_head_office: isHeadOffice,
      zone_id: payload.zone_id ?? null,
      country_id: payload.country_id ?? null,
      region_id: payload.region_id ?? null,
      state_id: payload.state_id ?? null,
      city_id: payload.city_id ?? null,
      area_id: payload.area_id ?? null,
      address: payload.address ?? null,
      pincode: payload.pincode ?? null,
      status: payload.status ?? "active",
    },
  });
};

export const getFranchisesByVendorId = async (vendorId: number) => {
  if (!vendorId || Number.isNaN(vendorId)) {
    const error = new Error("Valid vendor_id is required.");
    (error as any).statusCode = 400;
    throw error;
  }

  return await prisma.franchiseMaster.findMany({
    where: {
      vendor_id: Number(vendorId),
    },
    orderBy: {
      franchise_name: "asc",
    },
    select: {
      id: true,
      vendor_id: true,
      franchise_name: true,
      franchise_code: true,
      is_head_office: true,
      status: true,
    },
  });
};
