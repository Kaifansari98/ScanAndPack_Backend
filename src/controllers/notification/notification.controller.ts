import { Request, Response } from "express";
import { NotificationService } from "../../services/notification/notification.service";
import { NotificationType } from "@prisma/client";

export class NotificationController {
  static async send(req: Request, res: Response) {
    try {
      const vendorId = Number(req.body.vendor_id);
      const userId = Number(req.body.user_id);
      const senderId =
        req.body.sender_id !== undefined ? Number(req.body.sender_id) : null;
      const type = req.body.type as NotificationType | undefined;
      const title = String(req.body.title || "").trim();
      const message = String(req.body.message || "").trim();
      const entityType =
        req.body.entity_type !== undefined ? String(req.body.entity_type) : null;
      const entityId =
        req.body.entity_id !== undefined ? Number(req.body.entity_id) : null;
      const redirectUrl =
        req.body.redirect_url !== undefined ? String(req.body.redirect_url) : null;

      if (!vendorId || !userId || !type || !title || !message) {
        return res.status(400).json({
          success: false,
          message: "vendor_id, user_id, type, title, and message are required",
        });
      }

      if (senderId !== null && Number.isNaN(senderId)) {
        return res.status(400).json({
          success: false,
          message: "sender_id must be a number when provided",
        });
      }

      const { notification, delivery } = await NotificationService.createAndSend({
        vendor_id: vendorId,
        user_id: userId,
        sender_id: senderId,
        type,
        title,
        message,
        entity_type: entityType,
        entity_id: entityId,
        redirect_url: redirectUrl,
      });

      return res.status(201).json({
        success: true,
        message: "Notification sent",
        data: notification,
        delivery,
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        message: "Failed to send notification",
        error: error.message,
      });
    }
  }

  static async listForUser(req: Request, res: Response) {
    try {
      const vendorId = Number(req.params.vendorId);
      const userId = Number(req.params.userId);
      const isReadParam = req.query.is_read;
      const isRead =
        typeof isReadParam === "string"
          ? isReadParam === "true"
          : undefined;
      const take = req.query.take ? Number(req.query.take) : undefined;
      const skip = req.query.skip ? Number(req.query.skip) : undefined;

      if (!vendorId || !userId) {
        return res.status(400).json({
          success: false,
          message: "vendorId and userId are required",
        });
      }

      const { notifications, unread_count } = await NotificationService.listForUser(
        vendorId,
        userId,
        { is_read: isRead, take, skip }
      );

      return res.status(200).json({
        success: true,
        count: notifications.length,
        unread_count,
        data: notifications,
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        message: "Failed to fetch notifications",
        error: error.message,
      });
    }
  }

  static async markRead(req: Request, res: Response) {
    try {
      const notificationId = Number(req.params.id);
      const userId = Number(req.body.user_id);

      if (!notificationId || !userId) {
        return res.status(400).json({
          success: false,
          message: "notification id and user_id are required",
        });
      }

      const result = await NotificationService.markRead(notificationId, userId);

      if (result.count === 0) {
        return res.status(404).json({
          success: false,
          message: "Notification not found",
        });
      }

      return res.status(200).json({
        success: true,
        message: "Notification marked as read",
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        message: "Failed to mark notification as read",
        error: error.message,
      });
    }
  }

  static async registerPushToken(req: Request, res: Response) {
    try {
      const vendorId = Number(req.body.vendor_id);
      const userId = Number(req.body.user_id);
      const token = String(req.body.token || "").trim();
      const platform = String(req.body.platform || "").trim();
      const browser =
        req.body.browser !== undefined ? String(req.body.browser) : null;
      const deviceId =
        req.body.device_id !== undefined ? String(req.body.device_id) : null;

      if (!vendorId || !userId || !token || !platform) {
        return res.status(400).json({
          success: false,
          message: "vendor_id, user_id, token, and platform are required",
        });
      }

      const pushToken = await NotificationService.registerPushToken({
        vendor_id: vendorId,
        user_id: userId,
        token,
        platform,
        browser,
        device_id: deviceId,
      });

      return res.status(200).json({
        success: true,
        message: "Push token registered",
        data: pushToken,
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        message: "Failed to register push token",
        error: error.message,
      });
    }
  }
}
