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
}