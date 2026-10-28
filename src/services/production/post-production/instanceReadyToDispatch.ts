import { Prisma } from "../../../prisma/generated";

const fail = (message: string, statusCode = 400): never => {
  throw Object.assign(new Error(message), { statusCode });
};

// Caller locks the parent lead in the same transaction before reading its state.
export async function moveProductionInstanceToReady(
  tx: Prisma.TransactionClient,
  vendorId: number,
  leadId: number,
  instanceId: number | undefined,
  updatedBy: number,
  readyStatusId: number,
  leadStageTag: string,
) {
  if (!Number.isSafeInteger(instanceId) || !instanceId || instanceId < 1) {
    fail("Select an instance to move to Ready To Dispatch");
  }
  const instance = await tx.leadProductStructureInstance.findFirst({
    where: { id: instanceId, vendor_id: vendorId, lead_id: leadId, is_archived: false },
    include: { stageStatus: { select: { tag: true } } },
  });
  if (!instance) return fail("Instance not found for this lead and vendor", 404);
  if (instance.stage_status_id === readyStatusId) return { instance, changed: false };
  const currentTag = instance.stageStatus?.tag ?? leadStageTag;
  if (!["Type 8", "Type 9", "Type 10"].includes(currentTag)) {
    fail("This instance is not in Production", 409);
  }
  if (instance.status !== "open" || instance.is_tech_check_completed !== true ||
      instance.is_order_login_completed !== true || instance.is_production_completed !== true) {
    fail("Complete production for this instance before moving it to Ready To Dispatch", 409);
  }
  const productionStatus = await tx.statusTypeMaster.findFirst({
    where: { vendor_id: vendorId, tag: "Type 10" }, select: { id: true },
  });
  if (!productionStatus) return fail("Production status is not configured", 409);
  const updated = await tx.leadProductStructureInstance.update({
    where: { id: instance.id },
    data: { stage_status_id: readyStatusId, updated_by: updatedBy },
  });
  await tx.instanceStageHistory.create({
    data: { instance_id: instance.id, vendor_id: vendorId,
      from_status_id: productionStatus.id, to_status_id: readyStatusId, created_by: updatedBy },
  });
  return { instance: updated, changed: true };
}
