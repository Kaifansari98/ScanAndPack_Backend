import { Router } from "express";
import { ChatController } from "../../controllers/chat/chat.controller";
import { uploadChatAttachments } from "../../utils/wasabiClient";

const chatRouter = Router();

// GET /api/leads/chats/lead/:leadId
chatRouter.get("/lead/:leadId", ChatController.checkLeadChatRoom);

// POST /api/leads/chats/lead/:leadId
chatRouter.post("/lead/:leadId", ChatController.createLeadChatRoom);

// POST /api/leads/chats/members
chatRouter.post("/members", ChatController.getChatMembers);

// POST /api/leads/chats/messages
chatRouter.post(
  "/messages",
  uploadChatAttachments.array("attachments", 5),
  ChatController.sendMessage
);
// GET /api/leads/chats/messages
chatRouter.get("/messages", ChatController.getTextMessages);

export default chatRouter;
