import { Request, Response } from "express";
import { attendanceError } from "../../services/attendance/attendance.utils";
import { getAttendanceWorkspace, punchAttendance, requestAttendanceCorrection, listAttendanceCorrections, decideAttendanceCorrection } from "../../services/attendance/attendance-workspace.service";
import { listAttendanceLogs, getAttendanceLogDetail } from "../../services/attendance/attendance-logs.service";

const endpoint = (handler: (req: Request) => Promise<unknown>, status = 200) => async (req: Request, res: Response) => {
  try { return res.status(status).json({ success: true, data: await handler(req) }); }
  catch (error: any) {
    const conflict = ["P2002", "P2034"].includes(error.code);
    const code = error.statusCode || (conflict ? 409 : 500);
    if (code === 500) console.error("Attendance request failed", error);
    return res.status(code).json({ success: false, message: conflict ? "Attendance was updated by another request. Refresh and retry." : code === 500 ? "Attendance request failed. Please try again." : error.message });
  }
};
export const attendanceWorkspaceController = endpoint(req => getAttendanceWorkspace((req as any).user, req.query.month, req.query.user_id));
export const attendancePunchController = endpoint(req => punchAttendance((req as any).user, { ...req.body, user_id: (req as any).user?.id ?? (req as any).user?.user_id }));
export const attendanceCorrectionRequestController = endpoint(req => requestAttendanceCorrection((req as any).user, req.body ?? {}), 201);
export const attendanceCorrectionsController = endpoint(req => listAttendanceCorrections((req as any).user, req.query));
export const attendanceLogsController = endpoint(req => listAttendanceLogs((req as any).user, req.query));
export const attendanceLogDetailController = endpoint(req => {
  const id = Number(req.params.attendanceId);
  if (!Number.isSafeInteger(id) || id <= 0) attendanceError("Valid attendance id is required.");
  return getAttendanceLogDetail((req as any).user, id);
});
export const attendanceCorrectionDecisionController = endpoint(req => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) attendanceError("Valid correction id is required.");
  return decideAttendanceCorrection((req as any).user, id, req.body ?? {});
});
