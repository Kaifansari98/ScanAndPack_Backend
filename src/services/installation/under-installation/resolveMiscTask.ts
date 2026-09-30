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

  if (matches.length === 0) return null;
  if (matches.length === 1) return matches[0];

  // If multiple entries match (e.g. duplicate material & problem in legacy format),
  // prioritize unresolved and approved entries instead of throwing an error.
  const unresolvedMatches = matches.filter((e) => !e.is_resolved);
  if (unresolvedMatches.length === 1) return unresolvedMatches[0];

  const approvedUnresolved = unresolvedMatches.filter((e) => e.misc_approved === true);
  if (approvedUnresolved.length > 0) return approvedUnresolved[0];

  return unresolvedMatches[0] ?? matches[0] ?? null;
}
