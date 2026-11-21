import { prisma } from "../../prisma/client";
import { generateSignedUrl } from "../../utils/wasabiClient";
import {
  buildTracker,
  TrackerError,
  trackerUpdates,
} from "../../services/projectTracker/projectTracker.core";
import type { ClientTokenPayload } from "./auth.service";
import { clientLeadsWhere } from "./projects.service";

type ServiceResponse = { status: number; body: Record<string, unknown> };

// Long enough for a client to open documents after loading the tracker.
const DOCUMENT_URL_TTL_SECONDS = 60 * 60;

// StatusTypeMaster / DocumentTypeMaster tags used by the CRM booking form.
const BOOKING_STATUS_TAG = "Type 4";
const BOOKING_DOCUMENT_TAG = "Type 8";

type FileKind = "pdf" | "image" | "video" | "other";

const fileKind = (name: string): FileKind => {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "pdf") return "pdf";
  if (["jpg", "jpeg", "png", "webp", "heic", "gif", "avif"].includes(ext)) return "image";
  if (["mp4", "mov", "m4v", "webm"].includes(ext)) return "video";
  return "other";
};

/**
 * Client Project Tracker: one per booking (lead). Read-only for the client;
 * only client-facing information is returned, never internal CRM remarks.
 */
export class MobileTrackerService {
  private async clientLead(client: ClientTokenPayload, leadId: number) {
    if (!Number.isInteger(leadId) || leadId <= 0) return null;
    return prisma.leadMaster.findFirst({
      where: { id: leadId, ...clientLeadsWhere(client) },
      select: { id: true, vendor_id: true },
    });
  }

  async getProjectTracker(client: ClientTokenPayload, leadId: number): Promise<ServiceResponse> {
    const lead = await this.clientLead(client, leadId);
    if (!lead) return { status: 404, body: { message: "Project not found." } };
    try {
      const tracker = await buildTracker(lead.id, lead.vendor_id);
      const [booking, latest] = await Promise.all([
        this.bookingConfirmation(lead.id, lead.vendor_id),
        trackerUpdates(tracker, { limit: 1 }),
      ]);
      return { status: 200, body: { ...tracker.view, booking, latest_update: latest[0] ?? null } };
    } catch (error) {
      if (error instanceof TrackerError) return { status: error.statusCode, body: { message: error.message } };
      throw error;
    }
  }

  async getProjectUpdates(client: ClientTokenPayload, leadId: number): Promise<ServiceResponse> {
    const lead = await this.clientLead(client, leadId);
    if (!lead) return { status: 404, body: { message: "Project not found." } };
    const tracker = await buildTracker(lead.id, lead.vendor_id);
    return { status: 200, body: { updates: await trackerUpdates(tracker) } };
  }

  /** Booking form details: documents, MRP, booking value and advance. Null until booked. */
  private async bookingConfirmation(leadId: number, vendorId: number) {
    const [lead, bookingPayments, bookingStatusLog, documents] = await Promise.all([
      prisma.leadMaster.findUnique({
        where: { id: leadId },
        select: { mrp_value: true, total_project_amount: true, booking_amount: true },
      }),
      prisma.paymentInfo.findMany({
        where: { lead_id: leadId, paymentType: { type: "booking_amount" } },
        select: { payment_date: true, created_at: true, payment_file_id: true },
        orderBy: { payment_date: "asc" },
      }),
      prisma.leadStatusLogs.findFirst({
        where: { lead_id: leadId, statusType: { tag: BOOKING_STATUS_TAG, vendor_id: vendorId } },
        select: { created_at: true },
        orderBy: { created_at: "asc" },
      }),
      prisma.leadDocuments.findMany({
        where: {
          lead_id: leadId,
          is_deleted: false,
          documentType: { tag: BOOKING_DOCUMENT_TAG, vendor_id: vendorId },
        },
        select: { id: true, doc_og_name: true, doc_sys_name: true, created_at: true },
        orderBy: { created_at: "asc" },
      }),
    ]);

    if (!lead || (bookingPayments.length === 0 && !bookingStatusLog)) return null;

    const firstPayment = bookingPayments[0];
    const advanceReceivedAt = firstPayment?.payment_date ?? firstPayment?.created_at ?? null;

    // Payment proofs share the booking document type; they aren't quotations or designs.
    const paymentProofIds = new Set(
      bookingPayments.map((p) => p.payment_file_id).filter((id): id is number => id !== null),
    );

    const bookingDocuments = await Promise.all(
      documents
        .filter((doc) => !paymentProofIds.has(doc.id))
        .map(async (doc) => ({
          id: doc.id,
          name: doc.doc_og_name,
          kind: fileKind(doc.doc_og_name),
          uploaded_at: doc.created_at,
          url: await generateSignedUrl(doc.doc_sys_name, DOCUMENT_URL_TTL_SECONDS, "inline"),
        })),
    );

    return {
      confirmed_at: bookingStatusLog?.created_at ?? advanceReceivedAt,
      mrp_value: lead.mrp_value,
      total_booking_value: lead.total_project_amount,
      advance_received: lead.booking_amount,
      advance_received_at: advanceReceivedAt,
      documents: bookingDocuments,
    };
  }
}
