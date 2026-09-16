ALTER TABLE "UserLeadTask"
ADD COLUMN "small_order_request_id" INTEGER;

ALTER TABLE "UserLeadTask"
ADD CONSTRAINT "UserLeadTask_small_order_request_id_fkey"
FOREIGN KEY ("small_order_request_id") REFERENCES "smallOrderRequests"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;

CREATE INDEX "UserLeadTask_small_order_request_id_idx"
ON "UserLeadTask"("small_order_request_id");
