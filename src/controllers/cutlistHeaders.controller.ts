import { Request, Response } from "express";
import { prisma } from "../prisma/client";
import { CUTLIST_HEADER_FIELDS, CUTLIST_HEADER_FIELD_KEYS, normalizeCutlistHeader, validateHeaderMappings } from "../utils/cutlist-headers";

const CUTLIST_FIELD_META = new Map<string, (typeof CUTLIST_HEADER_FIELDS)[number]>(CUTLIST_HEADER_FIELDS.map((field) => [field.field, field]));

async function getActiveCutlistFields() {
  const ruleFields = await prisma.ruleFieldMaster.findMany({
    where: { field_key: { in: CUTLIST_HEADER_FIELD_KEYS as unknown as string[] }, status: "ACTIVE" },
    orderBy: { id: "asc" },
  });
  return ruleFields.map((ruleField) => ({
    id: ruleField.id,
    field_key: ruleField.field_key,
    label: ruleField.field_name,
    required: CUTLIST_FIELD_META.get(ruleField.field_key)?.required ?? false,
    aliases: CUTLIST_FIELD_META.get(ruleField.field_key)?.aliases ?? [],
  }));
}

async function checkAccess(req: Request, write: boolean) {
  const vendorId = Number(req.params.vendor_id);
  if (!Number.isSafeInteger(vendorId) || vendorId <= 0) throw Object.assign(new Error("Invalid vendor_id"), { statusCode: 400 });
  const actor = (req as any).user;
  const role = String(actor?.user_type ?? "").toLowerCase();
  const master = ["master-admin", "master", "vloq master", "masteradmin", "master_admin"].includes(role);
  if (!master && (actor?.vendor_id !== vendorId || (write && !["admin", "super-admin"].includes(role)))) {
    throw Object.assign(new Error("Vendor access denied"), { statusCode: 403 });
  }
  const vendor = await prisma.vendorMaster.findUnique({ where: { id: vendorId }, select: { id: true } });
  if (!vendor) throw Object.assign(new Error("Vendor not found"), { statusCode: 404 });
  return vendorId;
}

export async function getCutlistHeaders(req: Request, res: Response) {
  try {
    const vendorId = await checkAccess(req, false);
    const [fields, mappings] = await Promise.all([
      getActiveCutlistFields(),
      prisma.cutlistHeadersMapping.findMany({ where: { vendor_id: vendorId }, orderBy: { id: "asc" } }),
    ]);
    return res.json({ success: true, data: { fields, mappings } });
  } catch (error: any) {
    return res.status(error.statusCode || 500).json({ success: false, message: error.statusCode ? error.message : "Unable to load cutlist header mappings." });
  }
}

export async function saveCutlistHeaders(req: Request, res: Response) {
  try {
    const vendorId = await checkAccess(req, true);
    const allowedFields = await prisma.ruleFieldMaster.findMany({
      where: { field_key: { in: CUTLIST_HEADER_FIELD_KEYS as unknown as string[] }, status: "ACTIVE" },
      select: { id: true, field_key: true },
    });
    const mappings = validateHeaderMappings(req.body.mappings, allowedFields);
    const saved = await prisma.$transaction(async (tx) => {
      // Serialize replacement so simultaneous saves cannot merge two configurations.
      await tx.$queryRaw`SELECT id FROM "VendorMaster" WHERE id = ${vendorId} FOR UPDATE`;
      await tx.cutlistHeadersMapping.deleteMany({ where: { vendor_id: vendorId } });
      if (mappings.length) await tx.cutlistHeadersMapping.createMany({ data: mappings.map((mapping) => ({ ...mapping, vendor_id: vendorId, normalized_header: normalizeCutlistHeader(mapping.source_header) })) });
      return tx.cutlistHeadersMapping.findMany({ where: { vendor_id: vendorId }, orderBy: { id: "asc" } });
    });
    const fields = await getActiveCutlistFields();
    return res.json({ success: true, data: { fields, mappings: saved } });
  } catch (error: any) {
    return res.status(error.statusCode || 500).json({ success: false, message: error.statusCode ? error.message : "Unable to save cutlist header mappings." });
  }
}
