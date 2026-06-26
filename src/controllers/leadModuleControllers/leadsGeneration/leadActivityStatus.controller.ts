import { Request, Response } from "express";
import { LeadActivityStatusService } from "../../../services/leadModuleServices/leadsGeneration/leadActivityStatus.service";
import { ApiResponse } from "../../../utils/apiResponse";
import { ActivityStatus } from "../../../prisma/generated";
import logger from "../../../utils/logger";
import { resolveClientBaseUrl } from "../../../../src/utils/fileUtils";

const getParam = (param: unknown): string | undefined => {
  if (typeof param === "string") return param;
  if (Array.isArray(param) && typeof param[0] === "string") return param[0];
  return undefined;
};

export class LeadActivityStatusController {
  static async updateStatus(req: Request, res: Response) {
    try {
      const { leadId } = req.params;
      const {
        vendorId,
        accountId,
        userId,
        status,
        remark,
        createdBy,
        dueDate,
      } = req.body;

      if (
        ![
          ActivityStatus.onHold,
          ActivityStatus.lost,
          ActivityStatus.lostApproval,
        ].includes(status)
      ) {
        return res
          .status(400)
          .json(
            ApiResponse.error(
              "Only onHold, lost or lostApproval statuses are allowed",
              400,
            ),
          );
      }

      if (!remark) {
        return res
          .status(400)
          .json(ApiResponse.validationError("Remark is required."));
      }
      const clientBaseUrl = resolveClientBaseUrl(req);
      const lead = await LeadActivityStatusService.updateStatus(
        Number(leadId),
        vendorId,
        accountId,
        userId,
        status,
        remark,
        createdBy,
        clientBaseUrl,
        dueDate, // 👈 pass dueDate
      );

      return res
        .status(200)
        .json(ApiResponse.success(lead, "Lead activity status updated"));
    } catch (error: any) {
      return res
        .status(500)
        .json(ApiResponse.error(error.message || "Internal Server Error"));
    }
  }

  static async revertToOnGoing(req: Request, res: Response) {
    try {
      const { leadId } = req.params;
      const { vendorId, accountId, userId, remark, createdBy } = req.body;

      if (!remark) {
        return res
          .status(400)
          .json(ApiResponse.validationError("Remark is required."));
      }

      const baseUrl = resolveClientBaseUrl(req);

      const lead = await LeadActivityStatusService.revertToOnGoing(
        Number(leadId),
        vendorId,
        accountId,
        userId,
        remark,
        createdBy,
        baseUrl,
      );

      return res
        .status(200)
        .json(ApiResponse.success(lead, "Lead reverted to onGoing"));
    } catch (error: any) {
      return res
        .status(500)
        .json(ApiResponse.error(error.message || "Internal Server Error"));
    }
  }

  static async getActivityStatusCounts(req: Request, res: Response) {
    try {
      const vendorId = Number(getParam(req.params.vendorId));
      const franchiseIdRaw = getParam(req.query.franchise_id);
      const franchiseId =
        franchiseIdRaw !== undefined ? Number(franchiseIdRaw) : undefined;
      const assignToRaw = getParam(req.query.assign_to);
      const assignTo =
        assignToRaw !== undefined ? Number(assignToRaw) : undefined;

      if (!vendorId) {
        return res
          .status(400)
          .json(ApiResponse.error("Vendor ID is required", 400));
      }

      const data =
        await LeadActivityStatusService.getActivityStatusCount(
          vendorId,
          Number.isNaN(franchiseId) ? undefined : franchiseId,
          Number.isNaN(assignTo) ? undefined : assignTo,
        );

      logger.info("Fetched lead activity status counts", {
        vendorId,
        franchiseId,
        assignTo,
        data,
      });

      return res.json(
        ApiResponse.success(data, "Lead activity status counts fetched"),
      );
    } catch (error: any) {
      logger.error("Error fetching lead activity status counts", { error });
      return res
        .status(500)
        .json(ApiResponse.error("Internal server error", 500, error.message));
    }
  }

  static async getOnHoldLeadsFilter(req: Request, res: Response) {
    try {
      const vendorId = Number(getParam(req.params.vendorId));
      const page = parseInt((req.body.page as string) || "1");
      const limit = parseInt((req.body.limit as string) || "10");

      // ============================
      // DATE RANGE VALIDATION & NORMALIZATION
      // ============================
      let dateRange: { from: string; to: string } | undefined;

      if (req.body.date_range) {
        const { from, to } = req.body.date_range;

        // Validate 'from' date
        if (from && isNaN(Date.parse(from))) {
          return res.status(400).json({
            success: false,
            message: "Invalid 'from' date format. Use YYYY-MM-DD or ISO format",
          });
        }

        // Validate 'to' date
        if (to && isNaN(Date.parse(to))) {
          return res.status(400).json({
            success: false,
            message: "Invalid 'to' date format. Use YYYY-MM-DD or ISO format",
          });
        }

        // 🔥 NORMALIZE: Single date becomes range
        if (from && !to) {
          dateRange = { from, to: from };
        } else if (from && to) {
          if (new Date(from) > new Date(to)) {
            return res.status(400).json({
              success: false,
              message: "'from' date cannot be after 'to' date",
            });
          }
          dateRange = { from, to };
        } else if (!from && to) {
          dateRange = { from: to, to };
        }
      }

      const filters = {
        franchise_id: req.body.franchise_id,
        global_search: req.body.global_search,
        filter_lead_code: req.body.filter_lead_code,
        filter_name: req.body.filter_name,
        contact: req.body.contact,
        furniture_type: req.body.furniture_type,
        furniture_structure: req.body.furniture_structure,
        site_map_link: req.body.site_map_link,
        site_type: req.body.site_type,
        assign_to: req.body.assign_to,
        site_address: req.body.site_address,
        source: req.body.source,
        status: req.body.status,
        date_range: dateRange,
        created_at: req.body.created_at,
      };

      // ============================
      // VALIDATION GATE
      // ============================
      if (!vendorId) {
        logger.warn("[LeadActivityStatusController] Missing vendorId", {
          vendorId,
        });
        return res.status(400).json({
          success: false,
          message: "Vendor ID is required",
        });
      }

      logger.info(
        "[LeadActivityStatusController] getOnHoldLeadsFilter called",
        {
          vendorId,
          page,
          limit,
          dateRange,
        },
      );

      const { leads, count } =
        await LeadActivityStatusService.getOnHoldLeadsFilter(
          vendorId,
          page,
          limit,
          filters,
        );

      return res.status(200).json({
        success: true,
        message: "OnHold leads fetched successfully",
        count,
        data: leads,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(count / limit),
          totalRecords: count,
          hasNext: page * limit < count,
          hasPrev: page > 1,
        },
      });
    } catch (error: any) {
      logger.error(
        "[LeadActivityStatusController] getOnHoldLeadsFilter Error",
        {
          error: error.message,
          stack: error.stack,
        },
      );
      return res.status(500).json({
        success: false,
        message: error.message || "Something went wrong",
      });
    }
  }

  static async getLostLeadsFilter(req: Request, res: Response) {
    try {
      const vendorId = Number(getParam(req.params.vendorId));
      const page = parseInt((req.body.page as string) || "1");
      const limit = parseInt((req.body.limit as string) || "10");

      // ============================
      // DATE RANGE VALIDATION & NORMALIZATION
      // ============================
      let dateRange: { from: string; to: string } | undefined;

      if (req.body.date_range) {
        const { from, to } = req.body.date_range;

        // Validate 'from' date
        if (from && isNaN(Date.parse(from))) {
          return res.status(400).json({
            success: false,
            message: "Invalid 'from' date format. Use YYYY-MM-DD or ISO format",
          });
        }

        // Validate 'to' date
        if (to && isNaN(Date.parse(to))) {
          return res.status(400).json({
            success: false,
            message: "Invalid 'to' date format. Use YYYY-MM-DD or ISO format",
          });
        }

        // 🔥 NORMALIZE: Single date becomes range
        if (from && !to) {
          dateRange = { from, to: from };
        } else if (from && to) {
          if (new Date(from) > new Date(to)) {
            return res.status(400).json({
              success: false,
              message: "'from' date cannot be after 'to' date",
            });
          }
          dateRange = { from, to };
        } else if (!from && to) {
          dateRange = { from: to, to };
        }
      }

      const filters = {
        franchise_id: req.body.franchise_id,
        global_search: req.body.global_search,
        filter_lead_code: req.body.filter_lead_code,
        filter_name: req.body.filter_name,
        contact: req.body.contact,
        furniture_type: req.body.furniture_type,
        furniture_structure: req.body.furniture_structure,
        site_map_link: req.body.site_map_link,
        site_type: req.body.site_type,
        assign_to: req.body.assign_to,
        site_address: req.body.site_address,
        source: req.body.source,
        status: req.body.status,
        date_range: dateRange,
        created_at: req.body.created_at,
      };

      // ============================
      // VALIDATION GATE
      // ============================
      if (!vendorId) {
        logger.warn("[LeadActivityStatusController] Missing vendorId", {
          vendorId,
        });
        return res.status(400).json({
          success: false,
          message: "Vendor ID is required",
        });
      }

      logger.info("[LeadActivityStatusController] getLostLeadsFilter called", {
        vendorId,
        page,
        limit,
        dateRange,
      });

      const { leads, count } =
        await LeadActivityStatusService.getLostLeadsFilter(
          vendorId,
          page,
          limit,
          filters,
        );

      return res.status(200).json({
        success: true,
        message: "Lost leads fetched successfully",
        count,
        data: leads,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(count / limit),
          totalRecords: count,
          hasNext: page * limit < count,
          hasPrev: page > 1,
        },
      });
    } catch (error: any) {
      logger.error("[LeadActivityStatusController] getLostLeadsFilter Error", {
        error: error.message,
        stack: error.stack,
      });
      return res.status(500).json({
        success: false,
        message: error.message || "Something went wrong",
      });
    }
  }

  static async getLostApprovalLeadsFilter(req: Request, res: Response) {
    try {
      const vendorId = Number(getParam(req.params.vendorId));
      const page = parseInt((req.body.page as string) || "1");
      const limit = parseInt((req.body.limit as string) || "10");

      // ============================
      // DATE RANGE VALIDATION & NORMALIZATION
      // ============================
      let dateRange: { from: string; to: string } | undefined;

      if (req.body.date_range) {
        const { from, to } = req.body.date_range;

        // Validate 'from' date
        if (from && isNaN(Date.parse(from))) {
          return res.status(400).json({
            success: false,
            message: "Invalid 'from' date format. Use YYYY-MM-DD or ISO format",
          });
        }

        // Validate 'to' date
        if (to && isNaN(Date.parse(to))) {
          return res.status(400).json({
            success: false,
            message: "Invalid 'to' date format. Use YYYY-MM-DD or ISO format",
          });
        }

        // 🔥 NORMALIZE: Single date becomes range
        if (from && !to) {
          dateRange = { from, to: from };
        } else if (from && to) {
          if (new Date(from) > new Date(to)) {
            return res.status(400).json({
              success: false,
              message: "'from' date cannot be after 'to' date",
            });
          }
          dateRange = { from, to };
        } else if (!from && to) {
          dateRange = { from: to, to };
        }
      }

      const filters = {
        franchise_id: req.body.franchise_id,
        global_search: req.body.global_search,
        filter_lead_code: req.body.filter_lead_code,
        filter_name: req.body.filter_name,
        contact: req.body.contact,
        furniture_type: req.body.furniture_type,
        furniture_structure: req.body.furniture_structure,
        site_map_link: req.body.site_map_link,
        site_type: req.body.site_type,
        assign_to: req.body.assign_to,
        site_address: req.body.site_address,
        source: req.body.source,
        status: req.body.status,
        date_range: dateRange,
        created_at: req.body.created_at,
      };

      // ============================
      // VALIDATION GATE
      // ============================
      if (!vendorId) {
        logger.warn("[LeadActivityStatusController] Missing vendorId", {
          vendorId,
        });
        return res.status(400).json({
          success: false,
          message: "Vendor ID is required",
        });
      }

      logger.info(
        "[LeadActivityStatusController] getLostApprovalLeadsFilter called",
        {
          vendorId,
          page,
          limit,
          dateRange,
        },
      );

      const { leads, count } =
        await LeadActivityStatusService.getLostApprovalLeadsFilter(
          vendorId,
          page,
          limit,
          filters,
        );

      return res.status(200).json({
        success: true,
        message: "LostApproval leads fetched successfully",
        count,
        data: leads,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(count / limit),
          totalRecords: count,
          hasNext: page * limit < count,
          hasPrev: page > 1,
        },
      });
    } catch (error: any) {
      logger.error(
        "[LeadActivityStatusController] getLostApprovalLeadsFilter Error",
        {
          error: error.message,
          stack: error.stack,
        },
      );
      return res.status(500).json({
        success: false,
        message: error.message || "Something went wrong",
      });
    }
  }
}
