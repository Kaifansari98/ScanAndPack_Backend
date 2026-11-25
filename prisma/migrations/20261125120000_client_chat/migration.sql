-- Client chat: one conversation per booking between the client and the
-- lead's team (separate from the internal LeadChatRoom), with reactions,
-- per-staff read state and the client app's push tokens.
DO $$ BEGIN
  CREATE TYPE "ClientChatSender" AS ENUM ('CLIENT','STAFF','SYSTEM');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE "ClientChatKind" AS ENUM ('TEXT','PHOTO','DOCUMENT','VOICE','AUTO');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE "ClientChatAutoKind" AS ENUM ('STAGE','VISIT','DISPATCH','PAYMENT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "ClientChatRoom" (
  "id" SERIAL PRIMARY KEY,
  "vendor_id" INTEGER NOT NULL,
  "lead_id" INTEGER NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_message_at" TIMESTAMP(3),
  "client_delivered_id" INTEGER NOT NULL DEFAULT 0,
  "client_read_id" INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS "ClientChatRoom_lead_id_key" ON "ClientChatRoom"("lead_id");
CREATE INDEX IF NOT EXISTS "ClientChatRoom_vendor_id_last_message_at_idx" ON "ClientChatRoom"("vendor_id", "last_message_at");

CREATE TABLE IF NOT EXISTS "ClientChatMessage" (
  "id" SERIAL PRIMARY KEY,
  "room_id" INTEGER NOT NULL,
  "sender_type" "ClientChatSender" NOT NULL,
  "sender_user_id" INTEGER,
  "kind" "ClientChatKind" NOT NULL,
  "text" TEXT,
  "file_key" VARCHAR(500),
  "file_name" VARCHAR(255),
  "file_size" INTEGER,
  "mime_type" VARCHAR(100),
  "duration_sec" INTEGER,
  "auto_kind" "ClientChatAutoKind",
  "auto_title" VARCHAR(255),
  "reply_to_id" INTEGER,
  "deleted_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ClientChatMessage_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "ClientChatRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "ClientChatMessage_room_id_id_idx" ON "ClientChatMessage"("room_id", "id");

CREATE TABLE IF NOT EXISTS "ClientChatReaction" (
  "id" SERIAL PRIMARY KEY,
  "message_id" INTEGER NOT NULL,
  "reactor_key" VARCHAR(40) NOT NULL,
  "emoji" VARCHAR(16) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ClientChatReaction_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "ClientChatMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "ClientChatReaction_message_id_reactor_key_key" ON "ClientChatReaction"("message_id", "reactor_key");

CREATE TABLE IF NOT EXISTS "ClientChatStaffRead" (
  "id" SERIAL PRIMARY KEY,
  "room_id" INTEGER NOT NULL,
  "user_id" INTEGER NOT NULL,
  "delivered_id" INTEGER NOT NULL DEFAULT 0,
  "read_id" INTEGER NOT NULL DEFAULT 0,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ClientChatStaffRead_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "ClientChatRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "ClientChatStaffRead_room_id_user_id_key" ON "ClientChatStaffRead"("room_id", "user_id");

CREATE TABLE IF NOT EXISTS "ClientPushToken" (
  "id" SERIAL PRIMARY KEY,
  "email" VARCHAR(255) NOT NULL,
  "token" VARCHAR(255) NOT NULL,
  "platform" VARCHAR(20) NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "updated_at" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "ClientPushToken_token_key" ON "ClientPushToken"("token");
CREATE INDEX IF NOT EXISTS "ClientPushToken_email_idx" ON "ClientPushToken"("email");
