import { Request, Response } from "express";
import { UnderInstallationStageService } from "../../../services/installation/under-installation/underInstallationStageService";
import { ApiResponse } from "../../../utils/apiResponse";
import {
  uploadToWasabiUnderInstallationDayWiseDocumentsFile,
  uploadToWasabiUnderInstallationMiscellaneousDocumentsFile,
  uploadToWasabiUnderInstallationUsableHandoverDocumentsFile,
  uploadToWasabiUnderInstallationUsableHandoverFinalSitePhotosFile,
} from "../../../utils/wasabiClient";
import logger from "../../../utils/logger";
import fs from "node:fs/promises";
import { BookingStageService } from "../../../services/bookingStage/bookingStage.service";
import { resolveClientBaseUrl } from "../../../utils/fileUtils";
import { prisma } from "../../../prisma/client";

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
              400,
            ),
          );
      }

      const baseUrl = resolveClientBaseUrl(req);
      const result =
        await UnderInstallationStageService.moveLeadToUnderInstallation(
          vendorId,
          leadId,
          updated_by,
          baseUrl,
        );

      return res
        .status(200)
        .json(
          ApiResponse.success(
            result,
            "Lead successfully moved to Under Installation stage",
          ),
        );
    } catch (error: any) {
      logger.error(
        "[UnderInstallationStageController] moveLeadToUnderInstallation Error:",
        error,
      );
      return res
        .status(500)
        .json(ApiResponse.error(error.message || "Internal server error"));
    }
  }

  /** ✅ Get all leads under Post-Dispatch Stage (Type 15) */
  async getAllUnderInstallationStageLeads(req: Request, res: Response) {
    try {
      const vendorIdParam = Array.isArray(req.params.vendorId)
        ? req.params.vendorId[0]
        : req.params.vendorId;
      const userIdParam = Array.isArray(req.params.userId)
        ? req.params.userId[0]
        : req.params.userId;
      const vendorId = Number(vendorIdParam);
      const userId = Number(userIdParam);

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
        page,
      );

      return res
        .status(200)
        .json(
          ApiResponse.success(
            leads,
            "Under Installation Stage leads fetched successfully",
          ),
        );
    } catch (error: any) {
      logger.error(
        "[UnderInstallationStageController] getAllUnderInstallationStageLeads Error:",
        error,
      );
      return res
        .status(500)
        .json(ApiResponse.error(error.message || "Internal server error", 500));
    }
  }

  /**
   * ✅ Get all Under Installation leads with any Miscellaneous items
   * @route POST /installation/under-installation/vendorId/:vendorId/get-all-leads-which-includes-any-miscellaneous-item
   */
  async getAllLeadsWhichIncludesAnyMiscellaneousItem(
    req: Request,
    res: Response,
  ) {
    try {
      const vendorIdParam = Array.isArray(req.params.vendorId)
        ? req.params.vendorId[0]
        : req.params.vendorId;
      const vendorId = Number(vendorIdParam);
      const userId = Number(req.body.userId);
      const franchiseId = Number(req.body.franchise_id);
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
          dateRange = { from, to: from }; // Single date selection
        } else if (from && to) {
          // Validate from <= to
          if (new Date(from) > new Date(to)) {
            return res.status(400).json({
              success: false,
              message: "'from' date cannot be after 'to' date",
            });
          }
          dateRange = { from, to };
        } else if (!from && to) {
          dateRange = { from: to, to }; // Only 'to' provided
        }
      }

      // ============================
      // COMPLETE FILTERS OBJECT
      // ============================
      const filters = {
        global_search: req.body.global_search,
        filter_lead_code: req.body.filter_lead_code,
        filter_name: req.body.filter_name,
        contact: req.body.contact,
        stagetag: req.body.stagetag,
        furniture_type: req.body.furniture_type,
        furniture_structure: req.body.furniture_structure,
        site_map_link: req.body.site_map_link,
        site_type: req.body.site_type,
        assign_to: req.body.assign_to,
        site_address: req.body.site_address,
        archetech_name: req.body.archetech_name,
        source: req.body.source,
        created_at: req.body.created_at,
        alt_contact_no: req.body.alt_contact_no,
        email: req.body.email,
        designer_remark: req.body.designer_remark,
        date_range: dateRange, // Normalized date range
      };

      // ============================
      // VALIDATION GATE
      // ============================
      if (!vendorId || !userId || !franchiseId) {
        logger.warn(
          "[UnderInstallationStageController] Missing vendorId or userId or franchiseId",
          {
            vendorId,
            userId,
            franchiseId,
          },
        );
        return res.status(400).json({
          success: false,
          message: "Vendor ID, User ID, and Franchise ID are required",
        });
      }

      logger.info(
        "[UnderInstallationStageController] getAllLeadsWhichIncludesAnyMiscellaneousItem called",
        {
          vendorId,
          userId,
          page,
          limit,
          dateRange,
          filters,
        },
      );

      // ============================
      // SERVICE CALL
      // ============================
      const { leads, count } = await BookingStageService.getUniversalTableData(
        vendorId,
        userId,
        franchiseId,
        undefined,
        "Type 15",
        page,
        limit,
        filters,
        { requirePendingMiscellaneous: true },
      );

      // ============================
      // RESPONSE
      // ============================
      return res.status(200).json({
        success: true,
        message: "Universal table data fetched successfully",
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
        "[UnderInstallationStageController] getAllLeadsWhichIncludesAnyMiscellaneousItem Error:",
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
              400,
            ),
          );
      }

      const result =
        await UnderInstallationStageService.setActualInstallationStartDate(
          vendorId,
          leadId,
          updated_by,
          new Date(actual_installation_start_date),
        );

      return res
        .status(200)
        .json(
          ApiResponse.success(
            result,
            "Actual installation start date updated successfully",
          ),
        );
    } catch (error: any) {
      logger.error(
        "[UnderInstallationStageController] setActualInstallationStartDate Error:",
        error,
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
          leadId,
        );

      return res
        .status(200)
        .json(
          ApiResponse.success(details, "Under Installation details fetched"),
        );
    } catch (error: any) {
      logger.error(
        "[UnderInstallationStageController] getUnderInstallationDetails Error:",
        error,
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
              400,
            ),
          );
      }

      if (!expected_installation_end_date) {
        return res
          .status(400)
          .json(
            ApiResponse.error(
              "expected_installation_end_date is required",
              400,
            ),
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
          installers,
        );

      return res
        .status(200)
        .json(
          ApiResponse.success(
            result,
            "Installers added and expected installation end date updated successfully",
          ),
        );
    } catch (error: any) {
      logger.error(
        "[UnderInstallationStageController] addInstallersAndSetEndDate Error:",
        error,
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
          leadId,
        );

      return res
        .status(200)
        .json(
          ApiResponse.success(
            installers,
            "Mapped installers fetched successfully",
          ),
        );
    } catch (error: any) {
      logger.error(
        "[UnderInstallationStageController] getMappedInstallers Error:",
        error,
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
              400,
            ),
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
              400,
            ),
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
          installers,
        );

      return res
        .status(200)
        .json(
          ApiResponse.success(
            result,
            "Installation details updated successfully",
          ),
        );
    } catch (error: any) {
      logger.error(
        "[UnderInstallationStageController] updateInstallationDetails Error:",
        error,
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
              400,
            ),
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
              400,
            ),
          );
      }

      const result =
        await UnderInstallationStageService.setInstallationCompletionStatus(
          vendorId,
          leadId,
          updated_by,
          is_carcass_installation_completed,
          is_shutter_installation_completed,
        );

      return res
        .status(200)
        .json(
          ApiResponse.success(
            result,
            "Installation completion status updated successfully",
          ),
        );
    } catch (error: any) {
      logger.error(
        "[UnderInstallationStageController] setInstallationCompletionStatus Error:",
        error,
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
              400,
            ),
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
              400,
            ),
          );
      }

      // 🔁 Reuse the same service as POST API
      const result =
        await UnderInstallationStageService.setInstallationCompletionStatus(
          vendorId,
          leadId,
          updated_by,
          is_carcass_installation_completed,
          is_shutter_installation_completed,
        );

      return res
        .status(200)
        .json(
          ApiResponse.success(
            result,
            "Installation completion status updated successfully",
          ),
        );
    } catch (error: any) {
      logger.error(
        "[UnderInstallationStageController] updateInstallationCompletionStatus Error:",
        error,
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

      const uploadedFiles: { originalName: string; sysName: string }[] = [];

      for (const file of files) {
        const sysName =
          await uploadToWasabiUnderInstallationDayWiseDocumentsFile(
            file.path,
            Number(vendorId),
            Number(leadId),
            file.originalname,
            file.mimetype,
          );

        await fs.unlink(file.path);

        uploadedFiles.push({
          originalName: file.originalname,
          sysName,
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
          uploadedFiles,
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
        error,
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
          Number(leadId),
        );

      return res.status(200).json({
        success: true,
        message: "Installation updates fetched successfully",
        data,
      });
    } catch (error: any) {
      logger.error(
        "[UnderInstallationStageController] getInstallationUpdatesDayWise Error:",
        error,
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

      const uploadedFiles: { originalName: string; sysName: string }[] = [];

      if (files && files.length > 0) {
        for (const file of files) {
          const sysName =
            await uploadToWasabiUnderInstallationMiscellaneousDocumentsFile(
              file.path,
              Number(vendorId),
              Number(leadId),
              file.originalname,
              file.mimetype,
            );

          await fs.unlink(file.path);

          uploadedFiles.push({
            originalName: file.originalname,
            sysName,
          });
        }
      }

      const baseUrl = resolveClientBaseUrl(req);
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
        files: uploadedFiles,
        baseUrl,
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



  
  async addMiscDocumentsController(req: Request, res: Response) {
    try {
      const miscId = Number(req.params.miscId);
      const vendor_id = Number(req.body.vendor_id); // ✅ parse
      const lead_id = Number(req.body.lead_id); // ✅ parse
      const created_by = Number(req.body.created_by); // ✅ parse

      // validate parsed values
      if (!vendor_id || !lead_id || !created_by) {
        return res.status(400).json({
          success: false,
          message: "vendor_id, lead_id, and created_by are required",
        });
      }

      const files = req.files as Express.Multer.File[];

      if (!files?.length) {
        return res.status(400).json({
          success: false,
          message: "No files uploaded",
        });
      }

      const uploadedFiles = [];

      for (const file of files) {
        const sysName =
          await uploadToWasabiUnderInstallationMiscellaneousDocumentsFile(
            file.path,
            vendor_id,
            lead_id,
            file.originalname,
            file.mimetype,
          );

        await fs.unlink(file.path);

        uploadedFiles.push({
          originalName: file.originalname,
          sysName,
        });
      }

      const result =
        await UnderInstallationStageService.addMiscDocumentsService({
          misc_id: miscId,
          vendor_id,
          lead_id,
          created_by,
          files: uploadedFiles,
        });

      return res.status(201).json({
        success: true,
        message: "Documents uploaded successfully",
        data: result,
      });
    } catch (err: any) {
      return res.status(500).json({
        success: false,
        error: err.message,
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
          leadId,
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

      const baseUrl = resolveClientBaseUrl(req);
      const data = await UnderInstallationStageService.updateERDService({
        vendor_id: vendorId,
        misc_id: miscId,
        expected_ready_date,
        updated_by,
        baseUrl,
      });

      return res.status(200).json({ success: true, data });
    } catch (error: any) {
      console.error("Error updating ERD:", error.message);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  async updateMiscApproval(req: Request, res: Response) {
    try {
      const vendorId = Number(req.params.vendorId);
      const miscId = Number(req.params.miscId);
      const { misc_approved, exp_of_rejection, approval_remark, updated_by } = req.body;

      if (!vendorId || !miscId) {
        return res.status(400).json({
          success: false,
          error: "vendorId and miscId are required",
        });
      }

      if (typeof misc_approved !== "boolean" || !updated_by) {
        return res.status(400).json({
          success: false,
          error: "misc_approved and updated_by are required",
        });
      }

      if (misc_approved === false && !exp_of_rejection) {
        return res.status(400).json({
          success: false,
          error: "exp_of_rejection is required when rejecting",
        });
      }

      if (misc_approved === true && !String(approval_remark ?? "").trim()) {
        return res.status(400).json({
          success: false,
          error: "approval_remark is required when approving",
        });
      }

      const data =
        await UnderInstallationStageService.updateMiscApprovalService({
          vendor_id: vendorId,
          misc_id: miscId,
          misc_approved,
          exp_of_rejection,
          approval_remark,
          updated_by,
        });

      return res.status(200).json({ success: true, data });
    } catch (error: any) {
      console.error("Error updating misc approval:", error.message);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  async updateMiscRequiredDeliveryDate(req: Request, res: Response) {
    try {
      const vendorId = Number(req.params.vendorId);
      const miscId = Number(req.params.miscId);
      const { required_delivery_date, updated_by } = req.body;

      if (!vendorId || !miscId) {
        return res.status(400).json({
          success: false,
          error: "vendorId and miscId are required",
        });
      }

      if (!required_delivery_date || !updated_by) {
        return res.status(400).json({
          success: false,
          error: "required_delivery_date and updated_by are required",
        });
      }

      const baseUrl = resolveClientBaseUrl(req);
      const data =
        await UnderInstallationStageService.updateMiscRequiredDeliveryDateService(
          {
            vendor_id: vendorId,
            misc_id: miscId,
            required_delivery_date,
            updated_by,
            baseUrl,
          },
        );

      return res.status(200).json({ success: true, data });
    } catch (error: any) {
      console.error("Error updating required delivery date:", error.message);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  async updateMiscRequiredDeliveryDateByTaskId(req: Request, res: Response) {
    try {
      const vendorId = Number(req.params.vendorId);
      const taskId = Number(req.params.taskId);
      const { required_delivery_date, updated_by } = req.body;

      if (!vendorId || !taskId) {
        return res.status(400).json({
          success: false,
          error: "vendorId and taskId are required",
        });
      }

      if (!required_delivery_date || !updated_by) {
        return res.status(400).json({
          success: false,
          error: "required_delivery_date and updated_by are required",
        });
      }

      const baseUrl = resolveClientBaseUrl(req);
      const data =
        await UnderInstallationStageService.updateMiscRequiredDeliveryDateByTaskIdService(
          {
            vendor_id: vendorId,
            task_id: taskId,
            required_delivery_date,
            updated_by,
            baseUrl,
          },
        );

      return res.status(200).json({ success: true, data });
    } catch (error: any) {
      console.error(
        "Error updating required delivery date by task:",
        error.message,
      );
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  async uploadMiscCompletionDocumentsByTaskId(req: Request, res: Response) {
    try {
      const vendorId = Number(req.params.vendorId);
      const taskId = Number(req.params.taskId);
      const { created_by } = req.body;

      if (!vendorId || !taskId || !created_by) {
        return res.status(400).json({
          success: false,
          error: "vendorId, taskId and created_by are required",
        });
      }

      const task = await prisma.userLeadTask.findFirst({
        where: {
          id: taskId,
          vendor_id: vendorId,
          task_type: "Miscellaneous",
        },
        select: { lead_id: true },
      });

      if (!task?.lead_id) {
        return res.status(404).json({
          success: false,
          error: "Miscellaneous task not found",
        });
      }

      const files = req.files as Express.Multer.File[];
      if (!files || files.length === 0) {
        return res.status(400).json({
          success: false,
          error: "At least one file is required",
        });
      }

      const uploadedFiles: { originalName: string; sysName: string }[] = [];

      for (const file of files) {
        const sysName =
          await uploadToWasabiUnderInstallationMiscellaneousDocumentsFile(
            file.path,
            vendorId,
            task.lead_id,
            file.originalname,
            file.mimetype,
          );

        await fs.unlink(file.path);

        uploadedFiles.push({
          originalName: file.originalname,
          sysName,
        });
      }

      const data =
        await UnderInstallationStageService.uploadMiscCompletionDocumentsByTaskIdService(
          {
            vendor_id: vendorId,
            task_id: taskId,
            created_by: Number(created_by),
            files: uploadedFiles,
          },
        );

      return res.status(200).json({
        success: true,
        data,
      });
    } catch (error: any) {
      console.error(
        "Error uploading misc completion documents:",
        error.message,
      );
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  async createInstallationIssueLog(req: Request, res: Response) {
    try {
      const {
        vendor_id,
        lead_id,
        account_id,
        issue_type_ids,
        issue_description,
        issue_impact,
        responsible_team_ids,
        created_by,
      } = req.body;

      // Mandatory checks
      if (
        !vendor_id ||
        !lead_id ||
        !account_id ||
        !issue_type_ids?.length ||
        !issue_description ||
        !issue_impact ||
        !responsible_team_ids?.length ||
        !created_by
      ) {
        return res.status(400).json({
          success: false,
          message: "All fields are mandatory",
        });
      }

      const data = await UnderInstallationStageService.addInstallationIssueLog({
        vendor_id,
        lead_id,
        account_id,
        issue_type_ids,
        issue_description,
        issue_impact,
        responsible_team_ids,
        created_by,
      });

      return res.status(201).json({ success: true, data });
    } catch (error: any) {
      console.error("Error creating Installation Issue Log:", error.message);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  async getInstallationIssueLogs(req: Request, res: Response) {
    try {
      const vendorIdParam = Array.isArray(req.params.vendor_id)
        ? req.params.vendor_id[0]
        : req.params.vendor_id;
      const leadIdParam = Array.isArray(req.params.lead_id)
        ? req.params.lead_id[0]
        : req.params.lead_id;
      const vendor_id = Number(vendorIdParam);
      const lead_id = Number(leadIdParam);

      if (!vendor_id || !lead_id) {
        return res.status(400).json({
          success: false,
          message: "vendor_id and lead_id are required",
        });
      }

      const data = await UnderInstallationStageService.getInstallationIssueLogs(
        vendor_id,
        lead_id,
      );

      return res.status(200).json({ success: true, data });
    } catch (err: any) {
      console.error("Error fetching issue logs:", err.message);
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  async getInstallationIssueLogById(req: Request, res: Response) {
    try {
      const idParam = Array.isArray(req.params.id)
        ? req.params.id[0]
        : req.params.id;
      const id = Number(idParam);

      if (!id) {
        return res.status(400).json({
          success: false,
          message: "id is required",
        });
      }

      const data =
        await UnderInstallationStageService.getInstallationIssueLogById(id);

      if (!data) {
        return res.status(404).json({
          success: false,
          message: "Issue log not found",
        });
      }

      return res.status(200).json({ success: true, data });
    } catch (err: any) {
      console.error("Error fetching issue log:", err.message);
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  async updateInstallationIssueLog(req: Request, res: Response) {
    try {
      const idParam = Array.isArray(req.params.id)
        ? req.params.id[0]
        : req.params.id;
      const id = Number(idParam);

      if (!id)
        return res.status(400).json({
          success: false,
          message: "id is required",
        });

      const {
        issue_type_ids,
        issue_description,
        issue_impact,
        responsible_team_ids,
        updated_by,
      } = req.body;

      // Ensure at least one field is sent
      if (
        !issue_type_ids &&
        !issue_description &&
        !issue_impact &&
        !responsible_team_ids
      ) {
        return res.status(400).json({
          success: false,
          message: "At least one field must be updated",
        });
      }

      if (!updated_by) {
        return res.status(400).json({
          success: false,
          message: "updated_by is required",
        });
      }

      const data =
        await UnderInstallationStageService.updateInstallationIssueLog(id, {
          issue_type_ids,
          issue_description,
          issue_impact,
          responsible_team_ids,
          updated_by,
        });

      return res.status(200).json({ success: true, data });
    } catch (error: any) {
      console.error("Error updating issue log:", error.message);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  async updateUsableHandover(req: Request, res: Response) {
    try {
      const {
        vendor_id,
        lead_id,
        account_id,
        created_by,
        pending_work_details,
      } = req.body;

      if (!vendor_id || !lead_id || !account_id || !created_by) {
        return res.status(400).json({
          success: false,
          message: "vendor_id, lead_id, account_id, created_by are required",
        });
      }

      const files = (req.files as Express.Multer.File[]) || [];

      const uploadedFiles: {
        originalName: string;
        sysName: string;
        isImage: boolean;
      }[] = [];

      for (const file of files) {
        const isImage = file.mimetype.startsWith("image/");
        const sysName = isImage
          ? await uploadToWasabiUnderInstallationUsableHandoverFinalSitePhotosFile(
            file.path,
            Number(vendor_id),
            Number(lead_id),
            file.originalname,
            file.mimetype,
          )
          : await uploadToWasabiUnderInstallationUsableHandoverDocumentsFile(
            file.path,
            Number(vendor_id),
            Number(lead_id),
            file.originalname,
            file.mimetype,
          );

        await fs.unlink(file.path);

        uploadedFiles.push({
          originalName: file.originalname,
          sysName,
          isImage,
        });
      }

      const data = await UnderInstallationStageService.updateUsableHandover({
        vendor_id: Number(vendor_id),
        lead_id: Number(lead_id),
        account_id: Number(account_id),
        created_by: Number(created_by),
        pending_work_details,
        files: uploadedFiles,
      });

      return res.status(200).json({
        success: true,
        message: "Usable Handover updated successfully",
        data,
      });
    } catch (error: any) {
      console.error("Error in updateUsableHandover:", error.message);
      return res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  async getUsableHandover(req: Request, res: Response) {
    try {
      const { vendor_id, lead_id } = req.params;

      const data = await UnderInstallationStageService.getUsableHandover(
        Number(vendor_id),
        Number(lead_id),
      );

      return res.status(200).json({ success: true, data });
    } catch (error: any) {
      console.error("Error fetching usable handover:", error.message);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  async updateRemarks(req: Request, res: Response) {
    try {
      const { vendor_id, lead_id, pending_work_details } = req.body;

      if (!vendor_id || !lead_id) {
        return res.status(400).json({
          success: false,
          message: "vendor_id and lead_id are required",
        });
      }

      const data = await UnderInstallationStageService.updateRemarks(
        Number(vendor_id),
        Number(lead_id),
        pending_work_details,
      );

      return res.status(200).json({
        success: true,
        message: "Remarks updated successfully",
        data,
      });
    } catch (error: any) {
      console.error("Error updating remarks:", error.message);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  async markUsableHandoverCompleted(req: Request, res: Response) {
    try {
      const vendorId = Number(req.params.vendorId);
      const leadId = Number(req.params.leadId);
      const { updated_by } = req.body;

      if (!vendorId || !leadId || !updated_by) {
        return res.status(400).json({
          success: false,
          error: "vendorId, leadId and updated_by are required",
        });
      }

      const data =
        await UnderInstallationStageService.markUsableHandoverCompleted(
          vendorId,
          leadId,
          Number(updated_by),
        );

      return res.status(200).json({ success: true, data });
    } catch (error: any) {
      console.error("Error marking usable handover completed:", error.message);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  /**
   * ✅ Move Lead to Final Handover Stage (Type 16)
   * @route PUT /leads/installation/under-installation/vendorId/:vendorId/leadId/:leadId/move-to-final-handover
   */
  async moveLeadToFinalHandover(req: Request, res: Response) {
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
              400,
            ),
          );
      }

      const baseUrl = resolveClientBaseUrl(req);
      const result =
        await UnderInstallationStageService.moveLeadToFinalHandover(
          vendorId,
          leadId,
          updated_by,
          baseUrl,
        );

      return res
        .status(200)
        .json(
          ApiResponse.success(
            result,
            "Lead successfully moved to Final Handover stage",
          ),
        );
    } catch (error: any) {
      logger.error(
        "[UnderInstallationStageController] moveLeadToFinalHandover Error:",
        error,
      );

      return res
        .status(500)
        .json(ApiResponse.error(error.message || "Internal server error"));
    }
  }

  /** 🔥 Check Carcass + End Date + Installer Assigned */
  async checkUsableHandoverReadyFlag(req: Request, res: Response) {
    try {
      const vendorId = Number(req.params.vendorId);
      const leadId = Number(req.params.leadId);

      const result = await service.checkUsableHandoverReady(vendorId, leadId);

      if (!result) {
        return res.status(404).json({
          success: false,
          message: "Lead not found.",
        });
      }

      const { isReady, details } = result;

      const pending: string[] = [];
      const completed: string[] = [];

      if (details.carcassCompleted) completed.push("Carcass Installation");
      else pending.push("Carcass Installation");

      if (details.expectedEndDateFilled)
        completed.push("Expected Installation End Date");
      else pending.push("Expected Installation End Date");

      if (details.installersAssigned > 0) completed.push("Installer Assigned");
      else pending.push("Installer Assignment");

      return res.json({
        success: true,
        data: {
          isReady,
          completed,
          pending,
          details,
        },
        message: isReady
          ? "Lead is ready for Usable Handover."
          : "Lead is NOT ready. Some steps are pending.",
      });
    } catch (error) {
      console.error("Error checking usable handover flag:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error.",
      });
    }
  }

  async checkLeadReadyForFinalHandover(req: Request, res: Response) {
    try {
      const { vendorId, leadId } = req.params;

      const result = await service.checkLeadReadyForFinalHandover(
        Number(vendorId),
        Number(leadId),
      );

      return res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      console.error("Final handover readiness check failed:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error.",
      });
    }
  }

  async resolveMiscellaneousEntry(req: Request, res: Response) {
    try {
      const vendorId = Number(req.params.vendorId);
      const leadId = Number(req.params.leadId);
      const miscId = Number(req.params.miscId);

      const { resolved_by } = req.body; // userId

      if (!resolved_by) {
        return res.status(400).json({
          success: false,
          message: "resolved_by (userId) is required",
        });
      }

      const baseUrl = resolveClientBaseUrl(req);
      const result =
        await UnderInstallationStageService.resolveMiscellaneousService({
          vendor_id: vendorId,
          lead_id: leadId,
          misc_id: miscId,
          resolved_by: Number(resolved_by),
          baseUrl,
        });

      return res.status(200).json({
        success: true,
        message: "Miscellaneous entry marked as resolved",
        data: result,
      });
    } catch (err: any) {
      console.error("❌ Error in resolveMiscellaneousEntry:", err.message);
      return res.status(500).json({
        success: false,
        error: err.message || "Something went wrong",
      });
    }
  }

  async markMiscellaneousTaskReady(req: Request, res: Response) {
    try {
      const vendorId = Number(req.params.vendorId);
      const leadId = Number(req.params.leadId);
      const miscId = Number(req.params.miscId);

      const { ready_by } = req.body;

      if (!ready_by) {
        return res.status(400).json({
          success: false,
          message: "ready_by (userId) is required",
        });
      }

      const baseUrl = resolveClientBaseUrl(req);
      await UnderInstallationStageService.markMiscTaskReady({
        vendor_id: vendorId,
        lead_id: leadId,
        misc_id: miscId,
        ready_by: Number(ready_by),
        baseUrl,
      });

      return res.status(200).json({
        success: true,
        message: "Miscellaneous task marked as ready",
      });
    } catch (err: any) {
      console.error("❌ Error in markMiscellaneousTaskReady:", err.message);
      return res.status(500).json({
        success: false,
        error: err.message || "Something went wrong",
      });
    }
  }

  async getMiscellaneousResolutionStatus(req: Request, res: Response) {
    try {
      const vendorId = Number(req.params.vendorId);
      const leadId = Number(req.params.leadId);

      if (!vendorId || !leadId) {
        return res.status(400).json({
          success: false,
          message: "Invalid vendorId or leadId",
        });
      }

      const result =
        await UnderInstallationStageService.checkMiscellaneousResolved(
          vendorId,
          leadId,
        );

      return res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      console.error("Misc status error:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to evaluate miscellaneous status",
      });
    }
  }

  /**
   * GET /leads/installation/under-installation/vendorId/:vendorId/report/installation-data
   * Query params: franchise_id (optional), from_date (optional), to_date (optional)
   */
  getInstallationReportData = async (req: Request, res: Response) => {
    try {
      const vendorId = Number(req.params.vendorId);
      const franchiseId = req.query.franchise_id ? Number(req.query.franchise_id) : null;
      const leadId = req.query.lead_id ? Number(req.query.lead_id) : null;
      const fromDate = req.query.from_date ? String(req.query.from_date) : null;
      const toDate = req.query.to_date ? String(req.query.to_date) : null;

      if (!vendorId) {
        return res.status(400).json(ApiResponse.error("vendorId is required", 400));
      }

      console.log("[InstallationReport] Fetching report data", { vendorId, franchiseId, leadId, fromDate, toDate });

      const data = await UnderInstallationStageService.getInstallationReportData(
        vendorId,
        franchiseId,
        leadId,
        fromDate,
        toDate,
      );

      console.log(`[InstallationReport] Returning ${data.length} leads`);

      return res.status(200).json(ApiResponse.success(data, `Fetched ${data.length} installation leads`));
    } catch (error: any) {
      console.error("[InstallationReport] Error:", error);
      return res.status(500).json(ApiResponse.error("Failed to fetch installation report data"));
    }
  };

  /**
   * GET /leads/installation/under-installation/vendorId/:vendorId/report/misc-issue-log-data
   * Query params: franchise_id (optional), from_date (optional), to_date (optional)
   */
  getMiscIssueLogReportData = async (
    req: Request,
    res: Response,
  ) => {
    try {
      const vendorId = Number(req.params.vendorId);

      const franchiseId =
        req.query.franchise_id
          ? Number(req.query.franchise_id)
          : null;

      const leadId =
        req.query.lead_id
          ? Number(req.query.lead_id)
          : null;

      const fromDate =
        req.query.from_date
          ? String(req.query.from_date)
          : null;

      const toDate =
        req.query.to_date
          ? String(req.query.to_date)
          : null;

      // NEW
      const teamIds =
        req.query.team_ids
          ? String(req.query.team_ids)
            .split(",")
            .map((id) => Number(id))
            .filter((id) => !isNaN(id))
          : undefined;

      if (!vendorId) {
        return res
          .status(400)
          .json(
            ApiResponse.error(
              "vendorId is required",
              400,
            ),
          );
      }

      const data =
        await UnderInstallationStageService.getMiscIssueLogReportData(
          vendorId,
          franchiseId,
          leadId,
          fromDate,
          toDate,
          teamIds, // NEW
        );

      return res.status(200).json(
        ApiResponse.success(
          data,
          `Fetched ${data.length} misc and issue log rows`,
        ),
      );

    } catch (error: any) {
      console.error(
        "[MiscIssueLogReport] Error:",
        error,
      );

      return res.status(500).json(
        ApiResponse.error(
          "Failed to fetch misc and issue log report data",
        ),
      );
    }
  };
}
