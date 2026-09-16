ALTER TABLE "LeadMaster"
ADD COLUMN "tentative_order_login_date" TIMESTAMP(3);

ALTER TABLE "FastProductionRequest"
ADD COLUMN "tentative_order_login_date" TIMESTAMP(3);

UPDATE "FastProductionRequest"
SET "tentative_order_login_date" = "client_required_delivery_date"
WHERE "tentative_order_login_date" IS NULL;
