-- Spec 15: a repair that needs no material goes straight to repair scheduling.
ALTER TYPE "ComplaintExecutionStatus" ADD VALUE IF NOT EXISTS 'MATERIAL_NOT_REQUIRED' BEFORE 'MATERIAL_APPROVAL_PENDING';
