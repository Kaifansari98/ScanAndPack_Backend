import { Request, Response } from "express";
import { FinalHandoverStageService } from "../../../services/installation/final-handover/FinalHandoverStage.service";
import { ApiResponse } from "../../../utils/apiResponse";
import logger from "../../../utils/logger";

const service = new FinalHandoverStageService();

export class FinalHandoverStageController {
  /**
   * ✅ Get all leads under Final Handover Stage (Type 16)
   */
  async getAllFinalHandoverStageLeads(req: Request, res: Response) {
    try {
      const vendorId = parseInt(req.params.vendorId);
      const userId = parseInt(req.params.userId);

      if (!vendorId || !userId) {
        return res
          .status(400)
          .json(ApiResponse.error("Vendor ID and User ID are required", 400));
      }

      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;

      const leads = await service.getLeadsWithStatusFinalHandoverStage(
        vendorId,
        userId,
        limit,
        page
      );

      return res
        .status(200)
        .json(
          ApiResponse.success(
            leads,
            "Final Handover Stage leads fetched successfully"
          )
        );
    } catch (error: any) {
      logger.error(
        "[FinalHandoverStageController] getAllFinalHandoverStageLeads Error:",
        error
      );
      return res
        .status(500)
        .json(ApiResponse.error(error.message || "Internal server error", 500));
    }
  }

  async uploadFinalHandoverDocuments(req: Request, res: Response) {
    try {
      const vendorId = Number(req.body.vendorId);
      const leadId = Number(req.body.leadId);
      const accountId = Number(req.body.accountId);
      const userId = Number(req.body.userId);

      if (!vendorId || !leadId || !accountId || !userId) {
        return res.status(400).json({
          success: false,
          message: "vendorId, leadId, accountId, userId are required",
        });
      }

      const files = req.files as any;

      const result = await service.uploadFinalHandoverDocuments(
        vendorId,
        leadId,
        accountId,
        userId,
        files
      );

      return res.status(200).json({
        success: true,
        message: "Final Handover documents uploaded successfully",
        data: result,
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        message: error.message || "Upload failed",
      });
    }
  }

  async getFinalHandoverDocuments(req: Request, res: Response) {
    try {
      const vendorId = Number(req.params.vendorId);
      const leadId = Number(req.params.leadId);

      if (!vendorId || !leadId) {
        return res.status(400).json({
          success: false,
          message: "vendorId and leadId are required",
        });
      }

      const docs = await service.getFinalHandoverDocuments(vendorId, leadId);

      return res.status(200).json({
        success: true,
        message: "Final Handover documents fetched successfully",
        count: docs.length,
        data: docs,
      });
    } catch (error: any) {
      return res.status(error.statusCode || 500).json({
        success: false,
        message:
          error.message ||
          "Internal server error while fetching Final Handover documents",
      });
    }
  }

  async getFinalHandoverReadyStatus(req: Request, res: Response) {
    try {
      const vendorId = Number(req.params.vendorId);
      const leadId = Number(req.params.leadId);

      if (!vendorId || !leadId) {
        return res.status(400).json({
          success: false,
          message: "vendorId and leadId are required",
        });
      }

      const result = await service.getFinalHandoverReadyStatus(
        vendorId,
        leadId
      );

      return res.status(200).json({
        success: true,
        message: "Final handover readiness verified",
        data: result,
      });
    } catch (error: any) {
      return res.status(error.statusCode || 500).json({
        success: false,
        message:
          error.message ||
          "Internal server error while checking final-handover readiness",
      });
    }
  }

  /**
   * ✅ Move Lead to Project Completed Stage (Type 17)
   * @route PUT /leads/installation/final-handover/vendorId/:vendorId/leadId/:leadId/move-to-project-completed
   */
  async moveLeadToProjectCompleted(req: Request, res: Response) {
    try {
      const vendorId = Number(req.params.vendorId);
      const leadId = Number(req.params.leadId);
      const { updated_by } = req.body;

      if (!vendorId || !leadId || !updated_by) {
        return res
          .status(400)
          .json(
            ApiResponse.error(
              "vendorId, leadId, and updated_by are required",
              400
            )
          );
      }

      const result = await FinalHandoverStageService.moveLeadToProjectCompleted(
        vendorId,
        leadId,
        updated_by
      );

      return res
        .status(200)
        .json(
          ApiResponse.success(
            result,
            "Lead successfully moved to Project Completed stage"
          )
        );
    } catch (error: any) {
      logger.error(
        "[FinalHandoverStageController] moveLeadToProjectCompleted Error:",
        error
      );

      return res
        .status(500)
        .json(ApiResponse.error(error.message || "Internal server error"));
    }
  }
}
