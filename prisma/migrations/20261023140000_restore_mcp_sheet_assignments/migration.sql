-- Changing "sheet" from the enum to TEXT with `prisma db push` drops and re-adds the column, which resets
-- every row to the 'MACHINE_COST' default. Put the seeded rows back on their sheets using their stable codes.
-- Rows already on the right sheet are untouched, so this is a no-op on databases that were migrated normally.
UPDATE "MachineCostDescription"
SET "sheet" = CASE
    WHEN "code" IN ('machine_electrical_hp', 'dust_collector_electrical_hp', 'electricals_total_connected_load') THEN 'MACHINE_ELECTRICALS'
    WHEN "code" LIKE 'maintenance\_%' THEN 'MACHINE_MAINTENANCE'
    WHEN "code" LIKE 'capacity\_%' THEN 'MACHINE_CAPACITY'
    WHEN "code" LIKE 'tool\_%' THEN 'MACHINE_TOOL_GLUE'
    WHEN "code" LIKE 'labour\_%' THEN 'MACHINE_LABOUR'
    WHEN "code" LIKE 'general\_%' THEN 'GENERAL_DATA'
    WHEN "code" LIKE 'process\_%' THEN 'PROCESS_COST'
END
WHERE "sheet" = 'MACHINE_COST'
  AND (
    "code" IN ('machine_electrical_hp', 'dust_collector_electrical_hp', 'electricals_total_connected_load')
    OR "code" LIKE 'maintenance\_%'
    OR "code" LIKE 'capacity\_%'
    OR "code" LIKE 'tool\_%'
    OR "code" LIKE 'labour\_%'
    OR "code" LIKE 'general\_%'
    OR "code" LIKE 'process\_%'
  );
