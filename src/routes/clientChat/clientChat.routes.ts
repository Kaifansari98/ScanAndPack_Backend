import { Request, Router } from "express";
import { verifyToken } from "../../middlewares/auth.middleware";
import {
  ChatError,
  deleteMessage,
  getConversation,
  markRead,
  react,
  sendMessage,
  setTyping,
  staffInbox,
  type ChatActor,
} from "../../services/clientChat/clientChat.service";
import { bodyOf, chatHandler, chatUpload, positiveId } from "../../services/clientChat/chatHttp";

// Staff side of the client chat (CRM web and FurnixChats): /api/client-chats

const router = Router();
router.use(verifyToken);

function staff(req: Request): Extract<ChatActor, { kind: "staff" }> {
  const user = (req as any).user;
  const vendorId = positiveId(req.params.vendorId, "vendor");
  if (Number(user?.vendor_id) !== vendorId) throw new ChatError("Vendor access denied.", 403);
  return {
    kind: "staff",
    vendorId,
    userId: positiveId(user?.id, "user"),
    role: String(user?.user_type ?? "").trim().toLowerCase(),
  };
}

const lead = "/vendor/:vendorId/leads/:leadId";
const leadId = (req: Request) => positiveId(req.params.leadId, "lead");

router.get("/vendor/:vendorId/inbox", chatHandler("inbox", (req) => staffInbox(staff(req))));
router.get(`${lead}/messages`, chatHandler("messages", (req) => getConversation(staff(req), leadId(req), req.query)));
router.post(`${lead}/messages`, chatUpload, chatHandler("send", (req) => sendMessage(staff(req), leadId(req), bodyOf(req), req.file)));
router.delete(`${lead}/messages/:messageId`, chatHandler("delete", (req) => deleteMessage(staff(req), leadId(req), positiveId(req.params.messageId, "message"))));
router.post(`${lead}/messages/:messageId/reactions`, chatHandler("react", (req) => react(staff(req), leadId(req), positiveId(req.params.messageId, "message"), req.body?.emoji)));
router.post(`${lead}/read`, chatHandler("read", (req) => markRead(staff(req), leadId(req), req.body?.last_id)));
router.post(`${lead}/typing`, chatHandler("typing", (req) => setTyping(staff(req), leadId(req))));

export default router;
