import { prisma } from "../../prisma/client";

// Inventory locations (Masters Management → Inventory Masters → Locations): a
// per-vendor tree Factory > Shed > Floor > Store > Rack > Shelf > Position.

export class LocationError extends Error {
  constructor(message: string, public statusCode = 400) {
    super(message);
  }
}

export interface LocationActor {
  vendorId: number;
  userId: number;
}

export const LOCATION_LEVELS = ["Factory", "Shed", "Floor", "Store", "Rack", "Shelf", "Position"] as const;

const select = { id: true, parent_id: true, level: true, name: true, sort_order: true, is_active: true } as const;

function nameOf(value: unknown) {
  if (typeof value !== "string" || !value.trim()) throw new LocationError("Name / number is required.");
  const name = value.trim().replace(/\s+/g, " ");
  if (name.length > 50) throw new LocationError("Name / number must be at most 50 characters.");
  return name;
}

async function locationOf(actor: LocationActor, id: number) {
  const location = await prisma.inventoryLocation.findFirst({ where: { id, vendor_id: actor.vendorId } });
  if (!location) throw new LocationError("Location not found.", 404);
  return location;
}

/** Names are unique among siblings (case-insensitive). */
async function nameTaken(actor: LocationActor, parentId: number | null, name: string, level: number, exceptId?: number) {
  const clash = await prisma.inventoryLocation.findFirst({
    where: {
      vendor_id: actor.vendorId,
      parent_id: parentId,
      name: { equals: name, mode: "insensitive" },
      ...(exceptId ? { id: { not: exceptId } } : {}),
    },
    select: { id: true },
  });
  if (clash) throw new LocationError(`${LOCATION_LEVELS[level - 1]} “${name}” already exists here.`, 409);
}

export async function listLocations(actor: LocationActor) {
  return prisma.inventoryLocation.findMany({
    where: { vendor_id: actor.vendorId },
    orderBy: [{ level: "asc" }, { sort_order: "asc" }, { id: "asc" }],
    select: { ...select, _count: { select: { products: true } } },
  });
}

export async function createLocation(actor: LocationActor, body: Record<string, unknown>) {
  const name = nameOf(body.name);
  let parentId: number | null = null;
  let level = 1;
  if (body.parent_id !== undefined && body.parent_id !== null && body.parent_id !== "") {
    parentId = Number(body.parent_id);
    if (!Number.isSafeInteger(parentId) || parentId <= 0) throw new LocationError("Invalid parent location.");
    const parent = await locationOf(actor, parentId);
    if (parent.level >= LOCATION_LEVELS.length) throw new LocationError("A position can't have anything under it.");
    level = parent.level + 1;
  }
  await nameTaken(actor, parentId, name, level);
  const last = await prisma.inventoryLocation.aggregate({
    where: { vendor_id: actor.vendorId, parent_id: parentId },
    _max: { sort_order: true },
  });
  return prisma.inventoryLocation.create({
    data: {
      vendor_id: actor.vendorId,
      parent_id: parentId,
      level,
      name,
      sort_order: (last._max.sort_order ?? 0) + 1,
      created_by: actor.userId,
    },
    select,
  });
}

export async function updateLocation(actor: LocationActor, id: number, body: Record<string, unknown>) {
  const location = await locationOf(actor, id);
  const name = body.name === undefined ? location.name : nameOf(body.name);
  if (name !== location.name) await nameTaken(actor, location.parent_id, name, location.level, id);
  return prisma.inventoryLocation.update({
    where: { id },
    data: {
      name,
      ...(typeof body.is_active === "boolean" ? { is_active: body.is_active } : {}),
      updated_by: actor.userId,
    },
    select,
  });
}

export async function deleteLocation(actor: LocationActor, id: number) {
  const location = await locationOf(actor, id);
  const [children, products] = await Promise.all([
    prisma.inventoryLocation.count({ where: { parent_id: id } }),
    prisma.productMaster.count({ where: { location_id: id } }),
  ]);
  const level = LOCATION_LEVELS[location.level - 1].toLowerCase();
  if (children) throw new LocationError(`Delete what's inside this ${level} first.`, 409);
  if (products)
    throw new LocationError(`${products} item${products === 1 ? " is" : "s are"} kept at this ${level}. Move ${products === 1 ? "it" : "them"} first.`, 409);
  await prisma.inventoryLocation.delete({ where: { id } });
  return { id };
}
