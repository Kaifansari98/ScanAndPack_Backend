import { attendanceError } from "./attendance.utils";
export type CalendarStatus = "FULL_DAY" | "HALF_DAY" | "SHORT_DAY" | "WORKING" | "MISSING_PUNCH" | "ABSENT" | "NOT_CHECKED_IN" | "ON_LEAVE" | "OFF" | "EXPECTED_PRESENT";
export type CalendarCounts = { people: number; present: number; absent: number; off: number; full_day: number; half_day: number; short_day: number; working: number; on_leave: number; not_checked_in: number; needs_review: number; pending_leave: number; work_minutes: number };
export const calendarStatuses: CalendarStatus[] = ["FULL_DAY", "HALF_DAY", "SHORT_DAY", "WORKING", "MISSING_PUNCH", "ABSENT", "NOT_CHECKED_IN", "ON_LEAVE", "OFF", "EXPECTED_PRESENT"];
export function validateShiftMinutes(value: unknown) {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 15 || value > 1440 || value % 15 !== 0) attendanceError("Shift must be 15 minutes to 24 hours, in 15-minute increments.");
  return value;
}
export const emptyCalendarCounts = (): CalendarCounts => ({ people: 0, present: 0, absent: 0, off: 0, full_day: 0, half_day: 0, short_day: 0, working: 0, on_leave: 0, not_checked_in: 0, needs_review: 0, pending_leave: 0, work_minutes: 0 });
export type CalendarAttendance = { check_in: Date; check_out: Date | null; shift_minutes?: number | null; breaks: { started_at: Date; ended_at: Date | null }[] };
export function classifyCalendarDay(input: { date: string; today: string; now: Date; shiftMinutes: number; record?: CalendarAttendance; offReason?: string; leaveTitle?: string }) {
  const { date, today, now, record } = input;
  const shiftMinutes = record?.shift_minutes || input.shiftMinutes;
  let status: CalendarStatus, workMinutes: number | null = null, breakMinutes = 0;
  let note = "", open = false;
  if (record) {
    open = !record.check_out;
    const start = new Date(record.check_in).getTime(), end = record.check_out ? new Date(record.check_out).getTime() : now.getTime();
    if (end < start || end > now.getTime() || (open && now.getTime() - start > Math.max(16 * 60, shiftMinutes + 8 * 60) * 60000)) {
      status = "MISSING_PUNCH"; note = "Attendance needs review before work time can be confirmed.";
    } else {
      // Merge overlapping intervals as a safeguard for imported/historical break data.
      const intervals = record.breaks.map(pause => [Math.max(start, new Date(pause.started_at).getTime()), Math.min(end, pause.ended_at ? new Date(pause.ended_at).getTime() : end)])
        .filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b) && b > a).sort((a, b) => a[0] - b[0]);
      let breakMs = 0, previousEnd = start;
      for (const [a, b] of intervals) { breakMs += Math.max(0, b - Math.max(a, previousEnd)); previousEnd = Math.max(previousEnd, b); }
      const workMs = Math.max(0, end - start - breakMs);
      workMinutes = Math.floor(workMs / 60000); breakMinutes = Math.floor(breakMs / 60000);
      status = workMs >= shiftMinutes * 60000 ? "FULL_DAY" : workMs >= shiftMinutes * 30000 ? "HALF_DAY" : open ? "WORKING" : workMs > 0 ? "SHORT_DAY" : "ABSENT";
      if (open) note = "Live session; day classification may change as more hours are recorded.";
      else if (status === "SHORT_DAY") note = "Recorded work is below half of the expected shift.";
    }
    if (input.offReason) note += `${note ? " " : ""}Worked on a scheduled day off (${input.offReason}).`;
    if (input.leaveTitle) note += `${note ? " " : ""}Attendance recorded on leave: ${input.leaveTitle}.`;
  } else if (input.offReason) { status = "OFF"; note = input.offReason; }
  else if (input.leaveTitle) { status = "ON_LEAVE"; note = input.leaveTitle; }
  else if (date > today) { status = "EXPECTED_PRESENT"; note = "Expected to work; future attendance is a forecast."; }
  else if (date === today) { status = "NOT_CHECKED_IN"; note = "No check-in yet today. This is a live count, not a final absence."; }
  else { status = "ABSENT"; note = "No attendance recorded for this scheduled working day."; }
  const present = ["FULL_DAY", "HALF_DAY", "SHORT_DAY", "WORKING", "MISSING_PUNCH", "EXPECTED_PRESENT"].includes(status);
  return { status, present, absent: !present && status !== "OFF", shift_minutes: shiftMinutes, half_day_minutes: shiftMinutes / 2, work_minutes: workMinutes, break_minutes: breakMinutes, is_open: open, note };
}
export function addCalendarCount(counts: CalendarCounts, row: ReturnType<typeof classifyCalendarDay> & { pending_leave: boolean }) {
  counts.people++; if (row.present) counts.present++; if (row.absent) counts.absent++;
  const fields: Partial<Record<CalendarStatus, keyof CalendarCounts>> = { FULL_DAY: "full_day", HALF_DAY: "half_day", SHORT_DAY: "short_day", MISSING_PUNCH: "needs_review", NOT_CHECKED_IN: "not_checked_in", ON_LEAVE: "on_leave", OFF: "off" };
  const field = fields[row.status]; if (field) counts[field]++;
  if (row.is_open && row.status !== "MISSING_PUNCH") counts.working++;
  if (row.pending_leave) counts.pending_leave++;
  counts.work_minutes += row.work_minutes || 0;
}
