import { randomUUID } from "node:crypto";
import { FabricationType } from "../../../prisma/generated";
import { prisma } from "../../../prisma/client";
import logger from "../../../utils/logger";
import {
  generateSignedUrl,
  uploadToWasabiMetalCutlistImage,
} from "../../../utils/wasabiClient";

export type MetalCutlistPartInput = {
  part_name: string;
  length: number;
  width: number;
  qty: number;
  /** Index into the uploaded `images` files, or null when the part has no thumbnail. */
  image_index: number | null;
};

export class MetalCutlistError extends Error {
  constructor(message: string, public statusCode: number) {
    super(message);
  }
}

const MAX_PARTS = 1000;

/** The latest active Track & Trace project linked to the lead. */
const findLeadProject = (vendorId: number, leadId: number) =>
  prisma.projectMaster.findFirst({
    where: { vendor_id: vendorId, lead_id: leadId, isDeleted: false },
    orderBy: { id: "desc" },
    select: { id: true, unique_project_id: true, project_name: true },
  });

export const validateMetalCutlistParts = (
  value: unknown,
  imageCount: number,
): MetalCutlistPartInput[] => {
  if (!Array.isArray(value) || value.length === 0) {
    throw new MetalCutlistError("parts must be a non-empty array", 400);
  }
  if (value.length > MAX_PARTS) {
    throw new MetalCutlistError(`A Metalwork Cutlist can have at most ${MAX_PARTS} parts`, 400);
  }

  return value.map((raw, index) => {
    const row = `Row ${index + 1}`;
    const partName = typeof raw?.part_name === "string" ? raw.part_name.trim() : "";
    const length = Number(raw?.length);
    const width = Number(raw?.width);
    const qty = Number(raw?.qty);
    const imageIndex = raw?.image_index ?? null;

    if (!partName || partName.length > 255) {
      throw new MetalCutlistError(`${row}: part name is required (max 255 characters)`, 400);
    }
    if (!(length > 0) || !(width > 0) || !Number.isFinite(length) || !Number.isFinite(width)) {
      throw new MetalCutlistError(`${row}: size must be positive numbers`, 400);
    }
    if (!Number.isSafeInteger(qty) || qty < 1) {
      throw new MetalCutlistError(`${row}: quantity must be a whole number of at least 1`, 400);
    }
    if (imageIndex !== null && (!Number.isSafeInteger(imageIndex) || imageIndex < 0 || imageIndex >= imageCount)) {
      throw new MetalCutlistError(`${row}: image reference is invalid`, 400);
    }

    return { part_name: partName, length, width, qty, image_index: imageIndex };
  });
};

export class MetalCutlistService {
  async getMetalCutlist(vendorId: number, leadId: number) {
    const project = await findLeadProject(vendorId, leadId);
    if (!project) return { project: null, rows: [] };

    const rows = await prisma.cutList.findMany({
      where: {
        vendor_id: vendorId,
        project_id: project.id,
        fabrication: FabricationType.METALWORK,
      },
      orderBy: { id: "asc" },
      select: {
        id: true,
        item_name: true,
        length: true,
        width: true,
        qty: true,
        unique_code: true,
        image_key: true,
        created_at: true,
      },
    });

    return {
      project,
      rows: await Promise.all(
        rows.map(async ({ image_key, length, width, ...row }) => ({
          ...row,
          length: length === null ? null : Number(length),
          width: width === null ? null : Number(width),
          image_url: image_key ? await generateSignedUrl(image_key) : null,
        })),
      ),
    };
  }

  /** Replaces the project's Metalwork Cutlist with the given parts. */
  async saveMetalCutlist(
    vendorId: number,
    leadId: number,
    createdBy: number,
    parts: MetalCutlistPartInput[],
    images: Express.Multer.File[],
  ) {
    const user = await prisma.userMaster.findFirst({
      where: { id: createdBy, vendor_id: vendorId },
      select: { id: true },
    });
    if (!user) throw new MetalCutlistError("Invalid created_by for this vendor", 400);

    const lead = await prisma.leadMaster.findFirst({
      where: { id: leadId, vendor_id: vendorId },
      select: { id: true, lead_code: true, firstname: true, lastname: true, contact_no: true, site_address: true },
    });
    if (!lead) throw new MetalCutlistError("Invalid lead_id for this vendor", 400);

    const result = await prisma.$transaction(async (tx) => {
      // Serialize Metalwork submissions for this lead to avoid duplicate projects.
      await tx.$queryRaw`SELECT id FROM "LeadMaster" WHERE id = ${leadId} AND vendor_id = ${vendorId} FOR UPDATE`;
      const existingProject = await tx.projectMaster.findFirst({
        where: { vendor_id: vendorId, lead_id: leadId, isDeleted: false },
        orderBy: { id: "desc" },
        select: { id: true, unique_project_id: true, project_name: true },
      });
      const project = existingProject ?? await tx.projectMaster.create({
        data: {
          project_name: `Pre-Production Import - Lead #${leadId}`,
          unique_project_id: randomUUID(),
          vendor_id: vendorId,
          lead_id: leadId,
          created_by: createdBy,
          order_no: lead.lead_code,
          client_name: [lead.firstname, lead.lastname].filter(Boolean).join(" ").trim(),
          client_address: lead.site_address,
          client_contact_no: lead.contact_no,
        },
        select: { id: true, unique_project_id: true, project_name: true },
      });
      const existingWhere = {
        vendor_id: vendorId,
        project_id: project.id,
        fabrication: FabricationType.METALWORK,
      };

      // Rows already in production must not be silently replaced.
      const inUse = await tx.cutList.count({
        where: {
          ...existingWhere,
          OR: [{ cutListMachineMapping: { some: {} } }, { defectedItems: { some: {} } }],
        },
      });
      if (inUse > 0) {
        throw new MetalCutlistError(
          "The existing Metalwork Cutlist is already in production and cannot be replaced.",
          409,
        );
      }

      const imageKeys = await Promise.all(
        images.map((image) =>
          uploadToWasabiMetalCutlistImage(image.buffer, vendorId, leadId, project.id),
        ),
      );

      const { count: replaced } = await tx.cutList.deleteMany({ where: existingWhere });

      const created = await tx.cutList.createManyAndReturn({
        data: parts.map((part) => ({
          project_id: project.id,
          vendor_id: vendorId,
          lead_id: leadId,
          description: part.part_name,
          item_name: part.part_name,
          length: part.length,
          width: part.width,
          qty: part.qty,
          material_details: "",
          status: "Active",
          created_by: createdBy,
          fabrication: FabricationType.METALWORK,
          image_key: part.image_index === null ? null : imageKeys[part.image_index],
        })),
        select: { id: true },
      });

      // Same convention as the Excel import: without a barcode, the row id is the unique code.
      await Promise.all(
        created.map(({ id }) =>
          tx.cutList.update({ where: { id }, data: { unique_code: String(id) } }),
        ),
      );

      return { project, projectCreated: !existingProject, replaced, created: created.length };
    }, { timeout: 30000 });

    logger.info("Metalwork Cutlist saved", {
      vendorId,
      leadId,
      projectId: result.project.id,
      ...result,
      images: images.length,
    });

    return result;
  }
}
