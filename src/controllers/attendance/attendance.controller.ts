import { Request, Response } from "express";
import { prisma } from "../../prisma/client";
import {
  markAttendance,
  getAttendanceById,
  listAttendance,
  getAttendanceLogs,
  getEmployeeTodayAttendance,
} from "../../services/attendance/attendance.service";

function isSuperAdminActor(actor: any): boolean {
  if (!actor || !actor.user_type) return false;
  const rawRole = typeof actor.user_type === "object" ? actor.user_type?.user_type : actor.user_type;
  if (!rawRole) return false;
  const role = String(rawRole).toLowerCase().replace(/[-_\s]+/g, "");
  return [
    "superadmin",
    "masteradmin",
    "master",
    "vloqmaster",
  ].includes(role);
}

function isEmployeeActor(actor: any): boolean {
  if (!actor) return false;
  const rawRole = typeof actor.user_type === "object" ? actor.user_type?.user_type : actor.user_type;
  if (!rawRole) return false;
  const role = String(rawRole).toLowerCase().replace(/[-_\s]+/g, "");
  return role === "employee";
}

export const markAttendanceController = async (req: Request, res: Response) => {
  try {
    const actor = (req as any).user;
    if (isEmployeeActor(actor)) {
      const actorId = actor?.id ?? actor?.user_id;
      const requestedUserId = req.body?.user_id ? Number(req.body.user_id) : undefined;
      if (requestedUserId && requestedUserId !== actorId) {
        return res.status(403).json({
          success: false,
          message: "Unauthorized: Employees can only mark their own attendance",
        });
      }
      req.body.user_id = actorId;
    }
    const result = await markAttendance(req.body ?? {}, actor);

    const isNewCheckIn = req.body.action?.toUpperCase() === "IN";

    return res.status(isNewCheckIn ? 201 : 200).json({
      success: true,
      message: isNewCheckIn
        ? "Check-in marked successfully"
        : "Check-out marked successfully",
      data: result,
    });
  } catch (error: any) {
    console.error("Error marking attendance:", error);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Internal server error while marking attendance",
    });
  }
};

export const getAttendanceByIdController = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!id || Number.isNaN(id) || !Number.isSafeInteger(id) || id <= 0) {
      return res.status(400).json({
        success: false,
        message: "Valid attendance id is required",
      });
    }

    const attendance = await getAttendanceById(id);
    if (!attendance) {
      return res.status(404).json({
        success: false,
        message: "Attendance record not found",
      });
    }

    const actor = (req as any).user;
    const isSuperAdmin = isSuperAdminActor(actor);

    if (!isSuperAdmin && (!actor?.vendor_id || attendance.vendor_id !== actor.vendor_id)) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized: Access to another vendor's attendance record is denied",
      });
    }

    if (isEmployeeActor(actor)) {
      const actorId = actor?.id ?? actor?.user_id;
      if (attendance.user_id !== actorId) {
        return res.status(403).json({
          success: false,
          message: "Unauthorized: Access to another employee's attendance record is denied",
        });
      }
    }

    return res.status(200).json({
      success: true,
      message: "Attendance record fetched successfully",
      data: attendance,
    });
  } catch (error: any) {
    console.error("Error fetching attendance by id:", error);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Internal server error while fetching attendance",
    });
  }
};

export const listAttendanceController = async (req: Request, res: Response) => {
  try {
    const {
      vendor_id,
      franchise_id,
      user_id,
      attendance_date,
      from_date,
      to_date,
      page,
      limit,
    } = req.query;

    const actor = (req as any).user;
    const isSuperAdmin = isSuperAdminActor(actor);

    let effectiveVendorId: number | undefined;

    if (isSuperAdmin) {
      if (vendor_id !== undefined && vendor_id !== "") {
        const parsedVendorId = Number(vendor_id);
        if (!Number.isSafeInteger(parsedVendorId) || parsedVendorId <= 0) {
          return res.status(400).json({
            success: false,
            message: "Valid vendor_id is required",
          });
        }
        effectiveVendorId = parsedVendorId;
      }
    } else {
      if (!actor?.vendor_id) {
        return res.status(403).json({
          success: false,
          message: "Unauthorized: User has no vendor association",
        });
      }

      if (vendor_id !== undefined && vendor_id !== "") {
        const parsedVendorId = Number(vendor_id);
        if (!Number.isSafeInteger(parsedVendorId) || parsedVendorId <= 0) {
          return res.status(400).json({
            success: false,
            message: "Valid vendor_id is required",
          });
        }
        if (parsedVendorId !== actor.vendor_id) {
          return res.status(403).json({
            success: false,
            message: "Unauthorized: Access to another vendor's attendance records is denied",
          });
        }
      }

      effectiveVendorId = actor.vendor_id;
    }

    let effectiveFranchiseId: number | undefined;
    if (franchise_id !== undefined && franchise_id !== "") {
      const parsedFranchiseId = Number(franchise_id);
      if (!Number.isSafeInteger(parsedFranchiseId) || parsedFranchiseId <= 0) {
        return res.status(400).json({
          success: false,
          message: "Valid franchise_id is required",
        });
      }

      const franchise = await prisma.franchiseMaster.findUnique({
        where: { id: parsedFranchiseId },
        select: { id: true, vendor_id: true },
      });

      if (!franchise) {
        return res.status(404).json({
          success: false,
          message: "Franchise not found",
        });
      }

      if (!isSuperAdmin && franchise.vendor_id !== effectiveVendorId) {
        return res.status(403).json({
          success: false,
          message: "Unauthorized: Access to another vendor's franchise is denied",
        });
      }

      if (isSuperAdmin && effectiveVendorId && franchise.vendor_id !== effectiveVendorId) {
        return res.status(400).json({
          success: false,
          message: "Supplied franchise_id does not belong to the specified vendor",
        });
      }

      effectiveFranchiseId = parsedFranchiseId;
    }

    let effectiveUserId: number | undefined;
    if (user_id !== undefined && user_id !== "") {
      const parsedUserId = Number(user_id);
      if (!Number.isSafeInteger(parsedUserId) || parsedUserId <= 0) {
        return res.status(400).json({
          success: false,
          message: "Valid user_id is required",
        });
      }

      const targetEmployee = await prisma.userMaster.findUnique({
        where: { id: parsedUserId },
        select: { id: true, vendor_id: true },
      });

      if (!targetEmployee) {
        return res.status(404).json({
          success: false,
          message: "Employee not found",
        });
      }

      if (!isSuperAdmin && targetEmployee.vendor_id !== effectiveVendorId) {
        return res.status(403).json({
          success: false,
          message: "Unauthorized: Access to another vendor's employee attendance records is denied",
        });
      }

      if (isSuperAdmin && effectiveVendorId && targetEmployee.vendor_id !== effectiveVendorId) {
        return res.status(400).json({
          success: false,
          message: "Supplied user_id does not belong to the specified vendor",
        });
      }

      effectiveUserId = parsedUserId;
    }

    if (isEmployeeActor(actor)) {
      const actorId = actor?.id ?? actor?.user_id;
      if (user_id !== undefined && user_id !== "" && Number(user_id) !== actorId) {
        return res.status(403).json({
          success: false,
          message: "Unauthorized: Employees can only view their own attendance records",
        });
      }
      effectiveUserId = actorId;
    }

    const result = await listAttendance({
      vendor_id: effectiveVendorId,
      franchise_id: effectiveFranchiseId,
      user_id: effectiveUserId,
      attendance_date: typeof attendance_date === "string" ? attendance_date : undefined,
      from_date: typeof from_date === "string" ? from_date : undefined,
      to_date: typeof to_date === "string" ? to_date : undefined,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });

    return res.status(200).json({
      success: true,
      message: "Attendance list fetched successfully",
      data: result.items,
      pagination: result.pagination,
    });
  } catch (error: any) {
    console.error("Error listing attendance:", error);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Internal server error while listing attendance",
    });
  }
};

export const getAttendanceLogsController = async (req: Request, res: Response) => {
  try {
    const attendanceId = Number(req.params.attendanceId);
    if (!attendanceId || Number.isNaN(attendanceId) || !Number.isSafeInteger(attendanceId) || attendanceId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Valid attendanceId is required",
      });
    }

    const actor = (req as any).user;
    const isSuperAdmin = isSuperAdminActor(actor);

    const attendance = await prisma.attendance.findUnique({
      where: { id: attendanceId },
      select: { id: true, vendor_id: true, user_id: true },
    });

    if (!attendance) {
      return res.status(404).json({
        success: false,
        message: "Attendance record not found",
      });
    }

    if (!isSuperAdmin && (!actor?.vendor_id || attendance.vendor_id !== actor.vendor_id)) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized: Access to another vendor's attendance logs is denied",
      });
    }

    if (isEmployeeActor(actor)) {
      const actorId = actor?.id ?? actor?.user_id;
      if (attendance.user_id !== actorId) {
        return res.status(403).json({
          success: false,
          message: "Unauthorized: Access to another employee's attendance logs is denied",
        });
      }
    }

    const logs = await getAttendanceLogs(attendanceId);

    return res.status(200).json({
      success: true,
      message: "Attendance logs fetched successfully",
      data: logs,
    });
  } catch (error: any) {
    console.error("Error fetching attendance logs:", error);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Internal server error while fetching attendance logs",
    });
  }
};

export const getEmployeeTodayAttendanceController = async (req: Request, res: Response) => {
  try {
    const actor = (req as any).user;
    const isSuperAdmin = isSuperAdminActor(actor);

    const actorId = actor?.id ?? actor?.user_id;
    if (isEmployeeActor(actor)) {
      if (req.query.user_id && Number(req.query.user_id) !== actorId) {
        return res.status(403).json({
          success: false,
          message: "Unauthorized: Employees can only view their own today attendance status",
        });
      }
    }

    const rawUserId = req.query.user_id ? Number(req.query.user_id) : actorId;

    if (!rawUserId || Number.isNaN(rawUserId) || !Number.isSafeInteger(rawUserId) || rawUserId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Valid user_id is required",
      });
    }

    const targetUser = await prisma.userMaster.findUnique({
      where: { id: rawUserId },
      select: { id: true, vendor_id: true },
    });

    if (!targetUser) {
      return res.status(404).json({
        success: false,
        message: "Employee not found",
      });
    }

    if (!isSuperAdmin && (!actor?.vendor_id || targetUser.vendor_id !== actor.vendor_id)) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized: Access to another vendor's employee attendance is denied",
      });
    }

    const result = await getEmployeeTodayAttendance(rawUserId);

    return res.status(200).json({
      success: true,
      message: "Today's attendance status fetched successfully",
      data: result,
    });
  } catch (error: any) {
    console.error("Error fetching today's attendance:", error);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Internal server error while fetching today's attendance",
    });
  }
};
