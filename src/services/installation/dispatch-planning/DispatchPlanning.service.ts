import { NotificationType, Prisma } from "../../../prisma/generated";
import { prisma } from "../../../prisma/client";
import logger from "../../../utils/logger";
import { NotificationService } from "../../../../src/services/notification/notification.service";

export class DispatchPlanningService {
  /** ✅ Fetch all leads with status = Type 13 (Dispatch Planning) */
  async getLeadsWithStatusDispatchPlanning(
    vendorId: number,
    userId: number,
    limit = 10,
    page = 1,
  ) {
    const skip = (page - 1) * limit;

    // 🔹 Fetch Dispatch Planning Status (Type 13)
    const dispatchPlanningStatus = await prisma.statusTypeMaster.findFirst({
      where: { vendor_id: vendorId, tag: "Type 13" },
      select: { id: true },
    });

    if (!dispatchPlanningStatus) {
      throw new Error(
        `Dispatch Planning status (Type 13) not found for vendor ${vendorId}`,
      );
    }

    // 🔹 Identify user role
    const creator = await prisma.userMaster.findUnique({
      where: { id: userId },
      include: { user_type: true },
    });

    const isAdmin =
      creator?.user_type?.user_type?.toLowerCase() === "admin" ||
      creator?.user_type?.user_type?.toLowerCase() === "super-admin";

    const baseWhere: any = {
      vendor_id: vendorId,
      is_deleted: false,
      status_id: dispatchPlanningStatus.id,
      activity_status: { in: ["onGoing", "lostApproval"] },
    };

    // 🔹 Admin → all Dispatch Planning leads
    if (isAdmin) {
      const [total, leads] = await Promise.all([
        prisma.leadMaster.count({ where: baseWhere }),
        prisma.leadMaster.findMany({
          where: baseWhere,
          include: this.defaultIncludes(),
          orderBy: { created_at: "desc" },
          skip,
          take: limit,
        }),
      ]);
      return { total, leads };
    }

    // 🔹 Non-admin: mapped + task leads
    const mappedLeads = await prisma.leadUserMapping.findMany({
      where: { vendor_id: vendorId, user_id: userId, status: "active" },
      select: { lead_id: true },
    });

    const taskLeads = await prisma.userLeadTask.findMany({
      where: {
        vendor_id: vendorId,
        OR: [{ created_by: userId }, { user_id: userId }],
      },
      select: { lead_id: true },
    });

    const leadIds = [
      ...new Set([
        ...mappedLeads.map((m) => m.lead_id),
        ...taskLeads.map((t) => t.lead_id),
      ]),
    ];

    if (!leadIds.length) return { total: 0, leads: [] };

    const where = { ...baseWhere, id: { in: leadIds } };

    const [total, leads] = await Promise.all([
      prisma.leadMaster.count({ where }),
      prisma.leadMaster.findMany({
        where,
        include: this.defaultIncludes(),
        orderBy: { created_at: "desc" },
        skip,
        take: limit,
      }),
    ]);

    return { total, leads };
  }

  /** 🔹 Common include for Dispatch Planning */
  private defaultIncludes() {
    return {
      siteType: true,
      source: true,
      statusType: true,
      createdBy: { select: { id: true, user_name: true } },
      updatedBy: true,
      assignedTo: { select: { id: true, user_name: true } },
      assignedBy: { select: { id: true, user_name: true } },
      productMappings: {
        select: {
          productType: { select: { id: true, type: true, tag: true } },
        },
      },
      leadProductStructureMapping: {
        select: { productStructure: { select: { id: true, type: true } } },
      },
      tasks: {
        where: { task_type: "Follow Up" },
        select: {
          id: true,
          task_type: true,
          due_date: true,
          remark: true,
          status: true,
          created_at: true,
        },
        orderBy: { created_at: Prisma.SortOrder.desc },
      },
    };
  }

  private async syncDispatchCommitmentDate(
    tx: any,
    params: {
      vendor_id: number;
      lead_id: number;
      dispatchDate: Date;
      updated_by: number;
    },
  ) {
    const { vendor_id, lead_id, dispatchDate, updated_by } = params;

    /**
     * Update LeadMaster Dispatch Date
     */
    await tx.leadMaster.update({
      where: { id: lead_id },
      data: {
        required_date_for_dispatch: dispatchDate,
        updated_by,
      },
    });

    /**
     * Update Task Due Date (if already exists)
     */
    await tx.userLeadTask.updateMany({
      where: {
        lead_id,
        vendor_id,
        task_type: "Dispatch",
        lead_stage: "dispatch-planning-stage",
        status: "open",
      },
      data: {
        due_date: dispatchDate,
        updated_by,
      },
    });
  }

  /** ✅ 1️⃣ Save Dispatch Planning Information */
  async saveDispatchPlanningInfoService(payload: any) {
    const {
      vendor_id,
      lead_id,
      required_date_for_dispatch,
      onsite_contact_person_name,
      onsite_contact_person_number,
      alt_onsite_contact_person_name,
      alt_onsite_contact_person_number,
      material_lift_availability,
      dispatch_planning_remark,
      created_by,
    } = payload;

    const dispatchDate = required_date_for_dispatch
      ? new Date(required_date_for_dispatch)
      : null;

    if (!dispatchDate) {
      throw new Error("Dispatch date is required.");
    }

    return await prisma.$transaction(async (tx) => {
      /**
       * STEP 1 — Update Remaining Dispatch Fields
       */
      await tx.leadMaster.update({
        where: { id: lead_id },
        data: {
          onsite_contact_person_name,
          onsite_contact_person_number,
          alt_onsite_contact_person_name,
          alt_onsite_contact_person_number,
          material_lift_availability,
          dispatch_planning_remark,
          updated_by: created_by,
        },
      });

      /**
       * STEP 2 — Sync Dispatch Date ↔ Task Due Date
       */
      await this.syncDispatchCommitmentDate(tx, {
        vendor_id,
        lead_id,
        dispatchDate,
        updated_by: created_by,
      });

      /**
       * STEP 3 — Ensure Factory Task Exists
       */
      return { lead_id, vendor_id, updated: true };
    });
  }

  /** ✅ 2️⃣ Save Dispatch Planning Payment Info */
  async saveDispatchPlanningPaymentService(payload: any) {
    const {
      vendor_id,
      lead_id,
      account_id,
      pending_payment,
      pending_payment_details,
      payment_proof_file,
      created_by,
    } = payload;

    return prisma.$transaction(async (tx) => {
      // 1️⃣ Handle Payment Proof Upload (Type 20)
      let uploadedDocument = null;
      if (payment_proof_file) {
        const docType = await tx.documentTypeMaster.findFirst({
          where: { vendor_id, tag: "Type 20" },
        });

        if (!docType)
          throw new Error("Document type (Type 20) not found for this vendor");

        uploadedDocument = await tx.leadDocuments.create({
          data: {
            vendor_id,
            lead_id,
            account_id,
            created_by,
            doc_type_id: docType.id,
            doc_og_name: payment_proof_file.originalName,
            doc_sys_name: payment_proof_file.sysName,
          },
        });
      }

      // 2️⃣ Fetch Payment Type ID for Dispatch Planning (Type 5)
      const paymentType = await tx.paymentTypeMaster.findFirst({
        where: { vendor_id, tag: "Type 5" },
      });

      if (!paymentType)
        throw new Error("Payment Type (Type 5) not found for this vendor");

      // 3️⃣ Create PaymentInfo Record
      const payment = await tx.paymentInfo.create({
        data: {
          vendor_id,
          lead_id,
          account_id,
          created_by,
          payment_type_id: paymentType.id,
          payment_date: new Date(),
          amount: pending_payment,
          payment_text: pending_payment_details || null,
          payment_file_id: uploadedDocument?.id ?? null,
        },
      });

      // 4️⃣ Ledger Entry
      await tx.ledger.create({
        data: {
          lead_id,
          account_id,
          vendor_id,
          amount: pending_payment,
          payment_date: new Date(),
          type: "credit",
          created_by,
        },
      });

      // 🔹 4.1️⃣ Update LeadMaster pending_amount (deduct payment)
      const lead = await tx.leadMaster.findUnique({
        where: { id: lead_id },
        select: { pending_amount: true },
      });

      if (lead) {
        const newPending = (lead.pending_amount ?? 0) - pending_payment;
        if (newPending < 0) {
          throw new Error(
            `Invalid payment: deduction would make pending amount negative (current: ₹${
              lead.pending_amount ?? 0
            })`,
          );
        }

        await tx.leadMaster.update({
          where: { id: lead_id },
          data: { pending_amount: newPending },
        });
      }

      // 5️⃣ Create LeadDetailedLogs Entry
      const detailedLog = await tx.leadDetailedLogs.create({
        data: {
          vendor_id,
          lead_id,
          account_id,
          created_by,
          action: `Dispatch Planning Payment of ₹${pending_payment} recorded.`,
          action_type: "UPDATE", // or "create" depending on your enum usage
        },
      });

      // 6️⃣ If document uploaded → create LeadDocumentLogs entry
      if (uploadedDocument) {
        await tx.leadDocumentLogs.create({
          data: {
            vendor_id,
            lead_id,
            account_id,
            doc_id: uploadedDocument.id,
            lead_logs_id: detailedLog.id,
            created_by,
          },
        });
      }

      return {
        lead_id,
        vendor_id,
        payment_id: payment.id,
        uploaded_doc_id: uploadedDocument?.id || null,
        detailed_log_id: detailedLog.id,
        message: "Dispatch Planning payment & logs successfully saved",
      };
    });
  }

  /** ✅ 1️⃣ Get Dispatch Planning Info */
  async getDispatchPlanningInfoService(vendorId: number, leadId: number) {
    const lead = await prisma.leadMaster.findFirst({
      where: { id: leadId, vendor_id: vendorId },
      select: {
        id: true,
        lead_code: true,
        required_date_for_dispatch: true,
        onsite_contact_person_name: true,
        onsite_contact_person_number: true,
        alt_onsite_contact_person_name: true,
        alt_onsite_contact_person_number: true,
        material_lift_availability: true,
        dispatch_planning_remark: true,
        updated_at: true,
      },
    });

    if (!lead) throw new Error("Lead not found");

    return lead;
  }

  /** ✅ 2️⃣ Get Dispatch Planning Payment Info */
  async getDispatchPlanningPaymentService(vendorId: number, leadId: number) {
    // Fetch Dispatch Planning PaymentInfo (Type 5)
    const payment = await prisma.paymentInfo.findFirst({
      where: {
        vendor_id: vendorId,
        lead_id: leadId,
        paymentType: { tag: "Type 5" }, // ✅ Only Dispatch Planning payment
      },
      orderBy: { created_at: "desc" },
      include: {
        document: {
          select: {
            id: true,
            doc_og_name: true,
            doc_sys_name: true,
            created_at: true,
          },
        },
        paymentType: { select: { id: true, type: true, tag: true } },
        lead: {
          select: {
            id: true,
            lead_code: true,
            firstname: true,
            lastname: true,
            pending_amount: true,
          },
        },
      },
    });

    if (!payment) {
      return {
        success: false,
        message: "No Dispatch Planning payment found",
        data: null,
      };
    }

    // ✅ Fetch related log entry (latest one for this lead)
    const latestLog = await prisma.leadDetailedLogs.findFirst({
      where: {
        lead_id: leadId,
        vendor_id: vendorId,
        action: { contains: "Dispatch Planning Payment" },
      },
      orderBy: { created_at: "desc" },
      select: {
        id: true,
        action: true,
        created_at: true,
        created_by: true,
      },
    });

    return { payment, latestLog };
  }

  /** ✅ Get Pending Project Amount */
  async getPendingProjectAmountService(vendorId: number, leadId: number) {
    const lead = await prisma.leadMaster.findFirst({
      where: {
        id: leadId,
        vendor_id: vendorId,
      },
      select: {
        id: true,
        firstname: true,
        pending_amount: true,
      },
    });

    if (!lead) {
      throw new Error("Lead not found for this vendor");
    }

    return {
      lead_id: lead.id,
      lead_name: lead.firstname,
      pending_amount: lead.pending_amount ?? 0,
    };
  }

  /**
   * ✅ Move Lead to Dispatch Stage (Type 14)
   */

  /**
   * ✅ Check if all required Dispatch fields are filled
   */
  static async checkDispatchReadiness(vendorId: number, leadId: number) {
    const lead = await prisma.leadMaster.findFirst({
      where: { id: leadId, vendor_id: vendorId, is_deleted: false },
      select: {
        id: true,
        lead_code: true,
        required_date_for_dispatch: true,
        onsite_contact_person_name: true,
        onsite_contact_person_number: true,
        material_lift_availability: true,
        dispatch_planning_remark: true,
      },
    });

    if (!lead)
      throw new Error(`Lead ${leadId} not found for vendor ${vendorId}`);

    // ✅ Check each field
    const missingFields: string[] = [];
    if (!lead.required_date_for_dispatch)
      missingFields.push("Required Date for Dispatch");
    if (!lead.onsite_contact_person_name)
      missingFields.push("Onsite Contact Person Name");
    if (!lead.onsite_contact_person_number)
      missingFields.push("Onsite Contact Person Number");
    if (
      lead.material_lift_availability === null ||
      lead.material_lift_availability === undefined
    )
      missingFields.push("Material Lift Availability");

    const isReadyForDispatch = missingFields.length === 0;

    return {
      lead_id: lead.id,
      vendor_id: vendorId,
      is_ready_for_dispatch: isReadyForDispatch,
      missing_fields: missingFields,
    };
  }

  static async moveLeadToDispatch(
    vendorId: number,
    leadId: number,
    updatedBy: number,
  ) {
    // ==========================
    // CORE TRANSACTION LAYER
    // ==========================

    const result = await prisma.$transaction(async (tx) => {
      const lead = await tx.leadMaster.findUnique({
        where: { id: leadId },
        select: { id: true, vendor_id: true, account_id: true },
      });

      if (!lead) throw new Error(`Lead ${leadId} not found`);
      if (lead.vendor_id !== vendorId)
        throw new Error(`Lead does not belong to vendor ${vendorId}`);

      const toStatus = await tx.statusTypeMaster.findFirst({
        where: { vendor_id: vendorId, tag: "Type 14" },
        select: { id: true },
      });

      if (!toStatus) throw new Error(`Dispatch Stage (Type 14) not configured`);

      const updatedLead = await tx.leadMaster.update({
        where: { id: lead.id },
        data: {
          status_id: toStatus.id,
          updated_by: updatedBy,
          updated_at: new Date(),
        },
      });

      await tx.leadDetailedLogs.create({
        data: {
          vendor_id: vendorId,
          lead_id: lead.id,
          account_id: lead.account_id!,
          action: "Lead moved to Dispatch stage.",
          action_type: "UPDATE",
          created_by: updatedBy,
        },
      });

      const leadPlanningData = await tx.leadMaster.findUnique({
        where: { id: leadId },
        select: {
          account_id: true,
          franchise_id: true,
          required_date_for_dispatch: true,
          dispatch_planning_remark: true,
        },
      });

      if (!leadPlanningData?.account_id) {
        throw new Error("Lead Account not found.");
      }

      if (!leadPlanningData.required_date_for_dispatch) {
        throw new Error("Required date for dispatch is missing.");
      }

      const factoryUser = await tx.userMaster.findFirst({
        where: {
          vendor_id: vendorId,
          user_type: { user_type: "factory" },
          status: "active",
        },
        select: { id: true },
      });

      if (!factoryUser) {
        throw new Error("Factory user not configured.");
      }

      const existingTask = await tx.userLeadTask.findFirst({
        where: {
          lead_id: leadId,
          vendor_id: vendorId,
          task_type: "Dispatch",
          lead_stage: "dispatch-planning-stage",
        },
      });

      if (existingTask) {
        await tx.userLeadTask.update({
          where: { id: existingTask.id },
          data: {
            due_date: leadPlanningData.required_date_for_dispatch,
            updated_by: updatedBy,
            updated_at: new Date(),
          },
        });
      } else {
        await tx.userLeadTask.create({
          data: {
            vendor_id: vendorId,
            lead_id: leadId,
            account_id: leadPlanningData.account_id,
            franchise_id: leadPlanningData.franchise_id ?? null,
            user_id: factoryUser.id,
            task_type: "Dispatch",
            due_date: leadPlanningData.required_date_for_dispatch,
            remark:
              leadPlanningData.dispatch_planning_remark ||
              "Prepare material for dispatch",
            status: "open",
            created_by: updatedBy,
            lead_stage: "dispatch-planning-stage",
          },
        });
      }

      return updatedLead;
    });

    // ===============================
    // POST TRANSACTION NOTIFICATIONS
    // ===============================

    try {
      const actorId = updatedBy;

      const lead = await prisma.leadMaster.findUnique({
        where: { id: leadId },
        select: {
          firstname: true,
          lastname: true,
          lead_code: true,
          vendor_id: true,
          account_id: true,
          franchise_id: true,
          onsite_contact_person_name: true,
          onsite_contact_person_number: true,
          required_date_for_dispatch: true,
          material_lift_availability: true,
        },
      });

      if (!lead) return result;

      const leadName = `${lead.firstname ?? ""} ${lead.lastname ?? ""}`.trim();

      const leadCode =
        lead.lead_code ?? `LEAD-${String(leadId).padStart(4, "0")}`;

      const redirectPath = lead.account_id
        ? `/dashboard/leads/details/${leadId}?accountId=${lead.account_id}`
        : `/dashboard/leads/details/${leadId}`;

      // ===============================
      // FACTORY SME FETCH
      // ===============================

      const factoryMapping = await prisma.leadUserMapping.findFirst({
        where: {
          lead_id: leadId,
          vendor_id: vendorId,
          status: "active",
          user: {
            user_type: {
              user_type: {
                equals: "factory",
                mode: "insensitive",
              },
            },
          },
        },
        select: {
          user: {
            select: {
              id: true,
              user_name: true,
              user_email: true,
            },
          },
        },
      });

      if (!factoryMapping?.user) return result;

      const factoryUser = factoryMapping.user;

      const franchiseId = lead?.franchise_id ?? null;

      // ===============================
      // 🔔 FACTORY IN-APP
      // ===============================

      await NotificationService.createAndSend({
        vendor_id: vendorId,
        user_id: factoryUser.id,
        sender_id: actorId,
        type: NotificationType.LEAD_MILESTONE,
        title: "Lead Dispatched To Factory",
        message: `${leadCode} - ${leadName} moved to Dispatch stage.`,
        entity_type: "lead",
        entity_id: leadId,
        redirect_url: redirectPath,
      });

    } catch (err: any) {
      logger.warn("⚠️ Dispatch Factory notification failed", {
        lead_id: leadId,
        error: err?.message,
      });
    }

    return result;
  }
}
