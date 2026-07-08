import { Router } from "express";
import { TaskController } from "../../controllers/task/task.controller";

const taskRouter = Router();

// GET /api/tasks/vendorId/:vendorId/users/:userId/tasks
taskRouter.get(
  "/vendorId/:vendorId/userId/:userId/tasks",
  TaskController.getTasks,
);

taskRouter.post(
  "/vendorId/:vendorId/userId/:userId/tasks/filter",
  TaskController.getTasks2,
);

taskRouter.post(
  "/vendorId/:vendorId/userId/:userId/tasks/report/filter",
  TaskController.getReportTasksByUser,
);

// GET /api/tasks/vendorId/:vendorId/tasks/all
taskRouter.get(
  "/vendorId/:vendorId/tasks/all",
  TaskController.getTasksByVendor,
);

taskRouter.post(
  "/vendorId/:vendorId/tasks/filter/all",
  TaskController.getTasksFilterByVendorAll,
);

taskRouter.post(
  "/vendorId/:vendorId/tasks/report/filter/all",
  TaskController.getReportTasksFilterByVendorAll,
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

taskRouter.patch(
  "/leadId/:leadId/taskId/:taskId/update-self-assign-task",
  TaskController.updateSelfAssignTask,
);

taskRouter.patch(
  "/leadId/:leadId/taskId/:taskId/reschedule-self-assign-task",
  TaskController.rescheduleSelfAssignTask,
);

taskRouter.patch(
  "/leadId/:leadId/taskId/:taskId/small-order-request/action",
  TaskController.actOnSmallOrderRequestTask,
);

taskRouter.get(
  "/leadId/:leadId/taskId/:taskId/fast-production-request",
  TaskController.getFastProductionRequestDetails,
);

taskRouter.patch(
  "/leadId/:leadId/taskId/:taskId/fast-production-request/action",
  TaskController.actOnFastProductionRequestTask,
);

taskRouter.get(
  "/:taskId/details",
  TaskController.getTaskDetails,
);

export default taskRouter;
