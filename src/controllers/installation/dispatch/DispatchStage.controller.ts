import { Request, Response } from "express";
import { DispatchStageService } from "../../../services/installation/dispatch/DispatchStage.service";
import { ApiResponse } from "../../../utils/apiResponse";
import logger from "../../../utils/logger";

const service = new DispatchStageService();

export class DispatchStageController {
  /** ✅ Get all leads under Dispatch Stage (Type 14) */
  async getAllDispatchStageLeads(req: Request, res: Response) {
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

      const leads = await service.getLeadsWithStatusDispatchStage(
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
            "Dispatch Stage leads fetched successfully"
          )
        );
    } catch (error: any) {
      logger.error(
        "[DispatchStageController] getAllDispatchStageLeads Error:",
        error
      );
      return res
        .status(500)
        .json(ApiResponse.error(error.message || "Internal server error", 500));
    }
  }

  /** ✅ Get required_date_for_dispatch by Lead ID & Vendor ID */
  async getRequiredDateForDispatch(req: Request, res: Response) {
    try {
      const vendorId = parseInt(req.params.vendorId);
      const leadId = parseInt(req.params.leadId);

      if (!vendorId || !leadId) {
        return res
          .status(400)
          .json(ApiResponse.error("Vendor ID and Lead ID are required", 400));
      }

      const lead = await service.getRequiredDateForDispatch(vendorId, leadId);

      return res
        .status(200)
        .json(
          ApiResponse.success(
            lead,
            "Required date for dispatch fetched successfully"
          )
        );
    } catch (error: any) {
      logger.error(
        "[DispatchStageController] getRequiredDateForDispatch Error:",
        error
      );
      return res
        .status(500)
        .json(ApiResponse.error(error.message || "Internal server error", 500));
    }
  }

  /** ✅ POST → Add Dispatch Details */
  async addDispatchDetails(req: Request, res: Response) {
    try {
      const vendorId = parseInt(req.params.vendorId);
      const leadId = parseInt(req.params.leadId);
      const {
        dispatch_date,
        driver_name,
        driver_number,
        vehicle_no,
        dispatch_remark,
        updated_by,
      } = req.body;

      if (!vendorId || !leadId) {
        return res
          .status(400)
          .json(ApiResponse.error("Vendor ID and Lead ID are required", 400));
      }

      const data = await service.addDispatchDetails(vendorId, leadId, {
        dispatch_date,
        driver_name,
        driver_number,
        vehicle_no,
        dispatch_remark,
        updated_by,
      });

      return res
        .status(200)
        .json(ApiResponse.success(data, "Dispatch details added successfully"));
    } catch (error: any) {
      console.error(
        "[DispatchStageController] addDispatchDetails Error:",
        error.message,
        error.stack
      );
      return res.status(500).json({
        success: false,
        message: error.message || "Internal server error",
      });
    }
  }

  /** ✅ GET → Fetch Dispatch details */
  async getDispatchDetails(req: Request, res: Response) {
    try {
      const vendorId = parseInt(req.params.vendorId);
      const leadId = parseInt(req.params.leadId);

      if (!vendorId || !leadId) {
        return res
          .status(400)
          .json(ApiResponse.error("Vendor ID and Lead ID are required", 400));
      }

      const data = await service.getDispatchDetails(vendorId, leadId);

      return res
        .status(200)
        .json(
          ApiResponse.success(data, "Dispatch details fetched successfully")
        );
    } catch (error: any) {
      logger.error(
        "[DispatchStageController] getDispatchDetails Error:",
        error
      );
      return res
        .status(500)
        .json(ApiResponse.error(error.message || "Internal server error", 500));
    }
  }

  // ✅ Upload Dispatch Photos & Documents
  async uploadDispatchDocuments(req: Request, res: Response) {
    try {
      const { vendorId, leadId } = req.params;
      const { account_id, created_by } = req.body;
      const files = req.files as Express.Multer.File[];

      if (!vendorId || !leadId || !created_by) {
        return res.status(400).json({
          success: false,
          message: "vendorId, leadId and created_by are required",
        });
      }

      if (!files || files.length === 0) {
        return res.status(400).json({
          success: false,
          message: "At least one file must be uploaded",
        });
      }

      const uploaded = await service.uploadDispatchDocuments(
        Number(vendorId),
        Number(leadId),
        account_id ? Number(account_id) : null,
        Number(created_by),
        files
      );

      return res.status(200).json({
        success: true,
        message: "Dispatch Photos & Documents uploaded successfully",
        count: uploaded.length,
        data: uploaded,
      });
    } catch (error: any) {
      logger.error(
        "[DispatchStageController] uploadDispatchDocuments Error:",
        error
      );
      return res.status(error.statusCode || 500).json({
        success: false,
        message:
          error.message ||
          "Internal server error while uploading Dispatch Photos & Documents",
      });
    }
  }

  // ✅ GET → Fetch Dispatch Photos & Documents (with Signed URLs)
  async getDispatchDocuments(req: Request, res: Response) {
    try {
      const { vendorId, leadId } = req.params;

      if (!vendorId || !leadId) {
        return res.status(400).json({
          success: false,
          message: "vendorId and leadId are required",
        });
      }

      const docs = await service.getDispatchDocuments(
        Number(vendorId),
        Number(leadId)
      );

      return res.status(200).json({
        success: true,
        message: "Dispatch Photos & Documents fetched successfully",
        count: docs.length,
        data: docs,
      });
    } catch (error: any) {
      logger.error(
        "[DispatchStageController] getDispatchDocuments Error:",
        error
      );
      return res.status(error.statusCode || 500).json({
        success: false,
        message:
          error.message ||
          "Internal server error while fetching Dispatch Photos & Documents",
      });
    }
  }

  // ✅ Check if Lead is Ready for Post-Dispatch
  async checkReadyForPostDispatch(req: Request, res: Response) {
    try {
      const { vendorId, leadId } = req.params;

      if (!vendorId || !leadId) {
        return res.status(400).json({
          success: false,
          message: "vendorId and leadId are required",
        });
      }

      const result = await service.checkReadyForPostDispatch(
        Number(vendorId),
        Number(leadId)
      );

      return res.status(200).json({
        success: true,
        ...result,
      });
    } catch (error: any) {
      logger.error(
        "[DispatchStageController] checkReadyForPostDispatch Error:",
        error
      );
      return res.status(500).json({
        success: false,
        message:
          error.message ||
          "Internal server error while checking post-dispatch readiness",
      });
    }
  }

  // ✅ Upload Post Dispatch Photos & Documents
  async uploadPostDispatchDocuments(req: Request, res: Response) {
    try {
      const { vendorId, leadId } = req.params;
      const { account_id, created_by } = req.body;
      const files = req.files as Express.Multer.File[];

      if (!vendorId || !leadId || !created_by) {
        return res.status(400).json({
          success: false,
          message: "vendorId, leadId and created_by are required",
        });
      }

      if (!files || files.length === 0) {
        return res.status(400).json({
          success: false,
          message: "At least one file must be uploaded",
        });
      }

      const uploaded = await service.uploadPostDispatchDocuments(
        Number(vendorId),
        Number(leadId),
        account_id ? Number(account_id) : null,
        Number(created_by),
        files
      );

      return res.status(200).json({
        success: true,
        message: "Post Dispatch Photos & Documents uploaded successfully",
        count: uploaded.length,
        data: uploaded,
      });
    } catch (error: any) {
      logger.error(
        "[DispatchStageController] uploadPostDispatchDocuments Error:",
        error
      );
      return res.status(error.statusCode || 500).json({
        success: false,
        message:
          error.message ||
          "Internal server error while uploading Post Dispatch Photos & Documents",
      });
    }
  }

  // ✅ Get Post Dispatch Photos & Documents (with signed URLs)
  async getPostDispatchDocuments(req: Request, res: Response) {
    try {
      const { vendorId, leadId } = req.params;

      if (!vendorId || !leadId) {
        return res.status(400).json({
          success: false,
          message: "vendorId and leadId are required",
        });
      }

      const documents = await service.getPostDispatchDocuments(
        Number(vendorId),
        Number(leadId)
      );

      return res.status(200).json({
        success: true,
        message: "Post Dispatch Photos & Documents fetched successfully",
        count: documents.length,
        data: documents,
      });
    } catch (error: any) {
      logger.error(
        "[DispatchStageController] getPostDispatchDocuments Error:",
        error
      );
      return res.status(error.statusCode || 500).json({
        success: false,
        message:
          error.message ||
          "Internal server error while fetching Post Dispatch Photos & Documents",
      });
    }
  }
}
