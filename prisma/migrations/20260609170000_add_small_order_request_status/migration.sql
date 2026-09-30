CREATE TYPE "SmallOrderRequestStatus" AS ENUM (
    'pending_approval',
    'pending_approvals',
    'approved',
    'rejected'
);

ALTER TABLE "smallOrderRequests"
ADD COLUMN "status" "SmallOrderRequestStatus" NOT NULL DEFAULT 'pending_approval';
