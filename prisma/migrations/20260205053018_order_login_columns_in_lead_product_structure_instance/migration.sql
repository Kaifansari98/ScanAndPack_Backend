-- AlterTable
ALTER TABLE "LeadProductStructureInstance" ADD COLUMN     "is_order_login_completed" BOOLEAN,
ADD COLUMN     "order_login_completed_at" TIMESTAMP(3);
