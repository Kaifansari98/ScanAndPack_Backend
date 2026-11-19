-- Quotations are uploaded files shared with the client straight away, without
-- a department-head approval step.
ALTER TABLE "ComplaintAttachment" ADD COLUMN IF NOT EXISTS "quotation_id" INTEGER;
ALTER TABLE "ComplaintAttachment" DROP CONSTRAINT IF EXISTS "ComplaintAttachment_quotation_id_cycle_id_fkey";
ALTER TABLE "ComplaintAttachment" ADD CONSTRAINT "ComplaintAttachment_quotation_id_cycle_id_fkey" FOREIGN KEY ("quotation_id", "cycle_id") REFERENCES "ComplaintQuotation"("id", "cycle_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ComplaintQuotation" ADD COLUMN IF NOT EXISTS "payment_at_resolution" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "ComplaintQuotation" DROP CONSTRAINT IF EXISTS "ComplaintQuotation_approval_presence_check";
ALTER TABLE "ComplaintQuotation"
  ADD CONSTRAINT "ComplaintQuotation_approval_presence_check" CHECK (
    (status <> 'HSS_APPROVED' OR hss_approval_decision_id IS NOT NULL) AND
    (status NOT IN ('SHARED', 'CLIENT_ACCEPTED', 'CLIENT_REJECTED', 'MODIFICATION_REQUESTED') OR shared_at IS NOT NULL) AND
    (status NOT IN ('CLIENT_ACCEPTED', 'CLIENT_REJECTED', 'MODIFICATION_REQUESTED') OR client_response_decision_id IS NOT NULL)
  );

-- Pending work is recorded with every new inspection report.
ALTER TABLE "ComplaintInspectionReport" ADD COLUMN IF NOT EXISTS "pending_work" TEXT;
