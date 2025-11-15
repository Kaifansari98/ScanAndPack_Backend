import { Request, Response } from "express";
import { UnderInstallationStageService } from "../../../services/installation/under-installation/underInstallationStageService";
import { ApiResponse } from "../../../utils/apiResponse";
import logger from "../../../utils/logger";
import underInstallationStageRoutes from "../../../routes/installation/under-installation/underInstallation.routes";

const service = new UnderInstallationStageService();

export class UnderInstallationStageController {
  /**
   * ✅ Move Lead to Under Installation Stage (Type 15)
   * @route PUT /leads/installation/under-installation/vendorId/:vendorId/leadId/:leadId/move-to-under-installation
   */
  async moveLeadToUnderInstallation(req: Request, res: Response) {
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

      const result =
        await UnderInstallationStageService.moveLeadToUnderInstallation(
          vendorId,
          leadId,
          updated_by
        );

      return res
        .status(200)
        .json(
          ApiResponse.success(
            result,
            "Lead successfully moved to Under Installation stage"
          )
        );
    } catch (error: any) {
      logger.error(
        "[UnderInstallationStageController] moveLeadToUnderInstallation Error:",
        error
      );
      return res
        .status(500)
        .json(ApiResponse.error(error.message || "Internal server error"));
    }
  }

  /** ✅ Get all leads under Post-Dispatch Stage (Type 15) */
  async getAllUnderInstallationStageLeads(req: Request, res: Response) {
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

      const leads = await service.getLeadsWithStatusUnderInstallationStage(
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
            "Under Installation Stage leads fetched successfully"
          )
        );
    } catch (error: any) {
      logger.error(
        "[UnderInstallationStageController] getAllUnderInstallationStageLeads Error:",
        error
      );
      return res
        .status(500)
        .json(ApiResponse.error(error.message || "Internal server error", 500));
    }
  }

  /**
   * ✅ Set actual installation start date for a lead
   * @route PUT /installation/under-installation-stage/vendorId/:vendorId/leadId/:leadId/set-actual-installation-start-date
   */
  async setActualInstallationStartDate(req: Request, res: Response) {
    try {
      const vendorId = Number(req.params.vendorId);
      const leadId = Number(req.params.leadId);
      const { updated_by, actual_installation_start_date } = req.body;

      if (
        !vendorId ||
        !leadId ||
        !updated_by ||
        !actual_installation_start_date
      ) {
        return res
          .status(400)
          .json(
            ApiResponse.error(
              "vendorId, leadId, updated_by, and actual_installation_start_date are required",
              400
            )
          );
      }

      const result =
        await UnderInstallationStageService.setActualInstallationStartDate(
          vendorId,
          leadId,
          updated_by,
          new Date(actual_installation_start_date)
        );

      return res
        .status(200)
        .json(
          ApiResponse.success(
            result,
            "Actual installation start date updated successfully"
          )
        );
    } catch (error: any) {
      logger.error(
        "[UnderInstallationStageController] setActualInstallationStartDate Error:",
        error
      );
      return res
        .status(500)
        .json(ApiResponse.error(error.message || "Internal server error"));
    }
  }

  /**
   * ✅ Get some_under_installation_details for a lead
   * @route GET /installation/under-installation-stage/vendorId/:vendorId/leadId/:leadId/some_under_installation_details
   */
  async getUnderInstallationDetails(req: Request, res: Response) {
    try {
      const vendorId = Number(req.params.vendorId);
      const leadId = Number(req.params.leadId);

      if (!vendorId || !leadId) {
        return res
          .status(400)
          .json(ApiResponse.error("vendorId and leadId are required", 400));
      }

      const details =
        await UnderInstallationStageService.getUnderInstallationDetails(
          vendorId,
          leadId
        );

      return res
        .status(200)
        .json(
          ApiResponse.success(details, "Under Installation details fetched")
        );
    } catch (error: any) {
      logger.error(
        "[UnderInstallationStageController] getUnderInstallationDetails Error:",
        error
      );
      return res
        .status(500)
        .json(ApiResponse.error(error.message || "Internal server error"));
    }
  }

  /**
   * ✅ Add multiple installers & set expected installation end date
   * @route POST /leads/installation/under-installation/vendorId/:vendorId/leadId/:leadId/add-installers
   */
  async addInstallersAndSetEndDate(req: Request, res: Response) {
    try {
      const vendorId = Number(req.params.vendorId);
      const leadId = Number(req.params.leadId);
      const { updated_by, expected_installation_end_date, installers } =
        req.body;

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

      if (!expected_installation_end_date) {
        return res
          .status(400)
          .json(
            ApiResponse.error("expected_installation_end_date is required", 400)
          );
      }

      if (!Array.isArray(installers) || installers.length === 0) {
        return res
          .status(400)
          .json(ApiResponse.error("installers must be a non-empty array", 400));
      }

      const result =
        await UnderInstallationStageService.addInstallersAndSetEndDate(
          vendorId,
          leadId,
          updated_by,
          new Date(expected_installation_end_date),
          installers
        );

      return res
        .status(200)
        .json(
          ApiResponse.success(
            result,
            "Installers added and expected installation end date updated successfully"
          )
        );
    } catch (error: any) {
      logger.error(
        "[UnderInstallationStageController] addInstallersAndSetEndDate Error:",
        error
      );
      return res
        .status(500)
        .json(ApiResponse.error(error.message || "Internal server error"));
    }
  }

  /**
   * ✅ Get all mapped installers for a specific lead
   * @route GET /leads/installation/under-installation/vendorId/:vendorId/leadId/:leadId/installers
   */
  async getMappedInstallers(req: Request, res: Response) {
    try {
      const vendorId = Number(req.params.vendorId);
      const leadId = Number(req.params.leadId);

      if (!vendorId || !leadId) {
        return res
          .status(400)
          .json(ApiResponse.error("vendorId and leadId are required", 400));
      }

      const installers =
        await UnderInstallationStageService.getMappedInstallers(
          vendorId,
          leadId
        );

      return res
        .status(200)
        .json(
          ApiResponse.success(
            installers,
            "Mapped installers fetched successfully"
          )
        );
    } catch (error: any) {
      logger.error(
        "[UnderInstallationStageController] getMappedInstallers Error:",
        error
      );
      return res
        .status(500)
        .json(ApiResponse.error(error.message || "Internal server error"));
    }
  }

  /**
   * ✅ Update expected installation end date and/or installers
   * @route PUT /leads/installation/under-installation/vendorId/:vendorId/leadId/:leadId/update-installation-details
   */
  async updateInstallationDetails(req: Request, res: Response) {
    try {
      const vendorId = Number(req.params.vendorId);
      const leadId = Number(req.params.leadId);
      const { updated_by, expected_installation_end_date, installers } =
        req.body;

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

      if (
        !expected_installation_end_date &&
        (!Array.isArray(installers) || installers.length === 0)
      ) {
        return res
          .status(400)
          .json(
            ApiResponse.error(
              "At least one of expected_installation_end_date or installers must be provided",
              400
            )
          );
      }

      const result =
        await UnderInstallationStageService.updateInstallationDetails(
          vendorId,
          leadId,
          updated_by,
          expected_installation_end_date
            ? new Date(expected_installation_end_date)
            : undefined,
          installers
        );

      return res
        .status(200)
        .json(
          ApiResponse.success(
            result,
            "Installation details updated successfully"
          )
        );
    } catch (error: any) {
      logger.error(
        "[UnderInstallationStageController] updateInstallationDetails Error:",
        error
      );
      return res
        .status(500)
        .json(ApiResponse.error(error.message || "Internal server error"));
    }
  }

  /**
   * ✅ Set carcass/shutter installation completion status
   * @route POST /leads/installation/under-installation/vendorId/:vendorId/leadId/:leadId/set-installation-completion
   */
  async setInstallationCompletionStatus(req: Request, res: Response) {
    try {
      const vendorId = Number(req.params.vendorId);
      const leadId = Number(req.params.leadId);
      const {
        updated_by,
        is_carcass_installation_completed,
        is_shutter_installation_completed,
      } = req.body;

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

      if (
        typeof is_carcass_installation_completed === "undefined" &&
        typeof is_shutter_installation_completed === "undefined"
      ) {
        return res
          .status(400)
          .json(
            ApiResponse.error(
              "At least one of is_carcass_installation_completed or is_shutter_installation_completed must be provided",
              400
            )
          );
      }

      const result =
        await UnderInstallationStageService.setInstallationCompletionStatus(
          vendorId,
          leadId,
          updated_by,
          is_carcass_installation_completed,
          is_shutter_installation_completed
        );

      return res
        .status(200)
        .json(
          ApiResponse.success(
            result,
            "Installation completion status updated successfully"
          )
        );
    } catch (error: any) {
      logger.error(
        "[UnderInstallationStageController] setInstallationCompletionStatus Error:",
        error
      );
      return res
        .status(500)
        .json(ApiResponse.error(error.message || "Internal server error"));
    }
  }

  /**
   * ✅ Update carcass/shutter installation completion status
   * @route PUT /leads/installation/under-installation/vendorId/:vendorId/leadId/:leadId/update-installation-completion
   */
  async updateInstallationCompletionStatus(req: Request, res: Response) {
    try {
      const vendorId = Number(req.params.vendorId);
      const leadId = Number(req.params.leadId);
      const {
        updated_by,
        is_carcass_installation_completed,
        is_shutter_installation_completed,
      } = req.body;

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

      if (
        typeof is_carcass_installation_completed === "undefined" &&
        typeof is_shutter_installation_completed === "undefined"
      ) {
        return res
          .status(400)
          .json(
            ApiResponse.error(
              "At least one of is_carcass_installation_completed or is_shutter_installation_completed must be provided",
              400
            )
          );
      }

      // 🔁 Reuse the same service as POST API
      const result =
        await UnderInstallationStageService.setInstallationCompletionStatus(
          vendorId,
          leadId,
          updated_by,
          is_carcass_installation_completed,
          is_shutter_installation_completed
        );

      return res
        .status(200)
        .json(
          ApiResponse.success(
            result,
            "Installation completion status updated successfully"
          )
        );
    } catch (error: any) {
      logger.error(
        "[UnderInstallationStageController] updateInstallationCompletionStatus Error:",
        error
      );
      return res
        .status(500)
        .json(ApiResponse.error(error.message || "Internal server error"));
    }
  }

  /**
   * ✅ Upload Installation Updates (Day Wise)
   * @route POST /leads/installation/under-installation/vendorId/:vendorId/leadId/:leadId/upload-installation-updates-day-wise
   */
  async uploadInstallationUpdatesDayWise(req: Request, res: Response) {
    try {
      console.log("🔥 Day-wise Upload Route Mounted");
      const { vendorId, leadId } = req.params;
      const { account_id, created_by, remark, update_date } = req.body;
      const files = req.files as Express.Multer.File[];

      if (!vendorId || !leadId || !created_by) {
        return res.status(400).json({
          success: false,
          message: "vendorId, leadId, and created_by are required",
        });
      }

      if (!update_date) {
        return res.status(400).json({
          success: false,
          message: "update_date is required for day-wise upload",
        });
      }

      if (!files || files.length === 0) {
        return res.status(400).json({
          success: false,
          message: "At least one file must be uploaded",
        });
      }

      const uploaded =
        await UnderInstallationStageService.uploadInstallationUpdatesDayWise(
          Number(vendorId),
          Number(leadId),
          account_id ? Number(account_id) : null,
          Number(created_by),
          new Date(update_date),
          remark || null,
          files
        );

      return res.status(200).json({
        success: true,
        message: "Installation Day Wise Updates uploaded successfully",
        count: uploaded.length,
        data: uploaded,
      });
    } catch (error: any) {
      logger.error(
        "[UnderInstallationStageController] uploadInstallationUpdatesDayWise Error:",
        error
      );
      return res.status(error.statusCode || 500).json({
        success: false,
        message:
          error.message ||
          "Internal server error while uploading Installation Day Wise Updates",
      });
    }
  }

  /**
   * ✅ Get Installation Updates – Day Wise
   */
  async getInstallationUpdatesDayWise(req: Request, res: Response) {
    try {
      const { vendorId, leadId } = req.params;

      if (!vendorId || !leadId) {
        return res.status(400).json({
          success: false,
          message: "vendorId and leadId are required",
        });
      }

      const data =
        await UnderInstallationStageService.getInstallationUpdatesDayWise(
          Number(vendorId),
          Number(leadId)
        );

      return res.status(200).json({
        success: true,
        message: "Installation updates fetched successfully",
        data,
      });
    } catch (error: any) {
      logger.error(
        "[UnderInstallationStageController] getInstallationUpdatesDayWise Error:",
        error
      );
      return res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || "Internal server error",
      });
    }
  }

  async createMiscellaneousEntry(req: Request, res: Response) {
    try {
      const vendorId = Number(req.params.vendorId);
      const leadId = Number(req.params.leadId);

      const {
        account_id,
        misc_type_id,
        problem_description,
        reorder_material_details,
        quantity,
        cost,
        supervisor_remark,
        expected_ready_date,
        is_resolved,
        teams, // comma-separated string "1,2,3"
        created_by,
      } = req.body;

      const files = req.files as Express.Multer.File[];

      const parsedTeams = teams
        ? teams.split(",").map((t: string) => Number(t.trim()))
        : [];

      const payload = {
        vendor_id: vendorId,
        lead_id: leadId,
        account_id: Number(account_id),
        misc_type_id: Number(misc_type_id),
        problem_description,
        reorder_material_details,
        quantity: quantity ? Number(quantity) : undefined,
        cost: cost ? Number(cost) : undefined,
        supervisor_remark: supervisor_remark || undefined,
        expected_ready_date: expected_ready_date
          ? new Date(expected_ready_date)
          : undefined,
        is_resolved: is_resolved === "true" ? true : false,
        created_by: Number(created_by),
        teams: parsedTeams,
        files,
      };

      const result =
        await UnderInstallationStageService.createMiscellaneousService(payload);

      return res.status(201).json({
        success: true,
        message: "Miscellaneous entry created successfully",
        data: result,
      });
    } catch (err: any) {
      console.error("❌ Error in createMiscellaneousEntry:", err.message);
      return res.status(500).json({
        success: false,
        error: err.message || "Something went wrong",
      });
    }
  }

  async getAllMiscellaneousEntries(req: Request, res: Response) {
    try {
      const vendorId = Number(req.params.vendorId);
      const leadId = Number(req.params.leadId);

      const result =
        await UnderInstallationStageService.getAllMiscellaneousService(
          vendorId,
          leadId
        );

      return res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err: any) {
      console.error("❌ Error in getAllMiscellaneousEntries:", err.message);
      return res.status(500).json({
        success: false,
        error: err.message || "Something went wrong",
      });
    }
  }

  async updateMiscExpectedReadyDate(req: Request, res: Response) {
    try {
      const vendorId = Number(req.params.vendorId);
      const miscId = Number(req.params.miscId);
      const { expected_ready_date, updated_by } = req.body;
  
      if (!vendorId || !miscId) {
        return res.status(400).json({
          success: false,
          error: "vendorId and miscId are required",
        });
      }
  
      if (!expected_ready_date || !updated_by) {
        return res.status(400).json({
          success: false,
          error: "expected_ready_date and updated_by are required",
        });
      }
  
      const data = await UnderInstallationStageService.updateERDService({
        vendor_id: vendorId,
        misc_id: miscId,
        expected_ready_date,
        updated_by,
      });
  
      return res.status(200).json({ success: true, data });
    } catch (error: any) {
      console.error("Error updating ERD:", error.message);
      return res.status(500).json({ success: false, error: error.message });
    }
  };
}
