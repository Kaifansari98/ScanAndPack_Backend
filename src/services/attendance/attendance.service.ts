import { prisma } from "../../prisma/client";
import { AttendanceAction, AttendanceSource } from "../../../generated/prisma_client/client";
import { isValidIANATimeZone } from "../timeZone/timeZone.service";

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

/**
 * Derive vendor-local calendar date from UTC instant and IANA time zone identifier.
 */
export function deriveVendorLocalDate(utcInstant: Date, timeZone: string): {
  localDateString: string;
  attendanceDate: Date;
} {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const localDateString = formatter.format(utcInstant); // "YYYY-MM-DD"
  const [yearStr, monthStr, dayStr] = localDateString.split("-");
  const attendanceDate = new Date(
    Date.UTC(Number(yearStr), Number(monthStr) - 1, Number(dayStr), 0, 0, 0)
  );

  return { localDateString, attendanceDate };
}

/**
 * Format a Date object to a readable string in a given time zone.
 */
export function formatInTimeZone(
  date: Date | null | undefined,
  timeZone: string
): string | null {
  if (!date) return null;
  try {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).format(date);
  } catch {
    return date.toISOString();
  }
}

/**
 * Decorate attendance record with vendor-local formatted strings.
 */
export function decorateAttendance(att: any, timeZone: string) {
  if (!att) return att;
  return {
    ...att,
    vendor_time_zone: timeZone,
    attendance_date_local: att.attendance_date
      ? new Intl.DateTimeFormat("en-CA", {
          timeZone: "UTC",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(new Date(att.attendance_date))
      : null,
    check_in_local: formatInTimeZone(att.check_in, timeZone),
    check_out_local: formatInTimeZone(att.check_out, timeZone),
  };
}

export const markAttendance = async (
  input: MarkAttendanceInput,
  actor?: { user_id?: number; vendor_id?: number }
) => {
  const userId = Number(input.user_id);
  if (!userId || Number.isNaN(userId)) {
    const err: any = new Error("user_id must be a valid integer");
    err.statusCode = 400;
    throw err;
  }

  const rawAction = String(input.action || "").toUpperCase();
  if (rawAction !== "IN" && rawAction !== "OUT") {
    const err: any = new Error("action must be either 'IN' or 'OUT'");
    err.statusCode = 400;
    throw err;
  }
  const action = rawAction as AttendanceAction;

  const rawSource = String(input.source || "").toUpperCase();
  if (
    rawSource !== "MANUAL" &&
    rawSource !== "PHONE" &&
    rawSource !== "CARD"
  ) {
    const err: any = new Error(
      "source must be one of: 'MANUAL', 'PHONE', 'CARD'"
    );
    err.statusCode = 400;
    throw err;
  }
  const source = rawSource as AttendanceSource;

  // Validate action_time
  let actionTimeUtc: Date;
  if (input.action_time) {
    actionTimeUtc = new Date(input.action_time);
    if (Number.isNaN(actionTimeUtc.getTime())) {
      const err: any = new Error("Invalid action_time timestamp provided");
      err.statusCode = 400;
      throw err;
    }
  } else {
    actionTimeUtc = new Date();
  }

  // 1. Fetch employee
  const employee = await prisma.userMaster.findUnique({
    where: { id: userId },
    select: {
      id: true,
      user_name: true,
      vendor_id: true,
      franchise_id: true,
      status: true,
    },
  });

  if (!employee) {
    const err: any = new Error(`Employee with ID ${userId} not found`);
    err.statusCode = 404;
    throw err;
  }

  if (employee.status === "inactive") {
    const err: any = new Error(
      `Employee ${employee.user_name} (ID ${userId}) is inactive`
    );
    err.statusCode = 400;
    throw err;
  }

  // 2. Validate vendor and franchise context consistency
  if (input.vendor_id !== undefined && Number(input.vendor_id) !== employee.vendor_id) {
    const err: any = new Error(
      `Supplied vendor_id (${input.vendor_id}) does not match employee vendor_id (${employee.vendor_id})`
    );
    err.statusCode = 400;
    throw err;
  }

  if (
    input.franchise_id !== undefined &&
    input.franchise_id !== null &&
    Number(input.franchise_id) !== employee.franchise_id
  ) {
    const err: any = new Error(
      `Supplied franchise_id (${input.franchise_id}) does not match employee franchise_id (${employee.franchise_id})`
    );
    err.statusCode = 400;
    throw err;
  }

  // If actor is constrained by vendor
  if (actor?.vendor_id && actor.vendor_id !== employee.vendor_id) {
    const err: any = new Error("Unauthorized: Employee belongs to a different vendor");
    err.statusCode = 403;
    throw err;
  }

  // If employee has a franchise assigned, verify franchise belongs to employee's vendor
  if (employee.franchise_id) {
    const franchise = await prisma.franchiseMaster.findUnique({
      where: { id: employee.franchise_id },
      select: { id: true, vendor_id: true },
    });
    if (!franchise || franchise.vendor_id !== employee.vendor_id) {
      const err: any = new Error(
        `Employee franchise (${employee.franchise_id}) does not belong to vendor (${employee.vendor_id})`
      );
      err.statusCode = 400;
      throw err;
    }
  }

  // 3. Resolve vendor time zone
  const vendor = await prisma.vendorMaster.findUnique({
    where: { id: employee.vendor_id },
    include: {
      time_zone_master: true,
    },
  });

  if (!vendor) {
    const err: any = new Error(`Vendor with ID ${employee.vendor_id} not found`);
    err.statusCode = 404;
    throw err;
  }

  let ianaTimeZone: string | null = null;
  if (vendor.time_zone_master?.time_zone_code && isValidIANATimeZone(vendor.time_zone_master.time_zone_code)) {
    ianaTimeZone = vendor.time_zone_master.time_zone_code;
  } else if (vendor.time_zone && isValidIANATimeZone(vendor.time_zone)) {
    ianaTimeZone = vendor.time_zone;
  }

  if (!ianaTimeZone) {
    const err: any = new Error(
      `Vendor ${vendor.vendor_name} (ID ${vendor.id}) does not have an active, valid IANA time zone configured. Attendance cannot be recorded.`
    );
    err.statusCode = 400;
    throw err;
  }

  // 4. Derive vendor-local attendance date
  const { localDateString, attendanceDate } = deriveVendorLocalDate(
    actionTimeUtc,
    ianaTimeZone
  );

  // 5. Transactional execution
  const result = await prisma.$transaction(async (tx) => {
    const existing = await tx.attendance.findUnique({
      where: {
        vendor_id_user_id_attendance_date: {
          vendor_id: employee.vendor_id,
          user_id: employee.id,
          attendance_date: attendanceDate,
        },
      },
      include: {
        logs: {
          orderBy: { action_time: "asc" },
        },
      },
    });

    if (action === AttendanceAction.IN) {
      if (existing) {
        const err: any = new Error(
          `Duplicate IN: Employee has already marked IN for attendance date ${localDateString}. Only one IN action is allowed per employee per attendance date.`
        );
        err.statusCode = 409;
        throw err;
      }

      // Create attendance record
      const newAttendance = await tx.attendance.create({
        data: {
          vendor_id: employee.vendor_id,
          franchise_id: employee.franchise_id,
          user_id: employee.id,
          attendance_date: attendanceDate,
          check_in: actionTimeUtc,
          check_out: null,
          source: source,
        },
      });

      // Create initial IN log
      const log = await tx.attendance_logs.create({
        data: {
          vendor_id: employee.vendor_id,
          franchise_id: employee.franchise_id,
          user_id: employee.id,
          attendance_id: newAttendance.id,
          action: AttendanceAction.IN,
          action_time: actionTimeUtc,
          source: source,
        },
      });

      return {
        attendance: newAttendance,
        actionLog: log,
        allLogs: [log],
      };
    } else {
      // action === 'OUT'
      if (!existing) {
        const err: any = new Error(
          `Cannot mark OUT without a prior IN record for attendance date ${localDateString}.`
        );
        err.statusCode = 400;
        throw err;
      }

      if (actionTimeUtc < existing.check_in) {
        const err: any = new Error(
          `Action time (${actionTimeUtc.toISOString()}) cannot precede check-in time (${existing.check_in.toISOString()}).`
        );
        err.statusCode = 400;
        throw err;
      }

      // Create OUT log (permanent audit entry)
      const log = await tx.attendance_logs.create({
        data: {
          vendor_id: employee.vendor_id,
          franchise_id: employee.franchise_id,
          user_id: employee.id,
          attendance_id: existing.id,
          action: AttendanceAction.OUT,
          action_time: actionTimeUtc,
          source: source,
        },
      });

      // Update check_out only if actionTimeUtc is greater than existing.check_out (latest time wins)
      const shouldUpdateCheckOut =
        !existing.check_out || actionTimeUtc > existing.check_out;

      let updatedAttendance = existing;
      if (shouldUpdateCheckOut) {
        updatedAttendance = await tx.attendance.update({
          where: { id: existing.id },
          data: {
            check_out: actionTimeUtc,
          },
          include: {
            logs: {
              orderBy: { action_time: "asc" },
            },
          },
        });
      }

      const allLogs = [...existing.logs, log].sort(
        (a, b) => a.action_time.getTime() - b.action_time.getTime()
      );

      return {
        attendance: updatedAttendance,
        actionLog: log,
        allLogs,
      };
    }
  });

  return {
    attendance: decorateAttendance(result.attendance, ianaTimeZone),
    latest_action: {
      ...result.actionLog,
      action_time_local: formatInTimeZone(result.actionLog.action_time, ianaTimeZone),
    },
    logs: result.allLogs.map((l) => ({
      ...l,
      action_time_local: formatInTimeZone(l.action_time, ianaTimeZone),
    })),
  };
};

export const getAttendanceById = async (id: number) => {
  const record = await prisma.attendance.findUnique({
    where: { id },
    include: {
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

  const tz =
    record.vendor.time_zone_master?.time_zone_code ||
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
    where.attendance_date = new Date(Date.UTC(y, m - 1, d, 0, 0, 0));
  } else if (params.from_date || params.to_date) {
    where.attendance_date = {};
    if (params.from_date) {
      const [y, m, d] = params.from_date.split("-").map(Number);
      where.attendance_date.gte = new Date(Date.UTC(y, m - 1, d, 0, 0, 0));
    }
    if (params.to_date) {
      const [y, m, d] = params.to_date.split("-").map(Number);
      where.attendance_date.lte = new Date(Date.UTC(y, m - 1, d, 0, 0, 0));
    }
  }

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
      },
    }),
  ]);

  const decorated = items.map((item) => {
    const tz =
      item.vendor.time_zone_master?.time_zone_code ||
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

  const tz =
    attendance.vendor.time_zone_master?.time_zone_code ||
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
    employee.vendor.time_zone_master?.time_zone_code ||
    employee.vendor.time_zone ||
    "UTC";

  const { attendanceDate } = deriveVendorLocalDate(new Date(), tz);

  const record = await prisma.attendance.findUnique({
    where: {
      vendor_id_user_id_attendance_date: {
        vendor_id: employee.vendor_id,
        user_id: employee.id,
        attendance_date: attendanceDate,
      },
    },
    include: {
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
