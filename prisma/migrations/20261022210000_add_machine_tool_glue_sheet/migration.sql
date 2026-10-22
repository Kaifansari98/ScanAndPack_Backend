-- Kept separate from the seed: Postgres can't use a new enum value in the transaction that adds it.
ALTER TYPE "MachineCostSheet" ADD VALUE IF NOT EXISTS 'MACHINE_TOOL_GLUE';
