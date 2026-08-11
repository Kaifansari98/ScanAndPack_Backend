ALTER TABLE "LeadChatMessage"
ADD COLUMN "reply_to_message_id" INTEGER;

ALTER TABLE "LeadChatMessage"
ADD CONSTRAINT "LeadChatMessage_reply_to_message_id_fkey"
FOREIGN KEY ("reply_to_message_id") REFERENCES "LeadChatMessage"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;
