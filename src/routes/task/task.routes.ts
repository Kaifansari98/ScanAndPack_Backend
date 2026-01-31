import { Router } from "express";
import { TaskController } from "../../controllers/task/task.controller";

const taskRouter = Router();

taskRouter.post(
  "/vendorId/:vendorId/userId/:userId/tasks/filter",
  TaskController.getTasks2,
);

taskRouter.post(
  "/vendorId/:vendorId/tasks/filter/all",
  TaskController.getTasksFilterByVendorAll,
);

// GET /api/tasks/user/:userId/lead/:leadId/initial-site-measurement
taskRouter.get(
  "/user/:userId/lead/:leadId/initial-site-measurement",
  TaskController.getInitialSiteMeasurementTasks,
);

// GET /api/tasks/user/:userId/lead/:leadId/follow-up
taskRouter.get(
  "/user/:userId/lead/:leadId/follow-up",
  TaskController.getFollowUpTasks,
);

// GET /api/tasks/user/:userId/lead/:leadId/final-measurement
taskRouter.get(
  "/user/:userId/lead/:leadId/final-measurement",
  TaskController.getFinalMeasurementTasks,
);

// GET /api/tasks/vendorId/:vendorId/leadId/:leadId/active-tasks
taskRouter.get(
  "/vendorId/:vendorId/leadId/:leadId/active-tasks",
  TaskController.getActiveTasksByVendorAndLead,
);

export default taskRouter;
