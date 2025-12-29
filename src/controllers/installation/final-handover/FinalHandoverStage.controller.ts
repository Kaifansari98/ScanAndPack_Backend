import { Request, Response } from "express";
import { FinalHandoverStageService } from "../../../services/installation/final-handover/FinalHandoverStage.service";
import {
  uploadToWasabiFinalHandoverBookletPhotoFile,
  uploadToWasabiFinalHandoverFinalSitePhotosFile,
  uploadToWasabiFinalHandoverFormPhotoFile,
  uploadToWasabiFinalHandoverQCDocumentFile,
  uploadToWasabiFinalHandoverWarrantyCardPhotosFile,
} from "../../../utils/wasabiClient";
import { ApiResponse } from "../../../utils/apiResponse";
import logger from "../../../utils/logger";
import fs from "node:fs/promises";

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

      const files = req.files as {
        [fieldname: string]: Express.Multer.File[];
      };

      const uploadFiles = async (
        docs: Express.Multer.File[] | undefined,
        uploader: (
          filePath: string,
          vendorId: number,
          leadId: number,
          originalName: string,
          contentType: string
        ) => Promise<string>
      ) => {
        if (!docs || docs.length === 0) return [];
        const uploaded: { originalName: string; sysName: string }[] = [];

        for (const doc of docs) {
          const sysName = await uploader(
            doc.path,
            vendorId,
            leadId,
            doc.originalname,
            doc.mimetype
          );

          await fs.unlink(doc.path);

          uploaded.push({
            originalName: doc.originalname,
            sysName,
          });
        }

        return uploaded;
      };

      const uploadedFiles = {
        final_site_photos: await uploadFiles(
          files?.final_site_photos,
          uploadToWasabiFinalHandoverFinalSitePhotosFile
        ),
        warranty_card_photo: await uploadFiles(
          files?.warranty_card_photo,
          uploadToWasabiFinalHandoverWarrantyCardPhotosFile
        ),
        handover_booklet_photo: await uploadFiles(
          files?.handover_booklet_photo,
          uploadToWasabiFinalHandoverBookletPhotoFile
        ),
        final_handover_form_photo: await uploadFiles(
          files?.final_handover_form_photo,
          uploadToWasabiFinalHandoverFormPhotoFile
        ),
        qc_document: await uploadFiles(
          files?.qc_document,
          uploadToWasabiFinalHandoverQCDocumentFile
        ),
      };

      const result = await service.uploadFinalHandoverDocuments(
        vendorId,
        leadId,
        accountId,
        userId,
        uploadedFiles
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

  async isTotalProjectAmountPaid(req: Request, res: Response) {
    try {
      const vendorId = Number(req.params.vendorId);
      const leadId = Number(req.params.leadId);

      if (!vendorId || !leadId) {
        return res
          .status(400)
          .json(ApiResponse.error("vendorId and leadId are required", 400));
      }

      const result = await service.isTotalProjectAmountPaid(vendorId, leadId);

      return res
        .status(200)
        .json(
          ApiResponse.success(
            result,
            result.is_paid
              ? "Total project amount is fully paid"
              : "Pending amount remaining"
          )
        );
    } catch (error: any) {
      return res
        .status(error.statusCode || 500)
        .json(
          ApiResponse.error(
            error.message || "Internal server error",
            error.statusCode || 500
          )
        );
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
