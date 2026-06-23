import Joi from "joi";
import fs from "node:fs/promises";
import { prisma } from "../../prisma/client";
import { NotificationType } from "../../prisma/generated";
import {
  generateSignedUrl,
  uploadToWasabiInitialSiteMeasurementFile,
} from "../../utils/wasabiClient";
import { cache } from "../../utils/cache";
import { NotificationService } from "../notification/notification.service";
import { createTaskHistoryLog } from "../task/taskHistory.service";

const APPROVAL_REQUEST_TASK_TYPE = "Approval Request" as const;
const APPROVAL_REQUEST_DOCUMENT_TAG = "APPROVAL_REQUEST_DOCUMENT";

const createApprovalRequestSchema = Joi.object({
  lead_id: Joi.number().integer().positive().required(),
  due_date: Joi.alternatives().try(Joi.string().isoDate(), Joi.date()).required(),
  remark: Joi.string().trim().required(),
  assignee_user_id: Joi.number().integer().positive().required(),
  created_by: Joi.number().integer().positive().required(),
  baseUrl: Joi.string().uri().optional(),
  files: Joi.array().optional(),
});

type ApprovalRequestFile = {
  originalName: string;
  sysName: string;
};

export interface CreateApprovalRequestInput {
  lead_id: number;
  due_date: string | Date;
  remark: string;
  assignee_user_id: number;
  created_by: number;
  baseUrl?: string;
  files?: Express.Multer.File[];
}

export interface ActOnApprovalRequestInput {
  lead_id: number;
  task_id: number;
  action: "approve" | "reject";
  acted_by: number;
  remark?: string | null;
  files?: Express.Multer.File[];
}

const approvalRequestActionSchema = Joi.object({
  lead_id: Joi.number().integer().positive().required(),
  task_id: Joi.number().integer().positive().required(),
  action: Joi.string().valid("approve", "reject").required(),
  acted_by: Joi.number().integer().positive().required(),
  remark: Joi.string().allow("", null).optional(),
  files: Joi.array().optional(),
});

const formatDueDate = (dueDate: string | Date) =>
  new Date(dueDate).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

const getApprovalRequestDocumentTypeId = async (
  tx: any,
  vendorId: number,
  stage?: string | null,
) => {
  const existingDocType = await tx.documentTypeMaster.findFirst({
    where: {
      vendor_id: vendorId,
      tag: APPROVAL_REQUEST_DOCUMENT_TAG,
    },
    select: { id: true },
  });

  if (existingDocType) {
    return existingDocType.id;
  }

  const createdDocType = await tx.documentTypeMaster.create({
    data: {
      vendor_id: vendorId,
      tag: APPROVAL_REQUEST_DOCUMENT_TAG,
      type: "Approval Request Document",
      doc_title: "Approval Request Documents",
      stage: stage ?? "Approval Request",
    },
    select: { id: true },
  });

  return createdDocType.id;
};

const uploadApprovalRequestFiles = async (
  files: Express.Multer.File[],
  vendorId: number,
  leadId: number,
) => {
  const uploadedFiles: ApprovalRequestFile[] = [];

  for (const file of files) {
    const sysName = await uploadToWasabiInitialSiteMeasurementFile(
      file.path,
      vendorId,
      leadId,
      file.originalname,
      file.mimetype,
      "approval_requests",
    );

    uploadedFiles.push({
      originalName: file.originalname,
      sysName,
    });

    await fs.unlink(file.path).catch(() => undefined);
  }

  return uploadedFiles;
};

export class ApprovalRequestService {
  public async getApprovalRequestDetails(leadId: number, taskId: number) {
    const approvalRequest = await prisma.leadApprovalRequest.findFirst({
      where: {
        lead_id: leadId,
        task_id: taskId,
      },
      select: {
        id: true,
        task_id: true,
        status: true,
        request_remark: true,
        response_remark: true,
        created_at: true,
        responded_at: true,
        requester_user_id: true,
        approver_user_id: true,
        responded_by: true,
        documents: {
          select: {
            id: true,
            document_role: true,
            created_at: true,
            document: {
              select: {
                id: true,
                doc_og_name: true,
                doc_sys_name: true,
                created_at: true,
              },
            },
          },
          orderBy: {
            created_at: "asc",
          },
        },
      },
    });

    if (!approvalRequest) {
      throw new Error("Approval request not found");
    }

    const userIds = [
      approvalRequest.requester_user_id,
      approvalRequest.approver_user_id,
      approvalRequest.responded_by,
    ].filter((value): value is number => typeof value === "number");

    const users = userIds.length
      ? await prisma.userMaster.findMany({
          where: {
            id: {
              in: Array.from(new Set(userIds)),
            },
          },
          select: {
            id: true,
            user_name: true,
            user_email: true,
          },
        })
      : [];

    const userMap = new Map(users.map((user) => [user.id, user]));

    const documents = await Promise.all(
      approvalRequest.documents.map(async (mapping) => ({
        id: mapping.document.id,
        role: mapping.document_role,
        original_name: mapping.document.doc_og_name,
        signedUrl: await generateSignedUrl(
          mapping.document.doc_sys_name,
          3600,
          "inline",
        ),
        created_at: mapping.document.created_at,
      })),
    );

    return {
      id: approvalRequest.id,
      task_id: approvalRequest.task_id,
      status: approvalRequest.status,
      request_remark: approvalRequest.request_remark,
      response_remark: approvalRequest.response_remark,
      created_at: approvalRequest.created_at,
      responded_at: approvalRequest.responded_at,
      requester: userMap.get(approvalRequest.requester_user_id) ?? null,
      approver: userMap.get(approvalRequest.approver_user_id) ?? null,
      responder:
        approvalRequest.responded_by != null
          ? userMap.get(approvalRequest.responded_by) ?? null
          : null,
      request_documents: documents.filter((doc) => doc.role === "request"),
      response_documents: documents.filter((doc) => doc.role === "response"),
    };
  }

  public async getAssignableUsers(vendorId: number, leadId: number) {
    const lead = await prisma.leadMaster.findUnique({
      where: { id: leadId },
      select: {
        id: true,
        franchise_id: true,
        vendor_id: true,
      },
    });

    if (!lead) {
      throw new Error(`Lead ${leadId} not found`);
    }

    if (lead.vendor_id !== vendorId) {
      throw new Error("Lead does not belong to the provided vendor");
    }

    const users = await prisma.userMaster.findMany({
      where: {
        vendor_id: vendorId,
        status: "active",
      },
      select: {
        id: true,
        user_name: true,
        user_email: true,
        franchise_id: true,
        user_type: {
          select: {
            id: true,
            user_type: true,
          },
        },
      },
      orderBy: {
        user_name: "asc",
      },
    });

    const filteredUsers = users.filter((user) => {
      const normalizedUserType = String(
        user.user_type?.user_type ?? "",
      ).toLowerCase();

      if (normalizedUserType === "sales-executive") {
        return user.franchise_id === (lead.franchise_id ?? null);
      }

      return true;
    });

    return {
      leadFranchiseId: lead.franchise_id ?? null,
      users: filteredUsers,
    };
  }

  public async createApprovalRequest(input: CreateApprovalRequestInput) {
    const { error, value } = createApprovalRequestSchema.validate(input);
    if (error) {
      throw new Error(
        `Validation failed: ${error.details.map((detail) => detail.message).join(", ")}`,
      );
    }

    const lead = await prisma.leadMaster.findUnique({
      where: { id: value.lead_id },
      select: {
        id: true,
        vendor_id: true,
        account_id: true,
        franchise_id: true,
        status_id: true,
        firstname: true,
        lastname: true,
        lead_code: true,
      },
    });

    if (!lead) {
      throw new Error(`Lead ${value.lead_id} not found`);
    }

    const assignee = await prisma.userMaster.findUnique({
      where: { id: value.assignee_user_id },
      select: {
        id: true,
        vendor_id: true,
        franchise_id: true,
        user_name: true,
      },
    });

    if (!assignee) {
      throw new Error(`Assignee user ${value.assignee_user_id} not found`);
    }

    if (assignee.vendor_id !== lead.vendor_id) {
      throw new Error("Assignee does not belong to the lead's vendor");
    }

    if (lead.franchise_id && assignee.franchise_id !== lead.franchise_id) {
      throw new Error("Assignee must belong to the same franchise as the lead");
    }

    const uploaderFiles = await uploadApprovalRequestFiles(
      input.files ?? [],
      lead.vendor_id,
      lead.id,
    );

    const result = await prisma.$transaction(async (tx) => {
      const existingOpenTask = await tx.userLeadTask.findFirst({
        where: {
          lead_id: lead.id,
          task_type: APPROVAL_REQUEST_TASK_TYPE,
          user_id: assignee.id,
          status: { not: "completed" },
        },
        select: { id: true },
        orderBy: { created_at: "desc" },
      });

      if (existingOpenTask) {
        throw new Error(
          "An Approval Request is already assigned to this user and is not yet completed",
        );
      }

      const leadStage = lead.status_id
        ? (
            await tx.statusTypeMaster.findUnique({
              where: { id: lead.status_id },
              select: { type: true },
            })
          )?.type ?? null
        : null;

      const task = await tx.userLeadTask.create({
        data: {
          lead_id: lead.id,
          account_id: lead.account_id!,
          vendor_id: lead.vendor_id,
          franchise_id: lead.franchise_id ?? null,
          user_id: assignee.id,
          task_type: APPROVAL_REQUEST_TASK_TYPE,
          lead_stage: leadStage,
          due_date: new Date(value.due_date),
          remark: value.remark,
          status: "open",
          created_by: value.created_by,
        },
      });

      const documentTypeId = await getApprovalRequestDocumentTypeId(
        tx,
        lead.vendor_id,
        leadStage,
      );

      const createdDocuments = [];
      for (const file of uploaderFiles) {
        const document = await tx.leadDocuments.create({
          data: {
            doc_og_name: file.originalName,
            doc_sys_name: file.sysName,
            created_by: value.created_by,
            doc_type_id: documentTypeId,
            account_id: lead.account_id,
            lead_id: lead.id,
            vendor_id: lead.vendor_id,
          },
          select: { id: true },
        });
        createdDocuments.push(document);
      }

      const approvalRequest = await tx.leadApprovalRequest.create({
        data: {
          vendor_id: lead.vendor_id,
          lead_id: lead.id,
          account_id: lead.account_id!,
          franchise_id: lead.franchise_id ?? null,
          task_id: task.id,
          requester_user_id: value.created_by,
          approver_user_id: assignee.id,
          request_remark: value.remark,
          created_by: value.created_by,
        },
      });

      if (createdDocuments.length > 0) {
        await tx.leadApprovalRequestDocumentMapping.createMany({
          data: createdDocuments.map((document) => ({
            vendor_id: lead.vendor_id,
            lead_id: lead.id,
            account_id: lead.account_id!,
            approval_request_id: approvalRequest.id,
            document_id: document.id,
            document_role: "request",
            created_by: value.created_by,
          })),
        });
      }

      await createTaskHistoryLog({
        db: tx,
        task,
        createdBy: value.created_by,
        actionType: "CREATE",
        action: `Approval Request assigned to ${assignee.user_name}. Due Date: ${formatDueDate(value.due_date)}. Remark: ${value.remark}`,
        documentIds: createdDocuments.map((document) => document.id),
      });

      let chatRoom = await tx.leadChatRoom.findFirst({
        where: {
          lead_id: lead.id,
          vendor_id: lead.vendor_id,
        },
        select: { id: true },
      });

      if (!chatRoom) {
        chatRoom = await tx.leadChatRoom.create({
          data: {
            lead_id: lead.id,
            vendor_id: lead.vendor_id,
          },
          select: { id: true },
        });
      }

      const existingMember = await tx.leadChatMember.findFirst({
        where: {
          chat_room_id: chatRoom.id,
          user_id: assignee.id,
        },
        select: { id: true },
      });

      if (!existingMember) {
        await tx.leadChatMember.create({
          data: {
            chat_room_id: chatRoom.id,
            user_id: assignee.id,
            added_by: value.created_by,
          },
        });
      }

      return { task, approvalRequest, documentIds: createdDocuments.map((document) => document.id) };
    });

    await cache.del(`dashboard:tasks:${lead.vendor_id}:${assignee.id}`);
    await cache.del(`performance:snapshot:${lead.vendor_id}:${assignee.id}`);
    await cache.del(`performance:snapshot:${lead.vendor_id}:${value.created_by}`);

    await NotificationService.createAndSend({
      vendor_id: lead.vendor_id,
      user_id: assignee.id,
      sender_id: value.created_by,
      type: NotificationType.APPROVAL,
      title: "Approval Request Assigned",
      message: `${lead.lead_code ?? `Lead #${lead.id}`} requires your approval review. Due by ${formatDueDate(value.due_date)}.`,
      entity_type: "approval_request",
      entity_id: result.approvalRequest.id,
      redirect_url: `/dashboard/my-tasks?taskId=${result.task.id}&leadId=${lead.id}`,
    }).catch(() => undefined);

    return result;
  }

  public async actOnApprovalRequest(input: ActOnApprovalRequestInput) {
    const { error, value } = approvalRequestActionSchema.validate(input);
    if (error) {
      throw new Error(
        `Validation failed: ${error.details.map((detail) => detail.message).join(", ")}`,
      );
    }

    if (value.action === "reject" && !value.remark?.trim()) {
      throw new Error("Remark is required when rejecting an approval request");
    }

    const task = await prisma.userLeadTask.findFirst({
      where: {
        id: value.task_id,
        lead_id: value.lead_id,
        task_type: APPROVAL_REQUEST_TASK_TYPE,
      },
      select: {
        id: true,
        lead_id: true,
        account_id: true,
        vendor_id: true,
        user_id: true,
        created_by: true,
        lead_stage: true,
      },
    });

    if (!task) {
      throw new Error("Approval Request task not found");
    }

    const approvalRequest = await prisma.leadApprovalRequest.findFirst({
      where: {
        task_id: value.task_id,
        lead_id: value.lead_id,
        status: "pending",
      },
      select: {
        id: true,
        requester_user_id: true,
        approver_user_id: true,
      },
    });

    if (!approvalRequest) {
      throw new Error("Pending approval request not found");
    }

    if (approvalRequest.approver_user_id !== value.acted_by) {
      throw new Error("Only the assigned user can act on this approval request");
    }

    const uploadedFiles = await uploadApprovalRequestFiles(
      input.files ?? [],
      task.vendor_id,
      task.lead_id,
    );

    const result = await prisma.$transaction(async (tx) => {
      const documentTypeId = await getApprovalRequestDocumentTypeId(
        tx,
        task.vendor_id,
        task.lead_stage ?? "Approval Request",
      );

      const createdDocuments = [];
      for (const file of uploadedFiles) {
        const document = await tx.leadDocuments.create({
          data: {
            doc_og_name: file.originalName,
            doc_sys_name: file.sysName,
            created_by: value.acted_by,
            doc_type_id: documentTypeId,
            account_id: task.account_id,
            lead_id: task.lead_id,
            vendor_id: task.vendor_id,
          },
          select: { id: true },
        });
        createdDocuments.push(document);
      }

      if (createdDocuments.length > 0) {
        await tx.leadApprovalRequestDocumentMapping.createMany({
          data: createdDocuments.map((document) => ({
            vendor_id: task.vendor_id,
            lead_id: task.lead_id,
            account_id: task.account_id,
            approval_request_id: approvalRequest.id,
            document_id: document.id,
            document_role: "response",
            created_by: value.acted_by,
          })),
        });
      }

      const updatedApprovalRequest = await tx.leadApprovalRequest.update({
        where: { id: approvalRequest.id },
        data: {
          status: value.action === "approve" ? "approved" : "rejected",
          response_remark: value.remark?.trim() || null,
          responded_at: new Date(),
          responded_by: value.acted_by,
        },
      });

      const updatedTask = await tx.userLeadTask.update({
        where: { id: task.id },
        data: {
          status: "completed",
          updated_by: value.acted_by,
          closed_by: value.acted_by,
          closed_at: new Date(),
        },
      });

      const actionLabel =
        value.action === "approve" ? "approved" : "rejected";

      await createTaskHistoryLog({
        db: tx,
        task: updatedTask,
        createdBy: value.acted_by,
        actionType: "UPDATE",
        action: `Approval Request ${actionLabel}.` +
          (value.remark?.trim() ? ` Remark: ${value.remark.trim()}` : ""),
        documentIds: createdDocuments.map((document) => document.id),
      });

      return {
        approvalRequest: updatedApprovalRequest,
        task: updatedTask,
      };
    });

    await cache.del(`dashboard:tasks:${task.vendor_id}:${task.user_id}`);
    await cache.del(`dashboard:tasks:${task.vendor_id}:${approvalRequest.requester_user_id}`);
    await cache.del(`performance:snapshot:${task.vendor_id}:${task.user_id}`);
    await cache.del(`performance:snapshot:${task.vendor_id}:${approvalRequest.requester_user_id}`);

    await NotificationService.createAndSend({
      vendor_id: task.vendor_id,
      user_id: approvalRequest.requester_user_id,
      sender_id: value.acted_by,
      type: NotificationType.APPROVAL,
      title:
        value.action === "approve"
          ? "Approval Request Approved"
          : "Approval Request Rejected",
      message:
        value.action === "approve"
          ? "Your approval request has been approved."
          : "Your approval request has been rejected.",
      entity_type: "approval_request",
      entity_id: approvalRequest.id,
      redirect_url: `/dashboard/my-tasks`,
    }).catch(() => undefined);

    return result;
  }
}
