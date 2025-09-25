import { Router } from "express";
import { TaskController } from "../../controllers/task/task.controller";

const taskRouter = Router();

// GET /api/vendors/:vendorId/users/:userId/tasks
taskRouter.get(
  "/vendorId/:vendorId/userId/:userId/tasks",
  TaskController.getTasks
);

export default taskRouter;