-- Installation team visit: inspect and fix in one visit, skipping the quotation step.
ALTER TYPE "ComplaintVisitPurpose" ADD VALUE IF NOT EXISTS 'INSTALLATION_TEAM';
