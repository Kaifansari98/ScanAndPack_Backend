import type { Prisma } from "../../../prisma/generated";

export async function resolveMiscTask(
  tx: Prisma.TransactionClient,
  vendor_id: number,
  task: { lead_id: number; remark: string | null },
) {
  const remark = task.remark ?? "";
  const marker = remark.match(
    /\[misc(?:-delivery|-erd|-pickup|-return-confirm|-return-handover)?:(\d+)\]/,
  );
  const select = {
    id: true,
    misc_approved: true,
    is_resolved: true,
    reorder_material_details: true,
    problem_description: true,
    return_order_delivery_method: true,
    created_by: true,
    lead_id: true,
    account_id: true,
  } as const;

  if (marker) {
    return tx.miscellaneousMaster.findFirst({
      where: { id: Number(marker[1]), vendor_id, lead_id: task.lead_id },
      select,
    });
  }

  // Match complete legacy remarks: splitting on hyphens corrupts material names.
  const entries = await tx.miscellaneousMaster.findMany({
    where: { vendor_id, lead_id: task.lead_id },
    select: { ...select, reorder_material_details: true, problem_description: true },
  });
  const matches = entries.filter((entry) => {
    const material = entry.reorder_material_details;
    const problem = entry.problem_description;
    return [
      `${material} - ${problem}`,
      `**${material}** - ${problem}`,
      `Required delivery date set for **${material}** - ${problem}`,
      ...(material === "Pending Material" ? [problem] : []),
    ].some((candidate) => candidate?.trim() === remark);
  });

  if (matches.length > 1) {
    throw new Error("Multiple miscellaneous entries match this task");
  }
  return matches[0] ?? null;
}
