-- Give every workstation of every vendor its own Machine Tool / Glue rows. No values are seeded yet.
-- Codes are kept stable so formulas reference rows by code, not position.
INSERT INTO "MachineCostDescription" ("vendor_id", "machine_id", "code", "description", "sequence_no", "sheet")
SELECT machine.vendor_id, machine.id, defaults.code, defaults.description, defaults.sequence_no, 'MACHINE_TOOL_GLUE'
FROM "MachineMaster" machine
CROSS JOIN (VALUES
    ('tool_new_blade_set_cost', 'Cost of new blade set with scoring blade (C)', 1),
    ('tool_sheets_cut_new_blade_set', 'no of sheet cut with new blade set (manual value)', 2),
    ('tool_cuts_by_new_tool', 'No of cut by new tool (A)', 3),
    ('tool_resharp_life_times', 'New Tool resharp life times (manual value)', 4),
    ('tool_cost_per_cut_new_tool', 'cost per cut with new tool', 5),
    ('tool_resharp_cost', 'Tool Resharp cost (manual value)', 6),
    ('tool_sheets_cut_after_resharp', 'no of sheet can be cut after resharp (manual value)', 7),
    ('tool_resharp_cost_in_lifetime', 'Resharp tool cost in tool liftime (D)', 8),
    ('tool_cuts_by_resharp_tool', 'Total no of cut by resharp tool (B)', 9),
    ('tool_resharp_cost_per_cut', 'resharp tool cost/cut', 10),
    ('tool_total_cuts_per_set', 'total no of cut by 1 set of tool A+B', 11),
    ('tool_total_cost_till_death', 'total cost of tool till death C+D', 12),
    ('tool_total_cost_per_cut', 'total cost of 1 set tool/cut', 13)
) AS defaults(code, description, sequence_no)
ON CONFLICT ("vendor_id", "machine_id", "code") DO NOTHING;
