import { Prisma } from "../../../prisma/generated";
import { prisma } from "../../../prisma/client";
import logger from "../../../utils/logger";
import { generateSignedUrl } from "../../../utils/wasabiClient";

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
    updatedBy: number
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

      // 2️⃣ Fetch Under Installation StatusType (Type 15)
      const toStatus = await tx.statusTypeMaster.findFirst({
        where: { vendor_id: vendorId, tag: "Type 15" },
        select: { id: true, type: true },
      });

      if (!toStatus)
        throw new Error(
          `Status 'Type 15' (Under Installation Stage) not found for vendor ${vendorId}`
        );

      // 3️⃣ Update Lead’s Status
      const updatedLead = await tx.leadMaster.update({
        where: { id: lead.id },
        data: {
          status_id: toStatus.id,
          updated_by: updatedBy,
          updated_at: new Date(),
        },
        select: {
          id: true,
          account_id: true,
          vendor_id: true,
          status_id: true,
        },
      });

      // 4️⃣ Add Detailed Log Entry
      const actionMessage = `Lead moved to Under Installation stage.`;

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

      logger.info("[SERVICE] Lead moved to Under Installation Stage", {
        lead_id: lead.id,
        vendor_id: vendorId,
        updated_by: updatedBy,
      });

      return {
        lead_id: lead.id,
        vendor_id: vendorId,
        new_status: toStatus.type,
      };
    });
  }

  /** ✅ Fetch all leads with status = Type 15 (Post-Dispatch Stage) */
  async getLeadsWithStatusUnderInstallationStage(
    vendorId: number,
    userId: number,
    limit = 10,
    page = 1
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
        `under-installation-stage status (Type 15) not found for vendor ${vendorId}`
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
    actualInstallationStartDate: Date
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
        `Lead ${leadId} not found or doesn't belong to vendor ${vendorId}`
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
    installers: { installer_id: number }[]
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
    installers?: { installer_id: number }[]
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
          `expected installation end date → ${expectedEndDate.toISOString()}`
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
    isShutterCompleted?: boolean
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
    files: { originalName: string; sysName: string }[]
  ) {
    if (!vendorId || !leadId || !userId)
      throw Object.assign(
        new Error("vendorId, leadId and userId are required"),
        {
          statusCode: 400,
        }
      );

    // 🔹 Fetch document type (Type 23)
    const docType = await prisma.documentTypeMaster.findFirst({
      where: { vendor_id: vendorId, tag: "Type 23" },
    });

    if (!docType)
      throw Object.assign(
        new Error(
          "Document type (Type 23 – under-installation-day-wise-Documents) not found"
        ),
        { statusCode: 404 }
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
          "inline" // show inline by default
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

    // -----------------------------------------------------
    // 1. Now DB transaction
    // -----------------------------------------------------
    return await prisma.$transaction(async (tx) => {
      // Create Misc entry
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

      // Determine factory assignee for this lead (if any)
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

      const leadStageRecord = await tx.leadMaster.findUnique({
        where: { id: lead_id },
        select: { status_id: true },
      });
      const leadStage = leadStageRecord?.status_id
        ? (
            await tx.statusTypeMaster.findUnique({
              where: { id: leadStageRecord.status_id },
              select: { type: true },
            })
          )?.type ?? null
        : null;

      const miscRemark = `**${reorder_material_details}** - ${problem_description}`;

      await tx.userLeadTask.create({
        data: {
          vendor_id,
          lead_id,
          account_id,
          user_id: factoryAssigneeId ?? created_by,
          task_type: "Miscellaneous",
          lead_stage: leadStage,
          // due_date cannot be null in schema; use expected date when provided else now.
          due_date: expected_ready_date
            ? new Date(expected_ready_date)
            : new Date(),
          remark: miscRemark,
          status: "open",
          created_by,
        },
      });

      // Insert teams
      if (teams.length > 0) {
        await tx.miscellaneousTeamMapping.createMany({
          data: teams.map((teamId) => ({
            miscellaneous_id: misc.id,
            team_id: teamId,
          })),
        });
      }

      // 🔹 Fetch document type (Type 24)
      const docType = await prisma.documentTypeMaster.findFirst({
        where: { vendor_id: vendor_id, tag: "Type 24" },
      });

      if (!docType)
        throw Object.assign(
          new Error(
            "Document type (Type 24 – under-installation-miscellaneous-Documents) not found"
          ),
          { statusCode: 404 }
        );

      // Insert Documents → LeadDocuments + MiscDocuments
      for (const doc of files) {
        const leadDoc = await tx.leadDocuments.create({
          data: {
            doc_og_name: doc.originalName,
            doc_sys_name: doc.sysName,
            vendor_id,
            lead_id,
            created_by,
            doc_type_id: docType.id, // Type 24 → under-installation-miscellaneous-Documents
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

      return misc;
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
        status: "open",
      },
      select: { id: true, task_type: true, remark: true },
    });

    // ➜ Attach signed URLs for documents
    const finalResult = await Promise.all(
      miscList.map(async (m) => {
        const docs = await Promise.all(
          m.documents.map(async (docLink) => {
            const signed_url = await generateSignedUrl(
              docLink.document.doc_sys_name
            );

            return {
              document_id: docLink.document.id,
              original_name: docLink.document.doc_og_name,
              file_key: docLink.document.doc_sys_name,
              signed_url,
              uploaded_at: docLink.document.created_at,
            };
          })
        );

        const remarkKey = `**${m.reorder_material_details}** - ${m.problem_description}`;
        const taskForMisc = miscTasks.find((t) => t.remark === remarkKey);

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
            ? { id: taskForMisc.id, task_type: taskForMisc.task_type }
            : null,
        };
      })
    );

    return finalResult;
  }

  static async updateERDService({
    vendor_id,
    misc_id,
    expected_ready_date,
    updated_by,
  }: UpdateERDInput) {
    // Ensure Misc entry exists & belongs to vendor
    const existing = await prisma.miscellaneousMaster.findFirst({
      where: { id: misc_id, vendor_id },
    });

    if (!existing) {
      throw new Error("Miscellaneous record not found");
    }

    // Update only the ERD
    const updated = await prisma.miscellaneousMaster.update({
      where: { id: misc_id },
      data: {
        expected_ready_date: new Date(expected_ready_date),
        updated_by,
      },
    });

    return updated;
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
    }
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
            is_deleted: false
          },
        })
      : [];

    const handoverDocuments = handoverDocType
      ? await prisma.leadDocuments.findMany({
          where: {
            vendor_id,
            lead_id,
            doc_type_id: handoverDocType.id,
            is_deleted: false
          },
        })
      : [];

    // 4️⃣ Attach Signed URLs
    const finalSitePhotosWithUrl = await Promise.all(
      finalSitePhotos.map(async (doc) => ({
        ...doc,
        signedUrl: await generateSignedUrl(doc.doc_sys_name),
      }))
    );

    const handoverDocumentsWithUrl = await Promise.all(
      handoverDocuments.map(async (doc) => ({
        ...doc,
        signedUrl: await generateSignedUrl(
          doc.doc_sys_name,
          3600,
          "attachment"
        ),
      }))
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
    pending_work_details: string
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
    updatedBy: number
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

      // 2️⃣ Fetch Final Handover StatusType (Type 16)
      const toStatus = await tx.statusTypeMaster.findFirst({
        where: { vendor_id: vendorId, tag: "Type 16" },
        select: { id: true, type: true },
      });

      if (!toStatus)
        throw new Error(
          `Status 'Type 16' (Final Handover Stage) not found for vendor ${vendorId}`
        );

      // 3️⃣ Update Lead’s Status
      const updatedLead = await tx.leadMaster.update({
        where: { id: lead.id },
        data: {
          status_id: toStatus.id,
          updated_by: updatedBy,
          updated_at: new Date(),
        },
        select: {
          id: true,
          account_id: true,
          vendor_id: true,
          status_id: true,
        },
      });

      // 4️⃣ Add Detailed Log Entry
      const actionMessage = `Lead moved to Final Handover stage.`;

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

      logger.info("[SERVICE] Lead moved to Final Handover Stage", {
        lead_id: lead.id,
        vendor_id: vendorId,
        updated_by: updatedBy,
      });

      return {
        lead_id: lead.id,
        vendor_id: vendorId,
        new_status: toStatus.type,
      };
    });
  }

  /**
   * ✔ Checks:
   * 1. Carcass completion flag
   * 2. Expected end date filled
   * 3. At least one installer assigned
   */
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

  /** 🔥 Fully Independent Carcass + Installer + End Date Check */
  private async checkInstallationBaseConditions(
    vendorId: number,
    leadId: number
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
            installerCount
          ),
    };
  }

  /** 🔥 Custom descriptive message for base installation check */
  private getInstallationFailMessage(
    carcass: boolean | null,
    shutter: boolean | null,
    expectedEnd: Date | null,
    installers: number
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

  /** 🔥 Check Miscellaneous */
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

  /** 🔥 Check Required Documents */
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

  /** 🔥 MASTER FUNCTION — fully independent */
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

    return prisma.$transaction(async (tx) => {
      // Validate entry exists & belongs to vendor + lead
      const existing = await tx.miscellaneousMaster.findFirst({
        where: {
          id: misc_id,
          vendor_id,
          lead_id,
        },
      });

      if (!existing) {
        throw Object.assign(new Error("Miscellaneous entry not found"), {
          statusCode: 404,
        });
      }

      // Update entry to resolved
      const updated = await tx.miscellaneousMaster.update({
        where: { id: misc_id },
        data: {
          is_resolved: true,
          resolved_at: new Date(),
          updated_by: resolved_by,
        },
      });

      // Mark the corresponding Miscellaneous task as completed (if present)
      const miscRemark = `**${existing.reorder_material_details}** - ${existing.problem_description}`;

      await tx.userLeadTask.updateMany({
        where: {
          vendor_id,
          lead_id,
          account_id: existing.account_id,
          task_type: "Miscellaneous",
          remark: miscRemark,
          status: "open",
        },
        data: {
          status: "completed",
          closed_by: resolved_by,
          closed_at: new Date(),
          updated_by: resolved_by,
          updated_at: new Date(),
        },
      });

      return updated;
    });
  }
}
