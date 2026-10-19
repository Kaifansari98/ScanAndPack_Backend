import { CutListItemPayload, CutListRuleEngineService } from "./cutListRuleEngine.service";

type Machine = {
  id: number;
  machine_type_id: number | null;
  sequence_no: number | null;
};

// Return null for default vendors so their existing assignment logic stays intact.
// Load once per import, rather than once per item and machine.
export async function loadWoodworkMachineRules(
  configuration: string | null | undefined,
  vendorId: number,
  machines: Machine[]
) {
  const mode = configuration?.trim().toLowerCase().replace(/_/g, " ");
  if (mode !== "rule manage") return null;

  const rules = await CutListRuleEngineService.loadRules(vendorId, machines.map(m => m.id));
  const machinesById = new Map(machines.map(machine => [machine.id, machine]));

  return (item: CutListItemPayload) => {
    const assignments = new Map<number, { machine: Machine; ruleId: number | null }>();
    for (const candidate of machines) {
      const result = CutListRuleEngineService.evaluateRules(item, candidate.id, rules);
      // In rule-manage mode a machine only receives a panel when one of its rules matches.
      if (result.appliedRuleId === null || !result.allowed) continue;
      const machine = machinesById.get(result.targetMachineId);
      if (!machine) {
        throw new Error(`Cutlist rule ${result.matchingRuleName ?? result.appliedRuleId} targets an inactive, disabled, or different vendor's machine`);
      }
      // Replacement can converge on a machine already selected by another rule.
      // Keep one assignment per machine, preserving rule provenance when available.
      const previous = assignments.get(machine.id);
      if (!previous || (previous.ruleId === null && result.appliedRuleId !== null)) {
        assignments.set(machine.id, { machine, ruleId: result.appliedRuleId });
      }
    }
    return [...assignments.values()];
  };
}
