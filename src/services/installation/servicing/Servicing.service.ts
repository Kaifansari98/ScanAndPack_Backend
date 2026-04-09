import { prisma } from "../../../prisma/client";
import { generateSignedUrl } from "../../../utils/wasabiClient";

export class ServicingService {
  private readonly amcDocType = "AMC-contract-Documents";
  private readonly amcDocTag = "Type 39";
  private readonly completionDocType = "servicing-complition-Documents";
  private readonly completionDocTag = "Type 40";

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
        service_type: "free",
      },
      orderBy: {
        service_no: "asc",
      },
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
      schedules.map(async (schedule) => ({
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
      })),
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
          service_type: "free",
        },
        select: {
          id: true,
          account_id: true,
          service_no: true,
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

      if (taskType) {
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

      const formatter = new Intl.DateTimeFormat("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });

      await tx.leadDetailedLogs.create({
        data: {
          vendor_id: vendorId,
          lead_id: leadId,
          account_id: service.account_id,
          action: `${service.service_no} Service rescheduled from ${formatter.format(
            currentScheduledFor,
          )} to ${formatter.format(nextScheduledFor)}.`,
          action_type: "UPDATE",
          created_by: updatedBy,
          created_at: new Date(),
        },
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
          service_type: "free",
        },
        select: {
          id: true,
          account_id: true,
          service_no: true,
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

      if (taskType) {
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

      await tx.leadDetailedLogs.create({
        data: {
          vendor_id: vendorId,
          lead_id: leadId,
          account_id: service.account_id,
          action: `${service.service_no} Service marked as rejected. Remark: ${remark.trim()}`,
          action_type: "UPDATE",
          created_by: updatedBy,
          created_at: rejectedAt,
        },
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
          service_type: "free",
        },
        select: {
          id: true,
          account_id: true,
          service_no: true,
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

      if (taskType) {
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

      await tx.leadDetailedLogs.create({
        data: {
          vendor_id: vendorId,
          lead_id: leadId,
          account_id: service.account_id,
          action: `${service.service_no} Service status changed from rejected to open.`,
          action_type: "UPDATE",
          created_by: updatedBy,
          created_at: reopenedAt,
        },
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
          service_type: "free",
        },
        select: {
          id: true,
          account_id: true,
          service_no: true,
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

      const completedAt = new Date();
      const uploadedDocs = [];

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

      if (taskType) {
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
      const detailedLog = await tx.leadDetailedLogs.create({
        data: {
          vendor_id: vendorId,
          lead_id: leadId,
          account_id: service.account_id,
          action: `${service.service_no} Service completed successfully — ${docCount} servicing completion ${plural} been uploaded successfully.${remark?.trim() ? ` Remark: ${remark.trim()}` : ""}`,
          action_type: "UPDATE",
          created_by: completedBy,
          created_at: completedAt,
        },
      });

      await tx.leadDocumentLogs.createMany({
        data: uploadedDocs.map((doc) => ({
          vendor_id: vendorId,
          lead_id: leadId,
          account_id: service.account_id,
          doc_id: doc.id,
          lead_logs_id: detailedLog.id,
          created_by: completedBy,
          created_at: completedAt,
        })),
      });

      return {
        service: updatedService,
        documents: uploadedDocs,
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
