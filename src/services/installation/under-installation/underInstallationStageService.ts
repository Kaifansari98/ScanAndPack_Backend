import { Prisma } from "@prisma/client";
import { prisma } from "../../../prisma/client";
import logger from "../../../utils/logger";
import {
  generateSignedUrl,
  uploadToWasabiUnderInstallationDayWiseDocuments,
} from "../../../utils/wasabiClient";

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
          action: `installation started on : ${actualInstallationStartDate.toISOString()}`,
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
    files: Express.Multer.File[]
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
    // 1️⃣ UPLOAD FILES TO WASABI (OUTSIDE TX)
    // ------------------------------------------
    const uploadedFiles: { sysName: string; originalName: string }[] = [];

    for (const file of files) {
      const sysName = await uploadToWasabiUnderInstallationDayWiseDocuments(
        file.buffer,
        vendorId,
        leadId,
        file.originalname
      );

      uploadedFiles.push({
        sysName,
        originalName: file.originalname,
      });
    }

    // ------------------------------------------
    // 2️⃣ RUN PRISMA TRANSACTION (FAST, SAFE)
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
      for (const file of uploadedFiles) {
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
          action: `Uploaded ${
            files.length
          } Installation Update document(s) for ${updateDate.toDateString()}`,
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
}
