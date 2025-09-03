import { Request, Response } from "express";
import { validationResult } from "express-validator";
import { ApiResponse } from "../../../utils/apiResponse";
import { DesigingStage } from "../../../services/leadModuleServices/desigingStage/designing-stage.service";

export class DesigingStageController {

  public static async addToDesigingStage(req: Request, res: Response) {
    try {
      // ✅ Validate
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res
          .status(400)
          .json(ApiResponse.validationError(errors.array().map(err => err.msg)));
      }

      const { lead_id, user_id, vendor_id } = req.body;

      const result = await DesigingStage.addToDesigingStage(
        Number(lead_id),
        Number(user_id),
        Number(vendor_id)
      );

      return res
        .status(200)
        .json(ApiResponse.success(result, "Lead status updated to 3 and log created"));
    } catch (error: any) {
      if (error.message.includes("Unauthorized")) {
        return res.status(401).json(ApiResponse.unauthorized(error.message));
      }
      if (error.message.includes("not found")) {
        return res.status(404).json(ApiResponse.notFound(error.message));
      }
      return res.status(500).json(ApiResponse.error(error.message));
    }
  }

  public static async getLeadsByStatus(req: Request, res: Response) {
    try {
      const { vendorId, statusId } = req.params;
      const { page = "1", limit = "10" } = req.query;

      if (!vendorId || !statusId) {
        return res
          .status(400)
          .json(ApiResponse.validationError("vendorId and statusId are required"));
      }

      const result = await DesigingStage.getLeadsByStatus(
        Number(vendorId),
        Number(statusId),
        Number(page),
        Number(limit)
      );

      return res
        .status(200)
        .json(ApiResponse.success(result, "Leads fetched successfully"));
    } catch (error: any) {
      return res.status(500).json(ApiResponse.error(error.message));
    }
  }

  public static async upload(req: Request, res: Response) {
    try {
      const { vendorId, leadId, userId, accountId } = req.body;

      if (!req.file) {
        return res.status(400).json({ success: false, message: "File required" });
      }

      const doc = await DesigingStage.uploadQuotation({
        fileBuffer: req.file.buffer,
        originalName: req.file.originalname,
        vendorId: Number(vendorId),
        leadId: Number(leadId),
        userId: Number(userId),
        accountId: Number(accountId),
      });

      res.json({ success: true, document: doc });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

}