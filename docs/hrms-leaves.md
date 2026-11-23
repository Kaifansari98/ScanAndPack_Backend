# HRMS Leave Management

## Schema and rollout

Migrations: `20261104150000_hrms_leave_management`, `20261104160000_leave_request_date_ranges`, `20261105120000_allow_super_admin_self_leave_review`, then `20261105130000_record_backdated_leave`.

- `LeaveHoliday`: vendor/company or franchise scope, date, name, optional remark, creator/updater and timestamps. One holiday per scope/date.
- `LeaveWeeklyOff`: company defaults or franchise override; a sorted day-number array (`0` Sunday through `6` Saturday). No row means inherit. An explicitly saved empty array means no weekly offs. There is no assumed company schedule.
- `LeaveRequest`: owner, vendor and franchise at submission, inclusive start date (`leave_date`, retained for compatibility) and end date (`end_date`), title, type (`PAID`, `SICK`, `CASUAL`, `UNPAID`), remark, optional private attachment metadata, status, persistent backdated flag, reviewer, review time and rejection reason.

The initial migration adds a partial unique index preventing duplicate active start dates. The date-range migration backfills each existing end date from its original leave date and adds an end-on-or-after-start check. Submission checks for any overlapping pending/approved interval while holding the employee row lock, including overlaps with different start dates. Recorded backdated requests also reserve their dates. Rejected requests can be resubmitted. Database checks enforce valid scopes, weekly-day ranges, review metadata, rejection reasons and complete attachment metadata. Approved/rejected requests cannot be reviewed again through the API.

Deploy the backend migration and regenerate the Prisma client before starting the updated app:

```sh
pnpm exec prisma migrate deploy
pnpm build
```

For a local database maintained using `prisma db push`, if adding required `end_date` is blocked by existing requests, run this data-preserving backfill first:

```sh
pnpm prisma:backfill-leave-dates
pnpm prisma db push
pnpm prisma generate
```

The backfill runs in a transaction, adds the column if missing, fills only null end dates from each request's original start date, and adds the range check/index. It can be run again without replacing existing end dates. Use the normal migrations above for a migration-managed deployment; do not reset the database or use `--accept-data-loss` to bypass this error.

The configured database is not migrated by code generation. Existing attendance and payroll are not modified. Leave quotas, deductions, notifications and balance accrual are outside this implementation.

Attachments use the existing Wasabi configuration (`WASABI_BUCKET_NAME`, `WASABI_ENDPOINT`, `WASABI_REGION`, `WASABI_ACCESS_KEY_ID`, `WASABI_SECRET_ACCESS_KEY`). Objects are private under `hrms/leaves/<vendor>/<user>/`. Only the owner and their vendor's super admins can obtain a five-minute signed download URL. Files must be PDF, PNG or JPEG, at most 5 MB; extension, MIME and file signature must agree. Failed request creation attempts clean up uploaded objects. Object keys and permanent public URLs are never exposed by request listings.

## Authentication and scope

All `/api/leaves` routes require an authenticated active account with HRMS enabled and a valid vendor timezone. Vendor and role are read from the database using the session's user ID. A franchise must belong to that vendor.

Only `super-admin` users can read company-wide requests, import/delete holidays, save weekly offs or approve/reject requests. HRMS admins, auditors and other roles use their personal workspace. Super admins can approve or reject their own leave requests as well as requests from other users in their vendor.

Personal requests always use the logged-in user and their actual assigned franchise; supplied `vendor_id`, `user_id` or `franchise_id` fields are rejected on submission. Personal reads ignore client attempts to select another owner or franchise. Requests keep the franchise recorded at submission for administrative filtering.

Company paid holidays are inherited by every franchise. Local paid holidays are additional; a local holiday takes precedence on the same date. A franchise weekly-off override replaces, rather than adds to, the company schedule. Removing an override restores inheritance.

## API

- `GET /workspace?mode=admin|personal&year=2026&scope=company|<franchise_id>`: server-local date/timezone, valid location choices, calendar, saved weekly policies, full-scope request totals and available years. Personal mode is the default.
- `POST /holidays/import`: `{scope, year, rows:[{date:"YYYY-MM-DD",name,remark?}], allow_updates?:boolean}`. The UI reads the Excel file, previews errors, and submits parsed rows. The server independently validates every row, date/year, length, duplicate and scope before saving the entire batch in a transaction. At most 366 rows. Updating existing dates requires explicit confirmation; unspecified dates are retained. A vendor lock prevents unconfirmed concurrent overwrites.
- `DELETE /holidays/:id`: delete a holiday in the authenticated vendor.
- `PUT /weekly-offs`: `{scope, days:[0,6]}` or `{scope:<franchise_id>, inherit:true}`.
- `GET /requests`: workspace parameters plus optional `status`, `search`, `type`, `from`, `to`, `page` and `page_size` (at most 100). Returns paginated records, total and filtered status counts including `RECORDED`. Recorded entries appear in All requests and Backdated; they are excluded from the pending approval queue. Workspace overview totals remain independent of table filters. Reads use a consistent transaction snapshot.
- `POST /requests`: multipart fields `title`, `type`, `remark`, `start_date`, `end_date`, optional `attachment`. Start dates before the server’s vendor-local submission date create `RECORDED` leave with `is_backdated=true` and no reviewer or review timestamp. No approval is required for that entire range, including when its end date is today or later. Today/future start dates create `PENDING` requests requiring normal review. End date must be on or after start date. Locks the employee and rechecks interval overlap before inserting. A legacy `date` alone is still accepted as a one-day range for older clients. Responses include `startDate`, `endDate`, `dayCount`, `isBackdated`, `approvalRequired`, and a legacy `date` alias for the start.
- `PATCH /requests/:id/decision`: `{status:"APPROVED"|"REJECTED", rejection_reason?}`. A nonblank reason is required for rejection. The request is locked and checked for vendor ownership and pending state before writing reviewer metadata. Recorded backdated entries cannot be reviewed again.
- `GET /requests/:id/attachment`: authenticated authorization check, then a temporary signed download URL.

Leave dates are date-only values (`YYYY-MM-DD`). Submission/review timestamps are retained as instants; separate display dates use the vendor timezone. Supported calendar/request years are 2000–2100. Duration is the inclusive number of calendar days: the same start/end date is one day; 31 December–2 January is three days. Weekly offs and paid holidays are not subtracted from this displayed count. Year and date filters match any intersecting portion of a request, including cross-year leave. There are no automatic payroll or attendance changes.

## Validation

`node --test tests/leaves.test.cjs` covers input validation, import atomic validation, weekly-day rules, file signatures, role/tenant gates, forged ownership and rejection requirements. Integration validation also exercises the generated Prisma client and actual migration in an isolated PostgreSQL-compatible database, concurrent submissions/decisions, database constraints, Express multipart routes and the connected browser flow. Storage calls are stubbed during isolated tests; production Wasabi upload/download depends on the configured bucket credentials.

## Local sample data

Use the local-only seed to populate both HRMS pages with clearly marked sample data for an existing vendor:

```sh
node scripts/seed-hrms-leaves.cjs --vendor-id 1 --date 2026-11-05
node scripts/seed-hrms-leaves.cjs --vendor-id 1 --date 2026-11-05 --apply
```

The first command previews additions. The seed only accepts the local `scanandpack` database. It creates missing sample paid holidays, missing company/franchise weekly policies and three sample requests per active user. Existing settings and request rows are preserved; sample requests are tagged in their remarks and skipped on repeat runs. Requests avoid existing active leave intervals. Reviewable sample requests include pending, approved and rejected examples with a rejection reason. Super admins can review their own sample requests. The script does not create user accounts, change permissions, upload files or send notifications.


Backdated classification is saved at submission, not recalculated as time passes. An ordinary approved/pending request does not become backdated merely because its start date has passed. Existing rows and their decisions remain unchanged by this migration. The API computes the flag and status from dates; clients cannot mark future requests as recorded to bypass approval.
