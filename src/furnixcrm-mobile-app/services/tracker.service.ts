import { prisma } from "../../prisma/client";
import { generateSignedUrl } from "../../utils/wasabiClient";
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
 * Client-facing project tracker. The tracker starts at Booking Confirmation;
 * later milestones will be added as further sections of the response.
 */
export class MobileTrackerService {
  async getTracker(
    client: ClientTokenPayload,
    leadId: number,
    instanceId: number,
  ): Promise<ServiceResponse> {
    if (![leadId, instanceId].every((id) => Number.isInteger(id) && id > 0)) {
      return { status: 400, body: { message: "Invalid project item." } };
    }

    const instance = await prisma.leadProductStructureInstance.findFirst({
      where: {
        id: instanceId,
        lead_id: leadId,
        is_archived: false,
        lead: clientLeadsWhere(client),
      },
      select: { id: true, vendor_id: true, product_type_id: true },
    });
    if (!instance) return { status: 404, body: { message: "Project item not found." } };

    return {
      status: 200,
      body: { booking: await this.bookingConfirmation(leadId, instance) },
    };
  }

  /** Booking form details: documents, MRP, booking value and advance. Null until booked. */
  private async bookingConfirmation(
    leadId: number,
    instance: { id: number; vendor_id: number; product_type_id: number },
  ) {
    // Booking rows are lead-wide, or scoped to this item's product type / instance.
    const productScope = {
      AND: [
        { OR: [{ product_type_id: null }, { product_type_id: instance.product_type_id }] },
        {
          OR: [
            { product_structure_instance_id: null },
            { product_structure_instance_id: instance.id },
          ],
        },
      ],
    };

    const [lead, bookingPayments, bookingStatusLog, documents] = await Promise.all([
      prisma.leadMaster.findUnique({
        where: { id: leadId },
        select: { mrp_value: true, total_project_amount: true, booking_amount: true },
      }),
      prisma.paymentInfo.findMany({
        where: {
          lead_id: leadId,
          paymentType: { type: "booking_amount" },
          OR: [{ product_type_id: null }, { product_type_id: instance.product_type_id }],
        },
        select: { payment_date: true, created_at: true, payment_file_id: true },
        orderBy: { payment_date: "asc" },
      }),
      prisma.leadStatusLogs.findFirst({
        where: {
          lead_id: leadId,
          statusType: { tag: BOOKING_STATUS_TAG, vendor_id: instance.vendor_id },
        },
        select: { created_at: true },
        orderBy: { created_at: "asc" },
      }),
      prisma.leadDocuments.findMany({
        where: {
          lead_id: leadId,
          is_deleted: false,
          documentType: { tag: BOOKING_DOCUMENT_TAG, vendor_id: instance.vendor_id },
          ...productScope,
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
