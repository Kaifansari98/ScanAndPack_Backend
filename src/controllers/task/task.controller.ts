import { Request, Response } from "express";
import { TaskService } from "../../services/task/task.service";

export class TaskController {
  static async getTasks(req: Request, res: Response) {
    try {
      const vendorId = parseInt(req.params.vendorId, 10);
      const userId = parseInt(req.params.userId, 10);

      if (isNaN(vendorId) || isNaN(userId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid vendorId or userId",
        });
      }

      const tasks = await TaskService.getTasksByVendorAndUser(vendorId, userId);

      return res.status(200).json({
        success: true,
        count: tasks.length,
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

  static async getInitialSiteMeasurementTasks(req: Request, res: Response) {
    try {
      const userId = parseInt(req.params.userId, 10);
      const leadId = parseInt(req.params.leadId, 10);

      if (isNaN(userId) || isNaN(leadId)) {
        return res.status(400).json({ success: false, message: "Invalid userId or leadId" });
      }

      const tasks = await TaskService.getInitialSiteMeasurementTasks(userId, leadId);
      return res.status(200).json({ success: true, count: tasks.length, data: tasks });
    } catch (error: any) {
      console.error("[TaskController] getInitialSiteMeasurementTasks error:", error);
      return res.status(500).json({ success: false, message: "Failed to fetch ISM tasks", error: error.message });
    }
  }

  static async getFollowUpTasks(req: Request, res: Response) {
    try {
      const userId = parseInt(req.params.userId, 10);
      const leadId = parseInt(req.params.leadId, 10);

      if (isNaN(userId) || isNaN(leadId)) {
        return res.status(400).json({ success: false, message: "Invalid userId or leadId" });
      }

      const tasks = await TaskService.getFollowUpTasks(userId, leadId);
      return res.status(200).json({ success: true, count: tasks.length, data: tasks });
    } catch (error: any) {
      console.error("[TaskController] getFollowUpTasks error:", error);
      return res.status(500).json({ success: false, message: "Failed to fetch Follow Up tasks", error: error.message });
    }
  }

  static async getFinalMeasurementTasks(req: Request, res: Response) {
    try {
      const userId = parseInt(req.params.userId, 10);
      const leadId = parseInt(req.params.leadId, 10);

      if (isNaN(userId) || isNaN(leadId)) {
        return res.status(400).json({ success: false, message: "Invalid userId or leadId" });
      }

      const tasks = await TaskService.getFinalMeasurementTasks(userId, leadId);
      return res.status(200).json({ success: true, count: tasks.length, data: tasks });
    } catch (error: any) {
      console.error("[TaskController] getFinalMeasurementTasks error:", error);
      return res.status(500).json({ success: false, message: "Failed to fetch Final Measurement tasks", error: error.message });
    }
  }

  
}