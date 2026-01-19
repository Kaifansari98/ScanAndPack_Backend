import { Request, Response } from "express";
import { EmailNotificationMasterService } from "../../services/notification/emailNotificationMaster.service";

export class EmailNotificationMasterController {
  static async create(req: Request, res: Response) {
    try {
      const vendorId = Number(req.body.vendor_id);
      const templateKey = String(req.body.template_key || "").trim();
      const subject = String(req.body.subject || "").trim();
      const text = String(req.body.text || "").trim();
      const html = String(req.body.html || "").trim();
      let active: boolean | undefined;
      if (req.body.active !== undefined) {
        if (typeof req.body.active === "boolean") {
          active = req.body.active;
        } else if (typeof req.body.active === "string") {
          if (req.body.active === "true") active = true;
          else if (req.body.active === "false") active = false;
          else {
            return res.status(400).json({
              success: false,
              message: "active must be a boolean when provided",
            });
          }
        } else {
          return res.status(400).json({
            success: false,
            message: "active must be a boolean when provided",
          });
        }
      }

      if (!vendorId || !templateKey || !subject || !text || !html) {
        return res.status(400).json({
          success: false,
          message:
            "vendor_id, template_key, subject, text, and html are required",
        });
      }

      const record = await EmailNotificationMasterService.create({
        vendor_id: vendorId,
        template_key: templateKey,
        subject,
        text,
        html,
        active,
      });

      return res.status(201).json({
        success: true,
        message: "Email notification template created",
        data: record,
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        message: "Failed to create email notification template",
        error: error.message,
      });
    }
  }
}
