import { prisma } from "../../prisma/client";

import { validateShiftMinutes } from "../attendance/attendance-calendar.utils";

export type CreateFranchisePayload = {
  shift_minutes?: number;
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
  /** The vendor's store city (StoreCityMaster). */
  store_city_id?: number | null;
  area_id?: number | null;
  address?: string | null;
  pincode?: string | null;
  status?: string | null;
};

export const createFranchise = async (payload: CreateFranchisePayload) => {
  const shiftMinutes = payload.shift_minutes === undefined ? 480 : validateShiftMinutes(payload.shift_minutes);
  const franchiseName = payload.franchise_name?.trim();
  const franchiseCode = payload.franchise_code?.trim().toUpperCase() || null;
  const missingFields: string[] = [];
  if (!payload.vendor_id) missingFields.push("vendor_id");
  if (!franchiseName) missingFields.push("franchise_name");

  if (missingFields.length > 0) {
    const error = new Error(
      `Missing required field(s): ${missingFields.join(", ")}`,
    );
    (error as any).statusCode = 400;
    throw error;
  }

  if (franchiseCode) {
    const existing = await prisma.franchiseMaster.findFirst({
      where: {
        vendor_id: Number(payload.vendor_id),
        franchise_code: { equals: franchiseCode, mode: "insensitive" },
      },
      select: { id: true },
    });

    if (existing) {
      const error = new Error(
        "This franchise code is already in use for this vendor. Enter a different code.",
      );
      (error as any).statusCode = 409;
      (error as any).code = "FRANCHISE_CODE_EXISTS";
      throw error;
    }
  }

  const storeCityId = await validStoreCityId(Number(payload.vendor_id), payload.store_city_id);

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
      const error = new Error("Head office already exists for this vendor.");
      (error as any).statusCode = 409;
      throw error;
    }
  }

  return await prisma.franchiseMaster.create({
    data: {
      vendor_id: Number(payload.vendor_id),
      franchise_name: franchiseName!,
      shift_minutes: shiftMinutes,
      franchise_code: franchiseCode,
      contact_number: payload.contact_number ?? null,
      contact_email: payload.contact_email ?? null,
      contact_person: payload.contact_person ?? null,
      is_head_office: isHeadOffice,
      zone_id: payload.zone_id ?? null,
      country_id: payload.country_id ?? null,
      region_id: payload.region_id ?? null,
      state_id: payload.state_id ?? null,
      city_id: payload.city_id ?? null,
      store_city_id: storeCityId,
      area_id: payload.area_id ?? null,
      address: payload.address ?? null,
      pincode: payload.pincode ?? null,
      status: payload.status ?? "active",
    },
  });
};

const badRequest = (message: string, statusCode = 400): never => {
  const error = new Error(message);
  (error as any).statusCode = statusCode;
  throw error;
};

// A store city must be one of the vendor's active cities. Empty clears it.
async function validStoreCityId(vendorId: number, value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) badRequest("Select a valid city.");
  const city = await prisma.storeCityMaster.findFirst({
    where: { id, vendor_id: vendorId, is_active: true },
    select: { id: true },
  });
  if (!city) badRequest("The selected city is not in this vendor's city master.");
  return id;
}

/** The vendor's active store cities, for the franchise City dropdown. */
export const getStoreCitiesByVendorId = async (vendorId: number) => {
  if (!vendorId || Number.isNaN(vendorId)) badRequest("Valid vendor_id is required.");
  return prisma.storeCityMaster.findMany({
    where: { vendor_id: vendorId, is_active: true },
    orderBy: [{ sort_order: "asc" }, { name: "asc" }],
    select: { id: true, name: true },
  });
};

const FRANCHISE_ADMINS = ["master-admin", "super-admin", "admin"];

/**
 * Adds a city to the vendor's city master (StoreCityMaster), from the
 * franchise form. An existing city with the same name (any case) is reused,
 * and switched back on if it was inactive.
 */
export const addStoreCity = async (
  actor: { id?: number; vendor_id?: number; user_type?: string } | undefined,
  vendorId: number,
  rawName: unknown,
) => {
  const role = String(actor?.user_type ?? "").trim().toLowerCase();
  if (!FRANCHISE_ADMINS.includes(role)) badRequest("You do not have permission to add cities.", 403);
  if (!vendorId || Number.isNaN(vendorId)) badRequest("Valid vendor_id is required.");
  if (role !== "master-admin" && Number(actor?.vendor_id) !== vendorId) badRequest("Vendor not found.", 404);
  const name = String(rawName ?? "").trim().replace(/\s+/g, " ");
  if (!name) badRequest("City name is required.");
  if (name.length > 120) badRequest("City name must be at most 120 characters.");

  const existing = await prisma.storeCityMaster.findFirst({
    where: { vendor_id: vendorId, name: { equals: name, mode: "insensitive" } },
    select: { id: true, name: true, is_active: true },
  });
  if (existing) {
    if (!existing.is_active)
      await prisma.storeCityMaster.update({ where: { id: existing.id }, data: { is_active: true } });
    return { id: existing.id, name: existing.name, created: false };
  }
  const last = await prisma.storeCityMaster.aggregate({ where: { vendor_id: vendorId }, _max: { sort_order: true } });
  try {
    const city = await prisma.storeCityMaster.create({
      data: { vendor_id: vendorId, name, sort_order: (last._max.sort_order ?? 0) + 1 },
      select: { id: true, name: true },
    });
    return { ...city, created: true };
  } catch (error: any) {
    // Someone added the same city at the same moment.
    if (error?.code === "P2002") {
      const city = await prisma.storeCityMaster.findFirst({
        where: { vendor_id: vendorId, name: { equals: name, mode: "insensitive" } },
        select: { id: true, name: true },
      });
      if (city) return { ...city, created: false };
    }
    throw error;
  }
};

export type UpdateFranchisePayload = Partial<
  Pick<
    CreateFranchisePayload,
    | "franchise_name"
    | "franchise_code"
    | "contact_person"
    | "contact_number"
    | "contact_email"
    | "address"
    | "shift_minutes"
    | "store_city_id"
    | "status"
  >
>;

/**
 * Edits a franchise's details. Master admins can edit any vendor's franchise;
 * a vendor's super admin or admin only their own vendor's.
 */
export const updateFranchise = async (
  actor: { id?: number; vendor_id?: number; user_type?: string } | undefined,
  id: number,
  payload: UpdateFranchisePayload,
) => {
  const role = String(actor?.user_type ?? "").trim().toLowerCase();
  if (!FRANCHISE_ADMINS.includes(role)) badRequest("You do not have permission to edit franchises.", 403);
  if (!Number.isSafeInteger(id) || id <= 0) badRequest("Valid franchise id is required.");

  const franchise = await prisma.franchiseMaster.findUnique({ where: { id }, select: { id: true, vendor_id: true } });
  if (!franchise || (role !== "master-admin" && franchise.vendor_id !== Number(actor?.vendor_id)))
    badRequest("Franchise not found.", 404);
  const vendorId = franchise!.vendor_id;

  const data: Record<string, unknown> = {};
  const text = (key: keyof UpdateFranchisePayload, label: string, required = false) => {
    if (payload[key] === undefined) return;
    const value = String(payload[key] ?? "").trim();
    if (required && !value) badRequest(`${label} is required.`);
    data[key] = value || null;
  };
  text("franchise_name", "Franchise name", true);
  text("contact_person", "Contact person");
  text("contact_email", "Contact email");
  text("address", "Address");
  if (payload.contact_number !== undefined) {
    const digits = String(payload.contact_number ?? "").replace(/\D/g, "");
    if (digits && digits.length !== 10) badRequest("Contact number must be 10 digits.");
    data.contact_number = digits || null;
  }
  if (payload.franchise_code !== undefined) {
    const code = String(payload.franchise_code ?? "").trim().toUpperCase() || null;
    if (code) {
      const clash = await prisma.franchiseMaster.findFirst({
        where: { vendor_id: vendorId, id: { not: id }, franchise_code: { equals: code, mode: "insensitive" } },
        select: { id: true },
      });
      if (clash) {
        const error = new Error("This franchise code is already in use for this vendor. Enter a different code.");
        (error as any).statusCode = 409;
        (error as any).code = "FRANCHISE_CODE_EXISTS";
        throw error;
      }
    }
    data.franchise_code = code;
  }
  if (payload.shift_minutes !== undefined) data.shift_minutes = validateShiftMinutes(payload.shift_minutes);
  if (payload.store_city_id !== undefined) data.store_city_id = await validStoreCityId(vendorId, payload.store_city_id);
  if (payload.status !== undefined) {
    const status = String(payload.status ?? "").trim().toLowerCase();
    if (!["active", "inactive"].includes(status)) badRequest("Status must be active or inactive.");
    data.status = status;
  }

  return prisma.franchiseMaster.update({
    where: { id },
    data,
    select: {
      id: true,
      franchise_name: true,
      franchise_code: true,
      contact_person: true,
      contact_number: true,
      contact_email: true,
      address: true,
      shift_minutes: true,
      store_city_id: true,
      storeCity: { select: { name: true } },
      status: true,
    },
  });
};

export const getFranchisesByVendorId = async (vendorId: number) => {
  if (!vendorId || Number.isNaN(vendorId)) {
    const error = new Error("Valid vendor_id is required.");
    (error as any).statusCode = 400;
    throw error;
  }

  const franchises = await prisma.franchiseMaster.findMany({
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
      Department: true,
      shift_minutes: true,
      contact_person: true,
      contact_email: true,
      contact_number: true,
      address: true,
      pincode: true,
      store_city_id: true,
      storeCity: { select: { name: true } },
      is_head_office: true,
      moduled_for_b2b: true,
      status: true,
      createdAt: true,
    },
  });

  const fastProdLeads = await prisma.leadMaster.findMany({
    where: {
      vendor_id: Number(vendorId),
      OR: [
        { is_fast_production: true },
        { fastProductionRequests: { some: {} } },
      ],
    },
    select: {
      franchise_id: true,
    },
  });

  const fastProdFranchiseIds = new Set(
    fastProdLeads.map((l) => l.franchise_id).filter(Boolean),
  );

  return franchises.map((franchise) => ({
    ...franchise,
    has_fast_production_leads: fastProdFranchiseIds.has(franchise.id),
  }));
};

export type CreateHeadSiteSupervisorFranchiseMappingPayload = {
  vendor_id: number;
  user_id: number;
  franchise_id: number;
  created_by: number;
  status?: boolean;
};

export const createHeadSiteSupervisorFranchiseMapping = async (
  payload: CreateHeadSiteSupervisorFranchiseMappingPayload,
) => {
  const missingFields: string[] = [];
  if (!payload.vendor_id) missingFields.push("vendor_id");
  if (!payload.user_id) missingFields.push("user_id");
  if (!payload.franchise_id) missingFields.push("franchise_id");
  if (!payload.created_by) missingFields.push("created_by");

  if (missingFields.length > 0) {
    const error = new Error(
      `Missing required field(s): ${missingFields.join(", ")}`,
    );
    (error as any).statusCode = 400;
    throw error;
  }

  const existing = await prisma.headSiteSupervisorFranchiseMapping.findFirst({
    where: {
      vendor_id: Number(payload.vendor_id),
      user_id: Number(payload.user_id),
      franchise_id: Number(payload.franchise_id),
    },
    select: { id: true },
  });

  if (existing) {
    const error = new Error(
      "Mapping already exists for this vendor, user, and franchise.",
    );
    (error as any).statusCode = 409;
    throw error;
  }

  const existingFranchise =
    await prisma.headSiteSupervisorFranchiseMapping.findFirst({
      where: {
        vendor_id: Number(payload.vendor_id),
        franchise_id: Number(payload.franchise_id),
      },
      select: { id: true, user_id: true },
    });

  if (existingFranchise) {
    const error = new Error(
      "This franchise already has a head site supervisor assigned.",
    );
    (error as any).statusCode = 409;
    throw error;
  }

  return await prisma.headSiteSupervisorFranchiseMapping.create({
    data: {
      vendor_id: Number(payload.vendor_id),
      user_id: Number(payload.user_id),
      franchise_id: Number(payload.franchise_id),
      created_by: Number(payload.created_by),
      status: payload.status ?? true,
    },
  });
};

export const updateHeadSiteSupervisorFranchiseMappingStatus = async (
  id: number,
  status: boolean,
) => {
  if (!id || Number.isNaN(id)) {
    const error = new Error("Valid mapping id is required.");
    (error as any).statusCode = 400;
    throw error;
  }

  if (typeof status !== "boolean") {
    const error = new Error("Valid status (boolean) is required.");
    (error as any).statusCode = 400;
    throw error;
  }

  return await prisma.headSiteSupervisorFranchiseMapping.update({
    where: { id: Number(id) },
    data: { status },
  });
};

export const getHeadSiteSupervisorFranchiseMapping = async (
  vendorId: number,
  franchiseId: number,
) => {
  if (!vendorId || Number.isNaN(vendorId)) {
    const error = new Error("Valid vendor_id is required.");
    (error as any).statusCode = 400;
    throw error;
  }
  if (!franchiseId || Number.isNaN(franchiseId)) {
    const error = new Error("Valid franchise_id is required.");
    (error as any).statusCode = 400;
    throw error;
  }

  return await prisma.userMaster.findMany({
    where: {
      vendor_id: Number(vendorId),
      franchise_id: Number(franchiseId),
      user_type: {
        user_type: "head-site-supervisor",
      },
    },
    select: {
      id: true,
      user_name: true,
      user_contact: true,
    },
  });
};

export const getSiteSupervisorFranchiseMapping = async (
  vendorId: number,
  franchiseId: number,
) => {
  if (!vendorId || Number.isNaN(vendorId)) {
    const error = new Error("Valid vendor_id is required.");
    (error as any).statusCode = 400;
    throw error;
  }
  if (!franchiseId || Number.isNaN(franchiseId)) {
    const error = new Error("Valid franchise_id is required.");
    (error as any).statusCode = 400;
    throw error;
  }

  const supervisors = await prisma.userMaster.findMany({
    where: {
      vendor_id: Number(vendorId),
      user_type: {
        user_type: {
          in: ["site-supervisor", "site supervisor", "site_supervisor"],
          mode: "insensitive",
        },
      },
      status: "active",
      OR: [
        { franchise_id: Number(franchiseId) },
        {
          siteSupervisorFranchiseMappings: {
            some: {
              franchise_id: Number(franchiseId),
            },
          },
        },
      ],
    },
    select: {
      id: true,
      user_name: true,
      user_contact: true,
      user_email: true,
    },
    orderBy: {
      user_name: "asc",
    },
  });

  return supervisors;
};
