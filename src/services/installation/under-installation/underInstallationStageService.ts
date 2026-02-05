import { Prisma } from "../../../prisma/generated";
import { prisma } from "../../../prisma/client";
import logger from "../../../utils/logger";
import { generateSignedUrl } from "../../../utils/wasabiClient";
import { NotificationService } from "../../../../src/services/notification/notification.service";
import { NotificationType } from "../../../prisma/generated";
import {
  sendMiscERDUpdatedEmail,
  sendMiscRequirementEmail,
  sendMarkAsReadyEmail,
  sendMiscResolvedEmail,
  sendFinalHandoverEmail,
  sendLeadMovedToUnderInstallationEmail,
} from "../../../../src/services/email/brevoEmail.service";
import { sendUnderInstallationAssignedEmail } from "../../../../src/services/email/brevoEmail2.service";

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
}

interface UpdateERDInput {
  vendor_id: number;
  misc_id: number;
  expected_ready_date: string;
  updated_by: number;
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
  /**
   * ✅ Move Lead to Under Installation Stage (Type 15)
   */
  static async moveLeadToUnderInstallation(
    vendorId: number,
    leadId: number,
    updatedBy: number,
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

      // 4️⃣ Activity Log
      await tx.leadDetailedLogs.create({
        data: {
          vendor_id: vendorId,
          lead_id: lead.id,
          account_id: lead.account_id!,
          action: "Lead moved to Under Installation stage.",
          action_type: "UPDATE",
          created_by: updatedBy,
        },
      });

      return updatedLead;
    });

    // ===============================
    // UNDER INSTALLATION NOTIFICATION
    // ===============================

    try {
      const actorId = updatedBy;

      const [lead, actor] = await Promise.all([
        prisma.leadMaster.findUnique({
          where: { id: leadId },
          select: {
            firstname: true,
            lastname: true,
            lead_code: true,
            vendor_id: true,
            account_id: true,
          },
        }),

        prisma.userMaster.findUnique({
          where: { id: actorId },
          select: { user_name: true },
        }),
      ]);

      if (!lead) return result;

      const leadName = `${lead.firstname ?? ""} ${lead.lastname ?? ""}`.trim();

      const leadCode =
        lead.lead_code ?? `LEAD-${String(leadId).padStart(4, "0")}`;

      const dispatchedBy = actor?.user_name ?? "System";

      const dispatchedAt = new Date().toLocaleString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });

      const baseUrl =
        process.env.CLIENT_BASE_URL ||
        process.env.FRONTEND_URL ||
        "http://localhost:3000";

      const redirectPath = lead.account_id
        ? `/dashboard/leads/details/${leadId}?accountId=${lead.account_id}`
        : `/dashboard/leads/details/${leadId}`;

      const projectUrl = `${baseUrl}${redirectPath}`;

      // Fetch Admin Users
      const admins = await prisma.userMaster.findMany({
        where: {
          vendor_id: lead.vendor_id,
          status: "active",
          user_type: {
            user_type: { in: ["admin"] },
          },
        },
        select: {
          id: true,
          user_name: true,
          user_email: true,
        },
      });

      // Notify Each Admin
      for (const admin of admins) {
        if (admin.id === actorId) continue;

        // 🔔 In-App Notification
        await NotificationService.createAndSend({
          vendor_id: lead.vendor_id,
          user_id: admin.id,
          sender_id: actorId,
          type: NotificationType.LEAD_MILESTONE,
          title: "Lead Moved To Under Installation",
          message: `${leadCode} - ${leadName} moved to Under Installation stage by ${dispatchedBy}.`,
          entity_type: "lead",
          entity_id: leadId,
          redirect_url: redirectPath,
        });

        // 📧 Email Notification
        if (!admin.user_email) continue;

        await sendLeadMovedToUnderInstallationEmail({
          vendor_id: lead.vendor_id,
          toEmail: admin.user_email,
          toName: admin.user_name,
          leadCode,
          leadName,
          dispatchedBy,
          dispatchedAt,
          projectUrl,
        });
      }

      // ===============================
      // SITE SUPERVISOR NOTIFICATION
      // ===============================

      const siteSupervisorMapping = await prisma.leadUserMapping.findFirst({
        where: {
          lead_id: leadId,
          vendor_id: lead.vendor_id,
          status: "active",
          user: {
            user_type: {
              user_type: {
                equals: "site-supervisor",
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

      if (siteSupervisorMapping?.user) {
        const supervisor = siteSupervisorMapping.user;

        // 🔔 IN-APP (OPTIONAL BUT RECOMMENDED)
        await NotificationService.createAndSend({
          vendor_id: lead.vendor_id,
          user_id: supervisor.id,
          sender_id: actorId,
          type: NotificationType.LEAD_MILESTONE,
          title: "Lead Assigned For Installation",
          message: `${leadCode} - ${leadName} is now Under Installation.`,
          entity_type: "lead",
          entity_id: leadId,
          redirect_url: redirectPath,
        });

        // 📧 EMAIL (YOUR REQUIREMENT)
        if (supervisor.user_email) {
          await sendUnderInstallationAssignedEmail({
            vendor_id: lead.vendor_id,
            toEmail: supervisor.user_email,
            toName: supervisor.user_name,
            leadCode,
            leadName,
            dispatchedBy,
            dispatchedAt,
            projectUrl,
          });
        }
      }
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
      await tx.leadDetailedLogs.create({
        data: {
          vendor_id: vendorId,
          lead_id: lead.id,
          account_id: lead.account_id!,
          action: `Installation has been started`,
          action_type: "UPDATE",
          created_by: updatedBy,
          created_at: new Date(),
        },
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

      // 5️⃣ Log action in detailed logs
      await tx.leadDetailedLogs.create({
        data: {
          vendor_id: vendorId,
          lead_id: lead.id,
          account_id: lead.account_id!,
          action: `Set expected installation end date (${expectedEndDate.toISOString()}) & added ${
            installers.length
          } installer(s)`,
          action_type: "UPDATE",
          created_by: updatedBy,
          created_at: new Date(),
        },
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
        await tx.leadMaster.update({
          where: { id: lead.id },
          data: {
            expected_installation_end_date: expectedEndDate,
            updated_by: updatedBy,
            updated_at: new Date(),
          },
        });
        updates.push(
          `expected installation end date → ${expectedEndDate.toISOString()}`,
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

      await tx.leadDetailedLogs.create({
        data: {
          vendor_id: vendorId,
          lead_id: lead.id,
          account_id: lead.account_id!,
          action: actionMessage,
          action_type: "UPDATE",
          created_by: updatedBy,
          created_at: new Date(),
        },
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

      await tx.leadDetailedLogs.create({
        data: {
          vendor_id: vendorId,
          lead_id: lead.id,
          account_id: lead.account_id!,
          action: logMessage,
          action_type: "UPDATE",
          created_by: updatedBy,
          created_at: new Date(),
        },
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
      await tx.leadDetailedLogs.create({
        data: {
          vendor_id: vendorId,
          lead_id: leadId,
          account_id: finalAccountId,
          action: `Uploaded ${files.length} Installation Update document(s) for ${updateDate.toDateString()}`,
          action_type: "UPLOAD",
          created_by: userId,
          created_at: new Date(),
        },
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
      where: { vendor_id: vendorId, lead_id: leadId },
      include: {
        documents: {
          include: {
            document: true, // LeadDocuments
          },
        },
      },
      orderBy: { update_date: "desc" },
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

      let factoryAssigneeId: number | null = null;

      const factoryType = await tx.userTypeMaster.findFirst({
        where: {
          user_type: { equals: "factory", mode: "insensitive" },
        },
        select: { id: true },
      });

      if (factoryType) {
        const factoryMapping = await tx.leadUserMapping.findFirst({
          where: {
            vendor_id,
            lead_id,
            status: "active",
            user: { user_type_id: factoryType.id },
          },
          select: { user_id: true },
        });

        factoryAssigneeId = factoryMapping?.user_id ?? null;
      }

      // -----------------------------
      // Lead Stage Resolution
      // -----------------------------

      const leadStageRecord = await tx.leadMaster.findUnique({
        where: { id: lead_id },
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

      // -----------------------------
      // Task Creation
      // -----------------------------

      const miscRemark = `[misc:${misc.id}] **${reorder_material_details}** - ${problem_description}`;

      const task = await tx.userLeadTask.create({
        data: {
          vendor_id,
          lead_id,
          account_id,
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

      const leadMeta = await prisma.leadMaster.findUnique({
        where: { id: lead_id },
        select: {
          lead_code: true,
          firstname: true,
          lastname: true,
          account_id: true,
        },
      });

      const creator = await prisma.userMaster.findUnique({
        where: { id: created_by },
        select: { user_name: true },
      });

      const leadCode = leadMeta?.lead_code ?? `LEAD-${lead_id}`;
      const leadName =
        `${leadMeta?.firstname ?? ""} ${leadMeta?.lastname ?? ""}`.trim();

      const assignedAt = new Date().toLocaleString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });

      // -----------------------------
      // Build Deep-Link Redirect URL
      // -----------------------------

      const baseUrl =
        process.env.CLIENT_BASE_URL ||
        process.env.FRONTEND_URL ||
        "http://localhost:3000";

      const redirectPath =
        leadMeta?.account_id && leadMeta.account_id > 0
          ? `/dashboard/leads/details/${lead_id}?accountId=${leadMeta.account_id}&tab=misc&taskId=${misc.taskId}`
          : `/dashboard/leads/details/${lead_id}?tab=misc&taskId=${misc.taskId}`;

      const projectUrl = `${baseUrl}${redirectPath}`;

      // ===============================
      // Broadcast Notification + Email
      // ===============================

      await Promise.allSettled(
        factoryUsers.map(async ({ user }) => {
          // 🔔 In-App Notification
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

          // 📧 Email Notification
          if (!user.user_email) return;

          await sendMiscRequirementEmail({
            vendor_id,
            toEmail: user.user_email,
            toName: user.user_name ?? undefined,
            leadCode,
            leadName,
            assignedBy: creator?.user_name ?? "Sales Team",
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
            document: true,
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
      select: { id: true, task_type: true, remark: true, status: true },
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
              signed_url,
              uploaded_at: docLink.document.created_at,
            };
          }),
        );

        const remarkKey = `**${m.reorder_material_details}** - ${m.problem_description}`;
        const miscTaskKey = `[misc:${m.id}]`;
        const taskForMisc = miscTasks.find(
          (t) =>
            (t.remark && t.remark.includes(miscTaskKey)) ||
            t.remark === remarkKey,
        );

        return {
          id: m.id,
          vendor_id: m.vendor_id,
          lead_id: m.lead_id,
          account_id: m.account_id,
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
        };
      }),
    );

    return finalResult;
  }

  static async updateERDService({
    vendor_id,
    misc_id,
    expected_ready_date,
    updated_by,
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
        },
      });

      if (!existing) {
        throw new Error("Miscellaneous record not found");
      }

      const updated = await tx.miscellaneousMaster.update({
        where: { id: misc_id },
        data: {
          expected_ready_date: new Date(expected_ready_date),
          updated_by,
        },
      });

      const miscTaskKey = `[misc:${existing.id}]`;

      const existingTask = await tx.userLeadTask.findFirst({
        where: {
          vendor_id,
          lead_id: existing.lead_id,
          task_type: "Miscellaneous",
          remark: { contains: miscTaskKey },
        },
        select: { id: true },
      });

      let taskId: number;

      if (existingTask) {
        await tx.userLeadTask.update({
          where: { id: existingTask.id },
          data: {
            due_date: new Date(expected_ready_date),
            remark: `${miscTaskKey} ERD date updated.`,
            updated_by,
          },
        });

        taskId = existingTask.id;
      } else {
        const newTask = await tx.userLeadTask.create({
          data: {
            vendor_id,
            lead_id: existing.lead_id,
            account_id: existing.account_id,
            task_type: "Miscellaneous",
            user_id: updated_by,
            due_date: new Date(expected_ready_date),
            remark: miscTaskKey,
            status: "open",
            created_by: updated_by,
          },
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

      const leadMeta = await prisma.leadMaster.findUnique({
        where: { id: result.lead_id },
        select: {
          lead_code: true,
          firstname: true,
          lastname: true,
          account_id: true,
        },
      });

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

      const baseUrl =
        process.env.CLIENT_BASE_URL ||
        process.env.FRONTEND_URL ||
        "http://localhost:3000";

      const redirectPath =
        leadMeta?.account_id && leadMeta.account_id > 0
          ? `/dashboard/leads/details/${result.lead_id}?accountId=${leadMeta.account_id}&tab=misc&taskId=${result.taskId}`
          : `/dashboard/leads/details/${result.lead_id}?tab=misc&taskId=${result.taskId}`;

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
            title: "Miscellaneous Fulfillment Date Updated",
            message: `Factory has updated the fulfillment date for a miscellaneous requirement on ${leadCode} - ${leadName}. Expected Date: ${fulfillmentDate}`,
            entity_type: "miscellaneous",
            entity_id: misc_id,
            redirect_url: redirectPath,
          });

          // 📧 Email
          if (!user.user_email) return;

          await sendMiscERDUpdatedEmail({
            vendor_id,
            toEmail: user.user_email,
            toName: user.user_name ?? undefined,
            leadCode,
            leadName,
            fulfillmentDate,
            projectUrl,
          });
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
      select: { usable_handover_pending_work_details: true },
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
      final_site_photos: finalSitePhotosWithUrl,
      handover_documents: handoverDocumentsWithUrl,
    };
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
          updated_by: updatedBy,
          updated_at: new Date(),
        },
      });

      // Detailed Log
      await tx.leadDetailedLogs.create({
        data: {
          vendor_id: vendorId,
          lead_id: lead.id,
          account_id: lead.account_id!,
          action: "Lead moved to Final Handover stage.",
          action_type: "UPDATE",
          created_by: updatedBy,
          created_at: new Date(),
        },
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
      // Sales + Admin Roles
      const targetRoles = await prisma.userTypeMaster.findMany({
        where: {
          user_type: {
            in: ["sales-executive", "admin"],
            mode: "insensitive",
          },
        },
        select: { id: true },
      });

      if (!targetRoles.length) return result;

      const roleIds = targetRoles.map((r) => r.id);

      // Fetch Receivers
      const receivers = await prisma.leadUserMapping.findMany({
        where: {
          vendor_id: vendorId,
          lead_id: leadId,
          status: "active",
          user: {
            user_type_id: { in: roleIds },
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

      if (!receivers.length) return result;

      // Lead Meta
      const leadMeta = await prisma.leadMaster.findUnique({
        where: { id: leadId },
        select: {
          lead_code: true,
          firstname: true,
          lastname: true,
          account_id: true,
        },
      });

      const leadCode = leadMeta?.lead_code ?? `LEAD-${leadId}`;
      const leadName =
        `${leadMeta?.firstname ?? ""} ${leadMeta?.lastname ?? ""}`.trim();

      // Deep Link (Final Handover Tab)
      const baseUrl =
        process.env.CLIENT_BASE_URL ||
        process.env.FRONTEND_URL ||
        "http://localhost:3000";

      const redirectPath =
        leadMeta?.account_id && leadMeta.account_id > 0
          ? `/dashboard/leads/details/${leadId}?accountId=${leadMeta.account_id}`
          : `/dashboard/leads/details/${leadId}`;

      const projectUrl = `${baseUrl}${redirectPath}`;

      // Broadcast
      await Promise.allSettled(
        receivers.map(async ({ user }) => {
          // 🔔 In-App Notification
          await NotificationService.createAndSend({
            vendor_id: vendorId,
            user_id: user.id,
            sender_id: updatedBy,
            type: NotificationType.LEAD_ACTION,
            title: "Lead Moved to Final Handover",
            message: `${leadCode} - ${leadName} has been moved to the Final Handover stage.`,
            entity_type: "lead",
            entity_id: leadId,
            redirect_url: redirectPath,
          });

          // 📧 Email
          if (!user.user_email) return;

          await sendFinalHandoverEmail({
            vendor_id: vendorId,
            toEmail: user.user_email,
            toName: user.user_name ?? undefined,
            leadCode,
            leadName,
            projectUrl,
          });
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
  }) {
    const { vendor_id, lead_id, misc_id, resolved_by } = payload;

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
        hour: "2-digit",
        minute: "2-digit",
      });

      // Deep Link
      const baseUrl =
        process.env.CLIENT_BASE_URL ||
        process.env.FRONTEND_URL ||
        "http://localhost:3000";

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

          // 📧 Email
          if (!user.user_email) return;

          await sendMiscResolvedEmail({
            vendor_id,
            toEmail: user.user_email,
            toName: user.user_name ?? undefined,
            leadCode,
            leadName,
            resolvedBy: supervisor?.user_name ?? "Site Supervisor",
            resolvedAt,
            projectUrl,
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
  }) {
    const { vendor_id, lead_id, misc_id, ready_by } = payload;

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

      // Close misc task
      const updatedTasks = await tx.userLeadTask.updateMany({
        where: {
          vendor_id,
          lead_id,
          account_id: existing.account_id,
          task_type: "Miscellaneous",
          remark: { contains: miscTaskKey },
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
          remark: { contains: miscTaskKey },
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

      // Fetch Lead Meta
      const leadMeta = await prisma.leadMaster.findUnique({
        where: { id: lead_id },
        select: {
          lead_code: true,
          firstname: true,
          lastname: true,
          account_id: true,
        },
      });

      const leadCode = leadMeta?.lead_code ?? `LEAD-${lead_id}`;
      const leadName =
        `${leadMeta?.firstname ?? ""} ${leadMeta?.lastname ?? ""}`.trim();

      const readyAt = new Date().toLocaleString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });

      // Build Deep Link
      const baseUrl =
        process.env.CLIENT_BASE_URL ||
        process.env.FRONTEND_URL ||
        "http://localhost:3000";

      const redirectPath =
        leadMeta?.account_id && leadMeta.account_id > 0
          ? `/dashboard/leads/details/${lead_id}?accountId=${leadMeta.account_id}&tab=misc&taskId=${result.taskId}`
          : `/dashboard/leads/details/${lead_id}?tab=misc&taskId=${result.taskId}`;

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

          // 📧 Email
          if (!user.user_email) return;

          await sendMarkAsReadyEmail({
            vendor_id,
            toEmail: user.user_email,
            toName: user.user_name ?? undefined,
            leadCode,
            leadName,
            readyAt,
            projectUrl,
          });
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
}
