import { Router } from "express";
import {
  markAttendanceController,
  getAttendanceByIdController,
  listAttendanceController,
  getAttendanceLogsController,
  getEmployeeTodayAttendanceController,
} from "../../controllers/attendance/attendance.controller";
import { verifyToken } from "../../middlewares/auth.middleware";
import { attendanceWorkspaceController, attendancePunchController, attendanceCorrectionRequestController, attendanceCorrectionsController, attendanceCorrectionDecisionController } from "../../controllers/attendance/attendance-workspace.controller";

const attendanceRoutes = Router();

attendanceRoutes.get("/workspace", verifyToken, attendanceWorkspaceController);
attendanceRoutes.post("/punch", verifyToken, attendancePunchController);
attendanceRoutes.post("/corrections", verifyToken, attendanceCorrectionRequestController);
attendanceRoutes.get("/corrections", verifyToken, attendanceCorrectionsController);
attendanceRoutes.patch("/corrections/:id", verifyToken, attendanceCorrectionDecisionController);
attendanceRoutes.post("/mark", verifyToken, markAttendanceController);
attendanceRoutes.get("/today", verifyToken, getEmployeeTodayAttendanceController);
attendanceRoutes.get("/:id", verifyToken, getAttendanceByIdController);
attendanceRoutes.get("/:attendanceId/logs", verifyToken, getAttendanceLogsController);
attendanceRoutes.get("/", verifyToken, listAttendanceController);

export default attendanceRoutes;
