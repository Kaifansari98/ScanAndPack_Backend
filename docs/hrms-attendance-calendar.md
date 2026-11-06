# Attendance Calendar

The super-admin header button **Attendance Calender** on `/dashboard/hrms/leaves-management` opens `/dashboard/hrms/leaves-management/attendance-calender`.

## Data and permissions

Authenticated super admins with HRMS enabled can read only their vendor's calendar and update only their vendor's location shifts. The server reads the actor/vendor/role from the session and database. Employee names, attendance, leave, holidays and weekly offs are all vendor-scoped.

- `GET /api/attendance/calendar?month=YYYY-MM&location=all|<id>|head-office&unit=all|BRANCH|FRANCHISE|FACTORY|UNASSIGNED` returns daily counts and unit totals for a month.
- `GET /api/attendance/calendar/day?date=YYYY-MM-DD` supports the same scope filters, `search`, `status`, `page`, `page_size` (at most 100), and `export=true` (at most 20,000 employees). Location totals include all statuses; employee filters affect the table and CSV. Reads use a consistent snapshot.
- `PATCH /api/franchises/:id/shift` accepts `{shift_minutes:480}`. The value must be 15–1440 minutes, in 15-minute increments. Out-of-vendor locations and other roles are rejected.

The calendar groups by the saved Franchise Master `Department` enum, not by location name. Users without an assigned franchise appear under Head office / Unassigned with an 8-hour default. Users with invalid cross-vendor location mappings are excluded. Actual attendance uses its stored location; unpunched past leave days use the leave's submitted location; other days use the user's assigned location.

Joining/exit dates limit eligible days. If joining date is missing, account creation date is used in the vendor timezone. Inactive users without an exit date appear only on dates with actual attendance; future inactive users are not forecast. Past membership cannot be reconstructed beyond the available account/attendance data.

## Calculation rules

- Full day: net recorded work reaches the saved shift duration.
- Half day: net work reaches 50% of the saved shift, but not the full shift.
- Short day: a completed session has positive work below 50%.
- Working: an open session below the half-day threshold. Open sessions can also reach half/full-day status and are marked live.
- Needs review: invalid timestamps or an open session older than the larger of 16 hours or shift duration plus 8 hours. Work duration stays unconfirmed; the employee still counts as present because a check-in exists.
- Past scheduled working day without attendance: absent.
- Today without attendance: not checked in, counted as absent/not here **so far**, not a final absence. A live banner explains this.
- Approved or recorded backdated leave without a punch: on leave, counted as absent only on scheduled working days. Pending requests are flagged but do not reduce projected presence.
- Paid holidays and weekly offs: day off, outside present/absent counts. A local holiday overrides the company holiday on the same date. Local weekly offs replace company defaults; missing settings mean no assumed weekly offs and generate a notice.
- Actual attendance takes precedence over leave/off schedules, with a note about the mismatch.
- Future dates: expected counts based on eligible employees, approved/recorded leave, holidays and weekly offs. Future punches are ignored; future data is always marked as a forecast.

Durations subtract merged, clipped break intervals, including active breaks. Threshold comparisons use exact elapsed milliseconds; displayed minutes are rounded down. Counts are **people**, not payroll day-equivalents: a half-day employee is one present person, with half-day classification shown separately. Present + absent + off reconciles to people in scope. Presence rate excludes day-off people. No payroll deductions, late-arrival rules or automatic absence penalties are applied.

## Shifts and migration

Migration: `20261105140000_attendance_calendar_shifts`.

- `FranchiseMaster.shift_minutes` defaults to 480 (8 hours) for existing and new branches/franchises/factories.
- `attendance.shift_minutes` snapshots the expected shift. Existing attendance is initialized from its location's default shift without altering punches, breaks or other attendance fields.
- New punches and approved missing-day corrections save the location shift. Later shift edits do not reclassify existing records with a snapshot. Imported records without a snapshot fall back to the current location setting.

Shifts can be changed from the calendar's Location shifts dialog or Franchise Master's Manage location shifts control. Create Franchise also accepts a daily shift. Head office / Unassigned uses the documented 8-hour fallback.

Deploy using `pnpm exec prisma migrate deploy` and `pnpm build`. The migration adds fields and constraints without deleting attendance or user data.

## Verification

`node --test tests/attendance-calendar.test.cjs tests/attendance-workspace.test.cjs tests/leaves.test.cjs` covers threshold boundaries, break merging/clipping, shift snapshots, stale/overnight sessions, off days versus absence, forecasts and role guards. Isolated database/API/browser checks also cover branch/franchise/factory groups, eligible joining dates, cross-vendor isolation, shift updates, actual check-in snapshots, CSV export, header navigation and mobile layout.
