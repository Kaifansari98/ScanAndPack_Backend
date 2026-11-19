-- Visiting charge collected in cash by the site team; the visit can be scheduled before payment.
ALTER TABLE "ComplaintVisit" ADD COLUMN IF NOT EXISTS "pay_at_visit" BOOLEAN NOT NULL DEFAULT false;
