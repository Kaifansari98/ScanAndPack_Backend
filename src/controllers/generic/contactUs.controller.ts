import { Request, Response } from "express";
import logger from "../../utils/logger";
import { sendContactUsEmail } from "../../services/email/contactUsEmail.service";

const isValidEmail = (value: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

export class ContactUsController {
  static async submitContactUs(req: Request, res: Response) {
    try {
      const { name, email, subject, message } = req.body || {};

      if (!name || !email || !subject || !message) {
        return res.status(400).json({
          success: false,
          message: "name, email, subject, and message are required",
        });
      }

      if (!isValidEmail(String(email))) {
        return res.status(400).json({
          success: false,
          message: "Invalid email format",
        });
      }

      const result = await sendContactUsEmail({
        name: String(name),
        email: String(email),
        subject: String(subject),
        message: String(message),
      });

      if (result.success) {
        return res.status(200).json({
          success: true,
          message: "Message sent successfully",
        });
      }

      if ("skipped" in result) {
        return res.status(202).json({
          success: false,
          message: result.reason,
        });
      }

      return res.status(500).json({
        success: false,
        message: result.error || "Failed to send message",
      });
    } catch (error: any) {
      logger.error("[ContactUs] submitContactUs error", {
        error: error?.message,
        stack: error?.stack,
      });
      return res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  }
}
