-- Client-app complaints: the vendor's UPI ID for complaint payments, client
-- payments (no staff allocator) and complaint updates in the client chat.
ALTER TABLE "VendorMaster" ADD COLUMN IF NOT EXISTS "complaint_upi_id" VARCHAR(100);
ALTER TABLE "VendorMaster" ADD COLUMN IF NOT EXISTS "complaint_upi_name" VARCHAR(150);

ALTER TABLE "ComplaintPaymentAllocation" ALTER COLUMN "allocated_by" DROP NOT NULL;

ALTER TYPE "ClientChatAutoKind" ADD VALUE IF NOT EXISTS 'COMPLAINT';
