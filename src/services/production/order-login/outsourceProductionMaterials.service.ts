import { prisma } from "../../../prisma/client";
import { createLeadLog } from "../../../utils/leadDetailedLog";

const fail = (message: string, statusCode = 400): never => {
  throw Object.assign(new Error(message), { statusCode });
};

export async function outsourceProductionMaterials({ vendorId, leadId, userId, instanceId, materialIds }: {
  vendorId: number; leadId: number; userId: number; instanceId: number | null; materialIds: unknown;
}) {
  if (![vendorId, leadId, userId].every((id) => Number.isSafeInteger(id) && id > 0) ||
      (instanceId !== null && (!Number.isSafeInteger(instanceId) || instanceId <= 0))) {
    fail("Invalid lead, user, or instance.");
  }
  if (!Array.isArray(materialIds) || !materialIds.length || materialIds.length > 10000 ||
      materialIds.some((id) => typeof id !== "number" || !Number.isSafeInteger(id) || id <= 0)) {
    fail("Select valid saved material rows to outsource.");
  }
  const ids = [...new Set(materialIds as number[])];

  return prisma.$transaction(async (tx) => {
    // Share the import lock so a re-upload cannot replace rows during outsourcing.
    await tx.$queryRaw`SELECT id FROM "LeadMaster" WHERE id = ${leadId} AND vendor_id = ${vendorId} FOR UPDATE`;
    const [lead, user] = await Promise.all([
      tx.leadMaster.findFirst({ where: { id: leadId, vendor_id: vendorId }, include: {
        vendor: { select: { handlesLargeScaleProjects: true, is_inventory_enabled: true } },
        statusType: { select: { tag: true } },
      } }),
      tx.userMaster.findFirst({ where: { id: userId, vendor_id: vendorId }, include: { user_type: true } }),
    ]);
    if (!lead || !user) return fail("Lead or user not found.", 404);
    if (user.franchise_id && lead.franchise_id !== user.franchise_id) fail("Lead access denied.", 403);
    if (!lead.vendor.handlesLargeScaleProjects || !lead.vendor.is_inventory_enabled) fail("Required Production Materials is not enabled.");
    if (lead.is_blocked) fail("This lead is blocked.", 403);
    const instance = instanceId === null ? null : await tx.leadProductStructureInstance.findFirst({
      where: { id: instanceId, vendor_id: vendorId, lead_id: leadId },
    });
    if (instanceId !== null && !instance) fail("Product structure instance not found.", 404);
    const role = user.user_type.user_type.toLowerCase();
    const customAllowed = role === "custom" && await tx.userPrivilegeMapping.count({ where: {
      vendor_id: vendorId, user_id: userId, is_allowed: true,
      privilege: { code: "production.order_login.production_files.upload", is_active: true },
    } });
    const isOrderLoginStage = instance
      ? instance.is_tech_check_completed && !instance.is_order_login_completed
      : lead.statusType?.tag === "Type 9";
    if (!["admin", "super-admin"].includes(role) && !(role === "backend" && isOrderLoginStage) && !customAllowed) {
      fail("You don’t have permission to outsource materials.", 403);
    }
    const rows = await tx.productsRequiredForProduction.findMany({
      where: { id: { in: ids }, vendor_id: vendorId, lead_id: leadId, instance_id: instanceId },
      orderBy: { id: "asc" },
    });
    if (rows.length !== ids.length) fail("Some selected materials no longer exist in this lead and instance. Refresh and try again.", 404);
    if (!lead.account_id) return fail("The lead must have an account before outsourcing materials.");

    const outsourcedNames: string[] = [];
    for (const row of rows) {
      if (row.order_login_id !== null) continue;
      // Existing cards are keyed by title within an instance. Reuse one for repeated item names.
      let card = await tx.orderLoginDetails.findFirst({ where: {
        vendor_id: vendorId, lead_id: leadId, instance_id: instanceId, item_type: row.name,
      } });
      if (!card) card = await tx.orderLoginDetails.create({ data: {
        vendor_id: vendorId, lead_id: leadId, account_id: lead.account_id,
        instance_id: instanceId, item_type: row.name, item_desc: "", created_by: userId,
      } });
      await tx.productsRequiredForProduction.update({ where: { id: row.id }, data: { order_login_id: card.id } });
      outsourcedNames.push(row.name);
    }
    if (outsourcedNames.length) await createLeadLog(tx, {
      vendor_id: vendorId, lead_id: leadId, account_id: lead.account_id,
      action: `Materials outsourced: ${outsourcedNames.join(", ")}`,
      action_type: "CREATE", created_by: userId, instance_id: instanceId ?? undefined,
    });
    return { outsourced_count: outsourcedNames.length };
  }, { timeout: 30000 });
}
