import { Prisma } from "../../../prisma/generated";
import { prisma } from "../../../prisma/client";
import { createLeadLog } from "../../../utils/leadDetailedLog";
import logger from "../../../utils/logger";
import { generateSignedUrl } from "../../../utils/wasabiClient";
import { NotificationService } from "../../../../src/services/notification/notification.service";
import { NotificationType } from "../../../prisma/generated";
import { getFranchiseAdminRecipients } from "../../../../src/services/notification/adminRecipients.service";
import { sendLeadMovedToUnderInstallationEmail, sendMiscRequirementEmail, sendMiscERDUpdatedEmail, sendMarkAsReadyEmail, sendMiscRequiredDeliveryDateEmail, sendLeadMovedToFinalHandoverEmail } from "../../../../src/services/email/brevoEmail.service";
import { STAGE_PATH_BY_TAG } from "../../../../src/services/leadModuleServices/leadsGeneration/leadActivityStatus.service";
import { ensureLeadStatusLog } from "../../../utils/leadStatusLog";
import { createTaskHistoryLog } from "../../task/taskHistory.service";

interface MiscPayload {
  vendor_id: number;
  lead_id: number;
  account_id: number;
  misc_type_id: number;
  problem_description: string;
  reorder_material_details: string;
  quantity?: number;
  cost?: number;
  supervisor_remark?: string;
  expected_ready_date?: Date;
  is_resolved: boolean;
  created_by: number;
  teams: number[];
  files: { originalName: string; sysName: string }[];
  baseUrl: string;
}

interface UpdateERDInput {
  vendor_id: number;
  misc_id: number;
  expected_ready_date: string;
  updated_by: number;
  baseUrl: string;
}

interface InstallIssueLogPayload {
  vendor_id: number;
  lead_id: number;
  account_id: number;
  issue_type_ids: number[];
  issue_description: string;
  issue_impact: string;
  responsible_team_ids: number[];
  created_by: number;
}

interface UsableHandoverPayload {
  vendor_id: number;
  lead_id: number;
  account_id: number;
  created_by: number;
  pending_work_details: string;
  files: { originalName: string; sysName: string; isImage: boolean }[];
}

export class UnderInstallationStageService {
  private static addMonthsPreservingDay(date: Date, monthsToAdd: number) {
    const result = new Date(date);
    const originalDay = result.getDate();

    result.setMonth(result.getMonth() + monthsToAdd, 1);

    const lastDayOfTargetMonth = new Date(
      result.getFullYear(),
      result.getMonth() + 1,
      0,
    ).getDate();

    result.setDate(Math.min(originalDay, lastDayOfTargetMonth));

    return result;
  }

  /**
   * ✅ Move Lead to Under Installation Stage (Type 15)
   */
  static async moveLeadToUnderInstallation(
    vendorId: number,
    leadId: number,
    updatedBy: number,
    baseUrl: string,
  ) {
    // ==========================
    // CORE TRANSACTION LAYER
    // ==========================

    const result = await prisma.$transaction(async (tx) => {
      // 1️⃣ Validate Lead
      const lead = await tx.leadMaster.findUnique({
        where: { id: leadId },
        select: { id: true, vendor_id: true, account_id: true },
      });

      if (!lead) throw new Error(`Lead ${leadId} not found`);
      if (lead.vendor_id !== vendorId)
        throw new Error(`Lead does not belong to vendor ${vendorId}`);

      // 2️⃣ Fetch Under Installation Status
      const toStatus = await tx.statusTypeMaster.findFirst({
        where: { vendor_id: vendorId, tag: "Type 15" },
        select: { id: true, type: true },
      });

      if (!toStatus)
        throw new Error(`Under Installation Stage (Type 15) not configured`);

      // 3️⃣ Update Lead Status
      const updatedLead = await tx.leadMaster.update({
        where: { id: lead.id },
        data: {
          status_id: toStatus.id,
          updated_by: updatedBy,
          updated_at: new Date(),
        },
      });

      await ensureLeadStatusLog(tx, {
        vendorId,
        leadId: lead.id,
        accountId: lead.account_id,
        statusId: toStatus.id,
        createdBy: updatedBy,
      });

      // 4️⃣ Activity Log
      await createLeadLog(tx, {
        vendor_id: vendorId,
        lead_id: lead.id,
        account_id: lead.account_id!,
        action: "Lead moved to Under Installation stage.",
        action_type: "UPDATE",
        created_by: updatedBy,
      });

      // 5️⃣ Close Dispatch Planning Task (if any)
      const dispatchTask = await tx.userLeadTask.findFirst({
        where: {
          lead_id: leadId,
          vendor_id: vendorId,
          task_type: "Dispatch",
          lead_stage: "dispatch-planning-stage",
          status: "open",
        },
      });

      if (dispatchTask) {
        const updatedTask = await tx.userLeadTask.update({
          where: { id: dispatchTask.id },
          data: {
            status: "completed",
            closed_at: new Date(),
            closed_by: updatedBy,
            updated_by: updatedBy,
            updated_at: new Date(),
            remark:
              (dispatchTask.remark ?? "") +
              " | Auto-closed after lead moved to Dispatch stage.",
          },
        });

        await createTaskHistoryLog({
          db: tx,
          task: updatedTask,
          createdBy: updatedBy,
          actionType: "UPDATE",
        });

        await createLeadLog(tx, {
          vendor_id: vendorId,
          lead_id: leadId,
          account_id: lead.account_id!,
          action: "Dispatch preparation task marked as Completed.",
          action_type: "UPDATE",
          created_by: updatedBy,
        });
      }

      return updatedLead;
    });

    // ===============================
    // UNDER INSTALLATION NOTIFICATION
    // ===============================

    try {
      const actorId = updatedBy;

      const [lead, actor, firstInstance] = await Promise.all([
        prisma.leadMaster.findUnique({
          where: { id: leadId },
          select: {
            firstname: true,
            lastname: true,
            lead_code: true,
            vendor_id: true,
            account_id: true,
            franchise_id: true,
            statusType: { select: { tag: true } },
          },
        }),
        prisma.userMaster.findUnique({
          where: { id: actorId },
          select: { user_name: true },
        }),
        prisma.leadProductStructureInstance.findFirst({
          where: { lead_id: leadId, vendor_id: vendorId },
          select: { id: true },
          orderBy: [{ product_structure_id: "asc" }, { quantity_index: "asc" }],
        }),
      ]);

      if (!lead) return result;

      const leadName = `${lead.firstname ?? ""} ${lead.lastname ?? ""}`.trim();
      const leadCode = lead.lead_code ?? `LEAD-${String(leadId).padStart(4, "0")}`;
      const dispatchedBy = actor?.user_name ?? "System";
      const dispatchedAt = new Date().toLocaleString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
      const franchiseId = lead.franchise_id ?? null;
      const stageTag = lead.statusType?.tag;

      // Build redirect URL using STAGE_PATH_BY_TAG + instance_id
      const uiBase = stageTag && STAGE_PATH_BY_TAG[stageTag]
        ? `${STAGE_PATH_BY_TAG[stageTag]}/${leadId}`
        : `/dashboard/installation/under-installation/details/${leadId}`;
      const uiParams = new URLSearchParams();
      if (lead.account_id) uiParams.set("accountId", String(lead.account_id));
      if (firstInstance?.id) uiParams.set("instance_id", String(firstInstance.id));
      const uiQs = uiParams.toString();
      const redirectPath = uiQs ? `${uiBase}?${uiQs}` : uiBase;
      const projectUrl = `${baseUrl}${redirectPath}`;

      // Admins — franchise-filtered, no super-admin
      const admins = await getFranchiseAdminRecipients({
        vendorId: lead.vendor_id,
        franchiseId,
        excludeUserId: actorId,
      });

      // Site supervisor from lead mapping
      const siteSupervisorMapping = await prisma.leadUserMapping.findFirst({
        where: {
          lead_id: leadId,
          vendor_id: lead.vendor_id,
          status: "active",
          user: {
            user_type: { user_type: { equals: "site-supervisor", mode: "insensitive" } },
          },
        },
        select: {
          user: { select: { id: true, user_name: true, user_email: true } },
        },
      });

      // Deduplicate recipients, exclude actor
      const recipientMap = new Map<number, { id: number; user_name: string | null; user_email: string | null }>();
      for (const u of admins) recipientMap.set(u.id, u);
      if (siteSupervisorMapping?.user && siteSupervisorMapping.user.id !== actorId) {
        recipientMap.set(siteSupervisorMapping.user.id, siteSupervisorMapping.user);
      }

      await Promise.allSettled(
        Array.from(recipientMap.values()).map(async (user) => {
          const isAdmin = admins.some((a) => a.id === user.id);

          await NotificationService.createAndSend({
            vendor_id: lead.vendor_id,
            user_id: user.id,
            sender_id: actorId,
            type: NotificationType.LEAD_MILESTONE,
            title: isAdmin ? "Lead Moved To Under Installation" : "Lead Assigned For Installation",
            message: isAdmin
              ? `${leadCode} - ${leadName} moved to Under Installation stage by ${dispatchedBy}.`
              : `${leadCode} - ${leadName} is now Under Installation.`,
            entity_type: "lead",
            entity_id: leadId,
            redirect_url: redirectPath,
          });

          if (!user.user_email) return;

          await sendLeadMovedToUnderInstallationEmail({
            vendor_id: lead.vendor_id,
            toEmail: user.user_email,
            toName: user.user_name ?? undefined,
            leadCode,
            leadName,
            dispatchedBy,
            dispatchedAt,
            projectUrl,
          });
        }),
      );

      logger.info("✅ Under Installation notifications sent", {
        vendor_id: lead.vendor_id,
        lead_id: leadId,
        recipients: recipientMap.size,
      });
    } catch (err: any) {
      logger.warn("⚠️ Under Installation notification failed", {
        lead_id: leadId,
        error: err?.message,
      });
    }

    return result;
  }

  /** ✅ Fetch all leads with status = Type 15 (Post-Dispatch Stage) */
  async getLeadsWithStatusUnderInstallationStage(
    vendorId: number,
    userId: number,
    limit = 10,
    page = 1,
  ) {
    const skip = (page - 1) * limit;

    // 🔹 Fetch Post-Dispatch Stage Status (Type 15)
    const underInstallationStageStatus =
      await prisma.statusTypeMaster.findFirst({
        where: { vendor_id: vendorId, tag: "Type 15" },
        select: { id: true },
      });

    if (!underInstallationStageStatus) {
      throw new Error(
        `under-installation-stage status (Type 15) not found for vendor ${vendorId}`,
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
      status_id: underInstallationStageStatus.id,
      activity_status: { in: ["onGoing", "lostApproval"] },
    };

    // 🔹 Admin → all Post-Dispatch Stage leads
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

    // 🔹 Non-admin → mapped + task leads
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

  /** 🔹 Common include for Post-Dispatch Stage */
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

  /**
   * ✅ Set actual installation start date for a lead
   */
  static async setActualInstallationStartDate(
    vendorId: number,
    leadId: number,
    updatedBy: number,
    actualInstallationStartDate: Date,
  ) {
    return prisma.$transaction(async (tx) => {
      // 1️⃣ Validate lead
      const lead = await tx.leadMaster.findUnique({
        where: { id: leadId },
        select: { id: true, vendor_id: true, account_id: true },
      });

      if (!lead) throw new Error(`Lead ${leadId} not found`);
      if (lead.vendor_id !== vendorId)
        throw new Error(`Lead does not belong to vendor ${vendorId}`);

      // 2️⃣ Update date
      const updatedLead = await tx.leadMaster.update({
        where: { id: leadId },
        data: {
          actual_installation_start_date: actualInstallationStartDate,
          updated_by: updatedBy,
          updated_at: new Date(),
        },
        select: {
          id: true,
          vendor_id: true,
          account_id: true,
          actual_installation_start_date: true,
        },
      });

      // 3️⃣ Log the update
      await createLeadLog(tx, {
        vendor_id: vendorId,
        lead_id: lead.id,
        account_id: lead.account_id!,
        action: `Installation has been started`,
        action_type: "UPDATE",
        created_by: updatedBy,
        created_at: new Date(),
      });

      logger.info("[SERVICE] Actual installation start date set", {
        lead_id: lead.id,
        vendor_id: vendorId,
        updated_by: updatedBy,
      });

      return updatedLead;
    });
  }

  /**
   * ✅ Get Under Installation details for a lead
   */
  static async getUnderInstallationDetails(vendorId: number, leadId: number) {
    const lead = await prisma.leadMaster.findFirst({
      where: { id: leadId, vendor_id: vendorId },
      select: {
        id: true,
        actual_installation_start_date: true,
        expected_installation_end_date: true,
        is_carcass_installation_completed: true,
        carcass_installation_completion_date: true,
        is_shutter_installation_completed: true,
        shutter_installation_completion_date: true,
      },
    });

    if (!lead)
      throw new Error(
        `Lead ${leadId} not found or doesn't belong to vendor ${vendorId}`,
      );

    return lead;
  }

  /**
   * ✅ Add multiple installers & set expected installation end date
   */
  static async addInstallersAndSetEndDate(
    vendorId: number,
    leadId: number,
    updatedBy: number,
    expectedEndDate: Date,
    installers: { installer_id: number }[],
  ) {
    return prisma.$transaction(async (tx) => {
      // 1️⃣ Validate the lead and get account_id
      const lead = await tx.leadMaster.findUnique({
        where: { id: leadId },
        select: {
          id: true,
          vendor_id: true,
          account_id: true,
          expected_installation_end_date: true,
        },
      });

      if (!lead) throw new Error(`Lead ${leadId} not found`);
      if (lead.vendor_id !== vendorId)
        throw new Error(`Lead does not belong to vendor ${vendorId}`);
      if (!lead.account_id)
        throw new Error(`Lead ${leadId} does not have an associated account`);

      // 2️⃣ Update expected installation end date
      const updatedLead = await tx.leadMaster.update({
        where: { id: lead.id },
        data: {
          expected_installation_end_date: expectedEndDate,
          updated_by: updatedBy,
          updated_at: new Date(),
        },
        select: {
          id: true,
          vendor_id: true,
          account_id: true,
          expected_installation_end_date: true,
        },
      });

      // 3️⃣ Prepare Installer mappings
      const mappingsData = installers.map((i) => ({
        vendor_id: vendorId,
        account_id: lead.account_id!, // ✅ use account_id from lead
        lead_id: lead.id,
        installer_id: i.installer_id,
        assigned_by: updatedBy,
        assigned_date: new Date(),
      }));

      // 4️⃣ Create Installer mappings
      await tx.installerUserMapping.createMany({
        data: mappingsData,
      });

      const formattedExpectedEndDate = expectedEndDate.toLocaleDateString(
        "en-GB",
        {
          day: "numeric",
          month: "long",
          year: "numeric",
        },
      );

      // 5️⃣ Log action in detailed logs
      await createLeadLog(tx, {
        vendor_id: vendorId,
        lead_id: lead.id,
        account_id: lead.account_id!,
        action: `Set expected installation end date (${formattedExpectedEndDate}) & added ${
          installers.length
        } installer(s)`,
        action_type: "UPDATE",
        created_by: updatedBy,
        created_at: new Date(),
      });

      logger.info("[SERVICE] Installers added & expected end date set", {
        lead_id: lead.id,
        vendor_id: vendorId,
        updated_by: updatedBy,
      });

      return {
        lead_id: lead.id,
        vendor_id: vendorId,
        expected_installation_end_date:
          updatedLead.expected_installation_end_date,
        installers_assigned: installers.length,
      };
    });
  }

  /**
   * ✅ Get all installers mapped to a lead
   */
  static async getMappedInstallers(vendorId: number, leadId: number) {
    // 1️⃣ Verify lead existence (optional safety)
    const lead = await prisma.leadMaster.findUnique({
      where: { id: leadId },
      select: { id: true, vendor_id: true },
    });

    if (!lead) throw new Error(`Lead ${leadId} not found`);
    if (lead.vendor_id !== vendorId)
      throw new Error(`Lead does not belong to vendor ${vendorId}`);

    // 2️⃣ Fetch installers mapped to the lead
    const installers = await prisma.installerUserMapping.findMany({
      where: { vendor_id: vendorId, lead_id: leadId },
      include: {
        installer: {
          select: {
            id: true,
            installer_name: true,
            contact_number: true,
            status: true,
          },
        },
        assigner: {
          select: { id: true, user_name: true },
        },
      },
      orderBy: { assigned_date: "desc" },
    });

    return installers.map((m) => ({
      mapping_id: m.id,
      installer_id: m.installer.id,
      installer_name: m.installer.installer_name,
      contact_number: m.installer.contact_number,
      status: m.installer.status,
      assigned_by: m.assigner?.user_name || null,
      assigned_date: m.assigned_date,
    }));
  }

  /**
   * ✅ Update expected installation end date and/or installers
   */
  static async updateInstallationDetails(
    vendorId: number,
    leadId: number,
    updatedBy: number,
    expectedEndDate?: Date,
    installers?: { installer_id: number }[],
  ) {
    return prisma.$transaction(async (tx) => {
      // 1️⃣ Validate lead
      const lead = await tx.leadMaster.findUnique({
        where: { id: leadId },
        select: {
          id: true,
          vendor_id: true,
          account_id: true,
          expected_installation_end_date: true,
        },
      });

      if (!lead) throw new Error(`Lead ${leadId} not found`);
      if (lead.vendor_id !== vendorId)
        throw new Error(`Lead does not belong to vendor ${vendorId}`);
      if (!lead.account_id)
        throw new Error(`Lead ${leadId} does not have an associated account`);

      const updates: string[] = [];

      // 2️⃣ Update expected installation end date (if provided)
      if (expectedEndDate) {
        const formattedExpectedEndDate = expectedEndDate.toLocaleDateString(
          "en-GB",
          {
            day: "numeric",
            month: "long",
            year: "numeric",
          },
        );

        await tx.leadMaster.update({
          where: { id: lead.id },
          data: {
            expected_installation_end_date: expectedEndDate,
            updated_by: updatedBy,
            updated_at: new Date(),
          },
        });
        updates.push(
          `expected installation end date → ${formattedExpectedEndDate}`,
        );
      }

      // 3️⃣ Update installer mappings (if provided)
      if (Array.isArray(installers) && installers.length > 0) {
        // Remove existing mappings
        await tx.installerUserMapping.deleteMany({
          where: { vendor_id: vendorId, lead_id: lead.id },
        });

        // Add new mappings
        const mappingsData = installers.map((i) => ({
          vendor_id: vendorId,
          account_id: lead.account_id!,
          lead_id: lead.id,
          installer_id: i.installer_id,
          assigned_by: updatedBy,
          assigned_date: new Date(),
        }));

        await tx.installerUserMapping.createMany({
          data: mappingsData,
        });

        updates.push(`reassigned ${installers.length} installer(s)`);
      }

      // 4️⃣ Log what was updated
      const actionMessage =
        updates.length > 0
          ? `Updated ${updates.join(" and ")}`
          : "No changes were made";

      await createLeadLog(tx, {
        vendor_id: vendorId,
        lead_id: lead.id,
        account_id: lead.account_id!,
        action: actionMessage,
        action_type: "UPDATE",
        created_by: updatedBy,
        created_at: new Date(),
      });

      logger.info("[SERVICE] Installation details updated", {
        lead_id: lead.id,
        vendor_id: vendorId,
        updated_by: updatedBy,
        changes: updates,
      });

      return {
        lead_id: lead.id,
        vendor_id: vendorId,
        message: actionMessage,
        updated_fields: updates,
      };
    });
  }

  /**
   * ✅ Set carcass/shutter installation completion status
   */
  static async setInstallationCompletionStatus(
    vendorId: number,
    leadId: number,
    updatedBy: number,
    isCarcassCompleted?: boolean,
    isShutterCompleted?: boolean,
  ) {
    return prisma.$transaction(async (tx) => {
      // 1️⃣ Validate lead
      const lead = await tx.leadMaster.findUnique({
        where: { id: leadId },
        select: {
          id: true,
          vendor_id: true,
          account_id: true,
          is_carcass_installation_completed: true,
          is_shutter_installation_completed: true,
        },
      });

      if (!lead) throw new Error(`Lead ${leadId} not found`);
      if (lead.vendor_id !== vendorId)
        throw new Error(`Lead does not belong to vendor ${vendorId}`);
      if (!lead.account_id)
        throw new Error(`Lead ${leadId} does not have an associated account`);

      const updateData: any = {};
      const actionMessages: string[] = [];

      // 2️⃣ Carcass completion update
      if (typeof isCarcassCompleted !== "undefined") {
        updateData.is_carcass_installation_completed = isCarcassCompleted;

        if (isCarcassCompleted) {
          updateData.carcass_installation_completion_date = new Date();
          actionMessages.push("Carcass installation marked as completed");
        } else {
          updateData.carcass_installation_completion_date = null;
          actionMessages.push("Carcass installation marked as incomplete");
        }
      }

      // 3️⃣ Shutter completion update
      if (typeof isShutterCompleted !== "undefined") {
        updateData.is_shutter_installation_completed = isShutterCompleted;

        if (isShutterCompleted) {
          updateData.shutter_installation_completion_date = new Date();
          actionMessages.push("Shutter installation marked as completed");
        } else {
          updateData.shutter_installation_completion_date = null;
          actionMessages.push("Shutter installation marked as incomplete");
        }
      }

      // 4️⃣ Update the lead
      await tx.leadMaster.update({
        where: { id: lead.id },
        data: {
          ...updateData,
          updated_by: updatedBy,
          updated_at: new Date(),
        },
      });

      // 5️⃣ Log the action
      const logMessage = actionMessages.join(" & ");

      await createLeadLog(tx, {
        vendor_id: vendorId,
        lead_id: lead.id,
        account_id: lead.account_id!,
        action: logMessage,
        action_type: "UPDATE",
        created_by: updatedBy,
        created_at: new Date(),
      });

      logger.info("[SERVICE] Installation completion status updated", {
        lead_id: lead.id,
        vendor_id: vendorId,
        updated_by: updatedBy,
        logMessage,
      });

      return {
        lead_id: lead.id,
        vendor_id: vendorId,
        message: logMessage,
        updated_fields: Object.keys(updateData),
      };
    });
  }

  /**
   * ✅ Upload Installation Updates – Day Wise (Fixed Version)
   * ⚠️ Wasabi upload moved OUTSIDE the Prisma transaction
   */
  static async uploadInstallationUpdatesDayWise(
    vendorId: number,
    leadId: number,
    accountId: number | null,
    userId: number,
    updateDate: Date,
    remark: string | null,
    files: { originalName: string; sysName: string }[],
  ) {
    if (!vendorId || !leadId || !userId)
      throw Object.assign(
        new Error("vendorId, leadId and userId are required"),
        {
          statusCode: 400,
        },
      );

    // 🔹 Fetch document type (Type 23)
    const docType = await prisma.documentTypeMaster.findFirst({
      where: { vendor_id: vendorId, tag: "Type 23" },
    });

    if (!docType)
      throw Object.assign(
        new Error(
          "Document type (Type 23 – under-installation-day-wise-Documents) not found",
        ),
        { statusCode: 404 },
      );

    // 🔹 Validate Lead
    const lead = await prisma.leadMaster.findUnique({
      where: { id: leadId },
      select: { id: true, vendor_id: true, account_id: true },
    });

    if (!lead) throw new Error(`Lead ${leadId} not found`);
    if (lead.vendor_id !== vendorId)
      throw new Error(`Lead does not belong to vendor ${vendorId}`);

    const finalAccountId = accountId || lead.account_id;
    if (!finalAccountId)
      throw new Error(`Lead ${leadId} does not have an associated account`);

    // ------------------------------------------
    // 1️⃣ RUN PRISMA TRANSACTION (FAST, SAFE)
    // ------------------------------------------
    return prisma.$transaction(async (tx) => {
      // Create InstallationUpdate entry
      const installationUpdate = await tx.installationUpdate.create({
        data: {
          vendor_id: vendorId,
          lead_id: leadId,
          account_id: finalAccountId,
          update_date: updateDate,
          remark,
          created_by: userId,
        },
      });

      const uploadedDocs = [];

      // Create documents & links
      for (const file of files) {
        const doc = await tx.leadDocuments.create({
          data: {
            doc_og_name: file.originalName,
            doc_sys_name: file.sysName,
            vendor_id: vendorId,
            lead_id: leadId,
            account_id: finalAccountId,
            created_by: userId,
            doc_type_id: docType.id,
          },
        });

        await tx.installationUpdateDocuments.create({
          data: {
            vendor_id: vendorId,
            installation_update_id: installationUpdate.id,
            document_id: doc.id,
          },
        });

        uploadedDocs.push(doc);
      }

      // Log action
      await createLeadLog(tx, {
        vendor_id: vendorId,
        lead_id: leadId,
        account_id: finalAccountId,
        action: `Uploaded ${files.length} Installation Update document(s) for ${updateDate.toDateString()}`,
        action_type: "UPLOAD",
        created_by: userId,
        created_at: new Date(),
      });

      return uploadedDocs;
    });
  }

  /**
   * ✅ Get Installation Updates – Day Wise
   */
  static async getInstallationUpdatesDayWise(vendorId: number, leadId: number) {
    // 1️⃣ Fetch all updates (Day wise)
    const updates = await prisma.installationUpdate.findMany({
      where: {
        vendor_id: vendorId,
        lead_id: leadId,
      },
      include: {
        documents: {
          where: {
            document: {
              is_deleted: false,
            },
          },
          include: {
            document: true,
          },
        },
      },
      orderBy: {
        update_date: "desc",
      },
    });

    // 2️⃣ Format data
    const result = [];

    for (const update of updates) {
      const dayEntry = {
        update_id: update.id,
        update_date: update.update_date,
        remark: update.remark,
        documents: [] as any[],
      };

      // 3️⃣ Attach signed URLs for each file
      for (const docMap of update.documents) {
        const doc = docMap.document;

        const signedUrl = await generateSignedUrl(
          doc.doc_sys_name,
          3600,
          "inline", // show inline by default
        );

        dayEntry.documents.push({
          document_id: doc.id,
          original_name: doc.doc_og_name,
          file_key: doc.doc_sys_name,
          signed_url: signedUrl,
          uploaded_at: doc.created_at,
        });
      }

      result.push(dayEntry);
    }

    return result;
  }

  static async createMiscellaneousService(payload: MiscPayload) {
    const {
      vendor_id,
      lead_id,
      account_id,
      misc_type_id,
      problem_description,
      reorder_material_details,
      quantity,
      cost,
      supervisor_remark,
      expected_ready_date,
      is_resolved,
      created_by,
      teams,
      files,
      baseUrl,
    } = payload;

    // ====================================
    // 1️⃣ TRANSACTION LAYER
    // ====================================

    const misc = await prisma.$transaction(async (tx) => {
      const misc = await tx.miscellaneousMaster.create({
        data: {
          vendor_id,
          lead_id,
          account_id,
          misc_type_id,
          problem_description,
          reorder_material_details,
          quantity,
          cost,
          supervisor_remark,
          expected_ready_date,
          is_resolved,
          created_by,
        },
      });

      // -----------------------------
      // Factory Assignment Logic
      // -----------------------------

      const factoryMapping = await tx.leadUserMapping.findFirst({
        where: {
          vendor_id,
          lead_id,
          status: "active",
          type: "production-stage",
          user: {
            status: "active",
          },
        },
        orderBy: { created_at: "asc" },
        select: { user_id: true },
      });

      const factoryAssigneeId = factoryMapping?.user_id ?? null;

      // -----------------------------
      // Lead Stage Resolution
      // -----------------------------

      const leadStageRecord = await tx.leadMaster.findUnique({
        where: { id: lead_id },
        select: { status_id: true, franchise_id: true },
      });

      const leadStage = leadStageRecord?.status_id
        ? ((
            await tx.statusTypeMaster.findUnique({
              where: { id: leadStageRecord.status_id },
              select: { type: true },
            })
          )?.type ?? null)
        : null;

      // -----------------------------
      // Task Creation
      // -----------------------------

      const miscRemark = `${reorder_material_details} - ${problem_description}`;

      const task = await tx.userLeadTask.create({
        data: {
          vendor_id,
          lead_id,
          account_id,
          franchise_id: leadStageRecord?.franchise_id ?? null,
          user_id: factoryAssigneeId ?? created_by,
          task_type: "Miscellaneous",
          lead_stage: leadStage,
          due_date: expected_ready_date
            ? new Date(expected_ready_date)
            : new Date(),
          remark: miscRemark,
          status: "open",
          created_by,
        },
      });

      await createTaskHistoryLog({
        db: tx,
        task,
        createdBy: created_by,
        actionType: "CREATE",
      });

      // -----------------------------
      // Teams Mapping
      // -----------------------------

      if (teams.length) {
        await tx.miscellaneousTeamMapping.createMany({
          data: teams.map((teamId) => ({
            miscellaneous_id: misc.id,
            team_id: teamId,
          })),
        });
      }

      // -----------------------------
      // Documents Mapping
      // -----------------------------

      const docType = await tx.documentTypeMaster.findFirst({
        where: { vendor_id, tag: "Type 24" },
      });

      if (!docType) {
        throw new Error("Document type Type 24 not configured");
      }

      for (const doc of files) {
        const leadDoc = await tx.leadDocuments.create({
          data: {
            doc_og_name: doc.originalName,
            doc_sys_name: doc.sysName,
            vendor_id,
            lead_id,
            created_by,
            doc_type_id: docType.id,
          },
        });

        await tx.miscellaneousDocument.create({
          data: {
            vendor_id,
            miscellaneous_id: misc.id,
            document_id: leadDoc.id,
            created_by,
          },
        });
      }

      // Return misc + taskId for redirect deep linking
      return {
        misc,
        taskId: task.id,
      };
    });

    // ====================================
    // 2️⃣ COMMUNICATION LAYER
    // ====================================

    try {
      // -----------------------------
      // Fetch Factory Role
      // -----------------------------

      const factoryRole = await prisma.userTypeMaster.findFirst({
        where: {
          user_type: { equals: "factory", mode: "insensitive" },
        },
        select: { id: true },
      });

      if (!factoryRole) return misc.misc;

      // -----------------------------
      // Fetch Factory Users
      // -----------------------------

      const factoryUsers = await prisma.leadUserMapping.findMany({
        where: {
          vendor_id,
          lead_id,
          status: "active",
          user: {
            user_type_id: factoryRole.id,
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

      if (!factoryUsers.length) return misc.misc;

      // -----------------------------
      // Fetch Lead Meta (Single Query)
      // -----------------------------

      const [leadMeta, creator, firstInstance] = await Promise.all([
        prisma.leadMaster.findUnique({
          where: { id: lead_id },
          select: {
            lead_code: true,
            firstname: true,
            lastname: true,
            account_id: true,
            statusType: { select: { tag: true } },
          },
        }),
        prisma.userMaster.findUnique({
          where: { id: created_by },
          select: { user_name: true },
        }),
        prisma.leadProductStructureInstance.findFirst({
          where: { lead_id, vendor_id },
          select: { id: true },
          orderBy: [{ product_structure_id: "asc" }, { quantity_index: "asc" }],
        }),
      ]);

      const leadCode = leadMeta?.lead_code ?? `LEAD-${lead_id}`;
      const leadName = `${leadMeta?.firstname ?? ""} ${leadMeta?.lastname ?? ""}`.trim();
      const assignedBy = creator?.user_name ?? "System";
      const assignedAt = new Date().toLocaleString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });

      // Build redirect URL using STAGE_PATH_BY_TAG + instance_id
      const stageTag = leadMeta?.statusType?.tag;
      const miscBase = stageTag && STAGE_PATH_BY_TAG[stageTag]
        ? `${STAGE_PATH_BY_TAG[stageTag]}/${lead_id}`
        : `/dashboard/installation/under-installation/details/${lead_id}`;
      const miscParams = new URLSearchParams();
      if (leadMeta?.account_id) miscParams.set("accountId", String(leadMeta.account_id));
      if (firstInstance?.id) miscParams.set("instance_id", String(firstInstance.id));
      if (misc.taskId) miscParams.set("taskId", String(misc.taskId));
      miscParams.set("tab", "misc");
      const redirectPath = `${miscBase}?${miscParams.toString()}`;
      const projectUrl = `${baseUrl}${redirectPath}`;

      // ===============================
      // Broadcast Notification + Email
      // ===============================

      await Promise.allSettled(
        factoryUsers.map(async ({ user }) => {
          await NotificationService.createAndSend({
            vendor_id,
            user_id: user.id,
            sender_id: created_by,
            type: NotificationType.LEAD_ACTION,
            title: "Miscellaneous Requirement Raised",
            message: `A new miscellaneous requirement has been raised for ${leadCode} - ${leadName}. Please review and provide a fulfillment date.`,
            entity_type: "miscellaneous",
            entity_id: misc.misc.id,
            redirect_url: redirectPath,
          });

          if (!user.user_email) return;

          await sendMiscRequirementEmail({
            vendor_id,
            toEmail: user.user_email,
            toName: user.user_name ?? undefined,
            leadCode,
            leadName,
            assignedBy,
            assignedAt,
            requirementDescription: problem_description,
            projectUrl,
          });
        }),
      );

      logger.info("Miscellaneous notification dispatched", {
        misc_id: misc.misc.id,
        task_id: misc.taskId,
        receivers: factoryUsers.length,
      });
    } catch (err: any) {
      logger.warn("Miscellaneous notification failed", {
        misc_id: misc.misc.id,
        error: err?.message,
      });
    }

    return misc.misc;
  }

  static async addMiscDocumentsService(payload: {
    misc_id: number;
    vendor_id: number;
    lead_id: number;
    created_by: number;
    files: { originalName: string; sysName: string }[];
  }) {
    const { misc_id, vendor_id, lead_id, created_by, files } = payload;

    return await prisma.$transaction(async (tx) => {
      const misc = await tx.miscellaneousMaster.findUnique({
        where: { id: misc_id },
      });

      if (!misc) {
        throw new Error("Miscellaneous not found");
      }

      const docType = await tx.documentTypeMaster.findFirst({
        where: { vendor_id, tag: "Type 24" },
      });

      if (!docType) {
        throw new Error("Doc type not found");
      }

      const result = [];

      for (const file of files) {
        const leadDoc = await tx.leadDocuments.create({
          data: {
            doc_og_name: file.originalName,
            doc_sys_name: file.sysName,
            vendor_id,
            lead_id,
            created_by,
            doc_type_id: docType.id,
          },
        });

        const miscDoc = await tx.miscellaneousDocument.create({
          data: {
            vendor_id,
            miscellaneous_id: misc_id,
            document_id: leadDoc.id,
            created_by,
          },
        });

        result.push({
          doc_id: leadDoc.id,
          misc_doc_id: miscDoc.id,
        });
      }

      return result;
    });
  }
  static async getAllMiscellaneousService(vendor_id: number, lead_id: number) {
    const miscList = await prisma.miscellaneousMaster.findMany({
      where: { vendor_id, lead_id },
      orderBy: { created_at: "desc" },
      include: {
        type: true,
        createdBy: { select: { id: true, user_name: true } },
        teams: {
          include: {
            team: true,
          },
        },
        documents: {
          include: {
            document: {
              include: {
                documentType: true,
              },
            },
          },
          where: {
            document: {
              is_deleted: false,
            },
          },
        },
      },
    });

    const miscTasks = await prisma.userLeadTask.findMany({
      where: {
        vendor_id,
        lead_id,
        task_type: "Miscellaneous",
      },
      select: {
        id: true,
        task_type: true,
        remark: true,
        status: true,
        due_date: true,
      },
    });

    // ➜ Attach signed URLs for documents
    const finalResult = await Promise.all(
      miscList.map(async (m) => {
        const docs = await Promise.all(
          m.documents.map(async (docLink) => {
            const signed_url = await generateSignedUrl(
              docLink.document.doc_sys_name,
            );

            return {
              document_id: docLink.document.id,
              original_name: docLink.document.doc_og_name,
              file_key: docLink.document.doc_sys_name,
              doc_type_tag: docLink.document.documentType?.tag ?? null,
              signed_url,
              uploaded_at: docLink.document.created_at,
            };
          }),
        );

        const remarkKey = `${m.reorder_material_details} - ${m.problem_description}`;
        const miscTaskKey = `[misc:${m.id}]`;
        const taskForMisc = miscTasks.find(
          (t) =>
            (t.remark && t.remark.includes(miscTaskKey)) ||
            t.remark === remarkKey,
        );

        const deliveryTaskForMisc = miscTasks.find(
          (t) =>
            typeof t.remark === "string" &&
            t.remark.includes("Required delivery date set for") &&
            t.remark.includes(m.reorder_material_details) &&
            t.remark.includes(m.problem_description),
        );

        return {
          id: m.id,
          vendor_id: m.vendor_id,
          lead_id: m.lead_id,
          account_id: m.account_id,
          misc_approved: m.misc_approved,
          exp_of_rejection: m.exp_of_rejection,
          type: {
            id: m.type.id,
            name: m.type.name,
          },
          problem_description: m.problem_description,
          reorder_material_details: m.reorder_material_details,
          quantity: m.quantity,
          cost: m.cost,
          supervisor_remark: m.supervisor_remark,
          expected_ready_date: m.expected_ready_date,
          required_delivery_date: m.required_delivery_date,
          is_resolved: m.is_resolved,
          resolved_at: m.resolved_at,
          created_by: m.created_by,
          created_at: m.created_at,
          created_user: m.createdBy,
          teams: m.teams.map((t) => ({
            team_id: t.team_id,
            team_name: t.team.name,
          })),
          documents: docs,
          task: taskForMisc
            ? {
                id: taskForMisc.id,
                task_type: taskForMisc.task_type,
                status: taskForMisc.status,
              }
            : null,
          delivery_task: deliveryTaskForMisc
            ? {
                id: deliveryTaskForMisc.id,
                task_type: deliveryTaskForMisc.task_type,
                status: deliveryTaskForMisc.status,
                remark: deliveryTaskForMisc.remark ?? null,
                due_date: deliveryTaskForMisc.due_date ?? null,
              }
            : null,
        };
      }),
    );

    return finalResult;
  }

  static async updateMiscApprovalService({
    vendor_id,
    misc_id,
    misc_approved,
    exp_of_rejection,
    updated_by,
  }: {
    vendor_id: number;
    misc_id: number;
    misc_approved: boolean;
    exp_of_rejection?: string | null;
    updated_by: number;
  }) {
    const existing = await prisma.miscellaneousMaster.findFirst({
      where: { id: misc_id, vendor_id },
      select: { id: true },
    });

    if (!existing) {
      throw new Error("Miscellaneous record not found");
    }

    // ✅ VALIDATION: Reject must have reason
    if (misc_approved === false && !exp_of_rejection?.trim()) {
      throw new Error(
        "Rejection reason is required when rejecting miscellaneous",
      );
    }

    const shouldResolve = misc_approved === false && !!exp_of_rejection?.trim();

    const updated = await prisma.miscellaneousMaster.update({
      where: { id: misc_id },
      data: {
        misc_approved,
        exp_of_rejection: misc_approved ? null : exp_of_rejection,

        // ✅ ONLY reject-with-reason will resolve
        is_resolved: shouldResolve,
        resolved_at: shouldResolve ? new Date() : null,

        updated_by,
      },
    });

    // ✅ If rejected → cancel related misc task
    if (shouldResolve) {
      const miscTaskKey = `[misc:${misc_id}]`;

      const miscRecord = await prisma.miscellaneousMaster.findFirst({
        where: { id: misc_id, vendor_id },
        select: { reorder_material_details: true, problem_description: true },
      });

      const remarkKey = miscRecord
        ? `${miscRecord.reorder_material_details} - ${miscRecord.problem_description}`
        : undefined;

      await prisma.userLeadTask.updateMany({
        where: {
          vendor_id,
          task_type: "Miscellaneous",
          status: { in: ["open", "completed"] },
          OR: [
            { remark: { contains: miscTaskKey } },
            ...(remarkKey ? [{ remark: remarkKey }] : []),
          ],
        },
        data: {
          status: "cancelled",
          updated_by,
          updated_at: new Date(),
        },
      });
    }

    // ===============================
    // NOTIFY SITE SUPERVISOR
    // ===============================

    try {
      const miscFull = await prisma.miscellaneousMaster.findFirst({
        where: { id: misc_id, vendor_id },
        select: { lead_id: true },
      });

      if (miscFull) {
        const leadId = miscFull.lead_id;

        const [lead, firstInstance, supervisorMapping] = await Promise.all([
          prisma.leadMaster.findUnique({
            where: { id: leadId },
            select: {
              lead_code: true,
              firstname: true,
              lastname: true,
              account_id: true,
              statusType: { select: { tag: true } },
            },
          }),
          prisma.leadProductStructureInstance.findFirst({
            where: { lead_id: leadId, vendor_id },
            select: { id: true },
            orderBy: [{ product_structure_id: "asc" }, { quantity_index: "asc" }],
          }),
          prisma.leadUserMapping.findFirst({
            where: {
              lead_id: leadId,
              vendor_id,
              status: "active",
              user: {
                user_type: { user_type: { equals: "site-supervisor", mode: "insensitive" } },
              },
            },
            select: {
              user: { select: { id: true } },
            },
          }),
        ]);

        if (lead && supervisorMapping?.user) {
          const leadCode = lead.lead_code ?? `LEAD-${leadId}`;
          const leadName = `${lead.firstname ?? ""} ${lead.lastname ?? ""}`.trim();
          const stageTag = lead.statusType?.tag;

          const uiBase = stageTag && STAGE_PATH_BY_TAG[stageTag]
            ? `${STAGE_PATH_BY_TAG[stageTag]}/${leadId}`
            : `/dashboard/installation/under-installation/details/${leadId}`;
          const uiParams = new URLSearchParams();
          if (lead.account_id) uiParams.set("accountId", String(lead.account_id));
          if (firstInstance?.id) uiParams.set("instance_id", String(firstInstance.id));
          uiParams.set("tab", "misc");
          const redirectPath = `${uiBase}?${uiParams.toString()}`;

          await NotificationService.createAndSend({
            vendor_id,
            user_id: supervisorMapping.user.id,
            sender_id: updated_by,
            type: NotificationType.LEAD_ACTION,
            title: misc_approved
              ? "Miscellaneous Request Approved"
              : "Miscellaneous Request Rejected",
            message: misc_approved
              ? `Your miscellaneous request for ${leadCode} - ${leadName} has been approved.`
              : `Your miscellaneous request for ${leadCode} - ${leadName} has been rejected. Reason: ${exp_of_rejection ?? "No reason provided"}.`,
            entity_type: "miscellaneous",
            entity_id: misc_id,
            redirect_url: redirectPath,
          });
        }
      }
    } catch (err: any) {
      logger.warn("Misc approval notification failed", {
        misc_id,
        error: err?.message,
      });
    }

    return updated;
  }

  static async updateMiscRequiredDeliveryDateService({
    vendor_id,
    misc_id,
    required_delivery_date,
    updated_by,
    baseUrl,
  }: {
    vendor_id: number;
    misc_id: number;
    required_delivery_date: string;
    updated_by: number;
    baseUrl: string;
  }) {
    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.miscellaneousMaster.findFirst({
        where: { id: misc_id, vendor_id },
        select: {
          id: true,
          lead_id: true,
          account_id: true,
          reorder_material_details: true,
          problem_description: true,
          misc_approved: true,
        },
      });

      if (!existing) {
        throw new Error("Miscellaneous record not found");
      }

      if (existing.misc_approved !== true) {
        throw new Error("Miscellaneous entry is not approved");
      }

      const miscTaskKey = `[misc:${existing.id}]`;
      const remarkKey = `${existing.reorder_material_details} - ${existing.problem_description}`;
      const readyTask = await tx.userLeadTask.findFirst({
        where: {
          vendor_id,
          lead_id: existing.lead_id,
          task_type: "Miscellaneous",
          OR: [{ remark: { contains: miscTaskKey } }, { remark: remarkKey }],
          status: "completed",
        },
        select: { id: true },
      });

      if (!readyTask) {
        throw new Error("Miscellaneous entry is not marked as ready");
      }

      const updated = await tx.miscellaneousMaster.update({
        where: { id: misc_id },
        data: {
          required_delivery_date: new Date(required_delivery_date),
          updated_by,
        },
      });

      const factoryMapping = await tx.leadUserMapping.findFirst({
        where: {
          vendor_id,
          lead_id: existing.lead_id,
          status: "active",
          type: "production-stage",
          user: {
            status: "active",
          },
        },
        orderBy: { created_at: "asc" },
        select: { user_id: true },
      });

      const factoryAssigneeId = factoryMapping?.user_id ?? null;

      const leadStageRecord = await tx.leadMaster.findUnique({
        where: { id: existing.lead_id },
        select: { status_id: true },
      });

      const leadStage = leadStageRecord?.status_id
        ? ((
            await tx.statusTypeMaster.findUnique({
              where: { id: leadStageRecord.status_id },
              select: { type: true },
            })
          )?.type ?? null)
        : null;

      const deliveryRemark = `Required delivery date set for **${existing.reorder_material_details}** - ${existing.problem_description}`;

      const existingDeliveryTask = await tx.userLeadTask.findFirst({
        where: {
          vendor_id,
          lead_id: existing.lead_id,
          task_type: "Miscellaneous",
          remark: deliveryRemark,
        },
        orderBy: { id: "desc" },
        select: { id: true },
      });

      if (existingDeliveryTask) {
        const updatedTask = await tx.userLeadTask.update({
          where: { id: existingDeliveryTask.id },
          data: {
            due_date: new Date(required_delivery_date),
            updated_by,
            updated_at: new Date(),
          },
        });

        await createTaskHistoryLog({
          db: tx,
          task: {
            ...updatedTask,
            vendor_id,
            lead_id: existing.lead_id,
            account_id: existing.account_id,
            task_type: "Miscellaneous",
          },
          createdBy: updated_by,
          actionType: "UPDATE",
        });
      } else {
        const leadFranchise = await tx.leadMaster.findUnique({
          where: { id: existing.lead_id },
          select: { franchise_id: true },
        });
        const task = await tx.userLeadTask.create({
          data: {
            vendor_id,
            lead_id: existing.lead_id,
            account_id: existing.account_id,
            franchise_id: leadFranchise?.franchise_id ?? null,
            user_id: factoryAssigneeId ?? updated_by,
            task_type: "Miscellaneous",
            lead_stage: leadStage,
            due_date: new Date(required_delivery_date),
            remark: deliveryRemark,
            status: "open",
            created_by: updated_by,
          },
        });

        await createTaskHistoryLog({
          db: tx,
          task,
          createdBy: updated_by,
          actionType: "CREATE",
        });
      }

      return updated;
    });

    // ===============================
    // COMMUNICATION LAYER
    // ===============================

    try {
      const miscRecord = await prisma.miscellaneousMaster.findUnique({
        where: { id: misc_id },
        select: { lead_id: true, account_id: true },
      });

      if (!miscRecord) return result;

      const [leadMeta, firstInstance, factoryRole, setByUser] = await Promise.all([
        prisma.leadMaster.findUnique({
          where: { id: miscRecord.lead_id },
          select: {
            lead_code: true,
            firstname: true,
            lastname: true,
            account_id: true,
            statusType: { select: { tag: true } },
          },
        }),
        prisma.leadProductStructureInstance.findFirst({
          where: { lead_id: miscRecord.lead_id, vendor_id },
          select: { id: true },
          orderBy: [{ product_structure_id: "asc" }, { quantity_index: "asc" }],
        }),
        prisma.userTypeMaster.findFirst({
          where: { user_type: { equals: "factory", mode: "insensitive" } },
          select: { id: true },
        }),
        prisma.userMaster.findUnique({
          where: { id: updated_by },
          select: { user_name: true },
        }),
      ]);

      const leadCode = leadMeta?.lead_code ?? `LEAD-${miscRecord.lead_id}`;
      const leadName = `${leadMeta?.firstname ?? ""} ${leadMeta?.lastname ?? ""}`.trim();
      const setBy = setByUser?.user_name ?? "Admin";

      const deliveryDate = new Date(required_delivery_date).toLocaleString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });

      const stageTag = leadMeta?.statusType?.tag;
      const stagePath =
        stageTag && STAGE_PATH_BY_TAG[stageTag]
          ? `${STAGE_PATH_BY_TAG[stageTag]}/${miscRecord.lead_id}`
          : `/dashboard/installation/under-installation/details/${miscRecord.lead_id}`;

      const qp = new URLSearchParams();
      if (leadMeta?.account_id) qp.set("accountId", String(leadMeta.account_id));
      if (firstInstance?.id) qp.set("instance_id", String(firstInstance.id));
      qp.set("tab", "misc");
      const redirectPath = `${stagePath}?${qp.toString()}`;
      const projectUrl = `${baseUrl}${redirectPath}`;

      // Notify factory user
      if (factoryRole) {
        const factoryMapping = await prisma.leadUserMapping.findFirst({
          where: {
            vendor_id,
            lead_id: miscRecord.lead_id,
            status: "active",
            user: { user_type_id: factoryRole.id },
          },
          select: { user: { select: { id: true, user_name: true, user_email: true } } },
        });

        if (factoryMapping?.user) {
          const { user } = factoryMapping;

          await NotificationService.createAndSend({
            vendor_id,
            user_id: user.id,
            sender_id: updated_by,
            type: NotificationType.LEAD_ACTION,
            title: "Required Delivery Date Set",
            message: `A required delivery date (${deliveryDate}) has been set for a miscellaneous requirement on ${leadCode} - ${leadName}.`,
            entity_type: "miscellaneous",
            entity_id: misc_id,
            redirect_url: redirectPath,
          });

          if (user.user_email) {
            await sendMiscRequiredDeliveryDateEmail({
              vendor_id,
              toEmail: user.user_email,
              toName: user.user_name ?? undefined,
              leadCode,
              leadName,
              setBy,
              deliveryDate,
              projectUrl,
            });
          }
        }
      }
    } catch (err: any) {
      logger.warn("Required delivery date notification failed", {
        misc_id,
        error: err?.message,
      });
    }

    return result;
  }

  static async updateMiscRequiredDeliveryDateByTaskIdService({
    vendor_id,
    task_id,
    required_delivery_date,
    updated_by,
    baseUrl,
  }: {
    vendor_id: number;
    task_id: number;
    required_delivery_date: string;
    updated_by: number;
    baseUrl: string;
  }) {
    const result = await prisma.$transaction(async (tx) => {
      const task = await tx.userLeadTask.findFirst({
        where: {
          id: task_id,
          vendor_id,
          task_type: "Miscellaneous",
        },
        select: {
          id: true,
          lead_id: true,
          remark: true,
        },
      });

      if (!task) {
        throw new Error("Miscellaneous task not found");
      }

      const remark = task.remark || "";
      const match =
        remark.match(/\*\*(.+?)\*\*\s*-\s*([\s\S]+)$/) ||
        remark.match(/^(.+?)\s*-\s*([\s\S]+)$/);

      if (!match) {
        throw new Error("Unable to parse miscellaneous details from remark");
      }

      const reorder_material_details = match[1];
      const problem_description = match[2];

      const misc = await tx.miscellaneousMaster.findFirst({
        where: {
          vendor_id,
          lead_id: task.lead_id,
          reorder_material_details,
          problem_description,
        },
        select: {
          id: true,
          misc_approved: true,
          is_resolved: true,
        },
      });

      if (!misc) {
        throw new Error("Miscellaneous entry not found for this task");
      }

      if (misc.misc_approved !== true) {
        throw new Error("Miscellaneous entry is not approved");
      }

      if (misc.is_resolved) {
        throw new Error("Miscellaneous entry is already resolved");
      }

      const updated = await tx.miscellaneousMaster.update({
        where: { id: misc.id },
        data: {
          required_delivery_date: new Date(required_delivery_date),

          updated_by,
        },
      });

      return { updated, lead_id: task.lead_id, misc_id: misc.id };
    });

    // ===============================
    // COMMUNICATION LAYER
    // ===============================

    try {
      const [leadMeta, firstInstance, factoryRole, setByUser] = await Promise.all([
        prisma.leadMaster.findUnique({
          where: { id: result.lead_id },
          select: {
            lead_code: true,
            firstname: true,
            lastname: true,
            account_id: true,
            statusType: { select: { tag: true } },
          },
        }),
        prisma.leadProductStructureInstance.findFirst({
          where: { lead_id: result.lead_id, vendor_id },
          select: { id: true },
          orderBy: [{ product_structure_id: "asc" }, { quantity_index: "asc" }],
        }),
        prisma.userTypeMaster.findFirst({
          where: { user_type: { equals: "factory", mode: "insensitive" } },
          select: { id: true },
        }),
        prisma.userMaster.findUnique({
          where: { id: updated_by },
          select: { user_name: true },
        }),
      ]);

      const leadCode = leadMeta?.lead_code ?? `LEAD-${result.lead_id}`;
      const leadName = `${leadMeta?.firstname ?? ""} ${leadMeta?.lastname ?? ""}`.trim();
      const setBy = setByUser?.user_name ?? "Admin";
      const deliveryDate = new Date(required_delivery_date).toLocaleString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });

      const stageTag = leadMeta?.statusType?.tag;
      const stagePath =
        stageTag && STAGE_PATH_BY_TAG[stageTag]
          ? `${STAGE_PATH_BY_TAG[stageTag]}/${result.lead_id}`
          : `/dashboard/installation/under-installation/details/${result.lead_id}`;

      const qp = new URLSearchParams();
      if (leadMeta?.account_id) qp.set("accountId", String(leadMeta.account_id));
      if (firstInstance?.id) qp.set("instance_id", String(firstInstance.id));
      qp.set("tab", "misc");
      const redirectPath = `${stagePath}?${qp.toString()}`;
      const projectUrl = `${baseUrl}${redirectPath}`;

      if (factoryRole) {
        const factoryMapping = await prisma.leadUserMapping.findFirst({
          where: {
            vendor_id,
            lead_id: result.lead_id,
            status: "active",
            user: { user_type_id: factoryRole.id },
          },
          select: { user: { select: { id: true, user_name: true, user_email: true } } },
        });

        if (factoryMapping?.user) {
          const { user } = factoryMapping;

          await NotificationService.createAndSend({
            vendor_id,
            user_id: user.id,
            sender_id: updated_by,
            type: NotificationType.LEAD_ACTION,
            title: "Required Delivery Date Set",
            message: `A required delivery date (${deliveryDate}) has been set for a miscellaneous requirement on ${leadCode} - ${leadName}.`,
            entity_type: "miscellaneous",
            entity_id: result.misc_id,
            redirect_url: redirectPath,
          });

          if (user.user_email) {
            await sendMiscRequiredDeliveryDateEmail({
              vendor_id,
              toEmail: user.user_email,
              toName: user.user_name ?? undefined,
              leadCode,
              leadName,
              setBy,
              deliveryDate,
              projectUrl,
            });
          }
        }
      }
    } catch (err: any) {
      logger.warn("Required delivery date (by task) notification failed", {
        task_id,
        error: err?.message,
      });
    }

    return result.updated;
  }

  static async uploadMiscCompletionDocumentsByTaskIdService({
    vendor_id,
    task_id,
    created_by,
    files,
  }: {
    vendor_id: number;
    task_id: number;
    created_by: number;
    files: { originalName: string; sysName: string }[];
  }) {
    const result = await prisma.$transaction(async (tx) => {
      const task = await tx.userLeadTask.findFirst({
        where: {
          id: task_id,
          vendor_id,
          task_type: "Miscellaneous",
        },
        select: {
          id: true,
          lead_id: true,
          remark: true,
        },
      });

      if (!task) {
        throw new Error("Miscellaneous task not found");
      }

      const remark = task.remark || "";
      const match =
        remark.match(/\*\*(.+?)\*\*\s*-\s*([\s\S]+)$/) ||
        remark.match(/^(.+?)\s*-\s*([\s\S]+)$/);

      if (!match) {
        throw new Error("Unable to parse miscellaneous details from remark");
      }

      const reorder_material_details = match[1];
      const problem_description = match[2];

      const misc = await tx.miscellaneousMaster.findFirst({
        where: {
          vendor_id,
          lead_id: task.lead_id,
          reorder_material_details,
          problem_description,
        },
        select: { id: true },
      });

      if (!misc) {
        throw new Error("Miscellaneous entry not found for this task");
      }

      let docType = await tx.documentTypeMaster.findFirst({
        where: { vendor_id, tag: "Type 37" },
      });

      if (!docType) {
        docType = await tx.documentTypeMaster.create({
          data: {
            vendor_id,
            tag: "Type 37",
            type: "Miscellaneous Completion Documents",
          },
        });
      }

      for (const doc of files) {
        const leadDoc = await tx.leadDocuments.create({
          data: {
            doc_og_name: doc.originalName,
            doc_sys_name: doc.sysName,
            vendor_id,
            lead_id: task.lead_id,
            created_by,
            doc_type_id: docType.id,
          },
        });

        await tx.miscellaneousDocument.create({
          data: {
            vendor_id,
            miscellaneous_id: misc.id,
            document_id: leadDoc.id,
            created_by,
          },
        });
      }

      return { misc_id: misc.id, uploaded: files.length };
    });

    return result;
  }

  static async updateERDService({
    vendor_id,
    misc_id,
    expected_ready_date,
    updated_by,
    baseUrl,
  }: UpdateERDInput) {
    // ===============================
    // 1️⃣ TRANSACTION LAYER
    // ===============================

    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.miscellaneousMaster.findFirst({
        where: { id: misc_id, vendor_id },
        select: {
          id: true,
          lead_id: true,
          account_id: true,
          reorder_material_details: true,
          problem_description: true,
          misc_approved: true,
        },
      });

      if (!existing) {
        throw new Error("Miscellaneous record not found");
      }
      if (existing.misc_approved !== true) {
        throw new Error("Miscellaneous entry is not approved");
      }

      const updated = await tx.miscellaneousMaster.update({
        where: { id: misc_id },
        data: {
          expected_ready_date: new Date(expected_ready_date),
          updated_by,
        },
      });

      const miscTaskKey = `[misc:${existing.id}]`;
      const remarkKey = `${existing.reorder_material_details} - ${existing.problem_description}`;

      const existingTask = await tx.userLeadTask.findFirst({
        where: {
          vendor_id,
          lead_id: existing.lead_id,
          task_type: "Miscellaneous",
          OR: [{ remark: { contains: miscTaskKey } }, { remark: remarkKey }],
        },
        select: { id: true },
      });

      let taskId: number;

      if (existingTask) {
        const updatedTask = await tx.userLeadTask.update({
          where: { id: existingTask.id },
          data: {
            due_date: new Date(expected_ready_date),
            updated_by,
          },
        });

        await createTaskHistoryLog({
          db: tx,
          task: {
            ...updatedTask,
            vendor_id,
            lead_id: existing.lead_id,
            account_id: existing.account_id,
            task_type: "Miscellaneous",
          },
          createdBy: updated_by,
          actionType: "UPDATE",
        });

        taskId = existingTask.id;
      } else {
        const leadFranchise = await tx.leadMaster.findUnique({
          where: { id: existing.lead_id },
          select: { franchise_id: true },
        });
        const newTask = await tx.userLeadTask.create({
          data: {
            vendor_id,
            lead_id: existing.lead_id,
            account_id: existing.account_id,
            franchise_id: leadFranchise?.franchise_id ?? null,
            task_type: "Miscellaneous",
            user_id: updated_by,
            due_date: new Date(expected_ready_date),
            remark: remarkKey,
            status: "open",
            created_by: updated_by,
          },
        });

        await createTaskHistoryLog({
          db: tx,
          task: newTask,
          createdBy: updated_by,
          actionType: "CREATE",
        });

        taskId = newTask.id;
      }

      return {
        updated,
        lead_id: existing.lead_id,
        account_id: existing.account_id,
        taskId,
      };
    });

    // ===============================
    // 2️⃣ COMMUNICATION LAYER
    // ===============================

    try {
      // -------------------------
      // Resolve Site Supervisor
      // -------------------------

      const supervisorRole = await prisma.userTypeMaster.findFirst({
        where: {
          user_type: { equals: "site-supervisor", mode: "insensitive" },
        },
        select: { id: true },
      });

      if (!supervisorRole) return result.updated;

      const supervisors = await prisma.leadUserMapping.findMany({
        where: {
          vendor_id,
          lead_id: result.lead_id,
          status: "active",
          user: {
            user_type_id: supervisorRole.id,
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

      if (!supervisors.length) return result.updated;

      // -------------------------
      // Lead Meta
      // -------------------------

      const [leadMeta, firstInstance] = await Promise.all([
        prisma.leadMaster.findUnique({
          where: { id: result.lead_id },
          select: {
            lead_code: true,
            firstname: true,
            lastname: true,
            account_id: true,
            statusType: { select: { tag: true } },
          },
        }),
        prisma.leadProductStructureInstance.findFirst({
          where: { lead_id: result.lead_id, vendor_id },
          select: { id: true },
          orderBy: [{ product_structure_id: "asc" }, { quantity_index: "asc" }],
        }),
      ]);

      const leadCode = leadMeta?.lead_code ?? `LEAD-${result.lead_id}`;
      const leadName =
        `${leadMeta?.firstname ?? ""} ${leadMeta?.lastname ?? ""}`.trim();

      const fulfillmentDate = new Date(expected_ready_date).toLocaleString(
        "en-IN",
        {
          day: "2-digit",
          month: "short",
          year: "numeric",
        },
      );

      // -------------------------
      // Deep Link Builder
      // -------------------------

      const stageTag = leadMeta?.statusType?.tag;
      const stagePath =
        stageTag && STAGE_PATH_BY_TAG[stageTag]
          ? `${STAGE_PATH_BY_TAG[stageTag]}/${result.lead_id}`
          : `/dashboard/installation/under-installation/details/${result.lead_id}`;

      const qp = new URLSearchParams();
      if (leadMeta?.account_id) qp.set("accountId", String(leadMeta.account_id));
      if (firstInstance?.id) qp.set("instance_id", String(firstInstance.id));
      qp.set("tab", "misc");
      qp.set("taskId", String(result.taskId));
      const redirectPath = `${stagePath}?${qp.toString()}`;

      const projectUrl = `${baseUrl}${redirectPath}`;

      // -------------------------
      // Broadcast
      // -------------------------

      await Promise.allSettled(
        supervisors.map(async ({ user }) => {
          // 🔔 In-App Notification
          await NotificationService.createAndSend({
            vendor_id,
            user_id: user.id,
            sender_id: updated_by,
            type: NotificationType.LEAD_ACTION,
            title: "Miscellaneous ERD Date has been Updated",
            message: `Factory has updated the fulfillment date for a miscellaneous requirement on ${leadCode} - ${leadName}. Expected Date: ${fulfillmentDate}`,
            entity_type: "miscellaneous",
            entity_id: misc_id,
            redirect_url: redirectPath,
          });

          // 📧 Email Notification
          if (user.user_email) {
            await sendMiscERDUpdatedEmail({
              vendor_id,
              toEmail: user.user_email,
              toName: user.user_name ?? undefined,
              leadCode,
              leadName,
              fulfillmentDate,
              projectUrl,
            });
          }
        }),
      );
    } catch (err: any) {
      logger.warn("Misc ERD notification failed", {
        misc_id,
        error: err?.message,
      });
    }

    return result.updated;
  }

  static async addInstallationIssueLog(payload: InstallIssueLogPayload) {
    return prisma.$transaction(async (tx) => {
      const {
        vendor_id,
        lead_id,
        account_id,
        issue_type_ids,
        issue_description,
        issue_impact,
        responsible_team_ids,
        created_by,
      } = payload;

      // 1️⃣ Create main issue log master
      const issueLog = await tx.installationIssueLogMaster.create({
        data: {
          vendor_id,
          lead_id,
          account_id,
          issue_description,
          issue_impact,
          created_by,
        },
      });

      const issueLogId = issueLog.id;

      // 2️⃣ Create Issue Type Mappings
      const typeData = issue_type_ids.map((type_id) => ({
        issue_log_id: issueLogId,
        type_id,
      }));

      await tx.issueLogTypeMapping.createMany({
        data: typeData,
        skipDuplicates: true,
      });

      // 3️⃣ Create Responsible Teams Mappings
      const teamData = responsible_team_ids.map((team_id) => ({
        issue_log_id: issueLogId,
        team_id,
      }));

      await tx.issueLogResponsibleTeamMapping.createMany({
        data: teamData,
        skipDuplicates: true,
      });

      // 4️⃣ Return full issue log with relations
      return tx.installationIssueLogMaster.findUnique({
        where: { id: issueLogId },
        include: {
          issueTypes: { include: { type: true } },
          responsibleTeams: { include: { team: true } },
        },
      });
    });
  }

  static async getInstallationIssueLogs(vendor_id: number, lead_id: number) {
    return prisma.installationIssueLogMaster.findMany({
      where: {
        vendor_id,
        lead_id,
      },
      orderBy: { created_at: "desc" },

      include: {
        createdBy: {
          select: { id: true, user_name: true },
        },
        issueTypes: {
          include: { type: true },
        },
        responsibleTeams: {
          include: { team: true },
        },
      },
    });
  }

  static async getInstallationIssueLogById(id: number) {
    return prisma.installationIssueLogMaster.findUnique({
      where: { id },

      include: {
        createdBy: {
          select: { id: true, user_name: true },
        },
        issueTypes: {
          include: { type: true },
        },
        responsibleTeams: {
          include: { team: true },
        },
        lead: {
          select: {
            id: true,
            lead_code: true,
            firstname: true,
            lastname: true,
          },
        },
        account: {
          select: {
            id: true,
            name: true,
            contact_no: true,
          },
        },
      },
    });
  }

  static async updateInstallationIssueLog(
    id: number,
    payload: {
      issue_type_ids?: number[];
      issue_description?: string;
      issue_impact?: string;
      responsible_team_ids?: number[];
      updated_by: number;
    },
  ) {
    return prisma.$transaction(async (tx) => {
      const existing = await tx.installationIssueLogMaster.findUnique({
        where: { id },
      });

      if (!existing) throw new Error("Issue log not found");

      const {
        issue_type_ids,
        issue_description,
        issue_impact,
        responsible_team_ids,
      } = payload;

      // 1️⃣ Update issue description / impact if provided
      await tx.installationIssueLogMaster.update({
        where: { id },
        data: {
          issue_description: issue_description ?? existing.issue_description,
          issue_impact: issue_impact ?? existing.issue_impact,
        },
      });

      // 2️⃣ Update Issue Types
      if (issue_type_ids) {
        await tx.issueLogTypeMapping.deleteMany({
          where: { issue_log_id: id },
        });

        await tx.issueLogTypeMapping.createMany({
          data: issue_type_ids.map((type_id) => ({
            issue_log_id: id,
            type_id,
          })),
        });
      }

      // 3️⃣ Update Responsible Teams
      if (responsible_team_ids) {
        await tx.issueLogResponsibleTeamMapping.deleteMany({
          where: { issue_log_id: id },
        });

        await tx.issueLogResponsibleTeamMapping.createMany({
          data: responsible_team_ids.map((team_id) => ({
            issue_log_id: id,
            team_id,
          })),
        });
      }

      // 4️⃣ Return updated full record
      return tx.installationIssueLogMaster.findUnique({
        where: { id },
        include: {
          issueTypes: { include: { type: true } },
          responsibleTeams: { include: { team: true } },
          createdBy: { select: { id: true, user_name: true } },
        },
      });
    });
  }

  static async updateUsableHandover(payload: UsableHandoverPayload) {
    const {
      vendor_id,
      lead_id,
      account_id,
      created_by,
      pending_work_details,
      files,
    } = payload;

    // -----------------------------------------
    // 1️⃣ Update Pending Work Details
    // -----------------------------------------
    await prisma.leadMaster.update({
      where: { id: lead_id },
      data: {
        usable_handover_pending_work_details: pending_work_details,
      },
    });

    // -----------------------------------------
    // 2️⃣ Fetch document types
    // -----------------------------------------
    const finalSitePhotoType = await prisma.documentTypeMaster.findFirst({
      where: { vendor_id, tag: "Type 25" },
    });

    if (!finalSitePhotoType)
      throw new Error("Document type (Type 25) not found for this vendor");

    const handoverDocType = await prisma.documentTypeMaster.findFirst({
      where: { vendor_id, tag: "Type 26" },
    });

    if (!handoverDocType)
      throw new Error("Document type (Type 26) not found for this vendor");

    // -----------------------------------------
    // 3️⃣ Save Documents
    // -----------------------------------------
    const uploadedDocs = [];
    const uploadedFinalSitePhotos: any[] = [];
    const uploadedHandoverDocuments: any[] = [];

    for (const file of files) {
      const docTypeId = file.isImage
        ? finalSitePhotoType.id
        : handoverDocType.id;

      const savedDoc = await prisma.leadDocuments.create({
        data: {
          vendor_id,
          account_id,
          lead_id,
          created_by,
          doc_type_id: docTypeId,
          doc_og_name: file.originalName,
          doc_sys_name: file.sysName,
        },
      });

      uploadedDocs.push(savedDoc);
      if (file.isImage) {
        uploadedFinalSitePhotos.push(savedDoc);
      } else {
        uploadedHandoverDocuments.push(savedDoc);
      }
    }

    if (account_id && uploadedFinalSitePhotos.length > 0) {
      const detailedLog = await createLeadLog(prisma, {
        vendor_id,
        lead_id,
        account_id,
        action: `${uploadedFinalSitePhotos.length} Final Site Photo${uploadedFinalSitePhotos.length > 1 ? "s" : ""} uploaded successfully.`,
        action_type: "CREATE",
        history_type: "Lead",
        created_by,
      });

      await prisma.leadDocumentLogs.createMany({
        data: uploadedFinalSitePhotos.map((doc) => ({
          vendor_id,
          lead_id,
          account_id,
          doc_id: doc.id,
          lead_logs_id: detailedLog.id,
          created_by,
        })),
      });
    }

    if (account_id && uploadedHandoverDocuments.length > 0) {
      const detailedLog = await createLeadLog(prisma, {
        vendor_id,
        lead_id,
        account_id,
        action: `${uploadedHandoverDocuments.length} Handover Document${uploadedHandoverDocuments.length > 1 ? "s" : ""} uploaded successfully.`,
        action_type: "CREATE",
        history_type: "Lead",
        created_by,
      });

      await prisma.leadDocumentLogs.createMany({
        data: uploadedHandoverDocuments.map((doc) => ({
          vendor_id,
          lead_id,
          account_id,
          doc_id: doc.id,
          lead_logs_id: detailedLog.id,
          created_by,
        })),
      });
    }

    return {
      pending_work_details,
      uploaded_docs: uploadedDocs,
    };
  }

  static async getUsableHandover(vendor_id: number, lead_id: number) {
    // 1️⃣ Fetch pending work details from LeadMaster
    const lead = await prisma.leadMaster.findUnique({
      where: { id: lead_id },
      select: {
        usable_handover_pending_work_details: true,
        usable_handover_completed: true,
      },
    });

    if (!lead) throw new Error("Lead not found");

    // 2️⃣ Fetch final site photo type
    const finalSitePhotoType = await prisma.documentTypeMaster.findFirst({
      where: { vendor_id, tag: "Type 25" },
    });

    // 3️⃣ Fetch handover document type
    const handoverDocType = await prisma.documentTypeMaster.findFirst({
      where: { vendor_id, tag: "Type 26" },
    });

    const finalSitePhotos = finalSitePhotoType
      ? await prisma.leadDocuments.findMany({
          where: {
            vendor_id,
            lead_id,
            doc_type_id: finalSitePhotoType.id,
            is_deleted: false,
          },
        })
      : [];

    const handoverDocuments = handoverDocType
      ? await prisma.leadDocuments.findMany({
          where: {
            vendor_id,
            lead_id,
            doc_type_id: handoverDocType.id,
            is_deleted: false,
          },
        })
      : [];

    // 4️⃣ Attach Signed URLs
    const finalSitePhotosWithUrl = await Promise.all(
      finalSitePhotos.map(async (doc) => ({
        ...doc,
        signedUrl: await generateSignedUrl(doc.doc_sys_name),
      })),
    );

    const handoverDocumentsWithUrl = await Promise.all(
      handoverDocuments.map(async (doc) => ({
        ...doc,
        signedUrl: await generateSignedUrl(
          doc.doc_sys_name,
          3600,
          "attachment",
        ),
      })),
    );

    return {
      pending_work_details: lead.usable_handover_pending_work_details,
      usable_handover_completed: lead.usable_handover_completed ?? false,
      final_site_photos: finalSitePhotosWithUrl,
      handover_documents: handoverDocumentsWithUrl,
    };
  }

  static async markUsableHandoverCompleted(
    vendor_id: number,
    lead_id: number,
    updated_by: number,
  ) {
    const updatedLead = await prisma.$transaction(async (tx) => {
      const existingLead = await tx.leadMaster.findFirst({
        where: {
          id: lead_id,
          vendor_id,
          is_deleted: false,
        },
        select: {
          id: true,
          account_id: true,
          usable_handover_completed_at: true,
          productMappings: {
            select: {
              productType: {
                select: {
                  tag: true,
                },
              },
            },
          },
        },
      });

      if (!existingLead) {
        throw new Error("Lead not found");
      }

      if (!existingLead.account_id) {
        throw new Error("Account ID not found for this lead");
      }

      const usableHandoverCompletedAt =
        existingLead.usable_handover_completed_at ?? new Date();

      const updatedLead = await tx.leadMaster.update({
        where: { id: lead_id, vendor_id },
        data: {
          usable_handover_completed: true,
          usable_handover_completed_at: usableHandoverCompletedAt,
          updated_by,
          updated_at: new Date(),
        },
      });

      const isSmallOrderLead = existingLead.productMappings.some(
        (mapping) => mapping.productType?.tag === "Type 7",
      );

      if (!isSmallOrderLead) {
        for (const [index, monthGap] of [4, 8, 12].entries()) {
          const scheduledDate =
            UnderInstallationStageService.addMonthsPreservingDay(
              usableHandoverCompletedAt,
              monthGap,
            );

          await tx.leadServiceSchedule.upsert({
            where: {
              uniq_lead_service_no_type: {
                lead_id,
                service_no: index + 1,
                service_type: "free",
              },
            },
            update: {},
            create: {
              vendor_id,
              lead_id,
              account_id: existingLead.account_id,
              service_no: index + 1,
              service_type: "free",
              scheduled_for: scheduledDate,
              original_scheduled_for: scheduledDate,
              created_by: updated_by,
              updated_by,
            },
          });
        }
      }

      await createLeadLog(tx, {
        vendor_id,
        lead_id,
        account_id: existingLead.account_id,
        action: "Usable handover marked as completed.",
        action_type: "UPDATE",
        created_by: updated_by,
        created_at: new Date(),
      });

      return updatedLead;
    });

    return updatedLead;
  }

  // ----------------------------------------
  // PUT API — Update Remarks Only
  // ----------------------------------------
  static async updateRemarks(
    vendor_id: number,
    lead_id: number,
    pending_work_details: string,
  ) {
    const updatedLead = await prisma.leadMaster.update({
      where: { id: lead_id },
      data: {
        usable_handover_pending_work_details: pending_work_details,
      },
    });

    return updatedLead;
  }

  /**
   * ✅ Move Lead to Final Handover Stage (Type 16)
   */
  static async moveLeadToFinalHandover(
    vendorId: number,
    leadId: number,
    updatedBy: number,
    baseUrl: string,
  ) {
    // ===============================
    // 1️⃣ TRANSACTION LAYER
    // ===============================

    const result = await prisma.$transaction(async (tx) => {
      // Validate Lead
      const lead = await tx.leadMaster.findUnique({
        where: { id: leadId },
        select: { id: true, vendor_id: true, account_id: true },
      });

      if (!lead) throw new Error(`Lead ${leadId} not found`);
      if (lead.vendor_id !== vendorId)
        throw new Error(`Lead does not belong to vendor ${vendorId}`);

      // Fetch Final Handover Status (Type 16)
      const toStatus = await tx.statusTypeMaster.findFirst({
        where: { vendor_id: vendorId, tag: "Type 16" },
        select: { id: true, type: true },
      });

      if (!toStatus)
        throw new Error("Final Handover stage (Type 16) not configured");

      // Update Lead Stage
      await tx.leadMaster.update({
        where: { id: lead.id },
        data: {
          status_id: toStatus.id,
          actual_installation_completion_at: new Date(),
          updated_by: updatedBy,
          updated_at: new Date(),
        },
      });

      await ensureLeadStatusLog(tx, {
        vendorId,
        leadId: lead.id,
        accountId: lead.account_id,
        statusId: toStatus.id,
        createdBy: updatedBy,
      });

      // Detailed Log
      await createLeadLog(tx, {
        vendor_id: vendorId,
        lead_id: lead.id,
        account_id: lead.account_id!,
        action: "Lead moved to Final Handover stage.",
        action_type: "UPDATE",
        created_by: updatedBy,
        created_at: new Date(),
      });

      return {
        lead_id: lead.id,
        vendor_id: vendorId,
        account_id: lead.account_id,
        statusName: toStatus.type,
      };
    });

    // ===============================
    // 2️⃣ COMMUNICATION LAYER
    // ===============================

    try {
      const [leadMeta, firstInstance, mappedUsers, updatedByUser] = await Promise.all([
        prisma.leadMaster.findUnique({
          where: { id: leadId },
          select: {
            lead_code: true,
            firstname: true,
            lastname: true,
            account_id: true,
            franchise_id: true,
          },
        }),
        prisma.leadProductStructureInstance.findFirst({
          where: { lead_id: leadId, vendor_id: vendorId },
          select: { id: true },
          orderBy: [{ product_structure_id: "asc" }, { quantity_index: "asc" }],
        }),
        prisma.leadUserMapping.findMany({
          where: { vendor_id: vendorId, lead_id: leadId, status: "active" },
          select: { user_id: true },
        }),
        prisma.userMaster.findUnique({
          where: { id: updatedBy },
          select: { user_name: true },
        }),
      ]);

      const franchiseId = leadMeta?.franchise_id ?? null;
      const salesUserIds = Array.from(new Set(mappedUsers.map((m) => m.user_id)));

      const [admins, salesExecutives] = await Promise.all([
        getFranchiseAdminRecipients({
          vendorId,
          franchiseId,
          excludeUserId: updatedBy,
        }),
        salesUserIds.length > 0
          ? prisma.userMaster.findMany({
              where: {
                id: { in: salesUserIds },
                status: "active",
                user_type: { user_type: { in: ["sales-executive"], mode: "insensitive" } },
              },
              select: { id: true, user_name: true, user_email: true },
            })
          : Promise.resolve([]),
      ]);

      const recipientMap = new Map<number, { id: number; user_name: string | null; user_email: string | null }>();
      for (const u of [...admins, ...salesExecutives]) recipientMap.set(u.id, u);
      const recipients = Array.from(recipientMap.values());

      if (!recipients.length) return result;

      const leadCode = leadMeta?.lead_code ?? `LEAD-${leadId}`;
      const leadName = `${leadMeta?.firstname ?? ""} ${leadMeta?.lastname ?? ""}`.trim();
      const updatedByName = updatedByUser?.user_name ?? "Admin";
      const updatedAt = new Date().toLocaleString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });

      const stagePath = `${STAGE_PATH_BY_TAG["Type 16"]}/${leadId}`;
      const qp = new URLSearchParams();
      if (leadMeta?.account_id) qp.set("accountId", String(leadMeta.account_id));
      if (firstInstance?.id) qp.set("instance_id", String(firstInstance.id));
      const redirectPath = qp.toString() ? `${stagePath}?${qp.toString()}` : stagePath;
      const projectUrl = `${baseUrl}${redirectPath}`;

      await Promise.allSettled(
        recipients.map(async (user) => {
          // 🔔 In-App Notification
          await NotificationService.createAndSend({
            vendor_id: vendorId,
            user_id: user.id,
            sender_id: updatedBy,
            type: NotificationType.LEAD_MILESTONE,
            title: "Lead Moved to Final Handover",
            message: `${leadCode} - ${leadName} has been moved to the Final Handover stage.`,
            entity_type: "lead",
            entity_id: leadId,
            redirect_url: redirectPath,
          });

          // 📧 Email
          if (user.user_email) {
            await sendLeadMovedToFinalHandoverEmail({
              vendor_id: vendorId,
              toEmail: user.user_email,
              toName: user.user_name ?? undefined,
              leadCode,
              leadName,
              updatedBy: updatedByName,
              updatedAt,
              projectUrl,
            });
          }
        }),
      );
    } catch (err: any) {
      logger.warn("Final handover notification failed", {
        lead_id: leadId,
        error: err?.message,
      });
    }

    return result;
  }

  async checkUsableHandoverReady(vendorId: number, leadId: number) {
    // Fetch base lead fields
    const lead = await prisma.leadMaster.findFirst({
      where: {
        id: leadId,
        vendor_id: vendorId,
        is_deleted: false,
      },
      select: {
        is_carcass_installation_completed: true,
        is_shutter_installation_completed: true,
        expected_installation_end_date: true,
      },
    });

    if (!lead) return null;

    // Check installer count
    const installerCount = await prisma.installerUserMapping.count({
      where: {
        vendor_id: vendorId,
        lead_id: leadId,
      },
    });

    const conditions = {
      carcassCompleted: lead.is_carcass_installation_completed === true,
      shutterCompleted: lead.is_shutter_installation_completed === true,
      expectedEndDateFilled: lead.expected_installation_end_date !== null,
      installersAssigned: installerCount > 0,
    };

    const isReady =
      conditions.carcassCompleted &&
      conditions.shutterCompleted &&
      conditions.expectedEndDateFilled &&
      conditions.installersAssigned;

    return {
      isReady,
      details: {
        carcassCompleted: conditions.carcassCompleted,
        shutterCompleted: conditions.shutterCompleted,
        expectedEndDateFilled: conditions.expectedEndDateFilled,
        installersAssigned: installerCount,
      },
    };
  }

  private async checkInstallationBaseConditions(
    vendorId: number,
    leadId: number,
  ) {
    // Get essential fields
    const lead = await prisma.leadMaster.findFirst({
      where: {
        id: leadId,
        vendor_id: vendorId,
        is_deleted: false,
      },
      select: {
        is_carcass_installation_completed: true,
        is_shutter_installation_completed: true,
        expected_installation_end_date: true,
      },
    });

    if (!lead) {
      return {
        ok: false,
        msg: "Lead not found.",
      };
    }

    // Installer check
    const installerCount = await prisma.installerUserMapping.count({
      where: {
        vendor_id: vendorId,
        lead_id: leadId,
      },
    });

    // Compute readiness
    const isReady =
      lead.is_carcass_installation_completed === true &&
      lead.is_shutter_installation_completed === true &&
      lead.expected_installation_end_date !== null &&
      installerCount > 0;

    return {
      ok: isReady,
      lead,
      installerCount,
      msg: isReady
        ? null
        : this.getInstallationFailMessage(
            lead.is_carcass_installation_completed,
            lead.is_shutter_installation_completed,
            lead.expected_installation_end_date,
            installerCount,
          ),
    };
  }

  private getInstallationFailMessage(
    carcass: boolean | null,
    shutter: boolean | null,
    expectedEnd: Date | null,
    installers: number,
  ) {
    if (!carcass && !shutter)
      return "Carcass and shutter installation is not completed.";
    if (!carcass) return "Carcass installation is not completed.";
    if (!shutter) return "Shutter installation is not completed.";
    if (!expectedEnd)
      return "Expected installation completion date is not set.";
    if (installers === 0)
      return "No installer assigned. Please assign at least one installer.";
    return "Installation requirements not met.";
  }

  private async checkMiscellaneous(vendorId: number, leadId: number) {
    const pending = await prisma.miscellaneousMaster.count({
      where: {
        vendor_id: vendorId,
        lead_id: leadId,
        is_resolved: false,
      },
    });

    return {
      ok: pending === 0,
      msg:
        pending === 0
          ? null
          : "Miscellaneous items are still pending to be resolved.",
    };
  }

  private async checkRequiredDocuments(vendorId: number, leadId: number) {
    const requiredTags = ["Type 25", "Type 26"]; // Final Site + Handover Docs

    const docs = await prisma.leadDocuments.findMany({
      where: {
        vendor_id: vendorId,
        lead_id: leadId,
        is_deleted: false,
        documentType: {
          tag: { in: requiredTags },
        },
      },
      include: {
        documentType: true,
      },
    });

    const uploadedTags = docs.map((d) => d.documentType.tag);
    const missing = requiredTags.filter((tag) => !uploadedTags.includes(tag));

    return {
      ok: missing.length === 0,
      msg:
        missing.length === 0
          ? null
          : "Required final-site and handover documents are missing.",
    };
  }

  async checkLeadReadyForFinalHandover(vendorId: number, leadId: number) {
    // Step 1: Installation Base Conditions
    const base = await this.checkInstallationBaseConditions(vendorId, leadId);
    if (!base.ok)
      return {
        isReady: false,
        message: base.msg,
        step: "installationBase",
      };

    // Step 2: Miscellaneous
    const misc = await this.checkMiscellaneous(vendorId, leadId);
    if (!misc.ok)
      return {
        isReady: false,
        message: misc.msg,
        step: "miscPending",
      };

    // Step 3: Documents
    const docs = await this.checkRequiredDocuments(vendorId, leadId);
    if (!docs.ok)
      return {
        isReady: false,
        message: docs.msg,
        step: "docsMissing",
      };

    return {
      isReady: true,
      message: "Lead is fully ready for usable handover.",
      step: "completed",
    };
  }

  static async resolveMiscellaneousService(payload: {
    vendor_id: number;
    lead_id: number;
    misc_id: number;
    resolved_by: number;
    baseUrl: string;
  }) {
    const { vendor_id, lead_id, misc_id, resolved_by, baseUrl } = payload;

    // ===============================
    // 1️⃣ TRANSACTION LAYER
    // ===============================

    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.miscellaneousMaster.findFirst({
        where: {
          id: misc_id,
          vendor_id,
          lead_id,
        },
        select: {
          id: true,
          account_id: true,
        },
      });

      if (!existing) {
        throw Object.assign(new Error("Miscellaneous entry not found"), {
          statusCode: 404,
        });
      }

      // Mark misc resolved
      await tx.miscellaneousMaster.update({
        where: { id: misc_id },
        data: {
          is_resolved: true,
          resolved_at: new Date(),
          updated_by: resolved_by,
        },
      });

      const miscTaskKey = `[misc:${existing.id}]`;

      // Fetch latest misc task (for deep link)
      const resolvedTask = await tx.userLeadTask.findFirst({
        where: {
          vendor_id,
          lead_id,
          task_type: "Miscellaneous",
          remark: { contains: miscTaskKey },
        },
        orderBy: { id: "desc" },
        select: { id: true },
      });

      return {
        account_id: existing.account_id,
        taskId: resolvedTask?.id,
      };
    });

    // ===============================
    // 2️⃣ COMMUNICATION LAYER
    // ===============================

    try {
      // Resolve Factory Role
      const factoryRole = await prisma.userTypeMaster.findFirst({
        where: {
          user_type: { equals: "factory", mode: "insensitive" },
        },
        select: { id: true },
      });

      if (!factoryRole) return result;

      // Fetch Factory Users
      const factoryUsers = await prisma.leadUserMapping.findMany({
        where: {
          vendor_id,
          lead_id,
          status: "active",
          user: {
            user_type_id: factoryRole.id,
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

      if (!factoryUsers.length) return result;

      // Lead Meta
      const leadMeta = await prisma.leadMaster.findUnique({
        where: { id: lead_id },
        select: {
          lead_code: true,
          firstname: true,
          lastname: true,
          account_id: true,
        },
      });

      const supervisor = await prisma.userMaster.findUnique({
        where: { id: resolved_by },
        select: { user_name: true },
      });

      const leadCode = leadMeta?.lead_code ?? `LEAD-${lead_id}`;
      const leadName =
        `${leadMeta?.firstname ?? ""} ${leadMeta?.lastname ?? ""}`.trim();

      const resolvedAt = new Date().toLocaleString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });

      const redirectPath =
        leadMeta?.account_id && leadMeta.account_id > 0
          ? `/dashboard/leads/details/${lead_id}?accountId=${leadMeta.account_id}&tab=misc&taskId=${result.taskId}`
          : `/dashboard/leads/details/${lead_id}?tab=misc&taskId=${result.taskId}`;

      const projectUrl = `${baseUrl}${redirectPath}`;

      // Broadcast
      await Promise.allSettled(
        factoryUsers.map(async ({ user }) => {
          // 🔔 In-App Notification
          await NotificationService.createAndSend({
            vendor_id,
            user_id: user.id,
            sender_id: resolved_by,
            type: NotificationType.LEAD_ACTION,
            title: "Miscellaneous Requirement Resolved",
            message: `The miscellaneous requirement for ${leadCode} - ${leadName} has been marked Resolved by Site Supervisor.`,
            entity_type: "miscellaneous",
            entity_id: misc_id,
            redirect_url: redirectPath,
          });
        }),
      );
    } catch (err: any) {
      logger.warn("Misc resolved notification failed", {
        misc_id,
        error: err?.message,
      });
    }

    return { ok: true };
  }

  static async markMiscTaskReady(payload: {
    vendor_id: number;
    lead_id: number;
    misc_id: number;
    ready_by: number;
    baseUrl: string;
  }) {
    const { vendor_id, lead_id, misc_id, ready_by, baseUrl } = payload;

    // ===============================
    // 1️⃣ TRANSACTION LAYER
    // ===============================

    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.miscellaneousMaster.findFirst({
        where: {
          id: misc_id,
          vendor_id,
          lead_id,
        },
        select: {
          id: true,
          account_id: true,
          reorder_material_details: true,
          problem_description: true,
        },
      });

      if (!existing) {
        throw Object.assign(new Error("Miscellaneous entry not found"), {
          statusCode: 404,
        });
      }

      const miscTaskKey = `[misc:${existing.id}]`;
      const remarkKey = `${existing.reorder_material_details} - ${existing.problem_description}`;

      // Close misc task
      const updatedTasks = await tx.userLeadTask.updateMany({
        where: {
          vendor_id,
          lead_id,
          account_id: existing.account_id,
          task_type: "Miscellaneous",
          OR: [{ remark: { contains: miscTaskKey } }, { remark: remarkKey }],
          status: "open",
        },
        data: {
          status: "completed",
          closed_by: ready_by,
          closed_at: new Date(),
          updated_by: ready_by,
          updated_at: new Date(),
        },
      });

      // Get closed task id (for deep link)
      const closedTask = await tx.userLeadTask.findFirst({
        where: {
          vendor_id,
          lead_id,
          task_type: "Miscellaneous",
          OR: [{ remark: { contains: miscTaskKey } }, { remark: remarkKey }],
        },
        orderBy: { id: "desc" },
        select: { id: true },
      });

      return {
        account_id: existing.account_id,
        taskId: closedTask?.id,
      };
    });

    // ===============================
    // 2️⃣ COMMUNICATION LAYER
    // ===============================

    try {
      // Resolve Site Supervisor Role
      const supervisorRole = await prisma.userTypeMaster.findFirst({
        where: {
          user_type: { equals: "site-supervisor", mode: "insensitive" },
        },
        select: { id: true },
      });

      if (!supervisorRole) return { ok: true };

      // Fetch Supervisors
      const supervisors = await prisma.leadUserMapping.findMany({
        where: {
          vendor_id,
          lead_id,
          status: "active",
          user: {
            user_type_id: supervisorRole.id,
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

      if (!supervisors.length) return { ok: true };

      // Fetch Lead Meta + First Instance
      const [leadMeta, firstInstance] = await Promise.all([
        prisma.leadMaster.findUnique({
          where: { id: lead_id },
          select: {
            lead_code: true,
            firstname: true,
            lastname: true,
            account_id: true,
            statusType: { select: { tag: true } },
          },
        }),
        prisma.leadProductStructureInstance.findFirst({
          where: { lead_id, vendor_id },
          select: { id: true },
          orderBy: [{ product_structure_id: "asc" }, { quantity_index: "asc" }],
        }),
      ]);

      const leadCode = leadMeta?.lead_code ?? `LEAD-${lead_id}`;
      const leadName =
        `${leadMeta?.firstname ?? ""} ${leadMeta?.lastname ?? ""}`.trim();

      const readyAt = new Date().toLocaleString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });

      // Build Deep Link
      const stageTag = leadMeta?.statusType?.tag;
      const stagePath =
        stageTag && STAGE_PATH_BY_TAG[stageTag]
          ? `${STAGE_PATH_BY_TAG[stageTag]}/${lead_id}`
          : `/dashboard/installation/under-installation/details/${lead_id}`;

      const qp = new URLSearchParams();
      if (leadMeta?.account_id) qp.set("accountId", String(leadMeta.account_id));
      if (firstInstance?.id) qp.set("instance_id", String(firstInstance.id));
      qp.set("tab", "misc");
      if (result.taskId) qp.set("taskId", String(result.taskId));
      const redirectPath = `${stagePath}?${qp.toString()}`;

      const projectUrl = `${baseUrl}${redirectPath}`;

      // Broadcast Notifications
      await Promise.allSettled(
        supervisors.map(async ({ user }) => {
          // 🔔 In-App Notification
          await NotificationService.createAndSend({
            vendor_id,
            user_id: user.id,
            sender_id: ready_by,
            type: NotificationType.LEAD_ACTION,
            title: "Miscellaneous Requirement Ready",
            message: `The factory has marked a miscellaneous requirement as Ready for ${leadCode} - ${leadName}.`,
            entity_type: "miscellaneous",
            entity_id: misc_id,
            redirect_url: redirectPath,
          });

          // 📧 Email Notification
          if (user.user_email) {
            await sendMarkAsReadyEmail({
              vendor_id,
              toEmail: user.user_email,
              toName: user.user_name ?? undefined,
              leadCode,
              leadName,
              readyAt,
              projectUrl,
            });
          }
        }),
      );
    } catch (err: any) {
      logger.warn("Misc Ready notification failed", {
        misc_id,
        error: err?.message,
      });
    }

    return { ok: true };
  }

  static async checkMiscellaneousResolved(vendorId: number, leadId: number) {
    // Count unresolved records
    const unresolvedCount = await prisma.miscellaneousMaster.count({
      where: {
        vendor_id: vendorId,
        lead_id: leadId,
        OR: [{ is_resolved: false }],
      },
    });

    return {
      vendor_id: vendorId,
      lead_id: leadId,
      all_resolved: unresolvedCount === 0,
    };
  }

  /**
   * ✅ Installation Report — fetch all installation-stage leads with misc + issue counts
   * Covers Type 15 (Under Installation), Type 16 (Final Handover), Type 17 (Project Completed)
   */
  static async getInstallationReportData(
    vendorId: number,
    franchiseId: number | null, // null = all franchises
    leadId: number | null,
    fromDate: string | null,
    toDate: string | null,
  ) {
    const INSTALLATION_TAGS = ["Type 15", "Type 16", "Type 17"];

    // Resolve status IDs for all installation tags
    const statuses = await prisma.statusTypeMaster.findMany({
      where: { vendor_id: vendorId, tag: { in: INSTALLATION_TAGS } },
      select: { id: true },
    });

    if (!statuses.length) {
      return [];
    }

    const statusIds = statuses.map((s) => s.id);

    const where: any = {
      vendor_id: vendorId,
      is_deleted: false,
      status_id: { in: statusIds },
    };

    if (franchiseId !== null) {
      where.franchise_id = franchiseId;
    }

    if (leadId !== null) {
      where.id = leadId;
    }

    if (fromDate && toDate) {
      where.actual_installation_start_date = {
        gte: new Date(fromDate),
        lte: new Date(new Date(toDate).setHours(23, 59, 59, 999)),
      };
    }

    const leads = await prisma.leadMaster.findMany({
      where,
      select: {
        id: true,
        lead_code: true,
        firstname: true,
        lastname: true,
        franchise_id: true,
        actual_installation_start_date: true,
        expected_installation_end_date: true,
        actual_installation_completion_at: true,
        carcass_installation_completion_date: true,
        shutter_installation_completion_date: true,
        usable_handover_completed_at: true,
        final_handover_marked_at: true,
        franchise: {
          select: { franchise_name: true },
        },
        _count: {
          select: {
            miscellaneousMaster: true,
            installationIssueLogMaster: true,
          },
        },
      },
      orderBy: { actual_installation_start_date: "asc" },
    });

    return leads.map((lead) => ({
      id: lead.id,
      lead_code: lead.lead_code,
      firstname: lead.firstname,
      lastname: lead.lastname,
      franchise_id: lead.franchise_id,
      franchise_name: lead.franchise?.franchise_name ?? null,
      actual_installation_start_date: lead.actual_installation_start_date,
      expected_installation_end_date: lead.expected_installation_end_date,
      actual_installation_completion_at: lead.actual_installation_completion_at,
      carcass_installation_completion_date: lead.carcass_installation_completion_date,
      shutter_installation_completion_date: lead.shutter_installation_completion_date,
      usable_handover_completed_at: lead.usable_handover_completed_at,
      final_handover_marked_at: lead.final_handover_marked_at,
      misc_count: lead._count.miscellaneousMaster,
      issue_count: lead._count.installationIssueLogMaster,
    }));
  }

  static async getMiscIssueLogReportData(
    vendorId: number,
    franchiseId: number | null,
    leadId: number | null,
    fromDate: string | null,
    toDate: string | null,
  ) {
    const INSTALLATION_TAGS = ["Type 15", "Type 16", "Type 17"];
    const dateFilter =
      fromDate && toDate
        ? {
            gte: new Date(fromDate),
            lte: new Date(new Date(toDate).setHours(23, 59, 59, 999)),
          }
        : undefined;

    const leadWhere = {
      is_deleted: false,
      statusType: {
        tag: { in: INSTALLATION_TAGS },
      },
      ...(leadId !== null ? { id: leadId } : {}),
      ...(franchiseId !== null ? { franchise_id: franchiseId } : {}),
    };
    const splitMiscMaterial = (value: string | null) => {
      const raw = value?.trim() ?? "";
      if (!raw) {
        return {
          instance: "-",
          reorderMaterialType: "-",
        };
      }

      const delimiter = " - ";
      const delimiterIndex = raw.indexOf(delimiter);

      if (delimiterIndex === -1) {
        return {
          instance: "-",
          reorderMaterialType: raw,
        };
      }

      const instance = raw.slice(0, delimiterIndex).trim() || "-";
      const reorderMaterialType =
        raw.slice(delimiterIndex + delimiter.length).trim() || "-";

      return {
        instance,
        reorderMaterialType,
      };
    };

    const miscEntries = await prisma.miscellaneousMaster.findMany({
      where: {
        vendor_id: vendorId,
        ...(dateFilter ? { created_at: dateFilter } : {}),
        lead: leadWhere,
      },
      include: {
        type: {
          select: { name: true },
        },
        teams: {
          include: {
            team: {
              select: { name: true },
            },
          },
        },
        lead: {
          select: {
            lead_code: true,
            firstname: true,
            lastname: true,
            dispatch_date: true,
            franchise: {
              select: {
                franchise_name: true,
              },
            },
          },
        },
      },
      orderBy: { created_at: "asc" },
    });

    const issueLogs = await prisma.installationIssueLogMaster.findMany({
      where: {
        vendor_id: vendorId,
        ...(dateFilter ? { created_at: dateFilter } : {}),
        lead: leadWhere,
      },
      include: {
        issueTypes: {
          include: {
            type: {
              select: { name: true },
            },
          },
        },
        responsibleTeams: {
          include: {
            team: {
              select: { name: true },
            },
          },
        },
        lead: {
          select: {
            lead_code: true,
            firstname: true,
            lastname: true,
            franchise: {
              select: {
                franchise_name: true,
              },
            },
          },
        },
      },
      orderBy: { created_at: "asc" },
    });

    const miscRows = miscEntries.map((entry) => {
      const { instance, reorderMaterialType } = splitMiscMaterial(
        entry.reorder_material_details,
      );

      return {
        row_type: "misc" as const,
        row_id: entry.id,
        lead_id: entry.lead_id,
        lead_code: entry.lead.lead_code,
        client_name: `${entry.lead.firstname} ${entry.lead.lastname}`.trim(),
        franchise_store: entry.lead.franchise?.franchise_name ?? null,
        miscl_issue_type: entry.type.name,
        responsible_team:
          entry.teams.map((team) => team.team.name).join(", ") || "-",
        issue_impact: "-",
        instance,
        reorder_material_type: reorderMaterialType,
        approve_reject_date:
          entry.misc_approved === null ? null : entry.updated_at,
        rtd_date: entry.expected_ready_date,
        dispatch_req_date: entry.required_delivery_date,
        dispatch_date: entry.lead.dispatch_date,
        resolved_date: entry.resolved_at,
        created_at: entry.created_at,
      };
    });

    const issueRows = issueLogs.map((entry) => ({
      row_type: "issue" as const,
      row_id: entry.id,
      lead_id: entry.lead_id,
      lead_code: entry.lead.lead_code,
      client_name: `${entry.lead.firstname} ${entry.lead.lastname}`.trim(),
      franchise_store: entry.lead.franchise?.franchise_name ?? null,
      miscl_issue_type:
        entry.issueTypes.map((issueType) => issueType.type.name).join(", ") ||
        "Issue",
      responsible_team:
        entry.responsibleTeams.map((team) => team.team.name).join(", ") || "-",
      issue_impact: entry.issue_impact ?? "-",
      instance: "-",
      reorder_material_type: "-",
      approve_reject_date: null,
      rtd_date: null,
      dispatch_req_date: null,
      dispatch_date: null,
      resolved_date: null,
      created_at: entry.created_at,
    }));

    return [...miscRows, ...issueRows].sort(
      (a, b) => a.created_at.getTime() - b.created_at.getTime(),
    );
  }
}
