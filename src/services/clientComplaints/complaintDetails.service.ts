import { prisma, Prisma } from "../../prisma/client";
import { generateSignedUrl } from "../../utils/wasabiClient";
import logger from "../../utils/logger";
import {
  canViewAllComplaints,
  canViewComplaints,
  ComplaintActor,
  ComplaintError,
} from "./clientComplaints.service";

const person = { id: true, user_name: true } as const;
const financialCategories = ["PAYMENT_PROOF", "QUOTATION"] as const;

function scope(
  actor: ComplaintActor,
  id: number,
): Prisma.ComplaintMasterWhereInput {
  if (!Number.isSafeInteger(id) || id <= 0)
    throw new ComplaintError("Invalid complaint ID.");
  if (!canViewComplaints(actor.role))
    throw new ComplaintError("You do not have access to complaints.", 403);
  return {
    id,
    vendor_id: actor.vendorId,
    ...(canViewAllComplaints(actor.role)
      ? {}
      : { assigned_ss_id: actor.actorId }),
  };
}

export async function getComplaintDetail(actor: ComplaintActor, id: number) {
  const complaint = await prisma.complaintMaster.findFirst({
    where: scope(actor, id),
    select: {
      id: true,
      complaint_code: true,
      registration_channel: true,
      client_type: true,
      client_name: true,
      client_mobile: true,
      client_alternate_mobile: true,
      client_email: true,
      site_address: true,
      city: true,
      product_type: true,
      component: true,
      description: true,
      additional_remarks: true,
      preferred_visit_date: true,
      installation_date: true,
      usable_handover_date: true,
      final_handover_date: true,
      priority: true,
      warranty_status: true,
      exceptional_reason: true,
      possible_duplicate: true,
      duplicate_reviewed_at: true,
      duplicate_review_remarks: true,
      status: true,
      status_changed_at: true,
      current_cycle_id: true,
      created_at: true,
      updated_at: true,
      category: { select: { id: true, name: true } },
      lead: { select: { id: true, lead_code: true } },
      externalClient: { select: { id: true, external_client_code: true } },
      assignedSS: { select: person },
      assignedHSS: { select: person },
      raisedBy: { select: person },
      cycles: {
        orderBy: { cycle_number: "desc" },
        select: {
          id: true,
          cycle_number: true,
          reopened_reason: true,
          opened_at: true,
          resolved_at: true,
          closed_at: true,
          ended_at: true,
          end_reason: true,
          openedBy: { select: person },
        },
      },
    },
  });
  if (!complaint)
    throw new ComplaintError("Complaint not found or access denied.", 404);

  const canViewFinancial = canViewAllComplaints(actor.role);
  const where = { vendor_id: actor.vendorId, complaint_id: id };
  const [
    attachments,
    assignments,
    decisions,
    visits,
    inspections,
    quotations,
    charges,
    payments,
    executions,
    materials,
    notifications,
    closures,
    taskCounts,
  ] = await Promise.all([
    prisma.complaintAttachment.findMany({
      where: {
        ...where,
        ...(!canViewFinancial
          ? { category: { notIn: [...financialCategories] } }
          : {}),
      },
      orderBy: [{ created_at: "asc" }, { id: "asc" }],
      select: {
        id: true,
        cycle_id: true,
        original_name: true,
        storage_key: true,
        mime_type: true,
        size_bytes: true,
        media_type: true,
        category: true,
        created_at: true,
        visit_id: true,
        inspection_report_id: true,
        execution_id: true,
        decision_id: true,
        uploadedBy: { select: person },
      },
    }),
    prisma.complaintAssignment.findMany({
      where,
      orderBy: [{ assigned_at: "desc" }, { id: "desc" }],
      select: {
        id: true,
        cycle_id: true,
        role: true,
        reason: true,
        assigned_at: true,
        previousUser: { select: person },
        newUser: { select: person },
        assignedBy: { select: person },
      },
    }),
    prisma.complaintDecision.findMany({
      where: {
        ...where,
        ...(!canViewFinancial
          ? {
              decision_type: {
                notIn: [
                  "HSS_QUOTATION_APPROVAL",
                  "CLIENT_QUOTATION_RESPONSE",
                  "CHARGE_WAIVER",
                ] as const,
              },
            }
          : {}),
      },
      orderBy: [{ decided_at: "desc" }, { id: "desc" }],
      select: {
        id: true,
        cycle_id: true,
        decision_type: true,
        outcome: true,
        remarks: true,
        remote_instructions: true,
        client_response: true,
        actor_type: true,
        acting_on_behalf_of_client: true,
        decided_at: true,
        quotation_id: true,
        visit_id: true,
        performedBy: { select: person },
      },
    }),
    prisma.complaintVisit.findMany({
      where,
      orderBy: { visit_number: "desc" },
      select: {
        id: true,
        cycle_id: true,
        visit_number: true,
        purpose: true,
        status: true,
        charge_mode: true,
        ...(canViewFinancial ? { standard_fee: true, currency: true } : {}),
        team_details: true,
        repeat_of_visit_id: true,
        repeat_remarks: true,
        scheduled_for: true,
        completed_at: true,
        reschedule_count: true,
        remarks: true,
        assignedSS: { select: person },
      },
    }),
    prisma.complaintInspectionReport.findMany({
      where,
      orderBy: [{ submitted_at: "desc" }, { id: "desc" }],
      select: {
        id: true,
        cycle_id: true,
        visit_id: true,
        actual_visit_date: true,
        client_available: true,
        issue_observed: true,
        root_cause: true,
        affected_product: true,
        affected_unit_number: true,
        responsibility: true,
        responsibility_remarks: true,
        repair_actions: true,
        material_required: true,
        remarks: true,
        estimated_work_days: true,
        expected_completion_date: true,
        additional_visit_required: true,
        further_approval_required: true,
        submitted_at: true,
        submittedBy: { select: person },
        materials: {
          orderBy: { sequence: "asc" },
          select: {
            id: true,
            material_name: true,
            quantity: true,
            unit: true,
            specification: true,
            finish_colour: true,
            ...(canViewFinancial ? { estimated_cost: true } : {}),
            remarks: true,
          },
        },
      },
    }),
    canViewFinancial
      ? prisma.complaintQuotation.findMany({
          where,
          orderBy: [{ quotation_number: "desc" }, { revision: "desc" }],
          select: {
            id: true,
            cycle_id: true,
            quotation_number: true,
            revision: true,
            status: true,
            currency: true,
            subtotal: true,
            tax_amount: true,
            warranty_covered_amount: true,
            client_payable_amount: true,
            total_amount: true,
            shared_at: true,
            created_at: true,
            createdBy: { select: person },
            items: {
              orderBy: { sequence: "asc" },
              select: {
                id: true,
                category: true,
                description: true,
                quantity: true,
                unit: true,
                unit_rate: true,
                line_total: true,
                warranty_covered_amount: true,
                client_payable_amount: true,
                chargeable_reason: true,
              },
            },
          },
        })
      : Promise.resolve([]),
    canViewFinancial
      ? prisma.complaintCharge.findMany({
          where,
          orderBy: { created_at: "desc" },
          select: {
            id: true,
            cycle_id: true,
            charge_type: true,
            visit_id: true,
            quotation_id: true,
            amount: true,
            currency: true,
            status: true,
            due_at: true,
          },
        })
      : Promise.resolve([]),
    canViewFinancial
      ? prisma.complaintPayment.findMany({
          where,
          orderBy: [{ payment_date: "desc" }, { id: "desc" }],
          select: {
            id: true,
            cycle_id: true,
            amount: true,
            currency: true,
            method: true,
            transaction_reference: true,
            payment_date: true,
            status: true,
            proof_attachment_id: true,
            verified_at: true,
            verifiedBy: { select: person },
            rejection_remarks: true,
            refunded_at: true,
            refund_remarks: true,
            allocations: {
              select: { id: true, charge_id: true, amount: true },
            },
          },
        })
      : Promise.resolve([]),
    prisma.complaintExecution.findMany({
      where,
      orderBy: [{ created_at: "desc" }, { id: "desc" }],
      select: {
        id: true,
        cycle_id: true,
        status: true,
        material_required: true,
        purchase_order_reference: true,
        material_expected_date: true,
        material_received_date: true,
        team_details: true,
        scheduled_for: true,
        started_at: true,
        completed_at: true,
        material_used: true,
        replacement_details: true,
        client_remarks: true,
        completion_remarks: true,
        pending_work: true,
        assignedSS: { select: person },
        completedBy: { select: person },
      },
    }),
    prisma.miscellaneousMaster.findMany({
      where,
      orderBy: [{ created_at: "desc" }, { id: "desc" }],
      select: {
        id: true,
        complaint_execution_id: true,
        problem_description: true,
        reorder_material_details: true,
        quantity: true,
        ...(canViewFinancial ? { cost: true } : {}),
        misc_approved: true,
        expected_ready_date: true,
        required_delivery_date: true,
        is_resolved: true,
        resolved_at: true,
        supervisor_remark: true,
        solution: true,
        type: { select: { name: true } },
      },
    }),
    prisma.complaintNotification.findMany({
      where,
      orderBy: [{ created_at: "desc" }, { id: "desc" }],
      select: {
        id: true,
        cycle_id: true,
        event: true,
        channel: true,
        recipient_type: true,
        recipient_address: true,
        delivery_status: true,
        ...(canViewFinancial ? { failure_reason: true } : {}),
        sent_at: true,
        created_at: true,
        recipientUser: { select: person },
      },
    }),
    prisma.complaintClosure.findMany({
      where,
      orderBy: { created_at: "desc" },
      select: {
        id: true,
        cycle_id: true,
        status: true,
        client_confirmation_status: true,
        no_response_reason: true,
        completion_verified_at: true,
        financial_verified_at: true,
        closed_at: true,
        closure_remarks: true,
        closedBy: { select: person },
      },
    }),
    prisma.complaintTask.groupBy({
      by: ["status"],
      where,
      _count: { _all: true },
    }),
  ]);

  const media = await Promise.all(
    attachments.map(async ({ storage_key, ...file }) => {
      try {
        return {
          ...file,
          url: await generateSignedUrl(
            storage_key,
            3600,
            "inline",
            file.original_name,
          ),
        };
      } catch {
        logger.warn("Complaint attachment preview unavailable", {
          complaint_id: id,
          attachment_id: file.id,
        });
        return { ...file, url: null };
      }
    }),
  );
  return {
    ...complaint,
    permissions: { can_view_financial: canViewFinancial },
    attachments: media,
    assignments,
    decisions,
    visits,
    inspections,
    quotations,
    charges,
    payments,
    executions,
    materials,
    communications: notifications,
    closures,
    task_counts: Object.fromEntries(
      taskCounts.map((row) => [row.status, row._count._all]),
    ),
  };
}

export async function getComplaintActivity(
  actor: ComplaintActor,
  id: number,
  query: Record<string, unknown>,
) {
  const complaint = await prisma.complaintMaster.findFirst({
    where: scope(actor, id),
    select: { id: true },
  });
  if (!complaint)
    throw new ComplaintError("Complaint not found or access denied.", 404);
  const page = Number(query.page ?? 1);
  const limit = Number(query.limit ?? 20);
  if (
    !Number.isSafeInteger(page) ||
    page < 1 ||
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > 100 ||
    !Number.isSafeInteger((page - 1) * limit)
  )
    throw new ComplaintError("Invalid history pagination.");
  const cycleId =
    query.cycle_id === undefined || query.cycle_id === ""
      ? undefined
      : Number(query.cycle_id);
  if (cycleId !== undefined && (!Number.isSafeInteger(cycleId) || cycleId <= 0))
    throw new ComplaintError("Invalid complaint cycle.");
  const search =
    typeof query.search === "string" ? query.search.trim().slice(0, 200) : "";
  const canViewFinancial = canViewAllComplaints(actor.role);
  const where: Prisma.ComplaintActivityLogWhereInput = {
    vendor_id: actor.vendorId,
    complaint_id: id,
    ...(cycleId ? { cycle_id: cycleId } : {}),
    ...(!canViewFinancial
      ? {
          payment_id: null,
          quotation_id: null,
          NOT: [
            { action: { contains: "PAYMENT", mode: "insensitive" } },
            { action: { contains: "QUOTATION", mode: "insensitive" } },
            { action: { contains: "CHARGE", mode: "insensitive" } },
          ],
        }
      : {}),
    ...(search
      ? {
          OR: [
            { action: { contains: search, mode: "insensitive" } },
            { remarks: { contains: search, mode: "insensitive" } },
            { actor: { user_name: { contains: search, mode: "insensitive" } } },
          ],
        }
      : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.complaintActivityLog.findMany({
      where,
      orderBy: [{ created_at: "desc" }, { id: "desc" }],
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        cycle_id: true,
        action: true,
        from_status: true,
        to_status: true,
        actor_type: true,
        acting_on_behalf_of_client: true,
        remarks: true,
        created_at: true,
        actor: { select: person },
        cycle: { select: { cycle_number: true } },
      },
    }),
    prisma.complaintActivityLog.count({ where }),
  ]);
  return { rows, total, page, limit };
}
