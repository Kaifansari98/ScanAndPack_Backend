import { prisma } from "../../../prisma/client";

export interface CHSMappingItem {
  carcass_type_id?: number | null;
  shutter_type_id?: number | null;
  shutter_sub_type_id?: number | null;
  handle_type_id?: number | null;
}

export class CHSSelectionTypeMappingService {
  /**
   * POST — replace all mappings for a given selection_id with a new set of items.
   */
  public static async upsert(data: {
    vendor_id: number;
    lead_id: number;
    selection_id: number;
    items: CHSMappingItem[];
    created_by: number;
  }) {
    // Verify the selection belongs to this lead/vendor
    const selection = await prisma.leadDesignSelection.findFirst({
      where: {
        id: data.selection_id,
        lead_id: data.lead_id,
        vendor_id: data.vendor_id,
      },
      select: { id: true },
    });
    if (!selection) {
      throw new Error("Selection not found or access denied");
    }

    // Delete existing mappings for this selection
    await prisma.cHSSelectionTypeMapping.deleteMany({
      where: { selection_id: data.selection_id },
    });

    if (data.items.length === 0) {
      return [];
    }

    // Create new mappings
    await prisma.cHSSelectionTypeMapping.createMany({
      data: data.items.map((item) => ({
        vendor_id: data.vendor_id,
        lead_id: data.lead_id,
        selection_id: data.selection_id,
        carcass_type_id: item.carcass_type_id ?? null,
        shutter_type_id: item.shutter_type_id ?? null,
        shutter_sub_type_id: item.shutter_sub_type_id ?? null,
        handle_type_id: item.handle_type_id ?? null,
        created_by: data.created_by,
      })),
    });

    return prisma.cHSSelectionTypeMapping.findMany({
      where: { selection_id: data.selection_id },
      include: {
        carcassType: { select: { id: true, name: true } },
        shutterType: { select: { id: true, name: true } },
        shutterSubType: { select: { id: true, name: true } },
        handleType: { select: { id: true, name: true } },
      },
    });
  }

  /**
   * GET — fetch all mappings for a lead, optionally filtered by selection_id.
   */
  public static async getByLead(
    vendorId: number,
    leadId: number,
    selectionId?: number,
  ) {
    return prisma.cHSSelectionTypeMapping.findMany({
      where: {
        vendor_id: vendorId,
        lead_id: leadId,
        ...(selectionId ? { selection_id: selectionId } : {}),
      },
      include: {
        carcassType: { select: { id: true, name: true } },
        shutterType: { select: { id: true, name: true } },
        shutterSubType: { select: { id: true, name: true } },
        handleType: { select: { id: true, name: true } },
        selection: { select: { id: true, type: true } },
      },
      orderBy: { id: "asc" },
    });
  }

  /**
   * PUT — update a single mapping record by id.
   */
  public static async updateById(
    id: number,
    data: {
      carcass_type_id?: number | null;
      shutter_type_id?: number | null;
      shutter_sub_type_id?: number | null;
      handle_type_id?: number | null;
      updated_by: number;
    },
  ) {
    const existing = await prisma.cHSSelectionTypeMapping.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new Error("Mapping not found");
    }

    return prisma.cHSSelectionTypeMapping.update({
      where: { id },
      data: {
        carcass_type_id: data.carcass_type_id,
        shutter_type_id: data.shutter_type_id,
        shutter_sub_type_id: data.shutter_sub_type_id,
        handle_type_id: data.handle_type_id,
        updated_by: data.updated_by,
      },
      include: {
        carcassType: { select: { id: true, name: true } },
        shutterType: { select: { id: true, name: true } },
        shutterSubType: { select: { id: true, name: true } },
        handleType: { select: { id: true, name: true } },
      },
    });
  }
}
