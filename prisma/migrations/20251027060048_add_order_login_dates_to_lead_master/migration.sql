-- AlterTable
ALTER TABLE "LeadMaster" ADD COLUMN     "client_required_order_login_complition_date" TIMESTAMP(3),
ADD COLUMN     "expected_order_ready_date" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "OrderLoginDetails" (
    "id" SERIAL NOT NULL,
    "lead_id" INTEGER NOT NULL,
    "account_id" INTEGER NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "item_type" TEXT NOT NULL,
    "item_desc" TEXT NOT NULL,
    "estimated_completion_date" TIMESTAMP(3) NOT NULL,
    "completion_date" TIMESTAMP(3),
    "is_completed" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" INTEGER NOT NULL,

    CONSTRAINT "OrderLoginDetails_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "OrderLoginDetails" ADD CONSTRAINT "OrderLoginDetails_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderLoginDetails" ADD CONSTRAINT "OrderLoginDetails_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "LeadMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderLoginDetails" ADD CONSTRAINT "OrderLoginDetails_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "AccountMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderLoginDetails" ADD CONSTRAINT "OrderLoginDetails_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "UserMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;
