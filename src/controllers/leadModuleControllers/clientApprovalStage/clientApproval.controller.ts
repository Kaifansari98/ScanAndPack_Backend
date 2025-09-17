import { Request, Response } from "express";
import { ClientApprovalService } from "../../../services/leadModuleServices/clientApprovalStage/clientApproval.service";

const clientApprovalService = new ClientApprovalService();

export class ClientApprovalController {
  public static async submitApproval(req: Request, res: Response): Promise<void> {
    try {
      const { leadId, vendorId } = req.params;
      const { account_id, client_id, created_by, advance_payment_date, amount_paid, payment_text } = req.body;

      const approvalScreenshots = (req.files as any)?.approvalScreenshots || [];
      const payment_files = (req.files as any)?.payment_files || [];

      if (!leadId || !vendorId || !account_id || !client_id || !created_by) {
        res.status(400).json({ success: false, message: "Missing required fields" });
        return;
      }

      if (!approvalScreenshots || approvalScreenshots.length === 0) {
        res.status(400).json({ success: false, message: "Client approval screenshot is mandatory" });
        return;
      }

      // File validation
      const allowedImageExt = [".jpg", ".jpeg", ".png"];
      const invalidScreenshots = approvalScreenshots.filter(
        (file: Express.Multer.File) =>
          !allowedImageExt.includes("." + file.originalname.split(".").pop()?.toLowerCase())
      );
      if (invalidScreenshots.length > 0) {
        res.status(400).json({
          success: false,
          message: `Invalid screenshot file types: ${invalidScreenshots.map((f: any) => f.originalname).join(", ")}`,
        });
        return;
      }

      const invalidPaymentFiles = payment_files.filter(
        (file: Express.Multer.File) =>
          !allowedImageExt.includes("." + file.originalname.split(".").pop()?.toLowerCase())
      );
      if (invalidPaymentFiles.length > 0) {
        res.status(400).json({
          success: false,
          message: `Invalid payment file types: ${invalidPaymentFiles.map((f: any) => f.originalname).join(", ")}`,
        });
        return;
      }

      const dto = {
        lead_id: parseInt(leadId),
        vendor_id: parseInt(vendorId),
        account_id: parseInt(account_id),
        client_id: parseInt(client_id),
        created_by: parseInt(created_by),
        approvalScreenshots,
        advance_payment_date,
        amount_paid: parseFloat(amount_paid),
        payment_text,
        payment_files,
      };

      const result = await clientApprovalService.submitClientApproval(dto);

      res.status(201).json({
        success: true,
        message: "Client approval stage submitted successfully",
        data: result,
      });
    } catch (error: any) {
      console.error("[ClientApprovalController] Error:", error);
      res.status(500).json({ success: false, message: error.message || "Internal server error" });
    }
  }
}