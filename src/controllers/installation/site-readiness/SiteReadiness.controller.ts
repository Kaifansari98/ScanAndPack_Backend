import { Request, Response } from "express";
import { SiteReadinessService } from "../../../services/installation/site-readiness/SiteReadiness.service";
import logger from "../../../utils/logger";
import { ApiResponse } from "../../../utils/apiResponse";

const service = new SiteReadinessService();

export class SiteReadinessController {
  /** ✅ Get all leads under Site Readiness (Type 12) */
  async getAllSiteReadinessLeads(req: Request, res: Response) {
    try {
      const vendorId = parseInt(req.params.vendorId);
      const userId = parseInt(req.params.userId);

      if (!vendorId || !userId) {
        return res.status(400).json({
          success: false,
          message: "Vendor ID and User ID are required",
        });
      }

      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;

      const leads = await service.getLeadsWithStatusSiteReadiness(
        vendorId,
        userId,
        limit,
        page
      );

      return res.status(200).json({
        success: true,
        message: "Site Readiness leads fetched successfully",
        count: leads.total,
        data: leads,
        ...leads,
      });
    } catch (error: any) {
      logger.error(
        "[SiteReadinessController] getAllSiteReadinessLeads Error:",
        error
      );
      return res.status(500).json({
        success: false,
        message: error.message || "Internal server error",
      });
    }
  }

  /**
   * ✅ Create one or multiple Site Readiness entries
   * @route POST /leads/installation/site-readiness/vendorId/:vendorId/leadId/:leadId/create
   */
  async createSiteReadiness(req: Request, res: Response) {
    try {
      const vendorId = Number(req.params.vendorId);
      const leadId = Number(req.params.leadId);

      if (!vendorId || !leadId) {
        return res
          .status(400)
          .json(ApiResponse.error("vendorId and leadId are required", 400));
      }

      let payload: any;

      if (req.body.data) {
        try {
          payload = JSON.parse(req.body.data);
        } catch {
          return res
            .status(400)
            .json(ApiResponse.error("Invalid JSON in 'data' field", 400));
        }
      } else {
        payload = req.body;
      }

      if (!Array.isArray(payload) && typeof payload !== "object") {
        return res
          .status(400)
          .json(ApiResponse.error("Expected object or array of objects", 400));
      }

      const data = await SiteReadinessService.createSiteReadiness(
        vendorId,
        leadId,
        payload
      );

      return res
        .status(201)
        .json(
          ApiResponse.created(
            data,
            "Site Readiness entries created successfully"
          )
        );
    } catch (error: any) {
      console.error(
        "[SiteReadinessController] createSiteReadiness Error:",
        error
      );
      return res
        .status(500)
        .json(ApiResponse.error(error.message || "Internal server error"));
    }
  }

  /**
   * ✅ Fetch all Site Readiness records
   * @route GET /leads/installation/site-readiness/vendorId/:vendorId
   * @query leadId (optional), accountId (optional)
   */
  async getSiteReadinessRecords(req: Request, res: Response) {
    try {
      const vendorId = Number(req.params.vendorId);
      const leadId = req.query.leadId ? Number(req.query.leadId) : undefined;
      const accountId = req.query.accountId
        ? Number(req.query.accountId)
        : undefined;

      if (!vendorId) {
        return res
          .status(400)
          .json(ApiResponse.error("vendorId is required", 400));
      }

      const records = await SiteReadinessService.getSiteReadinessRecords(
        vendorId,
        leadId,
        accountId
      );

      return res
        .status(200)
        .json(
          ApiResponse.success(
            records,
            "Site Readiness records fetched successfully"
          )
        );
    } catch (error: any) {
      console.error(
        "[SiteReadinessController] getSiteReadinessRecords Error:",
        error
      );
      return res
        .status(500)
        .json(ApiResponse.error(error.message || "Internal server error"));
    }
  }

  /**
   * ✅ Update one or multiple Site Readiness entries
   * @route PUT /leads/installation/site-readiness/vendorId/:vendorId/leadId/:leadId/update
   */
  async updateSiteReadiness(req: Request, res: Response) {
    try {
      const vendorId = Number(req.params.vendorId);
      const leadId = Number(req.params.leadId);

      if (!vendorId || !leadId) {
        return res
          .status(400)
          .json(ApiResponse.error("vendorId and leadId are required", 400));
      }

      let payload: any;

      // ✅ Parse form-data JSON string
      if (req.body.data) {
        try {
          payload = JSON.parse(req.body.data);
        } catch {
          return res
            .status(400)
            .json(ApiResponse.error("Invalid JSON in 'data' field", 400));
        }
      } else {
        payload = req.body;
      }

      // Must be object or array
      if (!Array.isArray(payload) && typeof payload !== "object") {
        return res
          .status(400)
          .json(ApiResponse.error("Expected object or array of objects", 400));
      }

      const result = await SiteReadinessService.updateSiteReadiness(
        vendorId,
        leadId,
        payload
      );

      return res
        .status(200)
        .json(
          ApiResponse.success(
            result,
            "Site Readiness entries updated successfully"
          )
        );
    } catch (error: any) {
      console.error(
        "[SiteReadinessController] updateSiteReadiness Error:",
        error
      );
      return res
        .status(500)
        .json(ApiResponse.error(error.message || "Internal server error"));
    }
  }

  // ✅ Upload Current Site Photos at Site Readiness
  async uploadCurrentSitePhotosAtSiteReadiness(req: Request, res: Response) {
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

      const uploaded = await service.uploadCurrentSitePhotosAtSiteReadiness(
        Number(vendorId),
        Number(leadId),
        account_id ? Number(account_id) : null,
        Number(created_by),
        files
      );

      return res.status(200).json({
        success: true,
        message: "Current Site Photos uploaded successfully (Site Readiness)",
        count: uploaded.length,
        data: uploaded,
      });
    } catch (error: any) {
      console.error(
        "[SiteReadinessController] uploadCurrentSitePhotosAtSiteReadiness Error:",
        error
      );
      return res.status(error.statusCode || 500).json({
        success: false,
        message:
          error.message ||
          "Internal server error while uploading current site photos",
      });
    }
  }

  // ✅ Get Current Site Photos at Site Readiness
  async getCurrentSitePhotosAtSiteReadiness(req: Request, res: Response) {
    try {
      const { vendorId, leadId } = req.params;

      if (!vendorId || !leadId) {
        return res.status(400).json({
          success: false,
          message: "vendorId and leadId are required",
        });
      }

      const photos = await service.getCurrentSitePhotosAtSiteReadiness(
        Number(vendorId),
        Number(leadId)
      );

      return res.status(200).json({
        success: true,
        message: "Fetched Current Site Photos successfully (Site Readiness)",
        count: photos.length,
        data: photos,
      });
    } catch (error: any) {
      console.error(
        "[SiteReadinessController] getCurrentSitePhotosAtSiteReadiness Error:",
        error
      );
      return res.status(error.statusCode || 500).json({
        success: false,
        message:
          error.message ||
          "Internal server error while fetching current site photos",
      });
    }
  }

  /**
   * ✅ Check if Site Readiness is completed
   * @route GET /leads/installation/site-readiness/vendorId/:vendorId/leadId/:leadId/is-site-readiness-completed
   * Returns { is_site_readiness_completed: boolean }
   */
  async checkSiteReadinessCompletion(req: Request, res: Response) {
    try {
      const vendorId = Number(req.params.vendorId);
      const leadId = Number(req.params.leadId);

      if (!vendorId || !leadId) {
        return res
          .status(400)
          .json(ApiResponse.error("vendorId and leadId are required", 400));
      }

      const result = await service.checkSiteReadinessCompletion(
        vendorId,
        leadId
      );

      return res
        .status(200)
        .json(
          ApiResponse.success(
            result,
            "Site readiness completion status fetched successfully"
          )
        );
    } catch (error: any) {
      console.error(
        "[SiteReadinessController] checkSiteReadinessCompletion Error:",
        error
      );
      return res
        .status(500)
        .json(ApiResponse.error(error.message || "Internal server error"));
    }
  }

  /**
   * ✅ Move Lead to Dispatch Planning Stage
   * @route PUT /leads/installation/site-readiness/vendorId/:vendorId/leadId/:leadId/move-to-dispatch-planning
   */
  async moveLeadToDispatchPlanning(req: Request, res: Response) {
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

      const result = await SiteReadinessService.moveLeadToDispatchPlanning(
        vendorId,
        leadId,
        updated_by
      );

      return res
        .status(200)
        .json(
          ApiResponse.success(
            result,
            "Lead successfully moved to Dispatch Planning stage"
          )
        );
    } catch (error: any) {
      console.error(
        "[SiteReadinessController] moveLeadToDispatchPlanning Error:",
        error
      );
      return res
        .status(500)
        .json(ApiResponse.error(error.message || "Internal server error"));
    }
  }
}
