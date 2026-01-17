import { Request, Response } from "express";
import { ChatService } from "../../services/chat/chat.service";

export class ChatController {
  private static resolveClientBaseUrl(req: Request): string {
    const origin = req.headers.origin;
    if (typeof origin === "string" && origin.trim().length > 0) {
      return origin.replace(/\/$/, "");
    }

    const referer = req.headers.referer;
    if (typeof referer === "string" && referer.trim().length > 0) {
      try {
        return new URL(referer).origin;
      } catch {
        return "http://localhost:3000";
      }
    }

    return "http://localhost:3000";
  }
  static async checkLeadChatRoom(req: Request, res: Response) {
    try {
      const leadId = parseInt(req.params.leadId, 10);

      if (isNaN(leadId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid leadId",
        });
      }

      const result = await ChatService.checkChatRoomByLeadId(leadId);

      return res.status(200).json({
        success: true,
        exists: result.exists,
        data: result.room,
      });
    } catch (error: any) {
      return res.status(error.statusCode || 500).json({
        success: false,
        message: "Failed to check lead chat room",
        error: error.message,
      });
    }
  }

  static async createLeadChatRoom(req: Request, res: Response) {
    try {
      const leadId = parseInt(req.params.leadId, 10);
      const userId = parseInt(req.body.user_id, 10);

      if (isNaN(leadId) || isNaN(userId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid leadId or user_id",
        });
      }

      const result = await ChatService.createChatRoomIfMissing(leadId, userId);

      return res.status(200).json({
        success: true,
        created: result.created,
        data: result.room,
      });
    } catch (error: any) {
      return res.status(error.statusCode || 500).json({
        success: false,
        message: "Failed to create lead chat room",
        error: error.message,
      });
    }
  }

  static async getChatMembers(req: Request, res: Response) {
    try {
      const leadId = parseInt(req.body.lead_id, 10);
      const vendorId = parseInt(req.body.vendor_id, 10);

      if (isNaN(leadId) || isNaN(vendorId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid lead_id or vendor_id",
        });
      }

      const members = await ChatService.getChatMembersByLead(leadId, vendorId);

      return res.status(200).json({
        success: true,
        count: members.length,
        data: members,
      });
    } catch (error: any) {
      return res.status(error.statusCode || 500).json({
        success: false,
        message: "Failed to fetch chat members",
        error: error.message,
      });
    }
  }

  static async sendMessage(req: Request, res: Response) {
    try {
      const leadId = parseInt(req.body.lead_id, 10);
      const vendorId = parseInt(req.body.vendor_id, 10);
      const userId = parseInt(req.body.user_id, 10);
      const messageText = String(req.body.message_text || "").trim();
      const files = (req.files || []) as Express.Multer.File[];
      const mentionRaw = req.body.mention_user_ids;
      const mentionUserIds = Array.isArray(mentionRaw)
        ? mentionRaw.map((id) => parseInt(id, 10))
        : typeof mentionRaw === "string" && mentionRaw.length > 0
          ? mentionRaw.split(",").map((id) => parseInt(id.trim(), 10))
          : [];

      if (isNaN(leadId) || isNaN(vendorId) || isNaN(userId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid lead_id, vendor_id, or user_id",
        });
      }

      if (!messageText && files.length === 0) {
        return res.status(400).json({
          success: false,
          message: "message_text or attachments are required",
        });
      }

      const message = await ChatService.sendMessage({
        leadId,
        vendorId,
        userId,
        messageText,
        files,
        mentionUserIds,
        clientBaseUrl: ChatController.resolveClientBaseUrl(req),
      });

      return res.status(200).json({
        success: true,
        data: message,
      });
    } catch (error: any) {
      return res.status(error.statusCode || 500).json({
        success: false,
        message: "Failed to send chat message",
        error: error.message,
      });
    }
  }

  static async getTextMessages(req: Request, res: Response) {
    try {
      const leadId = parseInt(String(req.query.lead_id), 10);
      const vendorId = parseInt(String(req.query.vendor_id), 10);
      const page = parseInt(String(req.query.page || "1"), 10);
      const limit = parseInt(String(req.query.limit || "50"), 10);

      if (
        isNaN(leadId) ||
        isNaN(vendorId) ||
        isNaN(page) ||
        isNaN(limit) ||
        page < 1 ||
        limit < 1
      ) {
        return res.status(400).json({
          success: false,
          message: "Invalid lead_id, vendor_id, page, or limit",
        });
      }

      const result = await ChatService.getMessagesByLead({
        leadId,
        vendorId,
        page,
        limit,
      });

      return res.status(200).json({
        success: true,
        total: result.total,
        todayMessages: result.todayMessages,
        messages: result.messages,
      });
    } catch (error: any) {
      return res.status(error.statusCode || 500).json({
        success: false,
        message: "Failed to fetch chat messages",
        error: error.message,
      });
    }
  }
}
