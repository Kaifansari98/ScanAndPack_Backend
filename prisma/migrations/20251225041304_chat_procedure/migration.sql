-- CreateEnum
CREATE TYPE "LeadChatMessageType" AS ENUM ('text', 'attachment', 'system', 'textWithAttachment');

-- CreateTable
CREATE TABLE "LeadChatRoom" (
    "id" SERIAL NOT NULL,
    "lead_id" INTEGER NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadChatRoom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadChatMember" (
    "id" SERIAL NOT NULL,
    "chat_room_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "added_by" INTEGER,

    CONSTRAINT "LeadChatMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadChatMessage" (
    "id" SERIAL NOT NULL,
    "chat_room_id" INTEGER NOT NULL,
    "sender_id" INTEGER NOT NULL,
    "message_type" "LeadChatMessageType" NOT NULL DEFAULT 'text',
    "message_text" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadChatAttachment" (
    "id" SERIAL NOT NULL,
    "msg_id" INTEGER NOT NULL,
    "doc_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadChatAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadChatMention" (
    "id" SERIAL NOT NULL,
    "msg_id" INTEGER NOT NULL,
    "mentioned_user_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadChatMention_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadChatDocument" (
    "id" SERIAL NOT NULL,
    "doc_og_name" TEXT NOT NULL,
    "doc_sys_name" TEXT NOT NULL,
    "created_by" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_by" INTEGER,
    "deleted_at" TIMESTAMP(3),
    "account_id" INTEGER,
    "lead_id" INTEGER,
    "vendor_id" INTEGER NOT NULL,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "LeadChatDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LeadChatRoom_lead_id_vendor_id_key" ON "LeadChatRoom"("lead_id", "vendor_id");

-- CreateIndex
CREATE UNIQUE INDEX "LeadChatMember_chat_room_id_user_id_key" ON "LeadChatMember"("chat_room_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "LeadChatAttachment_msg_id_doc_id_key" ON "LeadChatAttachment"("msg_id", "doc_id");

-- CreateIndex
CREATE UNIQUE INDEX "LeadChatMention_msg_id_mentioned_user_id_key" ON "LeadChatMention"("msg_id", "mentioned_user_id");

-- AddForeignKey
ALTER TABLE "LeadChatRoom" ADD CONSTRAINT "LeadChatRoom_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "LeadMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadChatRoom" ADD CONSTRAINT "LeadChatRoom_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadChatMember" ADD CONSTRAINT "LeadChatMember_chat_room_id_fkey" FOREIGN KEY ("chat_room_id") REFERENCES "LeadChatRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadChatMember" ADD CONSTRAINT "LeadChatMember_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "UserMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadChatMember" ADD CONSTRAINT "LeadChatMember_added_by_fkey" FOREIGN KEY ("added_by") REFERENCES "UserMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadChatMessage" ADD CONSTRAINT "LeadChatMessage_chat_room_id_fkey" FOREIGN KEY ("chat_room_id") REFERENCES "LeadChatRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadChatMessage" ADD CONSTRAINT "LeadChatMessage_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "UserMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadChatAttachment" ADD CONSTRAINT "LeadChatAttachment_msg_id_fkey" FOREIGN KEY ("msg_id") REFERENCES "LeadChatMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadChatAttachment" ADD CONSTRAINT "LeadChatAttachment_doc_id_fkey" FOREIGN KEY ("doc_id") REFERENCES "LeadChatDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadChatMention" ADD CONSTRAINT "LeadChatMention_msg_id_fkey" FOREIGN KEY ("msg_id") REFERENCES "LeadChatMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadChatMention" ADD CONSTRAINT "LeadChatMention_mentioned_user_id_fkey" FOREIGN KEY ("mentioned_user_id") REFERENCES "UserMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadChatDocument" ADD CONSTRAINT "LeadChatDocument_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "AccountMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadChatDocument" ADD CONSTRAINT "LeadChatDocument_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "UserMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadChatDocument" ADD CONSTRAINT "LeadChatDocument_deleted_by_fkey" FOREIGN KEY ("deleted_by") REFERENCES "UserMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadChatDocument" ADD CONSTRAINT "LeadChatDocument_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "LeadMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadChatDocument" ADD CONSTRAINT "LeadChatDocument_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;
