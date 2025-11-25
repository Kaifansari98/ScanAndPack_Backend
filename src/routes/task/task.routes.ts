import { Router } from "express";
import { TaskController } from "../../controllers/task/task.controller";

const taskRouter = Router();

// GET /api/vendors/:vendorId/users/:userId/tasks
taskRouter.get(
  "/vendorId/:vendorId/userId/:userId/tasks",
  TaskController.getTasks
);

// GET /api/tasks/user/:userId/lead/:leadId/initial-site-measurement
taskRouter.get(
  "/user/:userId/lead/:leadId/initial-site-measurement",
  TaskController.getInitialSiteMeasurementTasks
);

// GET /api/tasks/user/:userId/lead/:leadId/follow-up
taskRouter.get(
  "/user/:userId/lead/:leadId/follow-up",
  TaskController.getFollowUpTasks
);

// GET /api/tasks/user/:userId/lead/:leadId/final-measurement
taskRouter.get(
  "/user/:userId/lead/:leadId/final-measurement",
  TaskController.getFinalMeasurementTasks
);

export default taskRouter;