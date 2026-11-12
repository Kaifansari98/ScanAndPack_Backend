import { prisma } from "../../prisma/client";
import { attendanceContext, normalizeRole, type AttendanceActor } from "../attendance/attendance-workspace.service";
import { attendanceError } from "../attendance/attendance.utils";

// Haversine formula to compute great-circle distance between two points in meters
export function calculateDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371e3; // Earth radius in meters
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

export interface CreateLocationInput {
  name: string;
  location_type?: "OFFICE" | "SITE";
  franchise_id?: number | null;
  address: string;
  latitude: number;
  longitude: number;
  radius_meters?: number;
  is_active?: boolean;
}

export interface UpdateLocationInput {
  name?: string;
  location_type?: "OFFICE" | "SITE";
  franchise_id?: number | null;
  address?: string;
  latitude?: number;
  longitude?: number;
  radius_meters?: number;
  is_active?: boolean;
}

async function requireSuperAdmin(actor?: AttendanceActor) {
  const context = await attendanceContext(actor);
  if (normalizeRole(context.user.user_type.user_type) !== "super-admin") {
    attendanceError("Only super-admins can manage attendance geo-fence locations.", 403);
  }
  return context;
}

export async function createAttendanceLocation(
  actor: AttendanceActor | undefined,
  input: CreateLocationInput
) {
  const context = await requireSuperAdmin(actor);

  if (!input.name || input.name.trim().length < 2) {
    attendanceError("Location name is required (minimum 2 characters).");
  }
  if (!input.address || input.address.trim().length < 5) {
    attendanceError("Address is required (minimum 5 characters).");
  }
  if (typeof input.latitude !== "number" || isNaN(input.latitude) || input.latitude < -90 || input.latitude > 90) {
    attendanceError("Valid latitude between -90 and 90 is required.");
  }
  if (typeof input.longitude !== "number" || isNaN(input.longitude) || input.longitude < -180 || input.longitude > 180) {
    attendanceError("Valid longitude between -180 and 180 is required.");
  }

  const radius = Math.max(20, Math.min(10000, Number(input.radius_meters) || 100));
  const locationType = input.location_type === "SITE" ? "SITE" : "OFFICE";

  return prisma.attendanceLocation.create({
    data: {
      vendor_id: context.user.vendor_id,
      franchise_id: input.franchise_id ? Number(input.franchise_id) : null,
      name: input.name.trim(),
      location_type: locationType,
      address: input.address.trim(),
      latitude: input.latitude,
      longitude: input.longitude,
      radius_meters: radius,
      is_active: input.is_active !== false,
    },
    include: {
      franchise: { select: { id: true, franchise_name: true, Department: true } },
      _count: { select: { userAssignments: true } },
    },
  });
}

export async function updateAttendanceLocation(
  actor: AttendanceActor | undefined,
  id: number,
  input: UpdateLocationInput
) {
  const context = await requireSuperAdmin(actor);

  const existing = await prisma.attendanceLocation.findFirst({
    where: { id, vendor_id: context.user.vendor_id },
  });
  if (!existing) attendanceError("Attendance location not found.", 404);

  const data: any = {};
  if (input.name !== undefined) {
    if (!input.name.trim() || input.name.trim().length < 2) {
      attendanceError("Location name must have at least 2 characters.");
    }
    data.name = input.name.trim();
  }
  if (input.address !== undefined) {
    if (!input.address.trim() || input.address.trim().length < 5) {
      attendanceError("Address must have at least 5 characters.");
    }
    data.address = input.address.trim();
  }
  if (input.location_type !== undefined) {
    data.location_type = input.location_type === "SITE" ? "SITE" : "OFFICE";
  }
  if (input.franchise_id !== undefined) {
    data.franchise_id = input.franchise_id ? Number(input.franchise_id) : null;
  }
  if (input.latitude !== undefined) {
    if (typeof input.latitude !== "number" || isNaN(input.latitude) || input.latitude < -90 || input.latitude > 90) {
      attendanceError("Valid latitude between -90 and 90 is required.");
    }
    data.latitude = input.latitude;
  }
  if (input.longitude !== undefined) {
    if (typeof input.longitude !== "number" || isNaN(input.longitude) || input.longitude < -180 || input.longitude > 180) {
      attendanceError("Valid longitude between -180 and 180 is required.");
    }
    data.longitude = input.longitude;
  }
  if (input.radius_meters !== undefined) {
    data.radius_meters = Math.max(20, Math.min(10000, Number(input.radius_meters) || 100));
  }
  if (input.is_active !== undefined) {
    data.is_active = !!input.is_active;
  }

  return prisma.attendanceLocation.update({
    where: { id },
    data,
    include: {
      franchise: { select: { id: true, franchise_name: true, Department: true } },
      _count: { select: { userAssignments: true } },
    },
  });
}

export async function deleteAttendanceLocation(actor: AttendanceActor | undefined, id: number) {
  const context = await requireSuperAdmin(actor);

  const existing = await prisma.attendanceLocation.findFirst({
    where: { id, vendor_id: context.user.vendor_id },
  });
  if (!existing) attendanceError("Attendance location not found.", 404);

  // Soft deactivate or delete
  await prisma.attendanceLocation.delete({ where: { id } });
  return { success: true };
}

export async function listAttendanceLocations(
  actor: AttendanceActor | undefined,
  filters: { is_active?: unknown; search?: unknown; franchise_id?: unknown; location_type?: unknown }
) {
  const context = await attendanceContext(actor);
  const isSuperAdmin = normalizeRole(context.user.user_type.user_type) === "super-admin";

  const search = typeof filters.search === "string" && filters.search.trim() ? filters.search.trim() : undefined;
  const where: any = {
    vendor_id: context.user.vendor_id,
    ...(!isSuperAdmin ? { is_active: true } : {}),
    ...(filters.is_active !== undefined && filters.is_active !== "" && filters.is_active !== "all"
      ? { is_active: String(filters.is_active) === "true" }
      : {}),
    ...(filters.location_type && filters.location_type !== "all"
      ? { location_type: String(filters.location_type).toUpperCase() }
      : {}),
    ...(filters.franchise_id && filters.franchise_id !== "all"
      ? { franchise_id: Number(filters.franchise_id) }
      : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { address: { contains: search, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const locations = await prisma.attendanceLocation.findMany({
    where,
    include: {
      franchise: { select: { id: true, franchise_name: true, Department: true } },
      _count: { select: { userAssignments: true, attendanceRecords: true } },
      userAssignments: {
        select: {
          user_id: true,
          user: {
            select: {
              id: true,
              user_name: true,
              user_email: true,
              designation: true,
            },
          },
        },
      },
    },
    orderBy: [{ is_active: "desc" }, { name: "asc" }],
  });

  return locations;
}

export async function getVendorAssignableEmployees(actor?: AttendanceActor) {
  const context = await requireSuperAdmin(actor);
  return prisma.userMaster.findMany({
    where: {
      vendor_id: context.user.vendor_id,
      status: "active",
    },
    select: {
      id: true,
      user_name: true,
      user_email: true,
      designation: true,
      user_contact: true,
      franchise: {
        select: {
          id: true,
          franchise_name: true,
        },
      },
    },
    orderBy: {
      user_name: "asc",
    },
  });
}

export async function assignLocationsToEmployees(
  actor: AttendanceActor | undefined,
  input: { location_id: number; user_ids: number[] }
) {
  const context = await requireSuperAdmin(actor);
  const locationId = Number(input.location_id);
  if (!Number.isSafeInteger(locationId) || locationId <= 0) {
    attendanceError("Valid location_id is required.");
  }

  const location = await prisma.attendanceLocation.findFirst({
    where: { id: locationId, vendor_id: context.user.vendor_id },
  });
  if (!location) attendanceError("Attendance location not found.", 404);

  const userIds = Array.isArray(input.user_ids)
    ? input.user_ids.map(Number).filter((id) => Number.isSafeInteger(id) && id > 0)
    : [];

  return prisma.$transaction(async (tx) => {
    // Clear existing assignments for this location
    await tx.userAttendanceLocation.deleteMany({
      where: { location_id: locationId },
    });

    if (userIds.length > 0) {
      // Verify users belong to this vendor
      const validUsers = await tx.userMaster.findMany({
        where: { id: { in: userIds }, vendor_id: context.user.vendor_id, status: "active" },
        select: { id: true },
      });

      if (validUsers.length > 0) {
        await tx.userAttendanceLocation.createMany({
          data: validUsers.map((u) => ({
            user_id: u.id,
            location_id: locationId,
          })),
          skipDuplicates: true,
        });
      }
    }

    return { assigned_count: userIds.length };
  });
}

// Get locations authorized for a specific employee
export async function getAuthorizedLocationsForUser(vendorId: number, userId: number) {
  // 1. Check direct employee assignments first
  const assignments = await prisma.userAttendanceLocation.findMany({
    where: {
      user_id: userId,
      location: { vendor_id: vendorId, is_active: true },
    },
    include: {
      location: {
        include: {
          franchise: { select: { id: true, franchise_name: true, Department: true } },
        },
      },
    },
  });

  if (assignments.length > 0) {
    return assignments.map((a) => a.location);
  }

  // 2. If the employee has NO specific location assigned, check if ANY employee in this vendor has specific assignments
  // Or check if this vendor has configured any specific assignments.
  // When an admin assigns employees to specific locations, an unassigned employee must NOT fall back to all locations.
  // Instead, check if user's franchise has a dedicated location:
  const user = await prisma.userMaster.findUnique({
    where: { id: userId },
    select: { franchise_id: true },
  });

  if (user?.franchise_id) {
    const franchiseLocations = await prisma.attendanceLocation.findMany({
      where: {
        vendor_id: vendorId,
        franchise_id: user.franchise_id,
        is_active: true,
      },
      include: {
        franchise: { select: { id: true, franchise_name: true, Department: true } },
      },
    });
    if (franchiseLocations.length > 0) return franchiseLocations;
  }

  // 3. Check if vendor has ANY specific user assignments created.
  // If user assignments exist in the vendor, unassigned employees are restricted to unassigned franchise-wide locations or blocked.
  const anyVendorAssignmentsCount = await prisma.userAttendanceLocation.count({
    where: { location: { vendor_id: vendorId } },
  });

  if (anyVendorAssignmentsCount > 0) {
    // There are assigned locations configured. Since this employee is not assigned to any, they have no authorized locations.
    return [];
  }

  // 4. Default: If no individual assignments have ever been created in the vendor,
  // allow general active vendor locations (initial setup mode).
  return prisma.attendanceLocation.findMany({
    where: { vendor_id: vendorId, is_active: true },
    include: {
      franchise: { select: { id: true, franchise_name: true, Department: true } },
    },
  });
}

// Server-side Geo-Fence Verification
export async function verifyEmployeeGeoFence(
  vendorId: number,
  userId: number,
  gps: { latitude: number; longitude: number; accuracy?: number }
) {
  // Check if this vendor has configured any active geo-fence locations
  const totalVendorLocations = await prisma.attendanceLocation.count({
    where: { vendor_id: vendorId, is_active: true },
  });

  // If vendor hasn't set up any geo-fence locations yet, allow with warning
  if (totalVendorLocations === 0) {
    return {
      allowed: true,
      matched_location: null,
      distance_meters: 0,
      note: "No geo-fences configured for this vendor.",
    };
  }

  const authorizedLocations = await getAuthorizedLocationsForUser(vendorId, userId);

  // If geo-fences are configured but the employee has no authorized locations assigned
  if (authorizedLocations.length === 0) {
    return {
      allowed: false,
      matched_location: null,
      distance_meters: 0,
      note: "You are not assigned to any attendance location.",
    };
  }

  // Check distances to all authorized locations
  let closestLocation: (typeof authorizedLocations)[0] | null = null;
  let minDistance = Infinity;

  for (const loc of authorizedLocations) {
    const dist = calculateDistanceMeters(
      gps.latitude,
      gps.longitude,
      loc.latitude,
      loc.longitude
    );
    if (dist < minDistance) {
      minDistance = dist;
      closestLocation = loc;
    }
    // Check if within allowed radius
    if (dist <= loc.radius_meters) {
      return {
        allowed: true,
        matched_location: loc,
        distance_meters: dist,
        note: `Within ${loc.name} geo-fence (${dist}m / ${loc.radius_meters}m).`,
      };
    }
  }

  // Outside all permitted locations
  return {
    allowed: false,
    matched_location: closestLocation,
    distance_meters: minDistance,
    note: closestLocation
      ? `You are ${minDistance}m away from ${closestLocation.name}. Allowed radius is ${closestLocation.radius_meters}m.`
      : "You are outside permitted attendance locations.",
  };
}

