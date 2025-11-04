import { Request, Response } from "express";
import { PostProductionService } from "../../../../services/production/post-production/postProduction.service";

const service = new PostProductionService();

export class PostProductionController {
  async uploadQcPhotos(req: Request, res: Response) {
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

      const uploaded = await service.uploadQcPhotos(
        Number(vendorId),
        Number(leadId),
        account_id ? Number(account_id) : null,
        Number(created_by),
        files
      );

      return res.status(200).json({
        success: true,
        message: "QC Photos uploaded successfully",
        count: uploaded.length,
        data: uploaded,
      });
    } catch (error: any) {
      console.error("[PostProductionController] uploadQcPhotos Error:", error);
      return res.status(error.statusCode || 500).json({
        success: false,
        message:
          error.message || "Internal server error while uploading QC Photos",
      });
    }
  }

  async uploadHardwarePackingDetails(req: Request, res: Response) {
    try {
      const { vendorId, leadId } = req.params;
      const { account_id, created_by, remark } = req.body;
      const files = req.files as Express.Multer.File[];

      if (!vendorId || !leadId || !created_by) {
        return res.status(400).json({
          success: false,
          message: "vendorId, leadId and created_by are required",
        });
      }

      // ✅ At least one of remark or files must be provided
      if ((!remark || remark.trim() === "") && (!files || files.length === 0)) {
        return res.status(400).json({
          success: false,
          message: "Either remark or at least one file must be provided",
        });
      }

      const uploaded = await service.uploadHardwarePackingDetails(
        Number(vendorId),
        Number(leadId),
        account_id ? Number(account_id) : null,
        Number(created_by),
        remark,
        files
      );

      return res.status(200).json({
        success: true,
        message: "Hardware Packing Details uploaded successfully",
        data: uploaded,
      });
    } catch (error: any) {
      console.error(
        "[PostProductionController] uploadHardwarePackingDetails Error:",
        error
      );
      return res.status(error.statusCode || 500).json({
        success: false,
        message:
          error.message ||
          "Internal server error while uploading hardware packing details",
      });
    }
  }

  async uploadWoodworkPackingDetails(req: Request, res: Response) {
    try {
      const { vendorId, leadId } = req.params;
      const { account_id, created_by, remark } = req.body;
      const files = req.files as Express.Multer.File[];

      if (!vendorId || !leadId || !created_by) {
        return res.status(400).json({
          success: false,
          message: "vendorId, leadId and created_by are required",
        });
      }

      if ((!remark || remark.trim() === "") && (!files || files.length === 0)) {
        return res.status(400).json({
          success: false,
          message: "Either remark or at least one file must be provided",
        });
      }

      const uploaded = await service.uploadWoodworkPackingDetails(
        Number(vendorId),
        Number(leadId),
        account_id ? Number(account_id) : null,
        Number(created_by),
        remark,
        files
      );

      return res.status(200).json({
        success: true,
        message: "Woodwork Packing Details uploaded successfully",
        data: uploaded,
      });
    } catch (error: any) {
      console.error(
        "[PostProductionController] uploadWoodworkPackingDetails Error:",
        error
      );
      return res.status(error.statusCode || 500).json({
        success: false,
        message:
          error.message ||
          "Internal server error while uploading woodwork packing details",
      });
    }
  }

  // ✅ GET QC Photos
  async getQcPhotos(req: Request, res: Response) {
    try {
      const { vendorId, leadId } = req.params;

      if (!vendorId || !leadId) {
        return res.status(400).json({
          success: false,
          message: "vendorId and leadId are required",
        });
      }

      const data = await service.getQcPhotos(Number(vendorId), Number(leadId));

      return res.status(200).json({
        success: true,
        message: "QC Photos fetched successfully",
        count: data.length,
        data,
      });
    } catch (error: any) {
      console.error("[PostProductionController] getQcPhotos Error:", error);
      return res.status(500).json({
        success: false,
        message:
          error.message || "Internal server error while fetching QC Photos",
      });
    }
  }

  // ✅ GET Hardware Packing Details
  async getHardwarePackingDetails(req: Request, res: Response) {
    try {
      const { vendorId, leadId } = req.params;

      if (!vendorId || !leadId) {
        return res.status(400).json({
          success: false,
          message: "vendorId and leadId are required",
        });
      }

      const data = await service.getHardwarePackingDetails(
        Number(vendorId),
        Number(leadId)
      );

      return res.status(200).json({
        success: true,
        message: "Hardware Packing Details fetched successfully",
        remark: data.remark,
        count: data.documents.length,
        data: data.documents,
      });
    } catch (error: any) {
      console.error(
        "[PostProductionController] getHardwarePackingDetails Error:",
        error
      );
      return res.status(500).json({
        success: false,
        message:
          error.message ||
          "Internal server error while fetching Hardware Packing Details",
      });
    }
  }

  // ✅ GET Woodwork Packing Details
  async getWoodworkPackingDetails(req: Request, res: Response) {
    try {
      const { vendorId, leadId } = req.params;

      if (!vendorId || !leadId) {
        return res.status(400).json({
          success: false,
          message: "vendorId and leadId are required",
        });
      }

      const data = await service.getWoodworkPackingDetails(
        Number(vendorId),
        Number(leadId)
      );

      return res.status(200).json({
        success: true,
        message: "Woodwork Packing Details fetched successfully",
        remark: data.remark,
        count: data.documents.length,
        data: data.documents,
      });
    } catch (error: any) {
      console.error(
        "[PostProductionController] getWoodworkPackingDetails Error:",
        error
      );
      return res.status(500).json({
        success: false,
        message:
          error.message ||
          "Internal server error while fetching Woodwork Packing Details",
      });
    }
  }

  async updateNoOfBoxes(req: Request, res: Response) {
    try {
      const { vendorId, leadId } = req.params;
      const { account_id, user_id, no_of_boxes } = req.body;

      if (!vendorId || !leadId || !user_id || !no_of_boxes) {
        return res.status(400).json({
          success: false,
          message: "vendorId, leadId, user_id and no_of_boxes are required",
        });
      }

      const value = parseInt(no_of_boxes);
      if (isNaN(value) || value <= 0) {
        return res.status(400).json({
          success: false,
          message: "no_of_boxes must be a positive integer",
        });
      }

      const updated = await service.updateNoOfBoxes(
        Number(vendorId),
        Number(leadId),
        Number(account_id) || null,
        Number(user_id),
        value
      );

      return res.status(200).json({
        success: true,
        message: "No. of Boxes updated successfully",
        data: updated,
      });
    } catch (error: any) {
      console.error("[PostProductionController] updateNoOfBoxes Error:", error);
      return res.status(error.statusCode || 500).json({
        success: false,
        message:
          error.message || "Internal server error while updating No. of Boxes",
      });
    }
  }

  // ✅ GET No. of Boxes by Lead
  async getNoOfBoxes(req: Request, res: Response) {
    try {
      const { vendorId, leadId } = req.params;

      if (!vendorId || !leadId) {
        return res.status(400).json({
          success: false,
          message: "vendorId and leadId are required",
        });
      }

      const data = await service.getNoOfBoxes(Number(vendorId), Number(leadId));

      if (!data) {
        return res.status(404).json({
          success: false,
          message: "Lead not found or deleted",
        });
      }

      return res.status(200).json({
        success: true,
        message: "No. of Boxes fetched successfully",
        data,
      });
    } catch (error: any) {
      console.error("[PostProductionController] getNoOfBoxes Error:", error);
      return res.status(error.statusCode || 500).json({
        success: false,
        message:
          error.message || "Internal server error while fetching No. of Boxes",
      });
    }
  }
}
