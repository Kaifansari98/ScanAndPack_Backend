import { attendanceError, validDate } from "../attendance/attendance.utils";
export const leaveTypes = ["PAID", "SICK", "CASUAL", "UNPAID"] as const;
export const leaveStatuses = ["PENDING", "APPROVED", "REJECTED", "RECORDED"] as const;
export const typeLabels: Record<string, string> = { PAID: "Paid Leave", SICK: "Sick Leave", CASUAL: "Casual Leave", UNPAID: "Unpaid Leave" };
export function positiveId(value: unknown, label = "id") {
  if ((typeof value !== "number" && typeof value !== "string") || !/^\d+$/.test(String(value))) attendanceError(`Valid ${label} is required.`);
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0 || id > 2147483647) attendanceError(`Valid ${label} is required.`);
  return id;
}
export function leaveYear(value: unknown, today: string) {
  const year = value === undefined ? Number(today.slice(0, 4)) : Number(value);
  if ((typeof value !== "string" && typeof value !== "number" && value !== undefined) || !Number.isSafeInteger(year) || year < 2000 || year > 2100) attendanceError("Year must be between 2000 and 2100.");
  return year;
}
export function leaveText(value: unknown, label: string, max: number, required = true) {
  if (value === undefined && !required) return "";
  if (typeof value !== "string" || (required && !value.trim()) || value.trim().length > max) attendanceError(`${label} must contain ${required ? '1' : '0'}–${max} characters.`);
  return value.trim();
}
export function holidayRows(value: unknown, year: number) {
  if (!Array.isArray(value) || !value.length || value.length > 366) attendanceError("Supply 1–366 holiday rows.");
  const seen = new Set<string>();
  return value.map((row, index) => {
    if (!row || typeof row !== "object") attendanceError(`Invalid holiday row ${index + 1}.`);
    const date = validDate(row.date);
    if (date.getUTCFullYear() !== year) attendanceError(`All holidays must be in ${year}.`);
    if (seen.has(row.date)) attendanceError(`Duplicate holiday date: ${row.date}.`);
    seen.add(row.date);
    return { holiday_date: date, name: leaveText(row.name, "Leave name", 100), remark: leaveText(row.remark, "Remark", 500, false) };
  });
}
export function weeklyDays(value: unknown) {
  if (!Array.isArray(value) || value.length > 7 || value.some(day => typeof day !== "number" || !Number.isInteger(day) || day < 0 || day > 6) || new Set(value).size !== value.length) attendanceError("Weekly offs must be unique day numbers from 0 (Sunday) to 6 (Saturday).");
  return [...value].sort((a, b) => a - b) as number[];
}
export function validateLeaveAttachment(file?: Express.Multer.File) {
  if (!file) return;
  if (!file.buffer?.length || file.size > 5 * 1024 * 1024) attendanceError("Attach a non-empty file of 5 MB or smaller.");
  const ext = file.originalname.split(".").pop()?.toLowerCase();
  const pdf = ext === "pdf" && file.mimetype === "application/pdf" && file.buffer.subarray(0, 5).toString() === "%PDF-";
  const png = ext === "png" && file.mimetype === "image/png" && file.buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const jpeg = ["jpg", "jpeg"].includes(ext || "") && file.mimetype === "image/jpeg" && file.buffer.subarray(0, 3).equals(Buffer.from([255, 216, 255]));
  if (!pdf && !png && !jpeg) attendanceError("Attach a valid PDF, PNG or JPG file matching its file extension.");
}

export function leaveDateRange(input: Record<string, unknown>, today: string) {
  // Older clients can still submit a single date during frontend rollout.
  const legacy = input.start_date === undefined && input.end_date === undefined && input.date !== undefined;
  if (!legacy && input.date !== undefined) attendanceError("Use start_date and end_date together instead of date.");
  const start = validDate(legacy ? input.date : input.start_date);
  const end = validDate(legacy ? input.date : input.end_date);
  leaveYear(start.getUTCFullYear(), today); leaveYear(end.getUTCFullYear(), today);
  if (end < start) attendanceError("End date must be on or after start date.");
  return { start, end, isBackdated: start.toISOString().slice(0, 10) < today, dayCount: Math.round((end.getTime() - start.getTime()) / 86400000) + 1 };
}
