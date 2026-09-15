// Prefer the entry ID over legacy descriptions, which can repeat across entries.
export function findMiscProductionTask<T extends {
  task_type: string;
  remark: string | null;
}>(entry: {
  id: number;
  reorder_material_details: string | null;
  problem_description: string | null;
}, tasks: T[]): T | undefined {
  const productionTasks = tasks.filter((task) =>
    ["Miscellaneous", "Pending Materials"].includes(task.task_type) &&
    typeof task.remark === "string" &&
    !task.remark.includes("[misc-delivery:") &&
    !task.remark.includes("[misc-erd:") &&
    !task.remark.includes("Required delivery date set for"),
  );
  const linked = productionTasks.find((task) =>
    task.remark?.includes(`[misc:${entry.id}]`),
  );
  if (linked) return linked;

  const legacyRemarks = [
    `${entry.reorder_material_details} - ${entry.problem_description}`,
    `**${entry.reorder_material_details}** - ${entry.problem_description}`,
    ...(entry.reorder_material_details === "Pending Material"
      ? [entry.problem_description] : []),
  ];
  return productionTasks.find((task) =>
    !/\[misc(?:-delivery|-erd)?:\d+\]/.test(task.remark || "") &&
    legacyRemarks.includes(task.remark?.trim() ?? ""),
  );
}
