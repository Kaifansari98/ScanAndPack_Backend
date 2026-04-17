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

    if (data.items.length > 0) {
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
    }

    const result = await prisma.cHSSelectionTypeMapping.findMany({
      where: { selection_id: data.selection_id },
      include: {
        carcassType: { select: { id: true, name: true } },
        shutterType: { select: { id: true, name: true } },
        shutterSubType: { select: { id: true, name: true } },
        handleType: { select: { id: true, name: true } },
      },
    });

    // Always recompute — covers both new items and cleared selections
    await CHSSelectionTypeMappingService.computeAndSetManufacturingDays(
      data.lead_id,
      data.vendor_id,
    );

    return result;
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

    const updated = await prisma.cHSSelectionTypeMapping.update({
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

    await CHSSelectionTypeMappingService.computeAndSetManufacturingDays(
      existing.lead_id,
      existing.vendor_id,
    );

    return updated;
  }

  /**
   * Computes the maximum CHS manufacturing days across all carcass+shutter
   * combinations for the lead, then writes the result to LeadMaster.
   *
   * Logic:
   *  1. Check if any product mapped to this lead has "kitchen" in its type name.
   *  2. For every distinct (carcass_type_id, shutter_type_id) pair in
   *     chs_selection_type_mapping for the lead, look up the matching TimelineRule.
   *  3. Pick kitchen_manufacturing_days or other_manufacturing_days based on step 1.
   *  4. Take the maximum days and persist it to LeadMaster.
   */
  private static async computeAndSetManufacturingDays(
    leadId: number,
    vendorId: number,
  ) {
    // 1. Determine if any product for this lead is a "kitchen" type
    const productMappings = await prisma.leadProductMapping.findMany({
      where: { lead_id: leadId },
      select: { productType: { select: { type: true } } },
    });
    const isKitchen = productMappings.some((m) =>
      m.productType.type.toLowerCase().includes("kitchen"),
    );

    // 2. Get all distinct (carcass_type_id, shutter_type_id) pairs for the lead
    const chsMappings = await prisma.cHSSelectionTypeMapping.findMany({
      where: { lead_id: leadId },
      select: { carcass_type_id: true, shutter_type_id: true },
    });

    let maxDays = 0;
    const seen = new Set<string>();

    for (const m of chsMappings) {
      if (!m.carcass_type_id || !m.shutter_type_id) continue;
      const key = `${m.carcass_type_id}-${m.shutter_type_id}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const rule = await prisma.timelineRule.findUnique({
        where: {
          vendor_id_carcass_id_shutter_id: {
            vendor_id: vendorId,
            carcass_id: m.carcass_type_id,
            shutter_id: m.shutter_type_id,
          },
        },
        select: {
          kitchen_manufacturing_days: true,
          other_manufacturing_days: true,
        },
      });

      if (rule) {
        const days = isKitchen
          ? rule.kitchen_manufacturing_days
          : rule.other_manufacturing_days;
        if (days > maxDays) maxDays = days;
      }
    }

    // 3. Persist — null if no valid combinations found
    await prisma.leadMaster.update({
      where: { id: leadId },
      data: {
        total_required_chs_manufacturing_days: maxDays > 0 ? maxDays : null,
      },
    });
  }
}
