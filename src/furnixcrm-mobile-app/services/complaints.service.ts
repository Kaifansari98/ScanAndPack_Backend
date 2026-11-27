import { prisma, Prisma } from "../../prisma/client";
import { ComplaintComponent, ComplaintStatus } from "../../prisma/generated";
import { deleteWasabiObjects, generateSignedUrl, uploadComplaintFile } from "../../utils/wasabiClient";
import {
  complaintAssigneeOptions,
  ComplaintError,
  ComplaintUpload,
  ensureDefaultCategories,
  validateUploads,
} from "../../services/clientComplaints/clientComplaints.service";
import { classifyUploads, LoadedComplaint, MediaKind } from "../../services/clientComplaints/complaintWorkflow.shared";
import { deliveredProjectsScope } from "../../services/clientComplaints/complaintLeadPicker.service";
import { chargeBalance, resolutionPaymentDue } from "../../services/clientComplaints/complaintPayment.service";
import { startExecutionTx } from "../../services/clientComplaints/complaintExecution.service";
import { refreshComplaintTasks } from "../../services/clientComplaints/complaintTasks.service";
import { clientLeadsWhere } from "./projects.service";
import type { ClientTokenPayload } from "./auth.service";

// Complaints for the client app (/furnixcrm-mobile-app/client/complaints).
// The CRM workflow (24 statuses, HSS approval, procurement, internal remarks)
// is mapped to the few steps a client sees; client actions are recorded as the
// CLIENT actor, the same records staff create when answering for the client.

type Tx = Prisma.TransactionClient;

const MAX_FILES = 5;
const FILE_TTL = 60 * 60;
const FINISHED: ComplaintStatus[] = ["CLOSED", "REJECTED", "CANCELLED"];
const CANCELLABLE: ComplaintStatus[] = ["NEW", "UNDER_VERIFICATION", "MORE_INFORMATION_REQUIRED"];
const RESOLUTION_STAGE: ComplaintStatus[] = [
  "PROCUREMENT_PENDING",
  "MATERIAL_RECEIVED",
  "REPAIR_SCHEDULED",
  "WORK_IN_PROGRESS",
  "AWAITING_CLIENT_CONFIRMATION",
  "AWAITING_HO_CLOSURE_APPROVAL",
];

const COMPONENTS: Record<string, ComplaintComponent> = {
  shutter: "SHUTTER",
  carcass: "CARCASS",
  hardware: "HARDWARE",
  accessory: "ACCESSORY",
};
const COMPONENT_LABEL: Record<ComplaintComponent, string> = {
  SHUTTER: "Shutter",
  CARCASS: "Carcass",
  HARDWARE: "Hardware",
  ACCESSORY: "Accessory",
};

/** How client actions are attributed (an authenticated client reference). */
const clientRef = (client: ClientTokenPayload) => `Client app · ${client.email}`.slice(0, 255);

const fullName = (first?: string | null, last?: string | null) =>
  [first, last]
    .map((v) => v?.trim())
    .filter(Boolean)
    .join(" ");

const last = <T,>(rows: T[]): T | undefined => rows[rows.length - 1];

const dateOnly = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);

/** Today in the CRM's timezone, as a date-only value. */
const todayIst = () =>
  new Date(`${new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date())}T00:00:00Z`);

function text(value: unknown, label: string, max: number, required = false) {
  if (value === undefined || value === null || (typeof value === "string" && !value.trim())) {
    if (required) throw new ComplaintError(`${label} is required.`);
    return null;
  }
  if (typeof value !== "string") throw new ComplaintError(`${label} must be text.`);
  const trimmed = value.trim();
  if (trimmed.length > max) throw new ComplaintError(`${label} must be at most ${max} characters.`);
  return trimmed;
}

function positiveId(value: unknown, label: string) {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw new ComplaintError(`Select a valid ${label}.`);
  return id;
}

/* --------------------------------- Scope ---------------------------------- */

async function clientLeadIds(client: ClientTokenPayload) {
  const leads = await prisma.leadMaster.findMany({ where: clientLeadsWhere(client), select: { id: true } });
  return leads.map((l) => l.id);
}

const leadSelect = {
  id: true,
  vendor_id: true,
  lead_code: true,
  account_id: true,
  firstname: true,
  lastname: true,
  country_code: true,
  contact_no: true,
  alt_contact_no: true,
  email: true,
  site_address: true,
  site_map_link: true,
  usable_handover_completed_at: true,
  final_handover_marked_at: true,
  franchise_id: true,
  productStructureInstances: {
    where: { is_archived: false },
    orderBy: [{ product_type_id: "asc" }, { quantity_index: "asc" }],
    select: { id: true, title: true, productType: { select: { type: true } } },
  },
} satisfies Prisma.LeadMasterSelect;

/** The client's bookings a complaint can be raised for: delivered / handed over, on vendors using complaints. */
async function eligibleLeads(client: ClientTokenPayload, leadId?: number) {
  const vendors = await prisma.leadMaster.findMany({
    where: {
      ...clientLeadsWhere(client),
      ...(leadId ? { id: leadId } : {}),
      vendor: { is_furnixcrm_app_enabled: true, status: "active", is_client_complaints_enabled: true },
    },
    distinct: ["vendor_id"],
    select: { vendor_id: true },
  });
  const leads = [];
  for (const { vendor_id } of vendors) {
    const scope = await deliveredProjectsScope(vendor_id);
    leads.push(
      ...(await prisma.leadMaster.findMany({
        where: {
          AND: [
            clientLeadsWhere(client),
            { vendor_id, account_id: { not: null }, ...(leadId ? { id: leadId } : {}) },
            scope,
          ],
        },
        orderBy: { created_at: "desc" },
        select: leadSelect,
      })),
    );
  }
  return leads;
}

/** A staff member to attribute system follow-ups to (tasks, execution start). */
async function staffProxy(vendorId: number, complaint?: { assigned_hss_id: number | null; assigned_ss_id: number | null }) {
  if (complaint?.assigned_hss_id) return complaint.assigned_hss_id;
  if (complaint?.assigned_ss_id) return complaint.assigned_ss_id;
  const admin = await prisma.userMaster.findFirst({
    where: { vendor_id: vendorId, status: "active", user_type: { user_type: { in: ["super-admin", "head-site-supervisor"] } } },
    orderBy: { id: "asc" },
    select: { id: true },
  });
  return admin?.id ?? null;
}

async function refreshTasks(complaintId: number) {
  const c = await prisma.complaintMaster.findUnique({
    where: { id: complaintId },
    select: { vendor_id: true, assigned_hss_id: true, assigned_ss_id: true },
  });
  if (!c) return;
  const proxy = await staffProxy(c.vendor_id, c);
  if (proxy) await refreshComplaintTasks(complaintId, proxy);
}

/* ---------------------------------- Meta ---------------------------------- */

export async function complaintMeta(client: ClientTokenPayload) {
  const [leads, anyEnabled] = await Promise.all([
    eligibleLeads(client),
    prisma.leadMaster.count({
      where: { ...clientLeadsWhere(client), vendor: { is_furnixcrm_app_enabled: true, status: "active", is_client_complaints_enabled: true } },
    }),
  ]);
  const vendorIds = [...new Set(leads.map((l) => l.vendor_id))];
  const vendors = new Map<number, { categories: { id: number; name: string }[]; upi: { vpa: string; name: string } | null; visit_fee: number }>();
  for (const vendorId of vendorIds) {
    let categories = await prisma.complaintCategoryMaster.findMany({
      where: { vendor_id: vendorId, is_active: true },
      orderBy: [{ sort_order: "asc" }, { name: "asc" }],
      select: { id: true, name: true },
    });
    if (!categories.length) {
      const proxy = await staffProxy(vendorId);
      if (proxy) {
        await ensureDefaultCategories(vendorId, proxy);
        categories = await prisma.complaintCategoryMaster.findMany({
          where: { vendor_id: vendorId, is_active: true },
          orderBy: [{ sort_order: "asc" }, { name: "asc" }],
          select: { id: true, name: true },
        });
      }
    }
    const vendor = await prisma.vendorMaster.findUniqueOrThrow({
      where: { id: vendorId },
      select: { vendor_name: true, complaint_upi_id: true, complaint_upi_name: true, complaint_visit_fee: true },
    });
    vendors.set(vendorId, {
      categories,
      upi: vendor.complaint_upi_id
        ? { vpa: vendor.complaint_upi_id, name: vendor.complaint_upi_name?.trim() || vendor.vendor_name }
        : null,
      visit_fee: Number(vendor.complaint_visit_fee),
    });
  }
  return {
    enabled: anyEnabled > 0,
    projects: leads.map((l) => {
      const v = vendors.get(l.vendor_id)!;
      return {
        lead_id: l.id,
        project_name: fullName(l.firstname, l.lastname),
        lead_code: l.lead_code,
        client_name: fullName(l.firstname, l.lastname),
        mobile: [l.country_code?.trim(), l.contact_no?.trim()].filter(Boolean).join(" "),
        alternate_mobile: l.alt_contact_no,
        email: l.email ?? client.email,
        site_address: l.site_address ?? "",
        map_link: l.site_map_link?.trim() || null,
        usable_handover: dateOnly(l.usable_handover_completed_at),
        final_handover: dateOnly(l.final_handover_marked_at),
        products: l.productStructureInstances.map((p) => ({
          id: p.id,
          name: p.title?.trim() || p.productType.type,
          type: p.productType.type,
        })),
        categories: v.categories,
        upi: v.upi,
        visit_fee: v.visit_fee,
      };
    }),
  };
}

/* ------------------------------ Client view ------------------------------- */

type ClientStatus =
  | "under_review"
  | "more_info"
  | "not_approved"
  | "visit_pending"
  | "charges_approval"
  | "payment_due"
  | "visit_scheduled"
  | "inspection_done"
  | "quotation_shared"
  | "work_scheduled"
  | "work_in_progress"
  | "feedback_due"
  | "closing"
  | "reopen_review"
  | "on_hold"
  | "closed"
  | "cancelled";

const ENDED_VISIT = ["COMPLETED", "CANCELLED", "CLIENT_NOT_AVAILABLE", "SITE_NOT_ACCESSIBLE"];
const SHOWN_QUOTATION = ["SHARED", "CLIENT_ACCEPTED", "CLIENT_REJECTED", "MODIFICATION_REQUESTED"] as const;

const complaintSelect = {
  id: true,
  vendor_id: true,
  complaint_code: true,
  lead_id: true,
  product_type: true,
  component: true,
  description: true,
  additional_remarks: true,
  preferred_visit_date: true,
  client_alternate_mobile: true,
  status: true,
  status_changed_at: true,
  current_cycle_id: true,
  created_at: true,
  updated_at: true,
  category: { select: { name: true } },
  lead: { select: { lead_code: true, firstname: true, lastname: true } },
  instance: { select: { title: true, productType: { select: { type: true } } } },
} satisfies Prisma.ComplaintMasterSelect;

async function loadViews(where: Prisma.ComplaintMasterWhereInput) {
  const complaints = await prisma.complaintMaster.findMany({
    where,
    orderBy: { updated_at: "desc" },
    select: complaintSelect,
  });
  if (!complaints.length) return [];
  const ids = complaints.map((c) => c.id);
  const cycleIds = complaints.map((c) => c.current_cycle_id).filter((id): id is number => !!id);
  const inComplaints = { complaint_id: { in: ids } };
  const inCycles = { cycle_id: { in: cycleIds } };

  const [attachments, decisions, logs, visits, charges, reports, quotations, executions, closures] = await Promise.all([
    prisma.complaintAttachment.findMany({
      where: { ...inComplaints, category: { in: ["REGISTRATION", "ADDITIONAL_INFORMATION", "AFTER_EXECUTION", "QUOTATION"] } },
      orderBy: { id: "asc" },
      select: {
        id: true,
        complaint_id: true,
        cycle_id: true,
        category: true,
        media_type: true,
        mime_type: true,
        original_name: true,
        storage_key: true,
        execution_id: true,
        quotation_id: true,
      },
    }),
    prisma.complaintDecision.findMany({
      where: {
        ...inComplaints,
        decision_type: { in: ["HO_VERIFICATION", "VISIT_CHARGE_ACCEPTANCE", "CLIENT_QUOTATION_RESPONSE", "CLIENT_RESOLUTION_CONFIRMATION"] },
      },
      orderBy: [{ decided_at: "asc" }, { id: "asc" }],
      select: {
        id: true,
        complaint_id: true,
        cycle_id: true,
        decision_type: true,
        outcome: true,
        remarks: true,
        remote_instructions: true,
        visit_id: true,
        quotation_id: true,
        decided_at: true,
      },
    }),
    prisma.complaintActivityLog.findMany({
      where: {
        ...inComplaints,
        action: { in: ["CLIENT_INFORMATION_SHARED", "INFORMATION_RECEIVED", "COMPLAINT_CANCELLED", "CLIENT_CONFIRMED_RESOLUTION", "COMPLAINT_REOPENED"] },
      },
      orderBy: { id: "asc" },
      select: { id: true, complaint_id: true, cycle_id: true, action: true, actor_type: true, remarks: true, metadata: true, created_at: true, decision_id: true },
    }),
    prisma.complaintVisit.findMany({
      where: inCycles,
      orderBy: { visit_number: "asc" },
      select: {
        id: true,
        complaint_id: true,
        visit_number: true,
        purpose: true,
        status: true,
        scheduled_for: true,
        reschedule_count: true,
        team_details: true,
        pay_at_visit: true,
        assignedSS: { select: { user_name: true } },
      },
    }),
    prisma.complaintCharge.findMany({
      where: { ...inCycles, status: "OPEN" },
      orderBy: { id: "asc" },
      select: {
        id: true,
        complaint_id: true,
        charge_type: true,
        amount: true,
        visit_id: true,
        quotation_id: true,
        allocations: {
          orderBy: { id: "asc" },
          select: { amount: true, payment: { select: { status: true, created_at: true, rejection_remarks: true } } },
        },
      },
    }),
    prisma.complaintInspectionReport.findMany({
      where: inCycles,
      orderBy: { submitted_at: "asc" },
      select: { complaint_id: true, submitted_at: true, expected_completion_date: true, remarks: true },
    }),
    prisma.complaintQuotation.findMany({
      where: { ...inCycles, status: { in: [...SHOWN_QUOTATION] } },
      orderBy: [{ quotation_number: "asc" }, { revision: "asc" }],
      select: {
        id: true,
        complaint_id: true,
        status: true,
        shared_at: true,
        subtotal: true,
        tax_amount: true,
        warranty_covered_amount: true,
        client_payable_amount: true,
        payment_at_resolution: true,
        clientResponse: { select: { remarks: true } },
        charges: { select: { id: true } },
      },
    }),
    prisma.complaintExecution.findMany({
      where: { ...inCycles, status: { not: "CANCELLED" } },
      orderBy: { id: "asc" },
      select: {
        id: true,
        complaint_id: true,
        status: true,
        scheduled_for: true,
        completed_at: true,
        pending_work: true,
        completion_remarks: true,
        team_details: true,
        assignedSS: { select: { user_name: true } },
      },
    }),
    prisma.complaintClosure.findMany({
      where: inComplaints,
      select: { complaint_id: true, cycle_id: true, client_rating: true, closed_at: true },
    }),
  ]);

  const payees = new Map(
    (
      await prisma.vendorMaster.findMany({
        where: { id: { in: [...new Set(complaints.map((c) => c.vendor_id))] } },
        select: { id: true, vendor_name: true, complaint_upi_id: true, complaint_upi_name: true },
      })
    ).map((v) => [
      v.id,
      v.complaint_upi_id ? { vpa: v.complaint_upi_id, name: v.complaint_upi_name?.trim() || v.vendor_name } : null,
    ]),
  );
  const urls = new Map<number, string>();
  await Promise.all(
    attachments.map(async (a) => urls.set(a.id, await generateSignedUrl(a.storage_key, FILE_TTL, "inline"))),
  );
  const media = (rows: typeof attachments) =>
    rows
      .filter((a) => a.media_type !== "DOCUMENT")
      .map((a) => ({ id: String(a.id), kind: a.media_type === "VIDEO" ? "video" : "photo", url: urls.get(a.id)! }));
  const by = <T extends { complaint_id: number }>(rows: T[], id: number) => rows.filter((r) => r.complaint_id === id);

  return complaints.map((c) => {
    const cycle = c.current_cycle_id;
    const att = by(attachments, c.id);
    const dec = by(decisions, c.id);
    const cur = dec.filter((d) => d.cycle_id === cycle);
    const lg = by(logs, c.id);
    const vis = by(visits, c.id);
    const chg = by(charges, c.id);
    const quotes = by(quotations, c.id);
    const quote = last(quotes) ?? null;
    const execs = by(executions, c.id);
    const exec = last(execs) ?? null;
    const report = last(by(reports, c.id)) ?? null;

    // Review: HO's latest verification decision this cycle.
    const verification = cur.filter((d) => d.decision_type === "HO_VERIFICATION" && d.outcome !== "ON_HOLD");
    const lastReview = last(verification);
    const review = lastReview
      ? {
          at: lastReview.decided_at.toISOString(),
          outcome:
            lastReview.outcome === "APPROVED_FOR_VISIT"
              ? "approved"
              : lastReview.outcome === "MORE_INFORMATION_REQUIRED"
                ? "more_info"
                : lastReview.outcome === "REJECTED"
                  ? "not_approved"
                  : "remote",
          // Only a rejection's reason is written for the client.
          remarks: lastReview.outcome === "REJECTED" ? lastReview.remarks : null,
          remote_instructions: lastReview.remote_instructions,
        }
      : null;

    // Information requests and the replies that answered them.
    const requests = verification.filter((d) => d.outcome === "MORE_INFORMATION_REQUIRED");
    const replies = lg.filter((l) => l.action === "CLIENT_INFORMATION_SHARED" || l.action === "INFORMATION_RECEIVED");
    const info_requests = requests.map((q, i) => {
      const next = requests[i + 1]?.decided_at.getTime() ?? Infinity;
      const reply = replies.find((r) => r.created_at >= q.decided_at && r.created_at.getTime() < next);
      const ids = new Set(((reply?.metadata as { attachment_ids?: number[] } | null)?.attachment_ids ?? []).map(Number));
      return {
        id: String(q.id),
        at: q.decided_at.toISOString(),
        question: q.remarks ?? "Please share more details.",
        reply: reply
          ? {
              at: reply.created_at.toISOString(),
              text: reply.actor_type === "CLIENT" ? (reply.remarks ?? "") : "Shared with our team",
              media: media(att.filter((a) => ids.has(a.id))),
            }
          : null,
      };
    });

    // Charges the client sees: open visit and repair charges, plus a repair
    // amount due at completion that has no charge yet.
    const accepted = new Set(
      cur.filter((d) => d.decision_type === "VISIT_CHARGE_ACCEPTANCE" && d.outcome === "ACCEPTED").map((d) => d.visit_id),
    );
    const clientCharges: ClientCharge[] = chg
      .map((ch): ClientCharge | null => {
        const amount = Number(ch.amount);
        const live = ch.allocations.filter((a) => ["PENDING_VERIFICATION", "VERIFIED", "REJECTED"].includes(a.payment.status));
        const verified = live.filter((a) => a.payment.status === "VERIFIED").reduce((t, a) => t + Number(a.amount), 0);
        const latest = last(live);
        const payment: ClientCharge["payment"] =
          verified >= amount && amount > 0
            ? { at: (live.find((a) => a.payment.status === "VERIFIED") ?? latest)!.payment.created_at.toISOString(), status: "verified" }
            : latest
              ? {
                  at: latest.payment.created_at.toISOString(),
                  status: latest.payment.status === "PENDING_VERIFICATION" ? "verifying" : latest.payment.status === "VERIFIED" ? "verified" : "rejected",
                  note: latest.payment.rejection_remarks ?? undefined,
                }
              : null;
        if (ch.charge_type === "VISIT") {
          const visit = vis.find((v) => v.id === ch.visit_id);
          if (!visit || amount <= 0) return null;
          if (["CANCELLED", "CLIENT_NOT_AVAILABLE", "SITE_NOT_ACCESSIBLE"].includes(visit.status) && !live.length) return null;
          const approved = visit.pay_at_visit || accepted.has(visit.id) || live.length > 0 || visit.status !== "AWAITING_PAYMENT";
          return {
            id: `c${ch.id}`,
            kind: "visit",
            label: visit.visit_number > 1 ? `Visit ${visit.visit_number} charges` : "Site visit charges",
            amount,
            approved: visit.status === "AWAITING_CHARGE_ACCEPTANCE" ? false : approved,
            preference: visit.pay_at_visit ? "pay_at_visit" : approved ? "pay_now" : null,
            payment,
          };
        }
        if (amount <= 0) return null;
        return { id: `c${ch.id}`, kind: "repair", label: "Repair charges", amount, approved: true, preference: "pay_now", payment };
      })
      .filter((x): x is ClientCharge => !!x);
    const due =
      quote?.status === "CLIENT_ACCEPTED" && quote.payment_at_resolution && !quote.charges.length && Number(quote.client_payable_amount) > 0
        ? quote
        : null;
    if (due)
      clientCharges.push({
        id: `q${due.id}`,
        kind: "repair",
        label: "Repair charges",
        amount: Number(due.client_payable_amount),
        approved: true,
        // Payable from the app once the work is done.
        preference: exec?.status === "WORK_COMPLETED" ? "pay_now" : "pay_at_visit",
        payment: null,
      });

    const visitsOut = [
      ...vis
        .filter((v) => v.scheduled_for && ["SCHEDULED", "CONFIRMED", "COMPLETED"].includes(v.status))
        .map((v) => ({
          id: `v${v.id}`,
          type: v.purpose === "INSTALLATION_TEAM" ? "Installation team" : v.purpose === "REPAIR" ? "Repair" : "Inspection",
          at: v.scheduled_for!.toISOString(),
          all_day: true,
          team: v.team_details?.trim() || (v.assignedSS ? `${v.assignedSS.user_name}, site supervisor` : "Our service team"),
          status: v.status === "COMPLETED" ? "completed" : v.reschedule_count > 0 ? "rescheduled" : "scheduled",
        })),
      ...execs
        .filter((e) => e.scheduled_for)
        .map((e) => ({
          id: `e${e.id}`,
          type: "Repair",
          at: e.scheduled_for!.toISOString(),
          all_day: true,
          team: e.team_details?.trim() || (e.assignedSS ? `${e.assignedSS.user_name}, site supervisor` : "Our service team"),
          status: e.status === "WORK_COMPLETED" ? "completed" : "scheduled",
        })),
    ];

    // Feedback this cycle, or the "not satisfied" that reopened it.
    const confirmations = dec.filter((d) => d.decision_type === "CLIENT_RESOLUTION_CONFIRMATION");
    const lastConfirmation = last(confirmations);
    const showFeedback =
      lastConfirmation && (lastConfirmation.cycle_id === cycle || (c.status === "REOPENED" && lastConfirmation.outcome === "NOT_SATISFIED"));
    const ratingLog = lg.find((l) => l.decision_id === lastConfirmation?.id);
    const closure = closures.find((x) => x.cycle_id === lastConfirmation?.cycle_id);
    const feedback = showFeedback
      ? {
          at: lastConfirmation.decided_at.toISOString(),
          satisfied: lastConfirmation.outcome === "SATISFIED",
          rating: closure?.client_rating ?? Number((ratingLog?.metadata as { rating?: number } | null)?.rating ?? 0),
          remarks: lastConfirmation.remarks,
        }
      : null;

    const outstanding = clientCharges.some((x) => x.payment?.status !== "verified");
    const quoteFiles = quote ? att.filter((a) => a.quotation_id === quote.id) : [];
    const rejectReason = quote && quote.status !== "CLIENT_ACCEPTED" && quote.status !== "SHARED" ? quote.clientResponse?.remarks : null;

    const status = clientStatus(c.status, {
      openVisit: [...vis].reverse().find((v) => !ENDED_VISIT.includes(v.status)) ?? null,
      accepted,
      charges: clientCharges,
      chg,
      quoteShared: quote?.status === "SHARED",
    });

    const closedAt =
      c.status === "CLOSED"
        ? (closures.find((x) => x.cycle_id === cycle)?.closed_at ?? c.status_changed_at)
        : FINISHED.includes(c.status)
          ? c.status_changed_at
          : null;

    return {
      id: c.id,
      code: c.complaint_code,
      lead_id: c.lead_id,
      project_name: fullName(c.lead?.firstname, c.lead?.lastname),
      lead_code: c.lead?.lead_code ?? "",
      category: c.category.name,
      product: c.instance ? c.instance.title?.trim() || c.instance.productType.type : c.product_type,
      component: c.component ? COMPONENT_LABEL[c.component] : null,
      description: c.description,
      remarks: c.additional_remarks,
      preferred_visit_date: dateOnly(c.preferred_visit_date),
      alternate_mobile: c.client_alternate_mobile,
      raised_at: c.created_at.toISOString(),
      updated_at: c.updated_at.toISOString(),
      status,
      media: media(att.filter((a) => a.category === "REGISTRATION")),
      review,
      info_requests,
      charges: clientCharges,
      visits: visitsOut,
      inspection: report
        ? {
            at: report.submitted_at.toISOString(),
            expected_completion_date: dateOnly(report.expected_completion_date),
            remarks: report.remarks ?? "",
          }
        : null,
      quotation: quote
        ? {
            id: String(quote.id),
            shared_at: (quote.shared_at ?? new Date()).toISOString(),
            items: [],
            subtotal: Number(quote.subtotal),
            tax: Number(quote.tax_amount),
            warranty_covered: Number(quote.warranty_covered_amount),
            payable: Number(quote.client_payable_amount),
            status: quote.status === "SHARED" ? "shared" : quote.status === "CLIENT_ACCEPTED" ? "accepted" : "rejected",
            reject_reason: rejectReason ?? undefined,
            files: quoteFiles.map((a) => ({ id: String(a.id), name: a.original_name, url: urls.get(a.id)!, mime: a.mime_type })),
          }
        : null,
      completion:
        exec?.status === "WORK_COMPLETED"
          ? {
              at: (exec.completed_at ?? c.updated_at).toISOString(),
              pending_work: exec.pending_work?.trim() || null,
              remarks: exec.completion_remarks ?? "",
              media: media(att.filter((a) => a.category === "AFTER_EXECUTION" && a.execution_id === exec.id)),
              payment_complete: !outstanding,
            }
          : null,
      feedback,
      closed_at: closedAt?.toISOString() ?? null,
      // Where the client pays this complaint's charges by UPI (null: not set up).
      payee: payees.get(c.vendor_id) ?? null,
      cancel_reason: c.status === "CANCELLED" ? (last(lg.filter((l) => l.action === "COMPLAINT_CANCELLED"))?.remarks ?? null) : null,
    };
  });
}

type ClientCharge = {
  id: string;
  kind: "visit" | "repair";
  label: string;
  amount: number;
  approved: boolean;
  preference: "pay_now" | "pay_at_visit" | null;
  payment: { at: string; status: "verifying" | "verified" | "rejected"; note?: string } | null;
};

type ViewCharge = { id: string; kind: string; approved: boolean; preference: string | null; payment: { status: string } | null };

function clientStatus(
  status: ComplaintStatus,
  ctx: {
    openVisit: { id: number; status: string; pay_at_visit: boolean } | null;
    accepted: Set<number | null>;
    charges: ViewCharge[];
    chg: { id: number; visit_id: number | null }[];
    quoteShared: boolean;
  },
): ClientStatus {
  const payNow = (x: ViewCharge) => x.approved && x.preference === "pay_now" && (!x.payment || x.payment.status === "rejected");
  switch (status) {
    case "NEW":
    case "UNDER_VERIFICATION":
      return "under_review";
    case "MORE_INFORMATION_REQUIRED":
      return "more_info";
    case "REJECTED":
      return "not_approved";
    case "APPROVED_FOR_VISIT":
    case "AWAITING_CLIENT_ACCEPTANCE":
    case "PAYMENT_PENDING": {
      const v = ctx.openVisit;
      if (!v) return "visit_pending";
      const chargeId = ctx.chg.find((x) => x.visit_id === v.id)?.id;
      const charge = ctx.charges.find((x) => x.id === `c${chargeId}`);
      if (v.status === "AWAITING_CHARGE_ACCEPTANCE") return charge ? "charges_approval" : "visit_pending";
      if (v.status === "AWAITING_PAYMENT" && charge) {
        if (!charge.approved) return "charges_approval";
        if (payNow(charge)) return "payment_due";
        return "under_review";
      }
      return "visit_pending";
    }
    case "VISIT_SCHEDULED":
      return "visit_scheduled";
    case "INSPECTION_SUBMITTED":
    case "QUOTATION_PREPARATION":
    case "DEPARTMENT_HEAD_APPROVAL":
      return "inspection_done";
    case "QUOTATION_SHARED":
    case "AWAITING_CLIENT_APPROVAL":
      return ctx.quoteShared ? "quotation_shared" : "inspection_done";
    case "AWAITING_PAYMENT":
    case "PROCUREMENT_PENDING":
    case "MATERIAL_RECEIVED":
    case "REPAIR_SCHEDULED":
      return ctx.charges.some((x) => x.kind === "repair" && payNow(x)) ? "payment_due" : "work_scheduled";
    case "WORK_IN_PROGRESS":
      return ctx.charges.some((x) => x.kind === "repair" && payNow(x)) ? "payment_due" : "work_in_progress";
    case "AWAITING_CLIENT_CONFIRMATION":
      return "feedback_due";
    case "AWAITING_HO_CLOSURE_APPROVAL":
      return "closing";
    case "CLOSED":
      return "closed";
    case "REOPENED":
      return "reopen_review";
    case "ON_HOLD":
      return "on_hold";
    case "CANCELLED":
      return "cancelled";
  }
}

export async function listComplaints(client: ClientTokenPayload) {
  const leadIds = await clientLeadIds(client);
  return { complaints: await loadViews({ lead_id: { in: leadIds } }) };
}

export async function getComplaint(client: ClientTokenPayload, id: number) {
  const leadIds = await clientLeadIds(client);
  const [complaint] = await loadViews({ id, lead_id: { in: leadIds } });
  if (!complaint) throw new ComplaintError("Complaint not found.", 404);
  return { complaint };
}

/* -------------------------------- Actions --------------------------------- */

const loadedSelect = {
  id: true,
  vendor_id: true,
  complaint_code: true,
  status: true,
  version: true,
  priority: true,
  possible_duplicate: true,
  duplicate_reviewed_at: true,
  assigned_ss_id: true,
  assigned_hss_id: true,
  current_cycle_id: true,
  lead_id: true,
  account_id: true,
  lead: { select: { franchise_id: true } },
} satisfies Prisma.ComplaintMasterSelect;

type Owned = LoadedComplaint & { vendor_id: number; complaint_code: string };

async function loadOwned(client: ClientTokenPayload, id: number): Promise<Owned> {
  const leadIds = await clientLeadIds(client);
  const complaint = await prisma.complaintMaster.findFirst({
    where: { id, lead_id: { in: leadIds } },
    select: loadedSelect,
  });
  if (!complaint?.current_cycle_id) throw new ComplaintError("Complaint not found.", 404);
  return complaint as Owned;
}

/** Applies the change only if nobody changed the complaint meanwhile. */
async function guard(tx: Tx, c: Owned, data: Prisma.ComplaintMasterUncheckedUpdateManyInput = {}) {
  const updated = await tx.complaintMaster.updateMany({
    where: { id: c.id, version: c.version },
    data: { ...data, version: { increment: 1 } },
  });
  if (!updated.count) throw new ComplaintError("This complaint was just updated. Please refresh and try again.", 409);
}

const setStatus = (tx: Tx, c: Owned, status: ComplaintStatus) =>
  status === c.status
    ? Promise.resolve()
    : tx.complaintMaster.update({ where: { id: c.id }, data: { status, status_changed_at: new Date() } });

function clientLog(
  tx: Tx,
  client: ClientTokenPayload,
  c: Owned,
  entry: Omit<
    Prisma.ComplaintActivityLogUncheckedCreateInput,
    "vendor_id" | "complaint_id" | "cycle_id" | "actor_type" | "actor_user_id" | "actor_client_reference"
  > & { cycle_id?: number },
) {
  return tx.complaintActivityLog.create({
    data: {
      vendor_id: c.vendor_id,
      complaint_id: c.id,
      cycle_id: c.current_cycle_id,
      actor_type: "CLIENT",
      actor_client_reference: clientRef(client),
      ...entry,
    },
  });
}

function clientDecision(
  tx: Tx,
  client: ClientTokenPayload,
  c: Owned,
  data: Pick<Prisma.ComplaintDecisionUncheckedCreateInput, "decision_type" | "outcome" | "remarks" | "visit_id" | "quotation_id">,
) {
  return tx.complaintDecision.create({
    data: {
      vendor_id: c.vendor_id,
      complaint_id: c.id,
      cycle_id: c.current_cycle_id,
      actor_type: "CLIENT",
      actor_client_reference: clientRef(client),
      ...data,
    },
  });
}

type Uploaded = { key: string; file: ComplaintUpload; media: MediaKind };

async function upload(vendorId: number, files: { file: ComplaintUpload; media: MediaKind }[]) {
  const uploaded: Uploaded[] = [];
  try {
    for (const { file, media } of files)
      uploaded.push({ key: await uploadComplaintFile(file.buffer, vendorId, file.mimetype), file, media });
  } catch (error) {
    await deleteWasabiObjects(uploaded.map((u) => u.key));
    throw error;
  }
  return uploaded;
}

async function attach(
  tx: Tx,
  client: ClientTokenPayload,
  c: { id: number; vendor_id: number; current_cycle_id: number },
  uploaded: Uploaded[],
  extra: Pick<Prisma.ComplaintAttachmentUncheckedCreateInput, "category" | "visit_id" | "decision_id">,
) {
  const ids: number[] = [];
  for (const { key, file, media } of uploaded) {
    const row = await tx.complaintAttachment.create({
      data: {
        vendor_id: c.vendor_id,
        complaint_id: c.id,
        cycle_id: c.current_cycle_id,
        storage_key: key,
        original_name: (file.originalname || "upload").slice(0, 255),
        mime_type: file.mimetype,
        size_bytes: file.size,
        media_type: media,
        actor_type: "CLIENT",
        actor_client_reference: clientRef(client),
        ...extra,
      },
    });
    ids.push(row.id);
  }
  return ids;
}

/** Runs a client action: uploads first, cleans them up if the change fails, then refreshes staff tasks. */
async function run<T>(complaintId: number, uploaded: Uploaded[], fn: () => Promise<T>) {
  try {
    const result = await fn();
    await refreshTasks(complaintId);
    return result;
  } catch (error) {
    await deleteWasabiObjects(uploaded.map((u) => u.key));
    throw error;
  }
}

export async function createComplaint(client: ClientTokenPayload, body: Record<string, unknown>, files: ComplaintUpload[]) {
  const leadId = positiveId(body.lead_id, "project");
  const [lead] = await eligibleLeads(client, leadId);
  if (!lead) throw new ComplaintError("You can raise a complaint once this project has been delivered.", 403);

  const categoryId = positiveId(body.category_id, "issue type");
  const category = await prisma.complaintCategoryMaster.findFirst({
    where: { id: categoryId, vendor_id: lead.vendor_id, is_active: true },
    select: { id: true },
  });
  if (!category) throw new ComplaintError("That issue type is no longer available.");
  const instanceId = body.instance_id ? positiveId(body.instance_id, "product") : null;
  const product = instanceId ? lead.productStructureInstances.find((p) => p.id === instanceId) : null;
  if (instanceId && !product) throw new ComplaintError("That product is not part of this project.");
  const componentKey = typeof body.component === "string" ? body.component.trim().toLowerCase() : "";
  const component = componentKey ? COMPONENTS[componentKey] : null;
  if (componentKey && !component) throw new ComplaintError("Select a valid part.");
  const description = text(body.description, "Description", 10000, true)!;
  if (description.length < 10) throw new ComplaintError("Please describe the issue in a little more detail.");
  const remarks = text(body.remarks, "Remarks", 4000);
  const visitRaw = text(body.preferred_visit_date, "Preferred visit date", 10);
  let preferredVisit: Date | null = null;
  if (visitRaw) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(visitRaw)) throw new ComplaintError("Preferred visit date is invalid.");
    preferredVisit = new Date(`${visitRaw}T00:00:00Z`);
    if (Number.isNaN(preferredVisit.getTime()) || preferredVisit < todayIst())
      throw new ComplaintError("Pick a visit date from today onwards.");
  }
  const altRaw = text(body.alternate_mobile, "Alternate mobile", 40);
  if (altRaw) {
    const count = altRaw.replace(/\D/g, "").length;
    if (count < 10 || count > 15) throw new ComplaintError("Enter a valid alternate mobile number.");
  }
  const alternateMobile = altRaw ? altRaw.replace(/[^\d+]/g, "") : lead.alt_contact_no;

  if (files.length > MAX_FILES) throw new ComplaintError(`Add up to ${MAX_FILES} photos or videos.`);
  const photos = files.filter((f) => f.mimetype.startsWith("image/"));
  const videos = files.filter((f) => !f.mimetype.startsWith("image/"));
  validateUploads(photos, videos);

  const assignees = await complaintAssigneeOptions(lead.vendor_id, lead);
  const ssId = assignees.leadSupervisorId ?? (assignees.siteSupervisors.length === 1 ? assignees.siteSupervisors[0].id : null);
  const hssId = assignees.headSiteSupervisors.length === 1 ? assignees.headSiteSupervisors[0].id : null;
  const duplicates = await prisma.complaintMaster.count({
    where: { vendor_id: lead.vendor_id, lead_id: lead.id, status: { notIn: FINISHED }, ...(product ? { instance_id: product.id } : {}) },
  });

  const uploaded = await upload(lead.vendor_id, [
    ...photos.map((file) => ({ file, media: "PHOTO" as const })),
    ...videos.map((file) => ({ file, media: "VIDEO" as const })),
  ]);
  const ref = clientRef(client);
  let created: { id: number; code: string };
  try {
    created = await prisma.$transaction(async (tx) => {
      // Same running number as staff registrations (CMP1, CMP2, …).
      await tx.$queryRaw`SELECT id FROM "VendorMaster" WHERE id = ${lead.vendor_id} FOR UPDATE`;
      const last = await tx.complaintMaster.aggregate({ where: { vendor_id: lead.vendor_id }, _max: { sequence_no: true } });
      const sequenceNo = (last._max.sequence_no ?? 0) + 1;
      const code = `CMP${sequenceNo}-${lead.lead_code}`;
      const complaint = await tx.complaintMaster.create({
        data: {
          vendor_id: lead.vendor_id,
          complaint_code: code,
          sequence_no: sequenceNo,
          registration_channel: "CLIENT_PORTAL",
          client_type: "CRM_LEAD",
          lead_id: lead.id,
          account_id: lead.account_id,
          instance_id: product?.id ?? null,
          client_name: fullName(lead.firstname, lead.lastname) || client.email,
          client_mobile: [lead.country_code?.trim(), lead.contact_no?.trim()].filter(Boolean).join(" ") || "-",
          client_alternate_mobile: alternateMobile,
          client_email: lead.email ?? client.email,
          site_address: lead.site_address?.trim() || "-",
          site_map_link: lead.site_map_link?.trim() || null,
          product_type: product ? `${product.productType.type} – ${product.title}` : null,
          component,
          category_id: category.id,
          description,
          additional_remarks: remarks,
          preferred_visit_date: preferredVisit,
          usable_handover_date: lead.usable_handover_completed_at,
          final_handover_date: lead.final_handover_marked_at,
          possible_duplicate: duplicates > 0,
          assigned_ss_id: ssId,
          assigned_hss_id: hssId,
          raised_by_actor_type: "CLIENT",
          raised_by_client_reference: ref,
          status: "NEW",
        },
      });
      const cycle = await tx.complaintCycle.create({
        data: {
          vendor_id: lead.vendor_id,
          complaint_id: complaint.id,
          cycle_number: 1,
          opened_by_actor_type: "CLIENT",
          opened_by_client_reference: ref,
        },
      });
      await tx.complaintMaster.update({ where: { id: complaint.id }, data: { current_cycle_id: cycle.id } });
      await attach(tx, client, { id: complaint.id, vendor_id: lead.vendor_id, current_cycle_id: cycle.id }, uploaded, {
        category: "REGISTRATION",
      });
      const assignments = [
        ssId && { role: "SITE_SUPERVISOR" as const, new_user_id: ssId },
        hssId && { role: "DEPARTMENT_HEAD" as const, new_user_id: hssId },
      ].filter((a): a is { role: "SITE_SUPERVISOR" | "DEPARTMENT_HEAD"; new_user_id: number } => !!a);
      if (assignments.length)
        await tx.complaintAssignment.createMany({
          data: assignments.map((a) => ({
            vendor_id: lead.vendor_id,
            complaint_id: complaint.id,
            cycle_id: cycle.id,
            role: a.role,
            new_user_id: a.new_user_id,
            assigned_by_actor_type: "SYSTEM" as const,
          })),
        });
      await tx.complaintActivityLog.create({
        data: {
          vendor_id: lead.vendor_id,
          complaint_id: complaint.id,
          cycle_id: cycle.id,
          action: "COMPLAINT_REGISTERED",
          to_status: "NEW",
          actor_type: "CLIENT",
          actor_client_reference: ref,
          remarks: "Raised by the client from the app.",
          metadata: { photos: photos.length, videos: videos.length, possible_duplicate: duplicates > 0, channel: "client_app" },
        },
      });
      return { id: complaint.id, code };
    });
  } catch (error) {
    await deleteWasabiObjects(uploaded.map((u) => u.key));
    throw error;
  }
  await refreshTasks(created.id);
  return getComplaint(client, created.id);
}

export async function replyWithInformation(
  client: ClientTokenPayload,
  id: number,
  body: Record<string, unknown>,
  files: ComplaintUpload[],
) {
  const c = await loadOwned(client, id);
  if (c.status !== "MORE_INFORMATION_REQUIRED") throw new ComplaintError("Our team isn't waiting for more details on this complaint.", 409);
  const reply = text(body.text, "Reply", 4000);
  if (!reply && !files.length) throw new ComplaintError("Type a reply or add a photo.");
  const uploaded = await upload(c.vendor_id, classifyUploads(files, MAX_FILES));
  await run(c.id, uploaded, () =>
    prisma.$transaction(async (tx) => {
      await guard(tx, c, { status: "UNDER_VERIFICATION", status_changed_at: new Date() });
      const ids = await attach(tx, client, c, uploaded, { category: "ADDITIONAL_INFORMATION" });
      await clientLog(tx, client, c, {
        action: "CLIENT_INFORMATION_SHARED",
        from_status: c.status,
        to_status: "UNDER_VERIFICATION",
        remarks: reply ?? `Shared ${ids.length} file${ids.length === 1 ? "" : "s"}.`,
        metadata: { attachment_ids: ids },
      });
    }),
  );
  return getComplaint(client, id);
}

async function openCharge(c: Owned, key: unknown) {
  const raw = typeof key === "string" ? key : "";
  const match = /^([cq])(\d+)$/.exec(raw);
  if (!match) throw new ComplaintError("Select the charge to pay.");
  const n = Number(match[2]);
  if (match[1] === "q") return { kind: "resolution" as const, quotationId: n };
  const charge = await prisma.complaintCharge.findFirst({
    where: { id: n, complaint_id: c.id, cycle_id: c.current_cycle_id, status: "OPEN" },
    select: { id: true, charge_type: true, visit_id: true, quotation_id: true },
  });
  if (!charge) throw new ComplaintError("This charge is no longer payable.", 409);
  return { kind: "charge" as const, charge };
}

export async function approveVisitCharges(client: ClientTokenPayload, id: number, body: Record<string, unknown>) {
  const c = await loadOwned(client, id);
  const preference = body.preference;
  if (preference !== "pay_now" && preference !== "pay_at_visit") throw new ComplaintError("Choose how you'd like to pay.");
  if (body.approved !== true) throw new ComplaintError("Please approve the charges to continue.");
  const target = await openCharge(c, body.charge);
  if (target.kind !== "charge" || target.charge.charge_type !== "VISIT" || !target.charge.visit_id)
    throw new ComplaintError("These charges can't be approved here.", 409);
  if (!["APPROVED_FOR_VISIT", "AWAITING_CLIENT_ACCEPTANCE", "PAYMENT_PENDING"].includes(c.status))
    throw new ComplaintError("These charges can't be approved at this stage.", 409);
  const visit = await prisma.complaintVisit.findUniqueOrThrow({
    where: { id: target.charge.visit_id },
    select: { id: true, status: true, standard_fee: true },
  });
  const balance = await chargeBalance(prisma, target.charge.id);
  if (!["AWAITING_CHARGE_ACCEPTANCE", "AWAITING_PAYMENT"].includes(visit.status) || balance.committed > 0)
    throw new ComplaintError("These charges are already approved.", 409);

  const atVisit = preference === "pay_at_visit" || Number(visit.standard_fee) === 0;
  await run(c.id, [], () =>
    prisma.$transaction(async (tx) => {
      await guard(tx, c);
      const decision = await clientDecision(tx, client, c, {
        decision_type: "VISIT_CHARGE_ACCEPTANCE",
        outcome: "ACCEPTED",
        visit_id: visit.id,
        remarks: preference === "pay_now" ? "Approved in the app · paying now by UPI" : "Approved in the app · will pay during the visit",
      });
      await tx.complaintVisit.update({
        where: { id: visit.id },
        data: atVisit ? { status: "READY_TO_SCHEDULE", pay_at_visit: preference === "pay_at_visit" } : { status: "AWAITING_PAYMENT" },
      });
      const to: ComplaintStatus = atVisit ? "APPROVED_FOR_VISIT" : "PAYMENT_PENDING";
      await setStatus(tx, c, to);
      await clientLog(tx, client, c, {
        action: atVisit ? "VISIT_PAY_AT_VISIT" : "VISIT_ACCEPT_CHARGE",
        from_status: c.status,
        to_status: to,
        remarks: decision.remarks,
        visit_id: visit.id,
        decision_id: decision.id,
      });
    }),
  );
  return getComplaint(client, id);
}

export async function submitPayment(
  client: ClientTokenPayload,
  id: number,
  body: Record<string, unknown>,
  files: ComplaintUpload[],
) {
  const c = await loadOwned(client, id);
  if (FINISHED.includes(c.status)) throw new ComplaintError("This complaint is closed.", 409);
  if (files.length !== 1 || !files[0].mimetype.startsWith("image/"))
    throw new ComplaintError("Add the screenshot of your UPI payment.");
  const target = await openCharge(c, body.charge);

  let charge: { id: number; charge_type: string; visit_id: number | null; quotation_id: number | null } | null = null;
  let amount: number;
  let resolution: { quotationId: number; createdBy: number } | null = null;
  if (target.kind === "charge") {
    charge = target.charge;
    const balance = await chargeBalance(prisma, charge.id);
    if (balance.pending) throw new ComplaintError("Your payment is being verified.", 409);
    if (balance.outstanding <= 0) throw new ComplaintError("This charge is already paid.", 409);
    if (charge.visit_id) {
      const visit = await prisma.complaintVisit.findUniqueOrThrow({ where: { id: charge.visit_id }, select: { status: true, pay_at_visit: true } });
      if (visit.status !== "AWAITING_PAYMENT" || visit.pay_at_visit) throw new ComplaintError("This charge is paid during the visit.", 409);
    }
    amount = balance.outstanding;
  } else {
    if (!RESOLUTION_STAGE.includes(c.status)) throw new ComplaintError("This payment isn't due yet.", 409);
    const due = await resolutionPaymentDue(prisma, c);
    const quotation = due
      ? await prisma.complaintQuotation.findUnique({ where: { id: due.id }, select: { id: true, client_payable_amount: true, created_by: true } })
      : null;
    if (!quotation || quotation.id !== target.quotationId || Number(quotation.client_payable_amount) <= 0)
      throw new ComplaintError("This payment isn't due.", 409);
    amount = Number(quotation.client_payable_amount);
    resolution = { quotationId: quotation.id, createdBy: quotation.created_by };
  }

  const uploaded = await upload(c.vendor_id, classifyUploads(files, 1, false));
  await run(c.id, uploaded, () =>
    prisma.$transaction(async (tx) => {
      await guard(tx, c);
      if (resolution)
        charge = await tx.complaintCharge.create({
          data: {
            vendor_id: c.vendor_id,
            complaint_id: c.id,
            cycle_id: c.current_cycle_id,
            charge_type: "REPAIR",
            quotation_id: resolution.quotationId,
            amount,
            created_by: resolution.createdBy,
          },
        });
      const ch = charge!;
      const [proofId] = await attach(tx, client, c, uploaded, { category: "PAYMENT_PROOF", visit_id: ch.visit_id });
      // Waits for HO to check the screenshot against the account (Pending verification).
      const payment = await tx.complaintPayment.create({
        data: {
          vendor_id: c.vendor_id,
          complaint_id: c.id,
          cycle_id: c.current_cycle_id,
          amount,
          method: "UPI",
          transaction_reference: "UPI screenshot · client app",
          payment_date: todayIst(),
          proof_attachment_id: proofId,
          actor_type: "CLIENT",
          actor_client_reference: clientRef(client),
        },
      });
      await tx.complaintPaymentAllocation.create({
        data: {
          vendor_id: c.vendor_id,
          complaint_id: c.id,
          cycle_id: c.current_cycle_id,
          payment_id: payment.id,
          charge_id: ch.id,
          amount,
        },
      });
      await clientLog(tx, client, c, {
        action: `${ch.charge_type}_PAYMENT_RECORDED`,
        remarks: `₹${amount.toFixed(2)} via UPI · screenshot uploaded from the client app`,
        visit_id: ch.visit_id,
        quotation_id: ch.quotation_id,
        payment_id: payment.id,
      });
    }),
  );
  return getComplaint(client, id);
}

async function sharedQuotation(c: Owned) {
  if (c.status !== "QUOTATION_SHARED") throw new ComplaintError("There's no quotation waiting for you.", 409);
  const quotation = await prisma.complaintQuotation.findFirst({
    where: { complaint_id: c.id, cycle_id: c.current_cycle_id, status: "SHARED" },
    orderBy: [{ quotation_number: "desc" }, { revision: "desc" }],
    select: { id: true, quotation_number: true, revision: true, client_payable_amount: true, created_by: true },
  });
  if (!quotation) throw new ComplaintError("There's no quotation waiting for you.", 409);
  return quotation;
}

export async function acceptQuotation(client: ClientTokenPayload, id: number, body: Record<string, unknown>) {
  const c = await loadOwned(client, id);
  const quotation = await sharedQuotation(c);
  const payable = Number(quotation.client_payable_amount);
  const payment = body.payment;
  if (payable > 0 && payment !== "pay_now" && payment !== "at_completion")
    throw new ComplaintError("Choose how you'd like to pay.");
  const payNow = payable > 0 && payment === "pay_now";
  const label = `Quotation Q${quotation.quotation_number} rev ${quotation.revision}`;
  await run(c.id, [], () =>
    prisma.$transaction(async (tx) => {
      await guard(tx, c);
      const decision = await clientDecision(tx, client, c, {
        decision_type: "CLIENT_QUOTATION_RESPONSE",
        outcome: "ACCEPTED",
        quotation_id: quotation.id,
        remarks: null,
      });
      await tx.complaintQuotation.update({
        where: { id: quotation.id },
        data: {
          status: "CLIENT_ACCEPTED",
          client_response_decision_id: decision.id,
          payment_at_resolution: payable > 0 && !payNow,
        },
      });
      // Pay now: the repair charge is raised for the client to pay by UPI.
      if (payNow)
        await tx.complaintCharge.create({
          data: {
            vendor_id: c.vendor_id,
            complaint_id: c.id,
            cycle_id: c.current_cycle_id,
            charge_type: "REPAIR",
            quotation_id: quotation.id,
            amount: payable,
            created_by: quotation.created_by,
          },
        });
      await clientLog(tx, client, c, {
        action: "QUOTATION_CLIENT_ACCEPTED",
        from_status: c.status,
        remarks: `${label} accepted in the app · ${payable <= 0 ? "nothing to pay" : payNow ? "paying now" : "pays at completion"}`,
        quotation_id: quotation.id,
        decision_id: decision.id,
        metadata: { quotation: label, payment_option: payable <= 0 ? "NONE" : payNow ? "PAID_NOW" : "AT_RESOLUTION" },
      });
      // Execution follows acceptance, attributed to the staff member who shared the quotation.
      await startExecutionTx(tx, { vendorId: c.vendor_id, actorId: quotation.created_by, role: "head-site-supervisor" }, c, {
        quotationId: quotation.id,
      });
    }),
  );
  return getComplaint(client, id);
}

export async function rejectQuotation(client: ClientTokenPayload, id: number, body: Record<string, unknown>) {
  const c = await loadOwned(client, id);
  const quotation = await sharedQuotation(c);
  const reason = text(body.reason, "Reason", 2000, true)!;
  await run(c.id, [], () =>
    prisma.$transaction(async (tx) => {
      await guard(tx, c);
      const decision = await clientDecision(tx, client, c, {
        decision_type: "CLIENT_QUOTATION_RESPONSE",
        outcome: "REJECTED",
        quotation_id: quotation.id,
        remarks: reason,
      });
      await tx.complaintQuotation.update({
        where: { id: quotation.id },
        data: { status: "CLIENT_REJECTED", client_response_decision_id: decision.id },
      });
      // Same as staff recording a rejection: HO reviews it while on hold.
      await setStatus(tx, c, "ON_HOLD");
      await clientLog(tx, client, c, {
        action: "QUOTATION_CLIENT_REJECTED",
        from_status: c.status,
        to_status: "ON_HOLD",
        remarks: reason,
        quotation_id: quotation.id,
        decision_id: decision.id,
      });
    }),
  );
  return getComplaint(client, id);
}

export async function giveFeedback(client: ClientTokenPayload, id: number, body: Record<string, unknown>) {
  const c = await loadOwned(client, id);
  if (c.status !== "AWAITING_CLIENT_CONFIRMATION") throw new ComplaintError("This complaint isn't waiting for your feedback.", 409);
  if (typeof body.satisfied !== "boolean") throw new ComplaintError("Tell us whether you're satisfied.");
  const satisfied = body.satisfied;
  const rating = Number(body.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new ComplaintError("Rate us from 1 to 5 stars.");
  const remarks = text(body.remarks, satisfied ? "Remarks" : "What's still not right", 2000, !satisfied);
  const ref = clientRef(client);
  await run(c.id, [], () =>
    prisma.$transaction(async (tx) => {
      await guard(tx, c);
      const decision = await clientDecision(tx, client, c, {
        decision_type: "CLIENT_RESOLUTION_CONFIRMATION",
        outcome: satisfied ? "SATISFIED" : "NOT_SATISFIED",
        remarks,
      });
      const closureData = {
        client_confirmation_status: satisfied ? ("SATISFIED" as const) : ("NOT_SATISFIED" as const),
        client_confirmation_decision_id: decision.id,
        client_rating: satisfied ? rating : null,
      };
      const closure = await tx.complaintClosure.upsert({
        where: { cycle_id: c.current_cycle_id },
        create: { vendor_id: c.vendor_id, complaint_id: c.id, cycle_id: c.current_cycle_id, ...closureData },
        update: closureData,
      });
      if (satisfied) await setStatus(tx, c, "AWAITING_HO_CLOSURE_APPROVAL");
      await clientLog(tx, client, c, {
        action: satisfied ? "CLIENT_CONFIRMED_RESOLUTION" : "COMPLAINT_REOPENED",
        from_status: c.status,
        to_status: satisfied ? "AWAITING_HO_CLOSURE_APPROVAL" : "REOPENED",
        remarks,
        decision_id: decision.id,
        closure_id: closure.id,
        metadata: { rating },
      });
      if (satisfied) return;
      // Not satisfied: the cycle ends and HO reviews the complaint in a new one.
      const now = new Date();
      await tx.complaintCycle.update({ where: { id: c.current_cycle_id }, data: { ended_at: now, end_reason: "REOPENED" } });
      const last = await tx.complaintCycle.aggregate({ where: { complaint_id: c.id }, _max: { cycle_number: true } });
      const cycle = await tx.complaintCycle.create({
        data: {
          vendor_id: c.vendor_id,
          complaint_id: c.id,
          cycle_number: (last._max.cycle_number ?? 1) + 1,
          reopened_reason: remarks!,
          opened_by_actor_type: "CLIENT",
          opened_by_client_reference: ref,
        },
      });
      await tx.complaintMaster.update({
        where: { id: c.id },
        data: { current_cycle_id: cycle.id, status: "REOPENED", status_changed_at: now },
      });
      await clientLog(tx, client, c, {
        cycle_id: cycle.id,
        action: "CYCLE_OPENED",
        from_status: c.status,
        to_status: "REOPENED",
        remarks,
      });
    }),
  );
  return getComplaint(client, id);
}

export async function cancelComplaint(client: ClientTokenPayload, id: number, body: Record<string, unknown>) {
  const c = await loadOwned(client, id);
  if (FINISHED.includes(c.status)) throw new ComplaintError("This complaint is already closed.", 409);
  if (!CANCELLABLE.includes(c.status))
    throw new ComplaintError("This complaint is already being worked on. Message your team in Chat to cancel it.", 409);
  const reason = text(body.reason, "Reason", 2000, true)!;
  const now = new Date();
  await run(c.id, [], () =>
    prisma.$transaction(async (tx) => {
      await guard(tx, c, { status: "CANCELLED", status_changed_at: now });
      const where = { complaint_id: c.id, cycle_id: c.current_cycle_id };
      await tx.complaintTask.updateMany({ where: { ...where, status: { in: ["open", "in_progress"] } }, data: { status: "cancelled" } });
      await tx.complaintCycle.update({ where: { id: c.current_cycle_id }, data: { ended_at: now, end_reason: "CANCELLED" } });
      await clientLog(tx, client, c, {
        action: "COMPLAINT_CANCELLED",
        from_status: c.status,
        to_status: "CANCELLED",
        remarks: reason,
      });
    }),
  );
  return getComplaint(client, id);
}
