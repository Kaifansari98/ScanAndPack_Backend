import { Request, Response } from "express";
import { TaskService } from "../../services/task/task.service";
import logger from "../../../src/utils/logger";
import { date } from "joi";

export class TaskController {
  static async getTasks(req: Request, res: Response) {
    try {
      const vendorId = Number(req.params.vendorId);
      const userId = Number(req.params.userId);
      const franchiseId = Number(req.query.franchise_id);

      if (isNaN(vendorId) || isNaN(userId) || isNaN(franchiseId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid vendorId, userId, or franchise_id",
        });
      }

      const { tasks, count } = await TaskService.getTasksByVendorAndUser2(
        vendorId,
        userId,
        franchiseId,
        1,
        1000,
        {},
      );

      return res.status(200).json({
        success: true,
        count,
        data: tasks,
      });
    } catch (error: any) {
      console.error("[TaskController] getTasks error:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to fetch tasks",
        error: error.message,
      });
    }
  }

  static async getTasks2(req: Request, res: Response) {
    try {
      const vendorId = Number(req.params.vendorId);
      const userId = Number(req.params.userId);
      const franchiseId = Number(req.body.franchise_id);

      const page = parseInt((req.body.page as string) || "1");
      const limit = parseInt((req.body.limit as string) || "10");

      // ============================
      // 🔥 DATE RANGE VALIDATION & NORMALIZATION (DUE DATE)
      // ============================
      let dateRange: { from: string; to: string } | undefined;

      if (req.body.date_range) {
        const { from, to } = req.body.date_range;

        // Validate
        if (from && isNaN(Date.parse(from))) {
          return res.status(400).json({
            success: false,
            message: "Invalid 'from' date format in date_range. Use YYYY-MM-DD",
          });
        }

        if (to && isNaN(Date.parse(to))) {
          return res.status(400).json({
            success: false,
            message: "Invalid 'to' date format in date_range. Use YYYY-MM-DD",
          });
        }

        // Normalize
        if (from && !to) {
          dateRange = { from, to: from };
        } else if (from && to) {
          if (new Date(from) > new Date(to)) {
            return res.status(400).json({
              success: false,
              message: "'from' date cannot be after 'to' date in date_range",
            });
          }
          dateRange = { from, to };
        } else if (!from && to) {
          dateRange = { from: to, to };
        }
      }

      // ============================
      // 🔥 ASSIGNED AT RANGE VALIDATION & NORMALIZATION
      // ============================
      let assignatRange: { from: string; to: string } | undefined;

      if (req.body.assignat_range) {
        const { from, to } = req.body.assignat_range;

        // Validate
        if (from && isNaN(Date.parse(from))) {
          return res.status(400).json({
            success: false,
            message:
              "Invalid 'from' date format in assignat_range. Use YYYY-MM-DD",
          });
        }

        if (to && isNaN(Date.parse(to))) {
          return res.status(400).json({
            success: false,
            message:
              "Invalid 'to' date format in assignat_range. Use YYYY-MM-DD",
          });
        }

        // Normalize
        if (from && !to) {
          assignatRange = { from, to: from };
        } else if (from && to) {
          if (new Date(from) > new Date(to)) {
            return res.status(400).json({
              success: false,
              message:
                "'from' date cannot be after 'to' date in assignat_range",
            });
          }
          assignatRange = { from, to };
        } else if (!from && to) {
          assignatRange = { from: to, to };
        }
      }

      const filters = {
        global_search: req.body.global_search,
        lead_code: req.body.lead_code,
        lead_name: req.body.lead_name,
        phone: req.body.phone,
        task_type: req.body.task_type,
        due_date: req.body.due_date,
        due_filter: req.body.due_filter,
        site_map_link: req.body.site_map_link,
        site_type: req.body.site_type,
        product_type: req.body.product_type,
        product_structure: req.body.product_structure,
        assign_by: req.body.assign_by,
        assign_to: req.body.assign_to,
        created_at: req.body.created_at,
        date_range: dateRange, // ✅ Due date range
        assignat_range: assignatRange, // ✅ Assigned at range
      };

      // ======================
      // VALIDATION GATE
      // ======================
      if (!vendorId || !userId || !franchiseId) {
        logger.warn("[TaskController] Missing vendorId or userId", {
          vendorId,
          userId,
        });

        return res.status(400).json({
          success: false,
          message: "Vendor ID, User ID, and Franchise ID are required",
        });
      }

      logger.info("[TaskController] getTasks2 called", {
        vendorId,
        userId,
        page,
        limit,
        filters,
      });

      const { tasks, count, summary } =
        await TaskService.getTasksByVendorAndUser2(
          vendorId,
          userId,
          franchiseId,
          page,
          limit,
          filters,
        );

      return res.status(200).json({
        success: true,
        message: "Tasks fetched successfully",
        count,
        summary,
        data: tasks,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(count / limit),
          totalRecords: count,
          hasNext: page * limit < count,
          hasPrev: page > 1,
        },
      });
    } catch (error: any) {
      logger.error("[TaskController] getTasks2 Error", {
        error: error.message,
        stack: error.stack,
      });

      return res.status(500).json({
        success: false,
        message: error.message || "Something went wrong",
      });
    }
  }

  static async getReportTasksByUser(req: Request, res: Response) {
    try {
      const vendorId = Number(req.params.vendorId);
      const userId = Number(req.params.userId);
      const franchiseId = Number(req.body.franchise_id);

      const page = parseInt((req.body.page as string) || "1");
      const limit = parseInt((req.body.limit as string) || "10");

      let dateRange: { from: string; to: string } | undefined;

      if (req.body.date_range) {
        const { from, to } = req.body.date_range;

        if (from && isNaN(Date.parse(from))) {
          return res.status(400).json({
            success: false,
            message: "Invalid 'from' date format in date_range. Use YYYY-MM-DD",
          });
        }

        if (to && isNaN(Date.parse(to))) {
          return res.status(400).json({
            success: false,
            message: "Invalid 'to' date format in date_range. Use YYYY-MM-DD",
          });
        }

        if (from && !to) {
          dateRange = { from, to: from };
        } else if (from && to) {
          if (new Date(from) > new Date(to)) {
            return res.status(400).json({
              success: false,
              message: "'from' date cannot be after 'to' date in date_range",
            });
          }
          dateRange = { from, to };
        } else if (!from && to) {
          dateRange = { from: to, to };
        }
      }

      let assignatRange: { from: string; to: string } | undefined;

      if (req.body.assignat_range) {
        const { from, to } = req.body.assignat_range;

        if (from && isNaN(Date.parse(from))) {
          return res.status(400).json({
            success: false,
            message:
              "Invalid 'from' date format in assignat_range. Use YYYY-MM-DD",
          });
        }

        if (to && isNaN(Date.parse(to))) {
          return res.status(400).json({
            success: false,
            message:
              "Invalid 'to' date format in assignat_range. Use YYYY-MM-DD",
          });
        }

        if (from && !to) {
          assignatRange = { from, to: from };
        } else if (from && to) {
          if (new Date(from) > new Date(to)) {
            return res.status(400).json({
              success: false,
              message:
                "'from' date cannot be after 'to' date in assignat_range",
            });
          }
          assignatRange = { from, to };
        } else if (!from && to) {
          assignatRange = { from: to, to };
        }
      }

      const filters = {
        global_search: req.body.global_search,
        lead_code: req.body.lead_code,
        lead_name: req.body.lead_name,
        phone: req.body.phone,
        task_type: req.body.task_type,
        due_date: req.body.due_date,
        due_filter: req.body.due_filter,
        site_map_link: req.body.site_map_link,
        site_type: req.body.site_type,
        product_type: req.body.product_type,
        product_structure: req.body.product_structure,
        assign_by: req.body.assign_by,
        assign_to: req.body.assign_to,
        created_at: req.body.created_at,
        date_range: dateRange,
        assignat_range: assignatRange,
      };

      if (!vendorId || !userId || !franchiseId) {
        return res.status(400).json({
          success: false,
          message: "Vendor ID, User ID, and Franchise ID are required",
        });
      }

      const { tasks, count, summary } =
        await TaskService.getTasksByVendorAndUserReport(
          vendorId,
          userId,
          franchiseId,
          page,
          limit,
          filters,
        );

      return res.status(200).json({
        success: true,
        message: "Report tasks fetched successfully",
        count,
        summary,
        data: tasks,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(count / limit),
          totalRecords: count,
          hasNext: page * limit < count,
          hasPrev: page > 1,
        },
      });
    } catch (error: any) {
      logger.error("[TaskController] getReportTasksByUser Error", {
        error: error.message,
        stack: error.stack,
      });

      return res.status(500).json({
        success: false,
        message: error.message || "Something went wrong",
      });
    }
  }

  static async getInitialSiteMeasurementTasks(req: Request, res: Response) {
    try {
      const userId = Number(req.params.userId);
      const leadId = Number(req.params.leadId);

      if (isNaN(userId) || isNaN(leadId)) {
        return res
          .status(400)
          .json({ success: false, message: "Invalid userId or leadId" });
      }

      const tasks = await TaskService.getInitialSiteMeasurementTasks(
        userId,
        leadId,
      );
      return res
        .status(200)
        .json({ success: true, count: tasks.length, data: tasks });
    } catch (error: any) {
      console.error(
        "[TaskController] getInitialSiteMeasurementTasks error:",
        error,
      );
      return res.status(500).json({
        success: false,
        message: "Failed to fetch ISM tasks",
        error: error.message,
      });
    }
  }

  static async getFollowUpTasks(req: Request, res: Response) {
    try {
      const userId = Number(req.params.userId);
      const leadId = Number(req.params.leadId);

      if (isNaN(userId) || isNaN(leadId)) {
        return res
          .status(400)
          .json({ success: false, message: "Invalid userId or leadId" });
      }

      const tasks = await TaskService.getFollowUpTasks(userId, leadId);
      return res
        .status(200)
        .json({ success: true, count: tasks.length, data: tasks });
    } catch (error: any) {
      console.error("[TaskController] getFollowUpTasks error:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to fetch Follow Up tasks",
        error: error.message,
      });
    }
  }

  static async getFinalMeasurementTasks(req: Request, res: Response) {
    try {
      const userId = Number(req.params.userId);
      const leadId = Number(req.params.leadId);

      if (isNaN(userId) || isNaN(leadId)) {
        return res
          .status(400)
          .json({ success: false, message: "Invalid userId or leadId" });
      }

      const tasks = await TaskService.getFinalMeasurementTasks(userId, leadId);
      return res
        .status(200)
        .json({ success: true, count: tasks.length, data: tasks });
    } catch (error: any) {
      console.error("[TaskController] getFinalMeasurementTasks error:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to fetch Final Measurement tasks",
        error: error.message,
      });
    }
  }

  // Vendor overall tasks
  static async getTasksByVendor(req: Request, res: Response) {
    try {
      const vendorId = Number(req.params.vendorId);
      const franchiseId = Number(req.query.franchise_id);

      if (isNaN(vendorId) || isNaN(franchiseId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid vendorId or franchise_id",
        });
      }

      const { tasks, count } = await TaskService.getTasksFilterByVendor2(
        vendorId,
        franchiseId,
        1,
        1000,
        {},
      );

      return res.status(200).json({
        success: true,
        count,
        data: tasks,
      });
    } catch (error: any) {
      console.error("[TaskController] getTasksByVendor error:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to fetch tasks",
        error: error.message,
      });
    }
  }

  static async getTasksFilterByVendorAll(req: Request, res: Response) {
    try {
      const vendorId = Number(req.params.vendorId);
      const franchiseId = Number(req.body.franchise_id);

      const page = parseInt((req.body.page as string) || "1");
      const limit = parseInt((req.body.limit as string) || "10");

      // ============================
      // 🔥 DATE RANGE VALIDATION & NORMALIZATION (DUE DATE)
      // ============================
      let dateRange: { from: string; to: string } | undefined;

      if (req.body.date_range) {
        const { from, to } = req.body.date_range;

        if (from && isNaN(Date.parse(from))) {
          return res.status(400).json({
            success: false,
            message: "Invalid 'from' date format in date_range. Use YYYY-MM-DD",
          });
        }

        if (to && isNaN(Date.parse(to))) {
          return res.status(400).json({
            success: false,
            message: "Invalid 'to' date format in date_range. Use YYYY-MM-DD",
          });
        }

        if (from && !to) {
          dateRange = { from, to: from };
        } else if (from && to) {
          if (new Date(from) > new Date(to)) {
            return res.status(400).json({
              success: false,
              message: "'from' date cannot be after 'to' date in date_range",
            });
          }
          dateRange = { from, to };
        } else if (!from && to) {
          dateRange = { from: to, to };
        }
      }

      // ============================
      // 🔥 ASSIGNED AT RANGE VALIDATION & NORMALIZATION
      // ============================
      let assignatRange: { from: string; to: string } | undefined;

      if (req.body.assignat_range) {
        const { from, to } = req.body.assignat_range;

        if (from && isNaN(Date.parse(from))) {
          return res.status(400).json({
            success: false,
            message:
              "Invalid 'from' date format in assignat_range. Use YYYY-MM-DD",
          });
        }

        if (to && isNaN(Date.parse(to))) {
          return res.status(400).json({
            success: false,
            message:
              "Invalid 'to' date format in assignat_range. Use YYYY-MM-DD",
          });
        }

        if (from && !to) {
          assignatRange = { from, to: from };
        } else if (from && to) {
          if (new Date(from) > new Date(to)) {
            return res.status(400).json({
              success: false,
              message:
                "'from' date cannot be after 'to' date in assignat_range",
            });
          }
          assignatRange = { from, to };
        } else if (!from && to) {
          assignatRange = { from: to, to };
        }
      }

      const filters = {
        global_search: req.body.global_search,
        lead_code: req.body.lead_code,
        lead_name: req.body.lead_name,
        phone: req.body.phone,
        task_type: req.body.task_type,
        due_date: req.body.due_date,
        due_filter: req.body.due_filter,
        site_map_link: req.body.site_map_link,
        site_type: req.body.site_type,
        product_type: req.body.product_type,
        product_structure: req.body.product_structure,
        assign_by: req.body.assign_by,
        assign_to: req.body.assign_to,
        created_at: req.body.created_at,
        date_range: dateRange, // ✅ Due date range
        assignat_range: assignatRange, // ✅ Assigned at range
      };

      // ======================
      // VALIDATION GATE
      // ======================
      if (!vendorId || !franchiseId) {
        logger.warn("[TaskController] Missing vendorId", {
          vendorId,
        });

        return res.status(400).json({
          success: false,
          message: "Vendor ID and Franchise ID are required",
        });
      }

      logger.info("[TaskController] getTasksByVendorAll called", {
        vendorId,
        page,
        limit,
        filters,
      });

      const { tasks, count, summary } =
        await TaskService.getTasksFilterByVendor2(
          vendorId,
          franchiseId,
          page,
          limit,
          filters,
        );

      return res.status(200).json({
        success: true,
        message: "Vendor tasks fetched successfully",
        count,
        summary,
        data: tasks,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(count / limit),
          totalRecords: count,
          hasNext: page * limit < count,
          hasPrev: page > 1,
        },
      });
    } catch (error: any) {
      logger.error("[TaskController] getTasksByVendorAll Error", {
        error: error.message,
        stack: error.stack,
      });

      return res.status(500).json({
        success: false,
        message: error.message || "Something went wrong",
      });
    }
  }

  static async getReportTasksFilterByVendorAll(req: Request, res: Response) {
    try {
      const vendorId = Number(req.params.vendorId);
      const franchiseId = Number(req.body.franchise_id);

      const page = parseInt((req.body.page as string) || "1");
      const limit = parseInt((req.body.limit as string) || "10");

      let dateRange: { from: string; to: string } | undefined;

      if (req.body.date_range) {
        const { from, to } = req.body.date_range;

        if (from && isNaN(Date.parse(from))) {
          return res.status(400).json({
            success: false,
            message: "Invalid 'from' date format in date_range. Use YYYY-MM-DD",
          });
        }

        if (to && isNaN(Date.parse(to))) {
          return res.status(400).json({
            success: false,
            message: "Invalid 'to' date format in date_range. Use YYYY-MM-DD",
          });
        }

        if (from && !to) {
          dateRange = { from, to: from };
        } else if (from && to) {
          if (new Date(from) > new Date(to)) {
            return res.status(400).json({
              success: false,
              message: "'from' date cannot be after 'to' date in date_range",
            });
          }
          dateRange = { from, to };
        } else if (!from && to) {
          dateRange = { from: to, to };
        }
      }

      let assignatRange: { from: string; to: string } | undefined;

      if (req.body.assignat_range) {
        const { from, to } = req.body.assignat_range;

        if (from && isNaN(Date.parse(from))) {
          return res.status(400).json({
            success: false,
            message:
              "Invalid 'from' date format in assignat_range. Use YYYY-MM-DD",
          });
        }

        if (to && isNaN(Date.parse(to))) {
          return res.status(400).json({
            success: false,
            message:
              "Invalid 'to' date format in assignat_range. Use YYYY-MM-DD",
          });
        }

        if (from && !to) {
          assignatRange = { from, to: from };
        } else if (from && to) {
          if (new Date(from) > new Date(to)) {
            return res.status(400).json({
              success: false,
              message:
                "'from' date cannot be after 'to' date in assignat_range",
            });
          }
          assignatRange = { from, to };
        } else if (!from && to) {
          assignatRange = { from: to, to };
        }
      }

      const filters = {
        global_search: req.body.global_search,
        lead_code: req.body.lead_code,
        lead_name: req.body.lead_name,
        phone: req.body.phone,
        task_type: req.body.task_type,
        due_date: req.body.due_date,
        due_filter: req.body.due_filter,
        site_map_link: req.body.site_map_link,
        site_type: req.body.site_type,
        product_type: req.body.product_type,
        product_structure: req.body.product_structure,
        assign_by: req.body.assign_by,
        assign_to: req.body.assign_to,
        created_at: req.body.created_at,
        date_range: dateRange,
        assignat_range: assignatRange,
      };

      if (!vendorId || !franchiseId) {
        return res.status(400).json({
          success: false,
          message: "Vendor ID and Franchise ID are required",
        });
      }

      const { tasks, count, summary } =
        await TaskService.getTasksFilterByVendorReport(
          vendorId,
          franchiseId,
          page,
          limit,
          filters,
        );

      return res.status(200).json({
        success: true,
        message: "Report vendor tasks fetched successfully",
        count,
        summary,
        data: tasks,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(count / limit),
          totalRecords: count,
          hasNext: page * limit < count,
          hasPrev: page > 1,
        },
      });
    } catch (error: any) {
      logger.error("[TaskController] getReportTasksFilterByVendorAll Error", {
        error: error.message,
        stack: error.stack,
      });

      return res.status(500).json({
        success: false,
        message: error.message || "Something went wrong",
      });
    }
  }

  
  static async getActiveTasksByVendorAndLead(req: Request, res: Response) {
    try {
      const vendorId = Number(req.params.vendorId);
      const leadId = Number(req.params.leadId);
      const franchiseId = Number(req.query.franchise_id);

      if (isNaN(vendorId) || isNaN(leadId) || isNaN(franchiseId)) {
        return res
          .status(400)
          .json({
            success: false,
            message: "Invalid vendorId, leadId, or franchise_id",
          });
      }

      const tasks = await TaskService.getActiveTasksByVendorAndLead(
        vendorId,
        leadId,
        franchiseId,
      );
      return res
        .status(200)
        .json({ success: true, count: tasks.length, data: tasks });
    } catch (error: any) {
      console.error(
        "[TaskController] getActiveTasksByVendorAndLead error:",
        error,
      );
      return res.status(500).json({
        success: false,
        message: "Failed to fetch active tasks",
        error: error.message,
      });
    }
  }
}
