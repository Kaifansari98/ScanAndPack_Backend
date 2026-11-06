BEGIN;

-- Role/vendor authorization is enforced by the leave decision API.
-- Super admins may also review their own requests; review metadata remains required.
ALTER TABLE "LeaveRequest" DROP CONSTRAINT IF EXISTS "LeaveRequest_review_check";
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_review_check" CHECK (
  (status = 'PENDING' AND reviewed_by IS NULL AND reviewed_at IS NULL AND rejection_reason IS NULL)
  OR (status = 'APPROVED' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL AND rejection_reason IS NULL)
  OR (status = 'REJECTED' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL AND rejection_reason IS NOT NULL AND length(trim(rejection_reason)) > 0)
);

COMMIT;
