import { prisma } from "../../../prisma/client";

export interface CHSMappingItem {
  carcass_type_id?: number | null;
  shutter_type_id?: number | null;
  shutter_sub_type_id?: number | null;
  handle_type_id?: number | null;
}

export class CHSSelectionTypeMappingService {
  private static usesKitchenManufacturingDays(
    productMappings: { productType: { type: string } }[],
  ) {
    return productMappings.some((mapping) => {
      const productType = mapping.productType.type.toLowerCase();
      return (
        productType.includes("kitchen") || productType.includes("small order")
      );
    });
  }

  private static async resolveTimelineDayFieldConfig(
    db: typeof prisma,
    leadId: number,
  ) {
    const [lead, productMappings] = await Promise.all([
      db.leadMaster.findUnique({
        where: { id: leadId },
        select: { is_fast_production: true },
      }),
      db.leadProductMapping.findMany({
        where: { lead_id: leadId },
        select: { productType: { select: { type: true } } },
      }),
    ]);

    return {
      isFastProductionLead: lead?.is_fast_production === true,
      usesKitchenManufacturingDays:
        CHSSelectionTypeMappingService.usesKitchenManufacturingDays(
          productMappings,
        ),
    };
  }

  private static pickTimelineDays(
    rule: {
      kitchen_manufacturing_days: number;
      other_manufacturing_days: number;
      kitchen_manufacturing_days_for_fast_production: number | null;
      other_manufacturing_days_for_fast_production: number | null;
    },
    config: {
      isFastProductionLead: boolean;
      usesKitchenManufacturingDays: boolean;
    },
  ) {
    if (config.isFastProductionLead) {
      const fastDays = config.usesKitchenManufacturingDays
        ? rule.kitchen_manufacturing_days_for_fast_production
        : rule.other_manufacturing_days_for_fast_production;

      if (fastDays != null) {
        return fastDays;
      }
    }

    return config.usesKitchenManufacturingDays
      ? rule.kitchen_manufacturing_days
      : rule.other_manufacturing_days;
  }

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
    await CHSSelectionTypeMappingService.recomputeAndPersistManufacturingDays(
      data.lead_id,
      data.vendor_id,
    );

    return result;
  }

  /**
   * GET — manufacturing days grouped by product_structure_instance_id.
   * For each instance, collects all distinct carcass + shutter IDs from its
   * CHS mappings, builds a Cartesian product, looks up TimelineRule, and
   * returns the maximum days (kitchen or other, based on lead product type).
   */
  public static async getManufacturingDaysByInstance(
    vendorId: number,
    leadId: number,
  ): Promise<{ instance_id: number | null; max_days: number | null }[]> {
    const timelineConfig =
      await CHSSelectionTypeMappingService.resolveTimelineDayFieldConfig(
        prisma,
        leadId,
      );

    // 2. Get all CHS mappings with their selection's instance_id
    const chsMappings = await prisma.cHSSelectionTypeMapping.findMany({
      where: { lead_id: leadId },
      select: {
        carcass_type_id: true,
        shutter_type_id: true,
        selection: { select: { product_structure_instance_id: true } },
      },
    });

    // 3. Group by instance_id
    const byInstance = new Map<
      number | null,
      { carcassIds: Set<number>; shutterIds: Set<number> }
    >();

    for (const m of chsMappings) {
      const instanceId = m.selection.product_structure_instance_id ?? null;
      if (!byInstance.has(instanceId)) {
        byInstance.set(instanceId, {
          carcassIds: new Set(),
          shutterIds: new Set(),
        });
      }
      const group = byInstance.get(instanceId)!;
      if (m.carcass_type_id) group.carcassIds.add(m.carcass_type_id);
      if (m.shutter_type_id) group.shutterIds.add(m.shutter_type_id);
    }

    // 4. Compute max days per instance via Cartesian product
    const result: { instance_id: number | null; max_days: number | null }[] =
      [];

    for (const [instanceId, { carcassIds, shutterIds }] of byInstance) {
      let maxDays = 0;

      for (const carcassId of carcassIds) {
        for (const shutterId of shutterIds) {
          const rule = await prisma.timelineRule.findUnique({
            where: {
              vendor_id_carcass_id_shutter_id: {
                vendor_id: vendorId,
                carcass_id: carcassId,
                shutter_id: shutterId,
              },
            },
            select: {
              kitchen_manufacturing_days: true,
              other_manufacturing_days: true,
              kitchen_manufacturing_days_for_fast_production: true,
              other_manufacturing_days_for_fast_production: true,
            },
          });
          if (rule) {
            const days = CHSSelectionTypeMappingService.pickTimelineDays(
              rule,
              timelineConfig,
            );
            if (days > maxDays) maxDays = days;
          }
        }
      }

      result.push({
        instance_id: instanceId,
        max_days: maxDays > 0 ? maxDays : null,
      });
    }

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

    await CHSSelectionTypeMappingService.recomputeAndPersistManufacturingDays(
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
   *  1. Check if any product mapped to this lead has "kitchen" or "small order"
   *     in its type name.
   *  2. For every distinct (carcass_type_id, shutter_type_id) pair in
   *     chs_selection_type_mapping for the lead, look up the matching TimelineRule.
   *  3. Pick kitchen_manufacturing_days or other_manufacturing_days based on step 1.
   *  4. Take the maximum days and persist it to LeadMaster.
   */
  public static async recomputeAndPersistManufacturingDays(
    leadId: number,
    vendorId: number,
    db: typeof prisma = prisma,
  ) {
    const timelineConfig =
      await CHSSelectionTypeMappingService.resolveTimelineDayFieldConfig(
        db,
        leadId,
      );

    // 2. Collect all distinct carcass IDs and shutter IDs stored for this lead.
    //    Each selection type (Carcas / Shutter / Handles) is saved as a separate
    //    row so no single row has both fields set. We build a Cartesian product.
    const chsMappings = await db.cHSSelectionTypeMapping.findMany({
      where: { lead_id: leadId },
      select: { carcass_type_id: true, shutter_type_id: true },
    });

    const carcassIds = [
      ...new Set(
        chsMappings
          .map((m) => m.carcass_type_id)
          .filter((id): id is number => id != null),
      ),
    ];
    const shutterIds = [
      ...new Set(
        chsMappings
          .map((m) => m.shutter_type_id)
          .filter((id): id is number => id != null),
      ),
    ];

    let maxDays = 0;

    // Cartesian product: every carcass × every shutter combination
    for (const carcassId of carcassIds) {
      for (const shutterId of shutterIds) {
        const rule = await db.timelineRule.findUnique({
          where: {
            vendor_id_carcass_id_shutter_id: {
              vendor_id: vendorId,
              carcass_id: carcassId,
              shutter_id: shutterId,
            },
          },
          select: {
            kitchen_manufacturing_days: true,
            other_manufacturing_days: true,
            kitchen_manufacturing_days_for_fast_production: true,
            other_manufacturing_days_for_fast_production: true,
          },
        });

        if (rule) {
          const days = CHSSelectionTypeMappingService.pickTimelineDays(
            rule,
            timelineConfig,
          );
          if (days > maxDays) maxDays = days;
        }
      }
    }

    // 3. Persist — null if no valid combinations found
    await db.leadMaster.update({
      where: { id: leadId },
      data: {
        total_required_chs_manufacturing_days: maxDays > 0 ? maxDays : null,
      },
    });
  }
}
