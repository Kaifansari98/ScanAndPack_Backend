import { prisma } from "../../prisma/client";
import { AttendanceAction, AttendanceSource } from "../../../generated/prisma_client/client";
import { deriveVendorLocalDate, formatInTimeZone, decorateAttendance, validDate, attendanceError } from "./attendance.utils";
import { punchAttendance, type AttendanceActor } from "./attendance-workspace.service";

export interface MarkAttendanceInput {
  user_id: number;
  action: AttendanceAction | "IN" | "OUT";
  source: AttendanceSource | "MANUAL" | "PHONE" | "CARD";
  action_time?: string | Date;
  vendor_id?: number;
  franchise_id?: number | null;
}

export interface ListAttendanceFilters {
  vendor_id?: number;
  franchise_id?: number | null;
  user_id?: number;
  attendance_date?: string; // YYYY-MM-DD
  from_date?: string; // YYYY-MM-DD
  to_date?: string; // YYYY-MM-DD
  page?: number;
  limit?: number;
}

export { deriveVendorLocalDate, formatInTimeZone, decorateAttendance } from "./attendance.utils";

export const markAttendance = async (input: MarkAttendanceInput, actor?: AttendanceActor) => {
  return punchAttendance(actor, input, false);
};

export const getAttendanceById = async (id: number) => {
  const record = await prisma.attendance.findUnique({
    where: { id },
    include: {
      breaks: { orderBy: { started_at: "asc" } },
      user: {
        select: {
          id: true,
          user_name: true,
          user_contact: true,
          user_email: true,
        },
      },
      vendor: {
        select: {
          id: true,
          vendor_name: true,
          time_zone: true,
          time_zone_master: true,
        },
      },
      franchise: {
        select: {
          id: true,
          franchise_name: true,
          franchise_code: true,
        },
      },
      logs: {
        orderBy: { action_time: "asc" },
      },
    },
  });

  if (!record) return null;

  const tz = record.time_zone ||
    record.vendor.time_zone_master?.time_zone_name ||
    record.vendor.time_zone ||
    "UTC";

  return {
    ...decorateAttendance(record, tz),
    logs: record.logs.map((l) => ({
      ...l,
      action_time_local: formatInTimeZone(l.action_time, tz),
    })),
  };
};

export const listAttendance = async (params: ListAttendanceFilters) => {
  const where: any = {};

  if (params.vendor_id) {
    where.vendor_id = Number(params.vendor_id);
  }

  if (params.franchise_id !== undefined) {
    where.franchise_id = params.franchise_id === null ? null : Number(params.franchise_id);
  }

  if (params.user_id) {
    where.user_id = Number(params.user_id);
  }

  if (params.attendance_date) {
    const [y, m, d] = params.attendance_date.split("-").map(Number);
    where.attendance_date = validDate(params.attendance_date);
  } else if (params.from_date || params.to_date) {
    where.attendance_date = {};
    if (params.from_date) {
      const [y, m, d] = params.from_date.split("-").map(Number);
      where.attendance_date.gte = validDate(params.from_date);
    }
    if (params.to_date) {
      const [y, m, d] = params.to_date.split("-").map(Number);
      where.attendance_date.lte = validDate(params.to_date);
    }
  }

  if (params.from_date && params.to_date && params.from_date > params.to_date) attendanceError("From date must not exceed to date.");

  const page = Math.max(1, Number(params.page) || 1);
  const limit = Math.max(1, Math.min(100, Number(params.limit) || 20));
  const skip = (page - 1) * limit;

  const [totalCount, items] = await Promise.all([
    prisma.attendance.count({ where }),
    prisma.attendance.findMany({
      where,
      skip,
      take: limit,
      orderBy: [{ attendance_date: "desc" }, { check_in: "desc" }],
      include: {
        breaks: { orderBy: { started_at: "asc" } },
        user: {
          select: {
            id: true,
            user_name: true,
            user_contact: true,
            user_email: true,
            designation: true,
            user_type: {
              select: {
                user_type: true,
              },
            },
          },
        },
        vendor: {
          select: {
            id: true,
            vendor_name: true,
            time_zone: true,
            time_zone_master: true,
          },
        },
        franchise: {
          select: {
            id: true,
            franchise_name: true,
            franchise_code: true,
          },
        },
      },
    }),
  ]);

  const decorated = items.map((item) => {
    const tz = item.time_zone ||
      item.vendor.time_zone_master?.time_zone_name ||
      item.vendor.time_zone ||
      "UTC";
    return decorateAttendance(item, tz);
  });

  return {
    items: decorated,
    pagination: {
      page,
      limit,
      totalCount,
      totalPages: Math.ceil(totalCount / limit),
    },
  };
};

export const getAttendanceLogs = async (attendanceId: number) => {
  const attendance = await prisma.attendance.findUnique({
    where: { id: attendanceId },
    include: {
      vendor: {
        select: {
          time_zone: true,
          time_zone_master: true,
        },
      },
    },
  });

  if (!attendance) {
    const err: any = new Error("Attendance record not found");
    err.statusCode = 404;
    throw err;
  }

  const tz = attendance.time_zone ||
    attendance.vendor.time_zone_master?.time_zone_name ||
    attendance.vendor.time_zone ||
    "UTC";

  const logs = await prisma.attendance_logs.findMany({
    where: { attendance_id: attendanceId },
    orderBy: { action_time: "asc" },
  });

  return logs.map((l) => ({
    ...l,
    action_time_local: formatInTimeZone(l.action_time, tz),
  }));
};

export const getEmployeeTodayAttendance = async (userId: number) => {
  const employee = await prisma.userMaster.findUnique({
    where: { id: userId },
    select: {
      id: true,
      user_name: true,
      vendor_id: true,
      vendor: {
        select: {
          id: true,
          vendor_name: true,
          time_zone: true,
          time_zone_master: true,
        },
      },
    },
  });

  if (!employee) {
    const err: any = new Error("Employee not found");
    err.statusCode = 404;
    throw err;
  }

  const tz =
    employee.vendor.time_zone_master?.time_zone_name ||
    employee.vendor.time_zone ||
    "UTC";

  const { attendanceDate } = deriveVendorLocalDate(new Date(), tz);

  const record = await prisma.attendance.findFirst({
    where: {
      vendor_id: employee.vendor_id, user_id: employee.id,
      OR: [{ check_out: null }, { attendance_date: attendanceDate }],
    },
    orderBy: [{ check_out: { sort: "asc", nulls: "first" } }, { attendance_date: "desc" }],
    include: {
      breaks: { orderBy: { started_at: "asc" } },
      logs: {
        orderBy: { action_time: "asc" },
      },
    },
  });

  if (!record) {
    return {
      has_marked_in: false,
      vendor_time_zone: tz,
      attendance: null,
      logs: [],
    };
  }

  return {
    has_marked_in: true,
    vendor_time_zone: tz,
    attendance: decorateAttendance(record, tz),
    logs: record.logs.map((l) => ({
      ...l,
      action_time_local: formatInTimeZone(l.action_time, tz),
    })),
  };
};
