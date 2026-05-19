import { prisma } from "../../../prisma/client";
import { createLeadLog } from "../../../utils/leadDetailedLog";
import { generateSignedUrl } from "../../../utils/wasabiClient";

export class ServicingService {
  private readonly amcDocType = "AMC-contract-Documents";
  private readonly amcDocTag = "Type 39";
  private readonly completionDocType = "servicing-complition-Documents";
  private readonly completionDocTag = "Type 40";

  private formatDateTimeInIndia(date: Date) {
    return new Intl.DateTimeFormat("en-IN", {
      timeZone: "Asia/Kolkata",
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  }

  private formatServiceLogLabel(serviceType: "free" | "amc", serviceNo: number) {
    const ordinal =
      serviceNo === 1 ? "1st" : serviceNo === 2 ? "2nd" : serviceNo === 3 ? "3rd" : `${serviceNo}th`;
    return serviceType === "amc" ? `AMC ${ordinal} Service` : `${ordinal} Service`;
  }

  private async createAmcSchedulesIfEligible(
    tx: Pick<
      typeof prisma,
      "leadMaster" | "leadServiceSchedule" | "leadDetailedLogs"
    >,
    vendorId: number,
    leadId: number,
    completedBy: number,
    service: {
      account_id: number;
      service_no: number;
      service_type: "free" | "amc";
    },
    completedAt: Date,
  ) {
    if (service.service_type !== "free" || service.service_no !== 3) {
      return;
    }

    const lead = await tx.leadMaster.findFirst({
      where: {
        id: leadId,
        vendor_id: vendorId,
        is_deleted: false,
      },
      select: {
        id: true,
        account_id: true,
        is_amc_opted: true,
      },
    });

    if (!lead?.is_amc_opted) {
      return;
    }

    const createdSchedules: Array<{ service_no: number; scheduled_for: Date }> = [];

    for (const serviceNo of [1, 2, 3]) {
      const existing = await tx.leadServiceSchedule.findFirst({
        where: {
          vendor_id: vendorId,
          lead_id: leadId,
          service_type: "amc",
          service_no: serviceNo,
        },
        select: { id: true },
      });

      if (existing) {
        continue;
      }

      const scheduledFor = this.addMonthsPreservingDay(completedAt, serviceNo * 4);

      await tx.leadServiceSchedule.create({
        data: {
          vendor_id: vendorId,
          lead_id: leadId,
          account_id: service.account_id,
          service_no: serviceNo,
          service_type: "amc",
          scheduled_for: scheduledFor,
          original_scheduled_for: scheduledFor,
          created_by: completedBy,
          updated_by: completedBy,
        },
      });

      createdSchedules.push({
        service_no: serviceNo,
        scheduled_for: scheduledFor,
      });
    }

    if (!createdSchedules.length) {
      return;
    }

    await tx.leadMaster.update({
      where: { id: leadId },
      data: {
        amc_plan_started_at: createdSchedules[0]?.scheduled_for ?? null,
        amc_plan_closed_at:
          createdSchedules[createdSchedules.length - 1]?.scheduled_for ?? null,
        updated_by: completedBy,
        updated_at: completedAt,
      },
    });

    const scheduleSummary = createdSchedules
      .map(
        (item) =>
          `${this.formatServiceLogLabel("amc", item.service_no)} scheduled for ${this.formatDateTimeInIndia(item.scheduled_for)}`,
      )
      .join(", ");

    await createLeadLog(tx, {
      vendor_id: vendorId,
      lead_id: leadId,
      account_id: service.account_id,
      action: `AMC service schedule created after 3rd free service completion. ${scheduleSummary}.`,
      action_type: "UPDATE",
      created_by: completedBy,
      created_at: completedAt,
    });
  }

  private addMonthsPreservingDay(date: Date, monthsToAdd: number) {
    const source = new Date(date);
    const originalDay = source.getDate();
    const result = new Date(source);

    result.setMonth(result.getMonth() + monthsToAdd);

    if (result.getDate() !== originalDay) {
      result.setDate(0);
    }

    return result;
  }

  private async getValidatedUserRole(
    tx: Pick<typeof prisma, "userMaster">,
    vendorId: number,
    userId: number,
  ) {
    const user = await tx.userMaster.findFirst({
      where: {
        id: userId,
        vendor_id: vendorId,
        status: "active",
      },
      select: {
        id: true,
        user_name: true,
        user_type: {
          select: {
            user_type: true,
          },
        },
      },
    });

    if (!user) {
      throw Object.assign(new Error("User not found"), { statusCode: 404 });
    }

    return user.user_type?.user_type?.toLowerCase() ?? "";
  }

  async getServiceSchedules(vendorId: number, leadId: number) {
    if (!vendorId || !leadId) {
      throw Object.assign(new Error("vendorId and leadId are required"), {
        statusCode: 400,
      });
    }

    const schedules = await prisma.leadServiceSchedule.findMany({
      where: {
        vendor_id: vendorId,
        lead_id: leadId,
      },
      orderBy: [{ service_type: "asc" }, { service_no: "asc" }],
      select: {
        id: true,
        vendor_id: true,
        lead_id: true,
        account_id: true,
        service_no: true,
        service_type: true,
        scheduled_for: true,
        original_scheduled_for: true,
        status: true,
        rescheduled_once: true,
        rescheduled_from: true,
        completed_by: true,
        completed_at: true,
        completion_remark: true,
        completion_document_id: true,
        rejected_at: true,
        rejection_remark: true,
        closure_reason: true,
        created_by: true,
        created_at: true,
        updated_by: true,
        updated_at: true,
        createdBy: {
          select: {
            id: true,
            user_name: true,
            user_type: {
              select: {
                user_type: true,
              },
            },
          },
        },
        updatedBy: {
          select: {
            id: true,
            user_name: true,
          },
        },
        completedBy: {
          select: {
            id: true,
            user_name: true,
          },
        },
        rejectedBy: {
          select: {
            id: true,
            user_name: true,
          },
        },
        completionDocument: {
          select: {
            id: true,
            doc_og_name: true,
            doc_sys_name: true,
            created_at: true,
          },
        },
      },
    });

    return Promise.all(
      schedules.map(async (schedule) => {
        const completionLog =
          schedule.status === "completed"
            ? await prisma.leadDetailedLogs.findFirst({
                where: {
                  vendor_id: vendorId,
                  lead_id: leadId,
                  account_id: schedule.account_id,
                  created_at: schedule.completed_at ?? undefined,
                  created_by: schedule.completed_by ?? undefined,
                },
                include: {
                  docLogs: {
                    include: {
                      doc: true,
                    },
                  },
                },
                orderBy: {
                  created_at: "desc",
                },
              })
            : null;

        const completionDocuments = completionLog
          ? await Promise.all(
              completionLog.docLogs.map(async (docLog) => ({
                id: docLog.doc.id,
                doc_og_name: docLog.doc.doc_og_name,
                doc_sys_name: docLog.doc.doc_sys_name,
                created_at: docLog.doc.created_at,
                signed_url: await generateSignedUrl(
                  docLog.doc.doc_sys_name,
                  3600,
                  "inline",
                ),
              })),
            )
          : [];

        return {
          ...schedule,
          completionDocument: schedule.completionDocument
            ? {
                ...schedule.completionDocument,
                signed_url: await generateSignedUrl(
                  schedule.completionDocument.doc_sys_name,
                  3600,
                  "inline",
                ),
              }
            : null,
          completionDocuments,
        };
      }),
    );
  }

  async rescheduleService(
    vendorId: number,
    leadId: number,
    serviceId: number,
    updatedBy: number,
  ) {
    if (!vendorId || !leadId || !serviceId || !updatedBy) {
      throw Object.assign(
        new Error("vendorId, leadId, serviceId, and updatedBy are required"),
        { statusCode: 400 },
      );
    }

    return prisma.$transaction(async (tx) => {
      const service = await tx.leadServiceSchedule.findFirst({
        where: {
          id: serviceId,
          vendor_id: vendorId,
          lead_id: leadId,
        },
        select: {
          id: true,
          account_id: true,
          service_no: true,
          service_type: true,
          status: true,
          scheduled_for: true,
          rescheduled_once: true,
        },
      });

      if (!service) {
        throw Object.assign(new Error("Service schedule not found"), {
          statusCode: 404,
        });
      }

      if (service.status !== "open") {
        throw Object.assign(
          new Error("Only pending services can be rescheduled"),
          { statusCode: 400 },
        );
      }

      if (service.rescheduled_once) {
        throw Object.assign(
          new Error("This service has already been rescheduled once"),
          { statusCode: 400 },
        );
      }

      const currentScheduledFor = new Date(service.scheduled_for);
      const nextScheduledFor = this.addMonthsPreservingDay(
        currentScheduledFor,
        1,
      );

      const updatedService = await tx.leadServiceSchedule.update({
        where: { id: service.id },
        data: {
          scheduled_for: nextScheduledFor,
          rescheduled_once: true,
          rescheduled_from: currentScheduledFor,
          updated_by: updatedBy,
          updated_at: new Date(),
        },
        select: {
          id: true,
          service_no: true,
          scheduled_for: true,
          rescheduled_once: true,
          rescheduled_from: true,
        },
      });

      const taskTypeByServiceNo: Record<number, string> = {
        1: "1st Servicing",
        2: "2nd Servicing",
        3: "3rd Servicing",
      };

      const taskType = taskTypeByServiceNo[service.service_no];

      if (taskType && service.service_type === "free") {
        await tx.userLeadTask.updateMany({
          where: {
            vendor_id: vendorId,
            lead_id: leadId,
            account_id: service.account_id,
            task_type: taskType,
            lead_stage: "servicing-stage",
            status: "open",
            due_date: currentScheduledFor,
          },
          data: {
            due_date: nextScheduledFor,
            updated_by: updatedBy,
            updated_at: new Date(),
          },
        });
      }

      await createLeadLog(tx, {
        vendor_id: vendorId,
        lead_id: leadId,
        account_id: service.account_id,
        action: `${this.formatServiceLogLabel(service.service_type, service.service_no)} rescheduled from ${this.formatDateTimeInIndia(
          currentScheduledFor,
        )} to ${this.formatDateTimeInIndia(nextScheduledFor)}.`,
        action_type: "UPDATE",
        created_by: updatedBy,
        created_at: new Date(),
      });

      return updatedService;
    });
  }

  async rejectService(
    vendorId: number,
    leadId: number,
    serviceId: number,
    updatedBy: number,
    remark: string,
  ) {
    if (!vendorId || !leadId || !serviceId || !updatedBy) {
      throw Object.assign(
        new Error("vendorId, leadId, serviceId, updatedBy are required"),
        { statusCode: 400 },
      );
    }

    if (!remark?.trim()) {
      throw Object.assign(new Error("Remark is required"), {
        statusCode: 400,
      });
    }

    return prisma.$transaction(async (tx) => {
      const role = await this.getValidatedUserRole(tx, vendorId, updatedBy);
      const canReject = [
        "head-site-supervisor",
        "admin",
        "super-admin",
      ].includes(role);

      if (!canReject) {
        throw Object.assign(
          new Error(
            "Only head-site-supervisor, admin, or super-admin can reject a service",
          ),
          { statusCode: 403 },
        );
      }

      const service = await tx.leadServiceSchedule.findFirst({
        where: {
          id: serviceId,
          vendor_id: vendorId,
          lead_id: leadId,
        },
        select: {
          id: true,
          account_id: true,
          service_no: true,
          service_type: true,
          scheduled_for: true,
          status: true,
        },
      });

      if (!service) {
        throw Object.assign(new Error("Service schedule not found"), {
          statusCode: 404,
        });
      }

      if (service.status === "rejected") {
        throw Object.assign(new Error("This service is already rejected"), {
          statusCode: 400,
        });
      }

      if (service.status !== "open") {
        throw Object.assign(
          new Error("Only pending services can be rejected"),
          { statusCode: 400 },
        );
      }

      const rejectedAt = new Date();

      const updatedService = await tx.leadServiceSchedule.update({
        where: { id: service.id },
        data: {
          status: "rejected",
          rejected_at: rejectedAt,
          rejected_by: updatedBy,
          rejection_remark: remark.trim(),
          updated_by: updatedBy,
          updated_at: rejectedAt,
        },
      });

      const taskTypeByServiceNo: Record<number, string> = {
        1: "1st Servicing",
        2: "2nd Servicing",
        3: "3rd Servicing",
      };

      const taskType = taskTypeByServiceNo[service.service_no];

      if (taskType && service.service_type === "free") {
        await tx.userLeadTask.updateMany({
          where: {
            vendor_id: vendorId,
            lead_id: leadId,
            account_id: service.account_id,
            task_type: taskType,
            lead_stage: "servicing-stage",
            status: "open",
            due_date: service.scheduled_for,
          },
          data: {
            status: "cancelled",
            remark: remark.trim(),
            closed_at: rejectedAt,
            closed_by: updatedBy,
            updated_by: updatedBy,
            updated_at: rejectedAt,
          },
        });
      }

      await createLeadLog(tx, {
        vendor_id: vendorId,
        lead_id: leadId,
        account_id: service.account_id,
        action: `${this.formatServiceLogLabel(service.service_type, service.service_no)} marked as rejected. Remark: ${remark.trim()}`,
        action_type: "UPDATE",
        created_by: updatedBy,
        created_at: rejectedAt,
      });

      return updatedService;
    });
  }

  async reopenRejectedService(
    vendorId: number,
    leadId: number,
    serviceId: number,
    updatedBy: number,
  ) {
    if (!vendorId || !leadId || !serviceId || !updatedBy) {
      throw Object.assign(
        new Error("vendorId, leadId, serviceId, updatedBy are required"),
        { statusCode: 400 },
      );
    }

    return prisma.$transaction(async (tx) => {
      const role = await this.getValidatedUserRole(tx, vendorId, updatedBy);
      const canReopen = ["admin", "super-admin"].includes(role);

      if (!canReopen) {
        throw Object.assign(
          new Error("Only admin or super-admin can reopen a rejected service"),
          { statusCode: 403 },
        );
      }

      const service = await tx.leadServiceSchedule.findFirst({
        where: {
          id: serviceId,
          vendor_id: vendorId,
          lead_id: leadId,
        },
        select: {
          id: true,
          account_id: true,
          service_no: true,
          service_type: true,
          scheduled_for: true,
          status: true,
        },
      });

      if (!service) {
        throw Object.assign(new Error("Service schedule not found"), {
          statusCode: 404,
        });
      }

      if (service.status !== "rejected") {
        throw Object.assign(new Error("Only rejected services can be reopened"), {
          statusCode: 400,
        });
      }

      const reopenedAt = new Date();

      const updatedService = await tx.leadServiceSchedule.update({
        where: { id: service.id },
        data: {
          status: "open",
          rejected_at: null,
          rejected_by: null,
          rejection_remark: null,
          updated_by: updatedBy,
          updated_at: reopenedAt,
        },
      });

      const taskTypeByServiceNo: Record<number, string> = {
        1: "1st Servicing",
        2: "2nd Servicing",
        3: "3rd Servicing",
      };

      const taskType = taskTypeByServiceNo[service.service_no];

      if (taskType && service.service_type === "free") {
        await tx.userLeadTask.updateMany({
          where: {
            vendor_id: vendorId,
            lead_id: leadId,
            account_id: service.account_id,
            task_type: taskType,
            lead_stage: "servicing-stage",
            status: "cancelled",
            due_date: service.scheduled_for,
          },
          data: {
            status: "open",
            closed_at: null,
            closed_by: null,
            updated_by: updatedBy,
            updated_at: reopenedAt,
          },
        });
      }

      await createLeadLog(tx, {
        vendor_id: vendorId,
        lead_id: leadId,
        account_id: service.account_id,
        action: `${this.formatServiceLogLabel(service.service_type, service.service_no)} status changed from rejected to open.`,
        action_type: "UPDATE",
        created_by: updatedBy,
        created_at: reopenedAt,
      });

      return updatedService;
    });
  }

  async completeService(
    vendorId: number,
    leadId: number,
    serviceId: number,
    completedBy: number,
    remark: string | null,
    files: { originalName: string; sysName: string }[],
    amcContractFiles: { originalName: string; sysName: string }[] = [],
  ) {
    if (!vendorId || !leadId || !serviceId || !completedBy) {
      throw Object.assign(
        new Error("vendorId, leadId, serviceId, and completedBy are required"),
        { statusCode: 400 },
      );
    }

    if (!files.length) {
      throw Object.assign(
        new Error("At least one completion document is required"),
        { statusCode: 400 },
      );
    }

    return prisma.$transaction(async (tx) => {
      const role = await this.getValidatedUserRole(tx, vendorId, completedBy);
      const canComplete = [
        "site-supervisor",
        "head-site-supervisor",
        "admin",
        "super-admin",
      ].includes(role);

      if (!canComplete) {
        throw Object.assign(
          new Error(
            "Only site-supervisor, head-site-supervisor, admin, or super-admin can complete a service",
          ),
          { statusCode: 403 },
        );
      }

      const service = await tx.leadServiceSchedule.findFirst({
        where: {
          id: serviceId,
          vendor_id: vendorId,
          lead_id: leadId,
        },
        select: {
          id: true,
          account_id: true,
          service_no: true,
          service_type: true,
          scheduled_for: true,
          status: true,
        },
      });

      if (!service) {
        throw Object.assign(new Error("Service schedule not found"), {
          statusCode: 404,
        });
      }

      if (service.status === "completed") {
        throw Object.assign(new Error("This service is already completed"), {
          statusCode: 400,
        });
      }

      if (service.status !== "open") {
        throw Object.assign(
          new Error("Only open services can be marked as completed"),
          { statusCode: 400 },
        );
      }

      const lead = await tx.leadMaster.findFirst({
        where: {
          id: leadId,
          vendor_id: vendorId,
          is_deleted: false,
        },
        select: {
          id: true,
          is_amc_opted: true,
        },
      });

      if (!lead) {
        throw Object.assign(new Error("Lead not found"), {
          statusCode: 404,
        });
      }

      const requiresAmcContractDocuments =
        service.service_type === "free" &&
        service.service_no === 3 &&
        lead.is_amc_opted;

      if (requiresAmcContractDocuments && !amcContractFiles.length) {
        throw Object.assign(
          new Error(
            "AMC Contract Documents are required when AMC is opted for the 3rd service completion",
          ),
          { statusCode: 400 },
        );
      }

      const docType = await tx.documentTypeMaster.findFirst({
        where: {
          vendor_id: vendorId,
          OR: [
            { tag: this.completionDocTag },
            { type: this.completionDocType },
          ],
        },
        select: { id: true },
      });

      if (!docType) {
        throw Object.assign(
          new Error(
            `Document Type ${this.completionDocType} / ${this.completionDocTag} not found for vendor ${vendorId}`,
          ),
          { statusCode: 404 },
        );
      }

      const amcDocType = requiresAmcContractDocuments
        ? await tx.documentTypeMaster.findFirst({
            where: {
              vendor_id: vendorId,
              OR: [{ tag: this.amcDocTag }, { type: this.amcDocType }],
            },
            select: { id: true },
          })
        : null;

      if (requiresAmcContractDocuments && !amcDocType) {
        throw Object.assign(
          new Error(
            `Document Type ${this.amcDocType} / ${this.amcDocTag} not found for vendor ${vendorId}`,
          ),
          { statusCode: 404 },
        );
      }

      const completedAt = new Date();
      const uploadedDocs = [];
      const uploadedAmcDocs = [];

      for (const file of files) {
        const saved = await tx.leadDocuments.create({
          data: {
            vendor_id: vendorId,
            account_id: service.account_id,
            lead_id: leadId,
            created_by: completedBy,
            doc_og_name: file.originalName,
            doc_sys_name: file.sysName,
            doc_type_id: docType.id,
          },
        });

        uploadedDocs.push(saved);
      }

      for (const file of amcContractFiles) {
        const saved = await tx.leadDocuments.create({
          data: {
            vendor_id: vendorId,
            account_id: service.account_id,
            lead_id: leadId,
            created_by: completedBy,
            doc_og_name: file.originalName,
            doc_sys_name: file.sysName,
            doc_type_id: amcDocType!.id,
          },
        });

        uploadedAmcDocs.push(saved);
      }

      const updatedService = await tx.leadServiceSchedule.update({
        where: { id: service.id },
        data: {
          status: "completed",
          completed_at: completedAt,
          completed_by: completedBy,
          completion_remark: remark?.trim() || null,
          updated_by: completedBy,
          updated_at: completedAt,
        },
      });

      const taskTypeByServiceNo: Record<number, string> = {
        1: "1st Servicing",
        2: "2nd Servicing",
        3: "3rd Servicing",
      };

      const taskType = taskTypeByServiceNo[service.service_no];

      if (taskType && service.service_type === "free") {
        await tx.userLeadTask.updateMany({
          where: {
            vendor_id: vendorId,
            lead_id: leadId,
            account_id: service.account_id,
            task_type: taskType,
            lead_stage: "servicing-stage",
            status: "open",
            due_date: service.scheduled_for,
          },
          data: {
            status: "completed",
            remark: remark?.trim() || null,
            closed_at: completedAt,
            closed_by: completedBy,
            updated_by: completedBy,
            updated_at: completedAt,
          },
        });
      }

      const docCount = uploadedDocs.length;
      const plural = docCount > 1 ? "documents have" : "document has";
      const amcDocCount = uploadedAmcDocs.length;
      const amcDocMessage =
        amcDocCount > 0
          ? ` ${amcDocCount} AMC contract ${
              amcDocCount > 1 ? "documents have" : "document has"
            } been uploaded successfully.`
          : "";
      const detailedLog = await createLeadLog(tx, {
        vendor_id: vendorId,
        lead_id: leadId,
        account_id: service.account_id,
        action: `${this.formatServiceLogLabel(service.service_type, service.service_no)} completed successfully — ${docCount} servicing completion ${plural} been uploaded successfully.${amcDocMessage}${remark?.trim() ? ` Remark: ${remark.trim()}` : ""}`,
        action_type: "UPDATE",
        created_by: completedBy,
        created_at: completedAt,
      });

      await tx.leadDocumentLogs.createMany({
        data: [...uploadedDocs, ...uploadedAmcDocs].map((doc) => ({
          vendor_id: vendorId,
          lead_id: leadId,
          account_id: service.account_id,
          doc_id: doc.id,
          lead_logs_id: detailedLog.id,
          created_by: completedBy,
          created_at: completedAt,
        })),
      });

      await this.createAmcSchedulesIfEligible(
        tx,
        vendorId,
        leadId,
        completedBy,
        {
          account_id: service.account_id,
          service_no: service.service_no,
          service_type: service.service_type,
        },
        completedAt,
      );

      return {
        service: updatedService,
        documents: [...uploadedDocs, ...uploadedAmcDocs],
      };
    });
  }

  async uploadAmcContractDocuments(
    vendorId: number,
    leadId: number,
    accountId: number,
    userId: number,
    files: { originalName: string; sysName: string }[],
  ) {
    const docType = await prisma.documentTypeMaster.findFirst({
      where: {
        vendor_id: vendorId,
        OR: [
          { tag: this.amcDocTag },
          { type: this.amcDocType },
        ],
      },
      select: { id: true },
    });

    if (!docType) {
      throw new Error(
        `Document Type ${this.amcDocType} / ${this.amcDocTag} not found for vendor ${vendorId}`,
      );
    }

    const uploadedDocs = [];

    for (const file of files) {
      const saved = await prisma.leadDocuments.create({
        data: {
          vendor_id: vendorId,
          account_id: accountId,
          lead_id: leadId,
          created_by: userId,
          doc_og_name: file.originalName,
          doc_sys_name: file.sysName,
          doc_type_id: docType.id,
        },
      });

      uploadedDocs.push(saved);
    }

    if (accountId && uploadedDocs.length > 0) {
      const detailedLog = await createLeadLog(prisma, {
        vendor_id: vendorId,
        lead_id: leadId,
        account_id: accountId,
        action: `${uploadedDocs.length} AMC Contract Document${uploadedDocs.length > 1 ? "s" : ""} uploaded successfully.`,
        action_type: "CREATE",
        history_type: "Lead",
        created_by: userId,
      });

      await prisma.leadDocumentLogs.createMany({
        data: uploadedDocs.map((doc) => ({
          vendor_id: vendorId,
          lead_id: leadId,
          account_id: accountId,
          doc_id: doc.id,
          lead_logs_id: detailedLog.id,
          created_by: userId,
        })),
      });
    }

    return uploadedDocs;
  }

  async getAmcContractDocuments(vendorId: number, leadId: number) {
    const docType = await prisma.documentTypeMaster.findFirst({
      where: {
        vendor_id: vendorId,
        OR: [
          { tag: this.amcDocTag },
          { type: this.amcDocType },
        ],
      },
      select: { id: true, tag: true },
    });

    if (!docType) {
      throw Object.assign(
        new Error("AMC contract document type not found for vendor"),
        { statusCode: 404 },
      );
    }

    const docs = await prisma.leadDocuments.findMany({
      where: {
        vendor_id: vendorId,
        lead_id: leadId,
        doc_type_id: docType.id,
        is_deleted: false,
      },
      orderBy: { created_at: "desc" },
    });

    return Promise.all(
      docs.map(async (doc) => ({
        ...doc,
        signed_url: await generateSignedUrl(doc.doc_sys_name, 3600, "inline"),
        doc_type_tag: docType.tag,
      })),
    );
  }
}
