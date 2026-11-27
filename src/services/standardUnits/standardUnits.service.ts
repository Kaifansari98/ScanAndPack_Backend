import { prisma, Prisma } from "../../prisma/client";

// Standard units for inventory (Masters Management → Inventory Masters → Unit
// Conversions): per-vendor unit classes, their units (one base unit per class)
// and unit relations within a class, e.g. 1 Mtr = 100 CM.

export class UnitError extends Error {
  constructor(message: string, public statusCode = 400) {
    super(message);
  }
}

export interface UnitActor {
  vendorId: number;
  userId: number;
}

// Defaults every vendor starts with (also in scripts/seed-standard-units.sql).
const DEFAULT_CLASSES: { name: string; units: string[] }[] = [
  { name: "Length", units: ["Mtr", "CM", "mm", "Ft", "Inch"] },
  { name: "Area", units: ["Sq.M", "Sq.cm", "Sq.mm", "Sq.Ft", "Sq.In"] },
  { name: "Volume", units: ["Cu.M", "cc", "Ltr", "CFT"] },
  { name: "Weight", units: ["MTon", "Kg", "Gram"] },
  { name: "Quantity", units: ["Nos", "Pair"] },
  { name: "Packing", units: ["Set", "Pack"] },
];
const DEFAULT_RELATIONS: [string, number, string][] = [
  ["Mtr", 100, "CM"],
  ["Mtr", 1000, "mm"],
  ["Mtr", 3.28084, "Ft"],
  ["Mtr", 39.3701, "Inch"],
  ["Sq.M", 10000, "Sq.cm"],
  ["Sq.M", 1000000, "Sq.mm"],
  ["Sq.M", 10.764, "Sq.Ft"],
  ["Sq.M", 1550.003, "Sq.In"],
  ["Cu.M", 35.315, "CFT"],
  ["Cu.M", 1000000, "cc"],
  ["Cu.M", 1000, "Ltr"],
  ["MTon", 1000, "Kg"],
  ["MTon", 1000000, "Gram"],
  ["Pair", 2, "Nos"],
];

/** Gives a vendor the default classes, units and relations the first time they open the page. */
async function ensureDefaults(actor: UnitActor) {
  if (await prisma.standardUnitClass.count({ where: { vendor_id: actor.vendorId } })) return;
  await prisma.$transaction(async (tx) => {
    const ids = new Map<string, { id: number; classId: number }>();
    for (const [i, c] of DEFAULT_CLASSES.entries()) {
      const unitClass = await tx.standardUnitClass.create({
        data: { vendor_id: actor.vendorId, name: c.name, sort_order: i + 1, created_by: actor.userId },
      });
      for (const [j, name] of c.units.entries()) {
        const unit = await tx.standardUnit.create({
          data: {
            vendor_id: actor.vendorId,
            unit_class_id: unitClass.id,
            name,
            is_base: j === 0,
            sort_order: j + 1,
            created_by: actor.userId,
          },
        });
        ids.set(name, { id: unit.id, classId: unitClass.id });
      }
    }
    await tx.standardUnitRelation.createMany({
      data: DEFAULT_RELATIONS.map(([from, qty, to]) => ({
        vendor_id: actor.vendorId,
        unit_class_id: ids.get(from)!.classId,
        from_unit_id: ids.get(from)!.id,
        from_qty: 1,
        to_unit_id: ids.get(to)!.id,
        to_qty: qty,
        created_by: actor.userId,
      })),
    });
  });
}

/* --------------------------------- Inputs --------------------------------- */

function nameOf(value: unknown, label: string, max: number) {
  if (typeof value !== "string" || !value.trim()) throw new UnitError(`${label} is required.`);
  const name = value.trim().replace(/\s+/g, " ");
  if (name.length > max) throw new UnitError(`${label} must be at most ${max} characters.`);
  return name;
}

function idOf(value: unknown, label: string) {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw new UnitError(`Select the ${label}.`);
  return id;
}

function qtyOf(value: unknown, label: string) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0 || n >= 1e18) throw new UnitError(`${label} must be a number greater than 0.`);
  if (Math.abs(n * 1e6 - Math.round(n * 1e6)) > 1e-3) throw new UnitError(`${label} can have up to 6 decimals.`);
  return n;
}

const duplicate = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";

async function classOf(actor: UnitActor, id: number) {
  const unitClass = await prisma.standardUnitClass.findFirst({ where: { id, vendor_id: actor.vendorId } });
  if (!unitClass) throw new UnitError("Unit class not found.", 404);
  return unitClass;
}

async function unitOf(actor: UnitActor, id: number) {
  const unit = await prisma.standardUnit.findFirst({ where: { id, vendor_id: actor.vendorId } });
  if (!unit) throw new UnitError("Unit not found.", 404);
  return unit;
}

/** Case-insensitive name clash within the vendor. */
async function nameTaken(
  table: "class" | "unit",
  actor: UnitActor,
  name: string,
  exceptId?: number,
) {
  const where = { vendor_id: actor.vendorId, name: { equals: name, mode: "insensitive" as const }, ...(exceptId ? { id: { not: exceptId } } : {}) };
  const count =
    table === "class" ? await prisma.standardUnitClass.count({ where }) : await prisma.standardUnit.count({ where });
  if (count) throw new UnitError(`“${name}” already exists.`, 409);
}

/* ---------------------------------- Read ---------------------------------- */

export async function getStandardUnits(actor: UnitActor) {
  await ensureDefaults(actor);
  const [classes, units, relations] = await Promise.all([
    prisma.standardUnitClass.findMany({
      where: { vendor_id: actor.vendorId },
      orderBy: [{ sort_order: "asc" }, { id: "asc" }],
      select: { id: true, name: true, sort_order: true, is_active: true },
    }),
    prisma.standardUnit.findMany({
      where: { vendor_id: actor.vendorId },
      orderBy: [{ sort_order: "asc" }, { id: "asc" }],
      select: { id: true, unit_class_id: true, name: true, is_base: true, sort_order: true, is_active: true },
    }),
    prisma.standardUnitRelation.findMany({
      where: { vendor_id: actor.vendorId },
      orderBy: { id: "asc" },
      select: { id: true, unit_class_id: true, from_unit_id: true, from_qty: true, to_unit_id: true, to_qty: true, is_active: true },
    }),
  ]);
  return {
    classes,
    units,
    relations: relations.map((r) => ({ ...r, from_qty: Number(r.from_qty), to_qty: Number(r.to_qty) })),
  };
}

/* --------------------------------- Classes -------------------------------- */

export async function createClass(actor: UnitActor, body: Record<string, unknown>) {
  const name = nameOf(body.name, "Unit class", 100);
  await nameTaken("class", actor, name);
  const last = await prisma.standardUnitClass.aggregate({ where: { vendor_id: actor.vendorId }, _max: { sort_order: true } });
  try {
    return await prisma.standardUnitClass.create({
      data: { vendor_id: actor.vendorId, name, sort_order: (last._max.sort_order ?? 0) + 1, created_by: actor.userId },
    });
  } catch (error) {
    if (duplicate(error)) throw new UnitError(`“${name}” already exists.`, 409);
    throw error;
  }
}

export async function updateClass(actor: UnitActor, id: number, body: Record<string, unknown>) {
  await classOf(actor, id);
  const name = nameOf(body.name, "Unit class", 100);
  await nameTaken("class", actor, name, id);
  return prisma.standardUnitClass.update({ where: { id }, data: { name, updated_by: actor.userId } });
}

export async function deleteClass(actor: UnitActor, id: number) {
  await classOf(actor, id);
  const units = await prisma.standardUnit.count({ where: { unit_class_id: id } });
  if (units) throw new UnitError("Delete or move this class's units first.", 409);
  await prisma.standardUnitClass.delete({ where: { id } });
  return { id };
}

/* ---------------------------------- Units --------------------------------- */

export async function createUnit(actor: UnitActor, body: Record<string, unknown>) {
  const name = nameOf(body.name, "Unit", 50);
  const classId = idOf(body.unit_class_id, "unit class");
  await classOf(actor, classId);
  await nameTaken("unit", actor, name);
  const [last, base] = await Promise.all([
    prisma.standardUnit.aggregate({ where: { unit_class_id: classId }, _max: { sort_order: true } }),
    prisma.standardUnit.count({ where: { unit_class_id: classId, is_base: true } }),
  ]);
  // The first unit of a class is its base unit unless another is chosen.
  const isBase = body.is_base === true || base === 0;
  return prisma.$transaction(async (tx) => {
    if (isBase) await tx.standardUnit.updateMany({ where: { unit_class_id: classId, is_base: true }, data: { is_base: false } });
    return tx.standardUnit.create({
      data: {
        vendor_id: actor.vendorId,
        unit_class_id: classId,
        name,
        is_base: isBase,
        sort_order: (last._max.sort_order ?? 0) + 1,
        created_by: actor.userId,
      },
    });
  });
}

export async function updateUnit(actor: UnitActor, id: number, body: Record<string, unknown>) {
  const unit = await unitOf(actor, id);
  const name = body.name === undefined ? unit.name : nameOf(body.name, "Unit", 50);
  const classId = body.unit_class_id === undefined ? unit.unit_class_id : idOf(body.unit_class_id, "unit class");
  if (classId !== unit.unit_class_id) {
    await classOf(actor, classId);
    const relations = await prisma.standardUnitRelation.count({
      where: { OR: [{ from_unit_id: id }, { to_unit_id: id }] },
    });
    if (relations) throw new UnitError("Remove this unit's relations before moving it to another class.", 409);
  }
  if (name !== unit.name) await nameTaken("unit", actor, name, id);
  const makeBase = body.is_base === true;
  if (body.is_base === false && unit.is_base && classId === unit.unit_class_id)
    throw new UnitError("Choose another unit as the base unit instead.", 409);
  return prisma.$transaction(async (tx) => {
    if (makeBase) await tx.standardUnit.updateMany({ where: { unit_class_id: classId, is_base: true, id: { not: id } }, data: { is_base: false } });
    return tx.standardUnit.update({
      where: { id },
      data: {
        name,
        unit_class_id: classId,
        // A unit moved to another class stops being the old class's base.
        is_base: makeBase || (unit.is_base && classId === unit.unit_class_id),
        updated_by: actor.userId,
      },
    });
  });
}

export async function deleteUnit(actor: UnitActor, id: number) {
  const unit = await unitOf(actor, id);
  if (unit.is_base) {
    const others = await prisma.standardUnit.count({ where: { unit_class_id: unit.unit_class_id, id: { not: id } } });
    if (others) throw new UnitError("This is the base unit. Make another unit the base first.", 409);
  }
  // Its relations go with it.
  await prisma.standardUnit.delete({ where: { id } });
  return { id };
}

/* -------------------------------- Relations ------------------------------- */

async function relationInput(actor: UnitActor, body: Record<string, unknown>, exceptId?: number) {
  const fromId = idOf(body.from_unit_id, "unit");
  const toId = idOf(body.to_unit_id, "unit it equals");
  if (fromId === toId) throw new UnitError("Pick two different units.");
  const [from, to] = await Promise.all([unitOf(actor, fromId), unitOf(actor, toId)]);
  if (from.unit_class_id !== to.unit_class_id) throw new UnitError("Both units must be in the same unit class.");
  const fromQty = body.from_qty === undefined ? 1 : qtyOf(body.from_qty, "Quantity");
  const toQty = qtyOf(body.to_qty, "Value");
  // One relation per pair of units, whichever way round.
  const clash = await prisma.standardUnitRelation.count({
    where: {
      vendor_id: actor.vendorId,
      ...(exceptId ? { id: { not: exceptId } } : {}),
      OR: [
        { from_unit_id: fromId, to_unit_id: toId },
        { from_unit_id: toId, to_unit_id: fromId },
      ],
    },
  });
  if (clash) throw new UnitError(`A relation between ${from.name} and ${to.name} already exists.`, 409);
  return { unit_class_id: from.unit_class_id, from_unit_id: fromId, from_qty: fromQty, to_unit_id: toId, to_qty: toQty };
}

const relationOut = <T extends { from_qty: Prisma.Decimal; to_qty: Prisma.Decimal }>(r: T) => ({
  ...r,
  from_qty: Number(r.from_qty),
  to_qty: Number(r.to_qty),
});

export async function createRelation(actor: UnitActor, body: Record<string, unknown>) {
  const data = await relationInput(actor, body);
  return relationOut(
    await prisma.standardUnitRelation.create({ data: { vendor_id: actor.vendorId, ...data, created_by: actor.userId } }),
  );
}

export async function updateRelation(actor: UnitActor, id: number, body: Record<string, unknown>) {
  const existing = await prisma.standardUnitRelation.findFirst({ where: { id, vendor_id: actor.vendorId } });
  if (!existing) throw new UnitError("Relation not found.", 404);
  const data = await relationInput(actor, body, id);
  return relationOut(await prisma.standardUnitRelation.update({ where: { id }, data: { ...data, updated_by: actor.userId } }));
}

export async function deleteRelation(actor: UnitActor, id: number) {
  const existing = await prisma.standardUnitRelation.findFirst({ where: { id, vendor_id: actor.vendorId } });
  if (!existing) throw new UnitError("Relation not found.", 404);
  await prisma.standardUnitRelation.delete({ where: { id } });
  return { id };
}

/* ----------------------------- Category units ----------------------------- */

// Purchase, stock and consumption units of a category (or sub-category). Each
// comes from a different unit class; count classes (Quantity, Packing) are
// allowed for the purchase unit only.
const CATEGORY_UNIT_ROLES = [
  { key: "purchase_unit_id", label: "Purchase unit", countAllowed: true },
  { key: "stock_unit_id", label: "Stock unit", countAllowed: false },
  { key: "consumption_unit_id", label: "Consumption unit", countAllowed: false },
] as const;
const COUNT_CLASSES = new Set(["quantity", "packing"]);

const categoryUnitSelect = {
  category_id: true,
  purchase_unit_id: true,
  stock_unit_id: true,
  consumption_unit_id: true,
} as const;

export async function getCategoryUnits(actor: UnitActor) {
  return prisma.categoryUnitSetting.findMany({
    where: { vendor_id: actor.vendorId },
    select: categoryUnitSelect,
  });
}

export async function saveCategoryUnits(actor: UnitActor, categoryId: number, body: Record<string, unknown>) {
  const category = await prisma.projectCategoriesMaster.findFirst({
    where: { id: categoryId, vendor_id: actor.vendorId },
    select: { id: true },
  });
  if (!category) throw new UnitError("Category not found.", 404);

  const ids = CATEGORY_UNIT_ROLES.map((role) => {
    const value = body[role.key];
    return value === null || value === undefined || value === "" ? null : idOf(value, role.label.toLowerCase());
  });
  const chosen = ids.filter((id): id is number => id !== null);
  const units = await prisma.standardUnit.findMany({
    where: { id: { in: chosen }, vendor_id: actor.vendorId },
    select: { id: true, unitClass: { select: { id: true, name: true } } },
  });
  const usedClasses = new Map<number, string>();
  CATEGORY_UNIT_ROLES.forEach((role, i) => {
    if (ids[i] === null) return;
    const unit = units.find((u) => u.id === ids[i]);
    if (!unit) throw new UnitError(`${role.label} not found.`, 404);
    if (!role.countAllowed && COUNT_CLASSES.has(unit.unitClass.name.toLowerCase()))
      throw new UnitError(`${role.label} can't be from the ${unit.unitClass.name} class.`);
    const takenBy = usedClasses.get(unit.unitClass.id);
    if (takenBy) throw new UnitError(`${role.label} must be from a different unit class than the ${takenBy.toLowerCase()}.`);
    usedClasses.set(unit.unitClass.id, role.label);
  });

  const data = {
    purchase_unit_id: ids[0],
    stock_unit_id: ids[1],
    consumption_unit_id: ids[2],
  };
  return prisma.categoryUnitSetting.upsert({
    where: { category_id: categoryId },
    create: { vendor_id: actor.vendorId, category_id: categoryId, ...data, created_by: actor.userId },
    update: { ...data, updated_by: actor.userId },
    select: categoryUnitSelect,
  });
}
