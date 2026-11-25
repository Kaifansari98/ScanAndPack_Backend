import { Router } from "express";
import { clientFrom, requireClient } from "../middleware/client-auth.middleware";
import {
  clientThreads,
  deleteMessage,
  getConversation,
  markRead,
  react,
  sendMessage,
  setTyping,
  type ChatActor,
} from "../../services/clientChat/clientChat.service";
import { registerClientPushToken, unregisterClientPushToken } from "../../services/clientChat/clientPush";
import { bodyOf, chatHandler, chatUpload, positiveId } from "../../services/clientChat/chatHttp";

// Client app chat: /furnixcrm-mobile-app/client/chats

const router = Router();
router.use(requireClient);

const me = (res: Parameters<typeof clientFrom>[0]): ChatActor => ({ kind: "client", email: clientFrom(res).email });
const lead = (value: unknown) => positiveId(value, "project");

router.get("/", chatHandler("threads", (_req, res) => clientThreads(clientFrom(res).email)));
router.post("/push-token", chatHandler("push token", (req, res) => registerClientPushToken(clientFrom(res).email, req.body?.token, req.body?.platform)));
router.delete("/push-token", chatHandler("push token", (req) => unregisterClientPushToken(req.body?.token)));

router.get("/:leadId/messages", chatHandler("messages", (req, res) => getConversation(me(res), lead(req.params.leadId), req.query)));
router.post(
  "/:leadId/messages",
  chatUpload,
  chatHandler("send", (req, res) => sendMessage(me(res), lead(req.params.leadId), bodyOf(req), req.file)),
);
router.delete("/:leadId/messages/:messageId", chatHandler("delete", (req, res) => deleteMessage(me(res), lead(req.params.leadId), positiveId(req.params.messageId, "message"))));
router.post("/:leadId/messages/:messageId/reactions", chatHandler("react", (req, res) => react(me(res), lead(req.params.leadId), positiveId(req.params.messageId, "message"), req.body?.emoji)));
router.post("/:leadId/read", chatHandler("read", (req, res) => markRead(me(res), lead(req.params.leadId), req.body?.last_id)));
router.post("/:leadId/typing", chatHandler("typing", (req, res) => setTyping(me(res), lead(req.params.leadId))));

export default router;
