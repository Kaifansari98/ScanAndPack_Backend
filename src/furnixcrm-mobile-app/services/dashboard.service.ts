import { prisma } from "../../prisma/client";
import { ProjectTrackerStageKey } from "../../prisma/generated";
import { buildTracker, tagNumber, TrackerError } from "../../services/projectTracker/projectTracker.core";
import type { ClientTokenPayload } from "./auth.service";
import { clientLeadsWhere } from "./projects.service";

type ServiceResponse = { status: number; body: Record<string, unknown> };

// Home dashboard for one booking: where the project is, what comes next, the
// team, and the money received so far. Client-facing data only.

// The CRM step inside a client stage that spans several CRM stages.
const SUB_STEPS: Record<number, string> = {
  6: "Client documentation",
  7: "Design approval",
  8: "TechCheck",
  9: "Order login",
  11: "Ready to dispatch",
  12: "Site readiness",
  13: "Dispatch planning",
  14: "Dispatch",
};

// What the client can prepare while each stage is under way, for the next one.
// Positive wording only, per the client app brief.
const PREPARE: Partial<Record<ProjectTrackerStageKey, { title: string; points: string[] }>> = {
  BOOKING: {
    title: "Get your site ready for measurement",
    points: ["Walls plastered and levelled", "Electrical and plumbing points marked", "Site open and accessible"],
  },
  FINAL_MEASUREMENT: {
    title: "Keep these details ready",
    points: ["Appliance models and sizes", "Materials you are arranging yourself", "Any design changes you have in mind"],
  },
  TECH_CHECK: {
    title: "Before production begins",
    points: ["Review your designs and quotation", "Keep your next payment ready"],
  },
  PRODUCTION: {
    title: "Prepare your site for delivery",
    points: ["Civil, flooring and painting work completed", "Electrical and plumbing points in place", "Site cleaned and secured"],
  },
  DISPATCH: {
    title: "Prepare for delivery",
    points: ["Space to unload the material", "Appliances available on site", "Your scope material in place"],
  },
  DELIVERY: {
    title: "Prepare for installation",
    points: ["Plumber, electrician and appliance technician on call", "Site clear for our installation team"],
  },
};

// Client-friendly names for the CRM payment types (PaymentTypeMaster.type).
const PAYMENT_LABELS: Record<string, string> = {
  initial_site_measurement_payment: "Site measurement",
  "bd-ism-payment": "Site measurement",
  booking_amount: "Booking amount",
  client_approval_payment: "Design approval payment",
  additional_payment: "Additional payment",
  "dispatch-planning-additional_payment": "Dispatch payment",
};

const ERD_STAGES: ProjectTrackerStageKey[] = ["PRODUCTION", "DISPATCH"];

export class MobileDashboardService {
  async getDashboard(client: ClientTokenPayload, leadId: number): Promise<ServiceResponse> {
    if (!Number.isInteger(leadId) || leadId <= 0) return { status: 400, body: { message: "Invalid project." } };
    const lead = await prisma.leadMaster.findFirst({
      where: { id: leadId, ...clientLeadsWhere(client) },
      select: { id: true, vendor_id: true, total_project_amount: true },
    });
    if (!lead) return { status: 404, body: { message: "Project not found." } };

    let tracker: Awaited<ReturnType<typeof buildTracker>>;
    try {
      tracker = await buildTracker(lead.id, lead.vendor_id);
    } catch (error) {
      if (error instanceof TrackerError) return { status: error.statusCode, body: { message: error.message } };
      throw error;
    }

    const { view } = tracker;
    const [team, payments] = await Promise.all([this.team(lead.id), this.payments(lead.id)]);

    const currentIndex = view.current ? view.stages.findIndex((s) => s.key === view.current!.key) : -1;
    const nextStage = currentIndex >= 0 ? view.stages[currentIndex + 1] ?? null : null;
    const leadTag = tagNumber(tracker.lead.statusType?.tag);
    const production = view.stages.find((s) => s.key === "PRODUCTION");

    const bookingValue = lead.total_project_amount ?? 0;

    return {
      status: 200,
      body: {
        project: {
          id: lead.id,
          lead_code: view.project.lead_code,
          name: view.project.name,
          site_address: view.project.site_address,
        },
        milestones_completed: view.project.milestones_completed,
        milestones_total: view.project.milestones_total,
        completed: view.project.completed,
        completed_at: view.project.completed_at,
        current: view.current
          ? {
              key: view.current.key,
              name: view.current.name,
              status: view.current.status,
              description: view.current.description,
              sub_step: SUB_STEPS[leadTag] ?? null,
              started_at: view.current.started_at,
              expected_date: view.current.latest_expected_date,
            }
          : null,
        next: nextStage
          ? {
              key: nextStage.key,
              name: nextStage.name,
              status: nextStage.status,
              expected_date: nextStage.latest_expected_date,
            }
          : null,
        // Estimated ready date: shown from Production until the furniture is dispatched.
        erd:
          view.current && ERD_STAGES.includes(view.current.key) ? production?.latest_expected_date ?? null : null,
        prepare: view.current ? PREPARE[view.current.key] ?? null : null,
        team,
        payments: {
          booking_value: bookingValue,
          paid: payments.paid,
          remaining: Math.max(0, bookingValue - payments.paid),
          receipts: payments.receipts,
        },
      },
    };
  }

  /** Designer and site supervisor currently assigned to the lead. */
  private async team(leadId: number) {
    const [designer, supervisorMap, supervisorTask] = await Promise.all([
      prisma.leadUserMapping.findFirst({
        where: { lead_id: leadId, type: "designer", status: "active" },
        select: { user: { select: { user_name: true, user_contact: true } } },
        orderBy: { created_at: "desc" },
      }),
      prisma.leadSiteSupervisorMapping.findFirst({
        where: { lead_id: leadId, status: "active" },
        select: { supervisor: { select: { user_name: true, user_contact: true } } },
        orderBy: { created_at: "desc" },
      }),
      prisma.leadUserMapping.findFirst({
        where: { lead_id: leadId, type: "site-supervisor", status: "active" },
        select: { user: { select: { user_name: true, user_contact: true } } },
        orderBy: { created_at: "desc" },
      }),
    ]);
    const supervisor = supervisorMap?.supervisor ?? supervisorTask?.user ?? null;
    return [
      designer ? { role: "Designer", name: designer.user.user_name, phone: designer.user.user_contact || null } : null,
      supervisor ? { role: "Site Supervisor", name: supervisor.user_name, phone: supervisor.user_contact || null } : null,
    ].filter((m) => m !== null);
  }

  /** Payments received against the lead, newest first. */
  private async payments(leadId: number) {
    const rows = await prisma.paymentInfo.findMany({
      where: { lead_id: leadId, is_archived: false },
      select: {
        id: true,
        amount: true,
        total_amount: true,
        payment_date: true,
        created_at: true,
        paymentType: { select: { type: true } },
      },
      orderBy: [{ payment_date: "desc" }, { id: "desc" }],
    });
    const receipts = rows
      .map((p) => ({
        id: p.id,
        date: (p.payment_date ?? p.created_at).toISOString(),
        amount: p.total_amount ?? p.amount ?? 0,
        label: PAYMENT_LABELS[p.paymentType.type] ?? "Payment",
      }))
      .filter((r) => r.amount > 0);
    return { paid: receipts.reduce((n, r) => n + r.amount, 0), receipts };
  }
}
