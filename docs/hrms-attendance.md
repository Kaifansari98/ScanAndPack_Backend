# HRMS attendance

The Employees Attendance page uses authenticated server records. Browser preview data is not imported into official attendance.

## API

All routes require `Authorization: Bearer <session token>`. New workspace APIs require an active account and `is_hrms_master_enabled` on its vendor. Identity and vendor scope come from the authenticated account, not a client-supplied employee ID.

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/api/attendance/workspace?month=YYYY-MM` | Own complete month, current/overnight session, corrections, timezone, server clock and monthly summary |
| POST | `/api/attendance/punch` | `action`: `IN`, `OUT`, `BREAK_START`, `BREAK_END`; check-in requires `work_location`: `OFFICE`, `FACTORY`, `SITE`, `REMOTE` |
| POST | `/api/attendance/corrections` | Own `attendance_date`, 10–1000 character `reason`, optional `requested_check_in` / `requested_check_out` |
| GET | `/api/attendance/corrections?status=PENDING&page=1` | HRMS-admin/super-admin vendor review queue; optional `month=YYYY-MM` |
| PATCH | `/api/attendance/corrections/:id` | Owner: `status=CANCELLED`. Reviewer: `APPROVED` or `REJECTED`, optional actual time overrides and `review_note` (required on rejection) |

Existing `/mark`, `/today`, attendance history and log APIs remain available. Historical client `action_time` overrides are rejected; corrections are the supported path for historical changes. Checkout is final; breaks have dedicated start/end actions.

Correction timestamps accept explicit ISO offsets or datetime-local values interpreted in the attendance/vendor timezone. Nonexistent or ambiguous daylight-saving local times are rejected. Approval requires a complete check-in/out window, must preserve completed breaks, cannot overlap another session, and cannot approve one's own request. A stale request must be cancelled and resubmitted. Approval and its before/after audit snapshot commit in the same transaction.

## Deployment

1. Install dependencies with the lockfile and generate the client: `pnpm install --frozen-lockfile` then `pnpm exec prisma generate`.
2. Review historical open-session conflicts before applying the migration:

```sql
SELECT vendor_id, user_id, array_agg(id ORDER BY attendance_date) AS attendance_ids
FROM attendance
WHERE check_out IS NULL
GROUP BY vendor_id, user_id
HAVING count(*) > 1;
```

Resolve any returned sessions using verified checkout times. The migration deliberately refuses to infer times and rolls back before changing the schema if conflicts remain.

3. Apply migrations: `pnpm exec prisma migrate deploy`.
4. Build the backend with `pnpm build`, then deploy/restart backend and frontend together.

Generated Prisma files are ignored and regenerated during the build. Source-only checkouts should not copy partial generated clients from older deployments.

## Validation

`node --test tests/attendance-workspace.test.cjs`

The tests exercise authentication and vendor boundaries, duplicate/overnight punches, breaks and net time, correction permissions/approvals/cancellation, stale records, overlapping intervals, audit rollback and timezone conversion.
