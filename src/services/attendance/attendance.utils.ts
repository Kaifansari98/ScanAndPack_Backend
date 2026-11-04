export function attendanceError(message: string, statusCode = 400): never {
  throw Object.assign(new Error(message), { statusCode });
}

export function validDate(value: unknown): Date {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) attendanceError("Date must use YYYY-MM-DD.");
  const date = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) attendanceError("Invalid attendance date.");
  return date;
}

export function deriveVendorLocalDate(instant: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(instant);
  const get = (type: string) => parts.find(part => part.type === type)!.value;
  const localDateString = `${get("year")}-${get("month")}-${get("day")}`;
  return { localDateString, attendanceDate: validDate(localDateString) };
}

export function formatInTimeZone(value: Date | null | undefined, timeZone: string) {
  return value ? new Intl.DateTimeFormat("en-IN", { timeZone, hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true }).format(new Date(value)) : null;
}

export function decorateAttendance(record: any, fallbackTimeZone: string, now = new Date()) {
  if (!record) return null;
  const timeZone = record.time_zone || fallbackTimeZone;
  const end = record.check_out ? new Date(record.check_out).getTime() : now.getTime();
  const breaks = record.breaks || [];
  const breakMs = breaks.reduce((total: number, pause: any) => total + Math.max(0,
    Math.min(end, pause.ended_at ? new Date(pause.ended_at).getTime() : end) - Math.max(new Date(record.check_in).getTime(), new Date(pause.started_at).getTime())), 0);
  const workSeconds = Math.floor(Math.max(0, end - new Date(record.check_in).getTime() - breakMs) / 1000);
  return {
    ...record,
    vendor_time_zone: timeZone,
    attendance_date_local: new Date(record.attendance_date).toISOString().slice(0, 10),
    check_in_local: formatInTimeZone(record.check_in, timeZone),
    check_out_local: formatInTimeZone(record.check_out, timeZone),
    status: record.check_out ? "COMPLETED" : breaks.some((pause: any) => !pause.ended_at) ? "ON_BREAK" : "CHECKED_IN",
    work_seconds: workSeconds,
    break_seconds: Math.floor(breakMs / 1000),
    duration_formatted: `${Math.floor(workSeconds / 3600)}h ${Math.floor(workSeconds / 60) % 60}m`,
  };
}

// Accept an offset-bearing instant, or a datetime-local value in the vendor's timezone.
// Round-trip candidates reject invalid and ambiguous daylight-saving wall times.
export function correctionTime(value: unknown, timeZone: string): Date | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") attendanceError("Correction time must be a date/time string.");
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/.test(value)) {
    validDate(value.slice(0, 10));
    const result = new Date(value);
    if (!Number.isFinite(result.getTime())) attendanceError("Invalid correction time.");
    return result;
  }
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(value)) attendanceError("Enter a valid correction date and time.");
  validDate(value.slice(0, 10));
  const target = value.length === 16 ? `${value}:00` : value;
  const nominal = Date.parse(`${target}Z`);
  const wall = (instant: number) => {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(new Date(instant));
    const get = (type: string) => parts.find(part => part.type === type)!.value;
    return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:${get("second")}`;
  };
  if (!Number.isFinite(nominal)) attendanceError("Invalid correction time.");
  const candidates = new Set<number>();
  for (const delta of [-86400000, 0, 86400000]) {
    const sample = nominal + delta;
    const offset = Date.parse(`${wall(sample)}Z`) - sample;
    const candidate = nominal - offset;
    if (wall(candidate) === target) candidates.add(candidate);
  }
  if (candidates.size !== 1) attendanceError("This local time is invalid or ambiguous in the vendor timezone. Supply a timestamp with an explicit UTC offset.");
  return new Date([...candidates][0]);
}
