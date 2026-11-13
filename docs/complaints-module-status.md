# Complaints module implementation review

Reviewed on 13 November 2026 against the 23-page **CRM Complaints Module.pdf** supplied by the client. This is a source-code audit of the current workspace, not a live deployment or end-to-end acceptance test.

**Estimated functional coverage: approximately 20–25% implemented, 75–80% remaining.** This is a planning estimate across the complete requested module, not a measured percentage of development hours. The extensive database foundation is listed separately; tables and status labels do not mean the corresponding workflow is operational.

## Implemented functionality

- Vendor feature flag and employee-authenticated complaint endpoints.
- Complaint list with pagination, search, status filtering and clickable grouped counters.
- Super Admin/HSS can register complaints for CRM clients or external clients from the CRM.
- CRM lead-code lookup, read-only client/project details, product-instance selection, component selection and handover-date capture when the CRM dates are missing.
- Ten initial complaint categories, issue description, optional preferred visit date and additional remarks.
- Required photo uploads, optional video uploads, file count/size/format/signature validation and Wasabi storage. Uploaded files are removed if registration fails.
- Sequential complaint codes for existing leads and external clients, including separate external-client profiles without automatically creating a lead.
- Possible-duplicate warnings based on mobile number or name/address; staff can explicitly select an existing external profile during registration. Matches are not merged automatically.
- Registration creates the first complaint cycle, evidence references, assignment-history records where an assignee is available, and an activity-log entry.
- HSS/Super Admin see vendor complaints; Site Supervisors see complaints assigned to them.
- Complaint list entries now open a read-only detail page with all twelve requested tabs, saved evidence previews, separate visit/repair financial records, linked Miscl requests and recorded workflow decisions. Tabs without saved records show empty states.
- Activity history supports search, pagination and cycle filtering. Previous complaint cycles and assignment history remain accessible. Signed evidence links are generated only after vendor/assignment access checks; financial details and proof links are limited to HSS/Super Admin.

## Requirement-by-requirement assessment

| PDF requirement | Status | Remaining work |
|---|---|---|
| Registration, lead lookup, required photos, optional videos and unique IDs (pp. 2–5) | Partial | Staff flow works. Client self-service, public website submission and OTP verification are absent. |
| External-client profiles and duplicate detection (pp. 3–4, 16) | Partial | Profiles, warnings and registration-time reuse exist. Post-registration HO duplicate review, linking an external complaint to a CRM lead, and verified profile updates are absent. |
| Categories and priority (p. 5) | Partial | Initial categories and priority fields/labels exist. No category-management UI/API, SS priority action or audited priority-revision workflow. |
| Dashboard summary and list (p. 6) | Partial | Searchable/paginated list and grouped status counters work. The full requested summary, overdue calculation and analytics are not implemented. |
| Complaint details with twelve tabs (p. 6) | Implemented for employee read access | Detail and paginated-history APIs, detail route, twelve tabs, evidence previews, cycle selection and assignment/activity history are implemented. Later-stage creation/approval actions and client-facing access remain separate work. |
| Primary ownership and reassignment (pp. 6–7) | Partial | Registration copies the lead's supervisor when available; HSS is assigned when HSS creates the record. Complaints can still be created without an SS/HSS. Assignment/reassignment actions, mandatory ownership and reasons are absent. |
| HO verification, warranty and responsibility decisions (pp. 7–8) | Schema only | Add review screens/APIs, mandatory remarks, rejection/hold/information requests, remote-resolution records and controlled transitions. |
| ₹800 visiting charges and approved free repeat visits (pp. 8–9) | Schema only | Charge creation, acceptance, proof verification, same-unresolved-issue checks, HSS/Super Admin exemptions and scheduling gates are absent. |
| Visit approval, CRM tasks, scheduling and rescheduling (pp. 9–10) | Schema only | No operational complaint visit/task workflow, scheduling, cancellation or client-unavailable/site-inaccessible handling. |
| Inspection and material-requirement reporting (pp. 10–11) | Schema only | No inspection form, report submission, evidence review or progression rules. |
| Versioned quotations and HSS/client approvals (pp. 11–12) | Schema only | No quotation editor, approval/revision actions, sharing, authenticated client acceptance or warranty pricing flow. |
| Separate visiting/repair payments, refunds and waivers (p. 12) | Schema only / incomplete | No payment screens/APIs, verification, financial clearance or authorised refund/waiver operations. |
| Procurement, existing Miscl integration and repair execution (p. 13) | Schema links only | Execution/Miscl relations exist. No complaint action initiates or tracks the factory/procurement flow. |
| Completion report, before/after photos, client confirmation and HO closure (pp. 13–14) | Schema only | No completion submission, client response, financial review, closure approval or no-response exception workflow. |
| Reopening with unchanged Complaint ID/history (p. 14) | Schema only | Initial cycles exist, but no reopen action creates subsequent cycles or preserves/continues operational work. |
| Client Portal (pp. 15–16) | Not implemented | Register, own-complaint list/detail, information uploads, visiting-charge acceptance, quotation approval, reschedule requests, confirmation and reopening. |
| Website form, email OTP and secure tracking (p. 16) | Not implemented | Employee APIs currently require an authenticated CRM token. Manually registering an external client is not the website flow. |
| Exceptional-client approval (pp. 16–17) | Schema only | Client-type/exception fields exist; registration currently accepts only CRM_LEAD or EXTERNAL, with no exceptional-approval action. |
| Internal/client-facing statuses and transition rules (pp. 17–18) | Partial foundation | Internal enums/list labels exist. No client-status mapping or complete transition service. |
| Notifications, complaint chat, reminders, escalation and configurable SLA (pp. 18–19) | Schema only / not implemented | Notification/SLA models exist, but no complaint notification producer, delivery worker, chat, SLA settings UI or reminder/escalation jobs. |
| Full role and financial permissions (pp. 19–20) | Partial | Employee list/register checks exist. Workflow-specific permissions and authenticated client/proxy actions remain. |
| Operational, quality and financial reports (pp. 20–21) | Not implemented | No complaint reporting endpoints or report screens. Status counters are not equivalent to these reports. |
| Exception handling and immutable historical records (pp. 21–23) | Partial foundation | Basic duplicate/invalid-lead/media handling and related schema exist. The later-stage exceptions need workflow implementation and acceptance tests. |

## Database foundation already present

The Prisma schema includes complaint categories, external clients, master records, cycles, assignments, attachments, decisions, visits, inspection reports/materials, quotations/items, charges, payments/allocations, executions, tasks, closures, notifications, SLA configuration and activity logs. Execution/master records also link to the existing Miscl schema.

The runtime complaint services implement metadata, lead lookup, duplicate checks, registration, listing, single-complaint details and activity history. The detail service reads saved later-stage records; the actions that create or progress decisions, visits, quotations, payments, execution, closure and notifications are still pending. SLA automation remains unimplemented.

## Gaps in the currently working registration flow

1. Mandatory ownership is not yet enforced. Missing lead-supervisor mappings and external registrations can leave assigned_ss_id empty. A Super Admin-created complaint can also have no HSS assigned.
2. Supervisor lookup uses LeadSiteSupervisorMapping; check whether it should prefer the current active LeadUserMapping assignment used elsewhere in the CRM.
3. External-client handover dates are stored empty, with no subsequent SS update action yet. The PDF requires the SS to capture these.
4. Priority is visible as a column but cannot currently be selected or revised through the complaint module.
5. Default categories can be created, but the Department Head cannot yet manage them through the module.
6. Registration does not generate the complaint-team/client notification or an operational visit task.

## Differences from the previously supplied journey

These are specification differences to resolve before implementing the affected stages; the audit does not change their behaviour automatically.

- **Closure authority:** the PDF names HSS/HO with client confirmation; the earlier journey explicitly reserved final closure for Super Admin.
- **Website-client confirmation:** the earlier journey skips confirmation for website complaints. The PDF sends external complaints through the standard journey and provides authenticated tracking/client actions; it does not specify the same blanket skip. The PDF also separately permits an authorised HO closure review after a configured no-response period.
- **Staff registration:** the PDF's permission matrix says Site Supervisor cannot register; the earlier journey allowed SS, HSS, Sales Executive and Super Admin. Current implementation permits HSS/Super Admin only, and the sidebar is also unavailable to Sales Executives.
- **Skipping inspection/quotation:** the earlier journey explicitly permits SS/HSS skips with remarks. The PDF supports direct carpenter resolution and no-material repair, but describes an inspection-before-quotation rule without the same explicit skip controls.

## Suggested implementation order

1. Complaint detail page, ownership/reassignment, categories/priority and HO verification.
2. Warranty decisions, approved visits, ₹800 charges/payment checks and repeat-visit exemptions.
3. Inspection, quotation revisions/approvals, repair-payment controls and existing Miscl execution integration.
4. Client/website authentication, OTP, tracking and client decisions, delivered alongside the stages that need them.
5. Completion, reopening, final closure and exception handling.
6. Notifications/chat, SLA automation, reports and end-to-end permission/workflow acceptance tests.

## Source references

- Backend runtime: src/routes/clientComplaints/clientComplaints.routes.ts; src/controllers/clientComplaints/clientComplaints.controller.ts; src/services/clientComplaints/clientComplaints.service.ts.
- Data foundation: prisma/schema.prisma and the complaint migration files.
- Frontend: VLOQ-CRM-FRONTEND/src/app/dashboard/client-complaints/page.tsx; src/components/client-complaints/ClientComplaintsView.tsx; CreateComplaintModal.tsx; src/api/client-complaints.ts.
- Sidebar label changed to **Complaints** in VLOQ-CRM-FRONTEND/src/components/app-sidebar.tsx, including the corresponding feature/role-filter comparison. Existing URL remains /dashboard/client-complaints.
