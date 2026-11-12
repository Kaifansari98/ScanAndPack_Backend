import { Request, Response } from "express";
import {
  createAttendanceLocation,
  updateAttendanceLocation,
  deleteAttendanceLocation,
  listAttendanceLocations,
  assignLocationsToEmployees,
  getAuthorizedLocationsForUser,
  getVendorAssignableEmployees,
} from "../../services/attendance/attendance-location.service";

const endpoint =
  (handler: (req: Request) => Promise<unknown>, status = 200) =>
  async (req: Request, res: Response) => {
    try {
      const data = await handler(req);
      return res.status(status).json({ success: true, data });
    } catch (error: any) {
      const code = error.statusCode || 500;
      if (code === 500) console.error("Attendance location request error", error);
      return res.status(code).json({
        success: false,
        message: error.message || "Attendance location operation failed.",
      });
    }
  };

export const createLocationController = endpoint(
  (req) => createAttendanceLocation((req as any).user, req.body),
  201
);

export const updateLocationController = endpoint((req) =>
  updateAttendanceLocation((req as any).user, Number(req.params.id), req.body)
);

export const deleteLocationController = endpoint((req) =>
  deleteAttendanceLocation((req as any).user, Number(req.params.id))
);

export const listLocationsController = endpoint((req) =>
  listAttendanceLocations((req as any).user, req.query)
);

export const assignLocationsController = endpoint((req) =>
  assignLocationsToEmployees((req as any).user, req.body)
);

export const getEmployeesForLocationController = endpoint((req) =>
  getVendorAssignableEmployees((req as any).user)
);

export const authorizedLocationsController = endpoint(async (req) => {
  const user = (req as any).user;
  const targetUserId = req.query.user_id ? Number(req.query.user_id) : user.id;
  return getAuthorizedLocationsForUser(user.vendor_id, targetUserId);
});

