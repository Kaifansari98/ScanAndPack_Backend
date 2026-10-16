import { Router } from "express";
import {
  markAttendanceController,
  getAttendanceByIdController,
  listAttendanceController,
  getAttendanceLogsController,
  getEmployeeTodayAttendanceController,
} from "../../controllers/attendance/attendance.controller";
import { verifyToken } from "../../middlewares/auth.middleware";

const attendanceRoutes = Router();

attendanceRoutes.post("/mark", verifyToken, markAttendanceController);
attendanceRoutes.get("/today", verifyToken, getEmployeeTodayAttendanceController);
attendanceRoutes.get("/:id", verifyToken, getAttendanceByIdController);
attendanceRoutes.get("/:attendanceId/logs", verifyToken, getAttendanceLogsController);
attendanceRoutes.get("/", verifyToken, listAttendanceController);

export default attendanceRoutes;
