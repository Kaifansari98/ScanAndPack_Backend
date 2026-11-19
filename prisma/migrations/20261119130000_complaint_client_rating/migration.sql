-- Client's star feedback recorded with the resolution confirmation.
ALTER TABLE "ComplaintClosure" ADD COLUMN IF NOT EXISTS "client_rating" INTEGER;
ALTER TABLE "ComplaintClosure" DROP CONSTRAINT IF EXISTS "ComplaintClosure_client_rating_check";
ALTER TABLE "ComplaintClosure"
  ADD CONSTRAINT "ComplaintClosure_client_rating_check" CHECK (client_rating IS NULL OR client_rating BETWEEN 1 AND 5);
