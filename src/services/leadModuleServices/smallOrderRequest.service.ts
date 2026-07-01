import Joi from "joi";
import fs from "node:fs/promises";
import { prisma } from "../../prisma/client";
import logger from "../../utils/logger";
import { createTaskHistoryLog } from "../task/taskHistory.service";
import { getFranchiseAdminRecipients } from "../notification/adminRecipients.service";
import {
  generateSignedUrl,
  uploadToWasabiInitialSiteMeasurementFile,
} from "../../utils/wasabiClient";
import { createLeadLog } from "../../utils/leadDetailedLog";
import { NotificationService } from "../notification/notification.service";
import { NotificationType } from "../../prisma/generated";
import {
  sendSmallOrderRequestSiteSupervisorApprovalEmail,
  sendSmallOrderRequestStoreAdminApprovalEmail,
  sendSmallOrderRequestSupervisorApprovedEmail,
  sendSmallOrderRequestSupervisorRejectedEmail,
  sendSmallOrderRequestAdminApprovedEmail,
  sendSmallOrderRequestAdminRejectedEmail,
  sendSmallOrderRequestFullyApprovedEmail,
  sendNewSmallOrderLeadAssignedEmail,
} from "../email/brevoEmail2.service";
import { LeadSuperAdminApprovalLockInService } from "../leadSuperAdminApprovalLockIn/leadSuperAdminApprovalLockIn.service";

const SMALL_ORDER_REQUEST_DOCUMENT_TAG = "SMALL_ORDER_REQUEST_DOCUMENT";
const SMALL_ORDER_REQUEST_TASK_TYPE = "Small order request";

const createSmallOrderRequestSchema = Joi.object({
  lead_id: Joi.number().integer().positive().required(),
  vendor_id: Joi.number().integer().positive().required(),
  created_by: Joi.number().integer().positive().required(),
  request_source: Joi.string()
    .valid("post_dispatch", "final_handover")
    .required(),
  request_type_id: Joi.number().integer().positive().required(),
  required_date: Joi.alternatives().try(Joi.string().isoDate(), Joi.date()).required(),
  remarks: Joi.string().allow("", null).max(2000).optional(),
  documents: Joi.array().optional(),
});

export interface CreateSmallOrderRequestInput {
  lead_id: number;
  vendor_id: number;
  created_by: number;
  request_source: "post_dispatch" | "final_handover";
  request_type_id: number;
  required_date: string | Date;
  remarks?: string | null;
  documents?: Express.Multer.File[];
}

export interface ActOnSmallOrderRequestTaskInput {
  lead_id: number;
  task_id: number;
  action: "approve" | "reject";
  acted_by: number;
  remark?: string | null;
}

export const markSmallOrderRequestResolved = async (
  vendorId: number,
  requestId: number,
  updatedBy: number,
) => {
  const request = await prisma.smallOrderRequest.findFirst({
    where: {
      id: requestId,
      vendor_id: vendorId,
    },
    select: {
      id: true,
      is_request_resolved: true,
      lead_id: true,
      so_code: true,
      parent_lead_code: true,
    },
  });

  if (!request) {
    throw new Error("Small order request not found");
  }

  if (request.is_request_resolved) {
    return request;
  }

  const updatedRequest = await prisma.smallOrderRequest.update({
    where: { id: requestId },
    data: {
      is_request_resolved: true,
      updated_by: updatedBy,
    },
    select: {
      id: true,
      is_request_resolved: true,
      lead_id: true,
      so_code: true,
      parent_lead_code: true,
      updated_at: true,
    },
  });

  const linkedLead = await prisma.leadMaster.findFirst({
    where: {
      id: updatedRequest.lead_id,
      vendor_id: vendorId,
    },
    select: {
      account_id: true,
    },
  });

  await createLeadLog(prisma as any, {
    account_id: linkedLead?.account_id ?? 0,
    lead_id: updatedRequest.lead_id,
    vendor_id: vendorId,
    created_by: updatedBy,
    action: `Small order request ${updatedRequest.so_code ?? updatedRequest.parent_lead_code} marked as resolved`,
    action_type: "STATUS_CHANGE",
    history_type: "Lead",
  }).catch(() => undefined);

  return updatedRequest;
};

export const getSmallOrderRequestsByLead = async (
  vendorId: number,
  leadId: number,
) => {
  const requests = await prisma.smallOrderRequest.findMany({
    where: {
      vendor_id: vendorId,
      lead_id: leadId,
    },
    include: {
      requestType: {
        select: {
          id: true,
          type: true,
          type_key: true,
        },
      },
      createdBy: {
        select: {
          id: true,
          user_name: true,
          user_email: true,
        },
      },
      documents: {
        select: {
          id: true,
          document_id: true,
          created_at: true,
          document: {
            select: {
              doc_og_name: true,
              doc_sys_name: true,
            },
          },
        },
      },
    },
    orderBy: {
      created_at: "desc",
    },
  });

  const soCodes = requests
    .map((request) => request.so_code?.trim())
    .filter((code): code is string => Boolean(code));

  const linkedLeads = soCodes.length
    ? await prisma.leadMaster.findMany({
      where: {
        vendor_id: vendorId,
        lead_code: {
          in: soCodes,
        },
        is_deleted: false,
      },
      select: {
        id: true,
        lead_code: true,
        account_id: true,
      },
    })
    : [];

  const linkedLeadByCode = new Map(
    linkedLeads.map((lead) => [lead.lead_code?.trim() ?? "", lead]),
  );

  return Promise.all(
    requests.map(async (request) => ({
      ...request,
      document_count: request.documents.length,
      documents: await Promise.all(
        request.documents.map(async (doc) => ({
          id: doc.id,
          document_id: doc.document_id,
          original_name: doc.document?.doc_og_name ?? "",
          signed_url: doc.document?.doc_sys_name
            ? await generateSignedUrl(doc.document.doc_sys_name, 3600, "inline")
            : null,
          created_at: doc.created_at,
        })),
      ),
      linked_lead:
        request.so_code?.trim()
          ? linkedLeadByCode.get(request.so_code.trim()) ?? null
          : null,
    })),
  );
};

type UploadedSmallOrderFile = {
  originalName: string;
  sysName: string;
};

const addDays = (date: Date, days: number) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

const startOfDay = (date: Date) => {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
};

const formatDate = (date: Date) =>
  new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);

const buildSmallOrderLeadCode = (parentLeadCode: string, sequence: number) => {
  const trimmedCode = parentLeadCode.trim();
  return `SO${sequence}-${trimmedCode}`;
};

const getSmallOrderRequestDocumentTypeId = async (
  tx: any,
  vendorId: number,
  stage: string | null,
) => {
  const existingDocType = await tx.documentTypeMaster.findFirst({
    where: {
      vendor_id: vendorId,
      tag: SMALL_ORDER_REQUEST_DOCUMENT_TAG,
    },
    select: { id: true },
  });

  if (existingDocType) {
    return existingDocType.id;
  }

  const createdDocType = await tx.documentTypeMaster.create({
    data: {
      vendor_id: vendorId,
      tag: SMALL_ORDER_REQUEST_DOCUMENT_TAG,
      type: "Small Order Request Document",
      doc_title: "Small Order Request Documents",
      stage: stage ?? "Small Order Request",
    },
    select: { id: true },
  });

  return createdDocType.id;
};

const uploadSmallOrderRequestFiles = async (
  files: Express.Multer.File[],
  vendorId: number,
  leadId: number,
) => {
  const uploadedFiles: UploadedSmallOrderFile[] = [];

  for (const file of files) {
    const sysName = await uploadToWasabiInitialSiteMeasurementFile(
      file.path,
      vendorId,
      leadId,
      file.originalname,
      file.mimetype,
      "small_order_requests",
    );

    uploadedFiles.push({
      originalName: file.originalname,
      sysName,
    });

    await fs.unlink(file.path).catch(() => undefined);
  }

  return uploadedFiles;
};

const getSiteSupervisorRecipients = async (
  vendorId: number,
  leadId: number,
  excludeUserId?: number,
) => {
  return prisma.leadUserMapping.findMany({
    where: {
      vendor_id: vendorId,
      lead_id: leadId,
      status: "active",
      user: {
        status: "active",
        ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
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
};

const getSuperAdminRecipients = async (
  vendorId: number,
  excludeUserId?: number,
) => {
  return prisma.userMaster.findMany({
    where: {
      vendor_id: vendorId,
      status: "active",
      ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
      user_type: {
        user_type: {
          equals: "super-admin",
          mode: "insensitive",
        },
      },
    },
    select: {
      id: true,
      user_name: true,
      user_email: true,
    },
  });
};

const buildTaskRemark = (input: {
  sourceLabel: string;
  parentLeadCode: string;
  customerName: string;
  requestType: string;
  requiredDate: Date;
  remarks?: string | null;
}) => {
  const parts = [
    `Small order request raised from ${input.sourceLabel}.`,
    `Lead: ${input.parentLeadCode}.`,
    `Customer: ${input.customerName}.`,
    `Type: ${input.requestType}.`,
    `Required Date: ${formatDate(input.requiredDate)}.`,
  ];

  if (input.remarks?.trim()) {
    parts.push(`Remarks: ${input.remarks.trim()}`);
  }

  return parts.join(" ");
};

const createSmallOrderLeadFromRequest = async ({
  tx,
  smallOrderRequestId,
}: {
  tx: any;
  smallOrderRequestId: number;
}) => {
  const request = await tx.smallOrderRequest.findUnique({
    where: { id: smallOrderRequestId },
    include: {
      createdBy: {
        include: {
          user_type: true,
        },
      },
      lead: true,
    },
  });

  if (!request) {
    throw new Error("Small order request not found for lead creation");
  }

  if (request.so_code) {
    const existingLead = await tx.leadMaster.findFirst({
      where: {
        vendor_id: request.vendor_id,
        lead_code: request.so_code,
      },
      select: { id: true },
    });

    const existingInstance = existingLead
      ? await tx.leadProductStructureInstance.findFirst({
          where: {
            lead_id: existingLead.id,
            vendor_id: request.vendor_id,
          },
          select: { id: true },
        })
      : null;

    return {
      leadId: existingLead?.id,
      leadCode: request.so_code,
      instanceId: existingInstance?.id,
      alreadyExists: true,
    };
  }

  if (!request.lead.account_id) {
    throw new Error("Parent lead account is missing for small order lead creation");
  }

  const [smallOrderProductType, othersStructure, orderLoginStatus] =
    await Promise.all([
      tx.productTypeMaster.findFirst({
        where: {
          vendor_id: request.vendor_id,
          tag: "Type 7",
        },
      }),
      tx.productStructure.findFirst({
        where: {
          vendor_id: request.vendor_id,
          type: "Others",
          parent: "Others",
        },
      }),
      tx.statusTypeMaster.findFirst({
        where: {
          vendor_id: request.vendor_id,
          tag: "Type 9",
        },
      }),
    ]);

  const parentLeadUserMappings = await tx.leadUserMapping.findMany({
    where: {
      vendor_id: request.vendor_id,
      lead_id: request.lead_id,
      status: "active",
    },
    select: {
      user_id: true,
      type: true,
      status: true,
    },
  });

  if (!smallOrderProductType) {
    throw new Error("Small Order product type master not found");
  }

  if (!othersStructure) {
    throw new Error("Others product structure master not found");
  }

  if (!orderLoginStatus) {
    throw new Error("Order Login stage status master not found");
  }

  const smallOrderSequence = request.small_order_sequence ?? 1;
  const leadCode = buildSmallOrderLeadCode(
    request.parent_lead_code,
    smallOrderSequence,
  );

  const existingLeadWithCode = await tx.leadMaster.findFirst({
    where: {
      vendor_id: request.vendor_id,
      lead_code: leadCode,
    },
    select: {
      id: true,
    },
  });

  if (existingLeadWithCode) {
    await tx.smallOrderRequest.update({
      where: { id: request.id },
      data: {
        so_code: leadCode,
      },
    });

    const existingInstance = await tx.leadProductStructureInstance.findFirst({
      where: {
        lead_id: existingLeadWithCode.id,
        vendor_id: request.vendor_id,
      },
      select: { id: true },
    });

    return {
      leadId: existingLeadWithCode.id,
      leadCode,
      instanceId: existingInstance?.id,
      alreadyExists: true,
    };
  }

  const leadCreateData: any = {
    lead_code: leadCode,
    firstname: request.lead.firstname,
    lastname: request.lead.lastname,
    country_code: request.lead.country_code,
    contact_no: request.lead.contact_no,
    alt_contact_no: request.lead.alt_contact_no,
    email: request.lead.email ?? "",
    site_address: request.lead.site_address,
    site_map_link: request.lead.site_map_link,
    site_type_id: request.lead.site_type_id,
    status_id: orderLoginStatus.id,
    source_id: request.lead.source_id,
    archetech_name: request.lead.archetech_name,
    archetech_number: request.lead.archetech_number,
    designer_remark: request.lead.designer_remark,
    vendor_id: request.vendor_id,
    franchise_id: request.lead.franchise_id,
    created_by: request.created_by,
    priority: request.lead.priority?.trim() || null,
    account_id: request.lead.account_id,
    is_small_order_request: true,
    client_required_order_login_complition_date: request.required_date,
    assign_to: null,
    assigned_by: null,
    is_draft: false,
  };

  const newLead = await tx.leadMaster.create({
    data: leadCreateData,
  });

  const mappingRows = new Map<
    string,
    {
      user_id: number;
      type: string;
      status: "active" | "inactive";
    }
  >();

  for (const mapping of parentLeadUserMappings) {
    const key = `${mapping.user_id}::${mapping.type}::${mapping.status}`;
    if (!mappingRows.has(key)) {
      mappingRows.set(key, {
        user_id: mapping.user_id,
        type: mapping.type,
        status: mapping.status,
      });
    }
  }

  const creatorMappingKey = `${request.created_by}::ISM::active`;
  if (!mappingRows.has(creatorMappingKey)) {
    mappingRows.set(creatorMappingKey, {
      user_id: request.created_by,
      type: "ISM",
      status: "active",
    });
  }

  if (mappingRows.size > 0) {
    await tx.leadUserMapping.createMany({
      data: Array.from(mappingRows.values()).map((mapping) => ({
        vendor_id: request.vendor_id,
        account_id: request.lead.account_id,
        lead_id: newLead.id,
        user_id: mapping.user_id,
        type: mapping.type,
        status: mapping.status,
        created_by: request.created_by,
      })),
    });
  }

  const chatRoom = await tx.leadChatRoom.create({
    data: {
      lead_id: newLead.id,
      vendor_id: request.vendor_id,
    },
  });

  const [superAdminUsers, adminUsers] = await Promise.all([
    tx.userMaster.findMany({
      where: {
        vendor_id: request.vendor_id,
        status: "active",
        user_type: { user_type: "super-admin" },
      },
      select: { id: true },
    }),
    request.lead.franchise_id
      ? tx.userMaster.findMany({
        where: {
          vendor_id: request.vendor_id,
          franchise_id: request.lead.franchise_id,
          status: "active",
          user_type: { user_type: "admin" },
        },
        select: { id: true },
      })
      : Promise.resolve([]),
  ]);

  const memberIds = new Set<number>([
    ...superAdminUsers.map((user: { id: number }) => user.id),
    ...adminUsers.map((user: { id: number }) => user.id),
    request.created_by,
  ]);

  for (const mapping of mappingRows.values()) {
    memberIds.add(mapping.user_id);
  }

  if (memberIds.size > 0) {
    await tx.leadChatMember.createMany({
      data: Array.from(memberIds).map((user_id) => ({
        chat_room_id: chatRoom.id,
        user_id,
        added_by: request.created_by,
      })),
      skipDuplicates: true,
    });
  }

  await tx.leadProductMapping.create({
    data: {
      vendor_id: request.vendor_id,
      lead_id: newLead.id,
      account_id: request.lead.account_id,
      product_type_id: smallOrderProductType.id,
      created_by: request.created_by,
    },
  });

  await tx.leadProductStructureMapping.create({
    data: {
      vendor_id: request.vendor_id,
      lead_id: newLead.id,
      account_id: request.lead.account_id,
      product_structure_id: othersStructure.id,
      created_by: request.created_by,
    },
  });

  const instanceCreatedAt = new Date();

  const instance = await tx.leadProductStructureInstance.create({
    data: {
      vendor_id: request.vendor_id,
      lead_id: newLead.id,
      account_id: request.lead.account_id,
      product_type_id: smallOrderProductType.id,
      product_structure_id: othersStructure.id,
      quantity_index: 1,
      title: othersStructure.type,
      description: null,
      created_by: request.created_by,
      created_at: instanceCreatedAt,
      is_tech_check_completed: true,
      tech_check_completed_at: instanceCreatedAt,
    },
  });

  await tx.leadStatusLogs.create({
    data: {
      lead_id: newLead.id,
      account_id: request.lead.account_id,
      vendor_id: request.vendor_id,
      status_id: orderLoginStatus.id,
      created_by: request.created_by,
      created_at: new Date(),
    },
  });

  const vendor = await tx.vendorMaster.findUnique({
    where: { id: request.vendor_id },
    select: { IsAccountLocInEnabled: true },
  });

  if (vendor?.IsAccountLocInEnabled) {
    const lockInService = new LeadSuperAdminApprovalLockInService();
    try {
      await lockInService.createOrderLoginLockIn(
        {
          vendor_id: request.vendor_id,
          lead_id: newLead.id,
          created_by: request.created_by,
          instance_id: instance.id,
          clientBaseUrl: process.env.CLIENT_BASE_URL || process.env.FRONTEND_URL || "http://localhost:3000",
        },
        tx
      );
    } catch (lockInError: any) {
      logger.warn(
        "Order Login lock-in creation failed during small order lead creation",
        {
          lead_id: newLead.id,
          instance_id: instance.id,
          error: lockInError?.message,
        }
      );
    }
  }

  await createLeadLog(tx, {
    vendor_id: request.vendor_id,
    lead_id: newLead.id,
    account_id: request.lead.account_id,
    action: `Small order lead created from parent lead ${request.parent_lead_code}`,
    action_type: "CREATE",
    created_by: request.created_by,
    created_at: new Date(),
  });

  await tx.smallOrderRequest.update({
    where: { id: request.id },
    data: {
      so_code: leadCode,
    },
  });

  return {
    leadId: newLead.id,
    leadCode,
    instanceId: instance.id,
    alreadyExists: false,
  };
};

const closeTask = async (
  tx: any,
  taskId: number,
  actedBy: number,
  remarkOverride?: string | null,
) => {
  const updatedTask = await tx.userLeadTask.update({
    where: { id: taskId },
    data: {
      status: "completed",
      closed_by: actedBy,
      closed_at: new Date(),
      updated_by: actedBy,
      ...(remarkOverride !== undefined ? { remark: remarkOverride } : {}),
    },
  });

  await createTaskHistoryLog({
    db: tx,
    task: updatedTask,
    createdBy: actedBy,
    actionType: "UPDATE",
  });

  return updatedTask;
};

const getTaskBoundSmallOrderRequest = async (taskId: number, leadId: number) => {
  const task = await prisma.userLeadTask.findFirst({
    where: {
      id: taskId,
      lead_id: leadId,
      task_type: SMALL_ORDER_REQUEST_TASK_TYPE,
    },
    select: {
      id: true,
      lead_id: true,
      vendor_id: true,
      user_id: true,
      status: true,
      created_at: true,
      created_by: true,
      small_order_request_id: true,
      smallOrderRequest: {
        select: {
          id: true,
          lead_id: true,
        },
      },
    },
  });

  if (!task) {
    throw new Error("Small order request task not found");
  }

  if (task.status === "completed") {
    throw new Error("This task is already completed");
  }

  if (task.small_order_request_id) {
    return {
      task,
      requestId: task.small_order_request_id,
    };
  }

  const fallbackRequest = await prisma.smallOrderRequest.findFirst({
    where: {
      lead_id: leadId,
      vendor_id: task.vendor_id,
      created_by: task.created_by,
      status: {
        in: ["pending_approval", "pending_approvals"],
      },
    },
    orderBy: {
      created_at: "desc",
    },
    select: {
      id: true,
    },
  });

  if (!fallbackRequest) {
    throw new Error("Linked small order request not found");
  }

  return {
    task,
    requestId: fallbackRequest.id,
  };
};

export const createSmallOrderRequest = async (
  input: CreateSmallOrderRequestInput,
) => {
  const { error, value } = createSmallOrderRequestSchema.validate(input);
  if (error) {
    throw new Error(
      `Validation failed: ${error.details.map((detail) => detail.message).join(", ")}`,
    );
  }

  const actor = await prisma.userMaster.findUnique({
    where: { id: value.created_by },
    select: {
      id: true,
      user_name: true,
      vendor_id: true,
      franchise_id: true,
      user_type: {
        select: {
          user_type: true,
        },
      },
    },
  });

  if (!actor) {
    throw new Error("Submitting user not found");
  }

  if (actor.vendor_id !== value.vendor_id) {
    throw new Error("Submitting user does not belong to this vendor");
  }

  const lead = await prisma.leadMaster.findUnique({
    where: { id: value.lead_id },
    select: {
      id: true,
      vendor_id: true,
      account_id: true,
      franchise_id: true,
      status_id: true,
      lead_code: true,
      firstname: true,
      lastname: true,
      usable_handover_completed_at: true,
      statusType: {
        select: {
          type: true,
        },
      },
    },
  });

  if (!lead) {
    throw new Error("Lead not found");
  }

  if (lead.vendor_id !== value.vendor_id) {
    throw new Error("Lead does not belong to this vendor");
  }

  if (!lead.account_id) {
    throw new Error("Lead account is missing");
  }

  const requestType = await prisma.smallOrderRequestTypeMaster.findFirst({
    where: {
      id: value.request_type_id,
      vendor_id: value.vendor_id,
      status: "active",
    },
    select: {
      id: true,
      type: true,
      type_key: true,
    },
  });

  if (!requestType) {
    throw new Error("Small order request type not found");
  }

  const requiredDate = startOfDay(new Date(value.required_date));
  const earliestRequiredDate = startOfDay(addDays(new Date(), 15));

  if (Number.isNaN(requiredDate.getTime())) {
    throw new Error("Required date is invalid");
  }

  if (requiredDate < earliestRequiredDate) {
    throw new Error(
      `Required Date must be on or after ${formatDate(earliestRequiredDate)}`,
    );
  }

  const actorRole = actor.user_type.user_type.trim().toLowerCase();
  const sourceLabel =
    value.request_source === "final_handover"
      ? "Final Handover"
      : "Under Installation";
  const customerName =
    `${lead.firstname ?? ""} ${lead.lastname ?? ""}`.trim() || "Unknown Customer";

  const siteSupervisorsRaw = await getSiteSupervisorRecipients(
    value.vendor_id,
    value.lead_id,
    value.created_by,
  );
  const siteSupervisorRecipients = siteSupervisorsRaw.map((item) => item.user);

  const { recipients: franchiseAdmins, isSuperAdminFallback } = await getFranchiseAdminRecipients({
    vendorId: value.vendor_id,
    franchiseId: lead.franchise_id ?? actor.franchise_id ?? null,
    excludeUserId: value.created_by,
  });

  const superAdmins = await getSuperAdminRecipients(
    value.vendor_id,
    value.created_by,
  );

  const recipientMap = new Map<number, { id: number; user_name: string | null; user_email: string | null }>();
  const adminRecipients =
    franchiseAdmins.length > 0 ? franchiseAdmins : superAdmins;

  if (actorRole === "sales-executive") {
    for (const recipient of adminRecipients) {
      recipientMap.set(recipient.id, recipient);
    }

    for (const recipient of siteSupervisorRecipients) {
      recipientMap.set(recipient.id, recipient);
    }
  } else if (actorRole === "admin") {
    for (const recipient of siteSupervisorRecipients) {
      recipientMap.set(recipient.id, recipient);
    }
  } else if (actorRole !== "super-admin") {
    throw new Error("You are not allowed to create a small order request");
  }

  if (actorRole !== "super-admin" && recipientMap.size === 0) {
    throw new Error("No approval recipients found for this small order request");
  }

  const uploadedFiles = await uploadSmallOrderRequestFiles(
    input.documents ?? [],
    value.vendor_id,
    value.lead_id,
  );

  const dueDate = addDays(startOfDay(new Date()), 1);
  const taskRemark = buildTaskRemark({
    sourceLabel,
    parentLeadCode: lead.lead_code,
    customerName,
    requestType: requestType.type,
    requiredDate,
    remarks: value.remarks,
  });

  const { createdTasks, ...requestResult } = await prisma.$transaction(async (tx) => {
    const existingCount = await tx.smallOrderRequest.count({
      where: {
        vendor_id: value.vendor_id,
        lead_id: value.lead_id,
      },
    });

    const smallOrderRequest = await tx.smallOrderRequest.create({
      data: {
        vendor_id: value.vendor_id,
        lead_id: value.lead_id,
        parent_lead_code: lead.lead_code,
        customer_name: customerName,
        status: actorRole === "super-admin" ? "approved" : "pending_approval",
        request_source: value.request_source,
        request_type_id: requestType.id,
        required_date: requiredDate,
        remarks: value.remarks?.trim() || null,
        supervisor_approved: actorRole === "super-admin",
        supervisor_approved_at:
          actorRole === "super-admin" ? new Date() : null,
        admin_approved: actorRole === "super-admin" || actorRole === "admin",
        admin_approved_at:
          (actorRole === "super-admin" || actorRole === "admin") ? new Date() : null,
        created_by: value.created_by,
        is_merge_to_parent_on_installation:
          value.request_source === "post_dispatch",
        usable_handover_date_snapshot: lead.usable_handover_completed_at ?? null,
        small_order_sequence: existingCount + 1,
      },
      include: {
        requestType: {
          select: {
            id: true,
            type: true,
            type_key: true,
          },
        },
      },
    });

    const documentTypeId = await getSmallOrderRequestDocumentTypeId(
      tx,
      value.vendor_id,
      lead.statusType?.type ?? null,
    );

    const createdDocuments: Array<{ id: number }> = [];
    for (const file of uploadedFiles) {
      const document = await tx.leadDocuments.create({
        data: {
          doc_og_name: file.originalName,
          doc_sys_name: file.sysName,
          created_by: value.created_by,
          doc_type_id: documentTypeId,
          account_id: lead.account_id,
          lead_id: lead.id,
          vendor_id: value.vendor_id,
        },
        select: { id: true },
      });

      createdDocuments.push(document);

      await tx.smallOrderRequestDocument.create({
        data: {
          vendor_id: value.vendor_id,
          small_order_request_id: smallOrderRequest.id,
          document_id: document.id,
          created_by: value.created_by,
        },
      });
    }

    const createdTasks = [];
    for (const recipient of recipientMap.values()) {
      const task = await tx.userLeadTask.create({
        data: {
          lead_id: lead.id,
          account_id: lead.account_id!,
          vendor_id: value.vendor_id,
          franchise_id: lead.franchise_id ?? actor.franchise_id ?? undefined,
          user_id: recipient.id,
          small_order_request_id: smallOrderRequest.id,
          task_type: SMALL_ORDER_REQUEST_TASK_TYPE,
          lead_stage: lead.statusType?.type ?? null,
          due_date: dueDate,
          remark: taskRemark,
          status: "open",
          created_by: value.created_by,
        },
      });

      await createTaskHistoryLog({
        db: tx,
        task,
        createdBy: value.created_by,
        actionType: "CREATE",
      });

      createdTasks.push(task);
    }

    let createdLead: { leadId?: number; leadCode: string; instanceId?: number; alreadyExists: boolean } | null =
      null;

    if (actorRole === "super-admin") {
      createdLead = await createSmallOrderLeadFromRequest({
        tx,
        smallOrderRequestId: smallOrderRequest.id,
      });
    }

    return {
      ...smallOrderRequest,
      documents_count: createdDocuments.length,
      tasks_created: createdTasks.length,
      created_lead: createdLead,
      createdTasks,
    };
  });

  // Trigger notifications and emails asynchronously outside database transaction
  const siteSupervisorIds = new Set(siteSupervisorRecipients.map((u) => u.id));
  const adminIds = new Set(adminRecipients.map((u) => u.id));
  const baseUrl = process.env.CLIENT_BASE_URL || process.env.FRONTEND_URL || "http://localhost:3000";

  for (const task of createdTasks) {
    const recipient = recipientMap.get(task.user_id);
    if (!recipient) continue;

    const leadCode = lead.lead_code ?? `LEAD-${String(lead.id).padStart(4, "0")}`;
    const leadName = customerName;

    // 1. Send In-App Notification (Redirecting to /dashboard/my-tasks?taskId=...)
    if (siteSupervisorIds.has(task.user_id)) {
      // In-App Notification for Site Supervisor
      NotificationService.createAndSend({
        vendor_id: value.vendor_id,
        user_id: task.user_id,
        sender_id: value.created_by,
        type: NotificationType.TASK_ASSIGNED,
        title: "Small Order Approval Request",
        message: `A Small Order request for ${leadCode} - ${leadName} is pending your approval.`,
        entity_type: "small_order_request",
        entity_id: requestResult.id,
        redirect_url: `/dashboard/my-tasks?taskId=${task.id}`,
      }).catch((err: any) => {
        logger.error(`[InAppNotification] Failed to send supervisor notification:`, err);
      });
    } else if (adminIds.has(task.user_id)) {
      // In-App Notification for Admin
      NotificationService.createAndSend({
        vendor_id: value.vendor_id,
        user_id: task.user_id,
        sender_id: value.created_by,
        type: NotificationType.TASK_ASSIGNED,
        title: "Small Order Approval Request",
        message: `A Small Order request for ${leadCode} - ${leadName} is pending your approval.`,
        entity_type: "small_order_request",
        entity_id: requestResult.id,
        redirect_url: `/dashboard/my-tasks?taskId=${task.id}`,
      }).catch((err: any) => {
        logger.error(`[InAppNotification] Failed to send admin notification:`, err);
      });
    }

    // 2. Send Email Notification (only when raised by sales-executive or admin)
    if ((actorRole === "sales-executive" || actorRole === "admin") && recipient.user_email) {
      if (siteSupervisorIds.has(task.user_id)) {
        sendSmallOrderRequestSiteSupervisorApprovalEmail({
          vendor_id: value.vendor_id,
          toEmail: recipient.user_email,
          site_supervisor_name: recipient.user_name || "Site Supervisor",
          leadCode,
          leadName,
          sales_executive_name: actor.user_name || (actorRole === "admin" ? "Admin" : "Sales Executive"),
          projectUrl: `${baseUrl}/dashboard/my-tasks?taskId=${task.id}`,
        }).catch((err: any) => {
          logger.error(`[EmailNotification] Failed to send supervisor approval email to ${recipient.user_email}:`, err);
        });
      } else if (adminIds.has(task.user_id)) {
        sendSmallOrderRequestStoreAdminApprovalEmail({
          vendor_id: value.vendor_id,
          toEmail: recipient.user_email,
          store_admin_name: recipient.user_name || "Store Admin",
          leadCode,
          leadName,
          sales_executive_name: actor.user_name || "Sales Executive",
          projectUrl: `${baseUrl}/dashboard/my-tasks?taskId=${task.id}`,
        }).catch((err: any) => {
          logger.error(`[EmailNotification] Failed to send store admin approval email to ${recipient.user_email}:`, err);
        });
      }
    }
  }

  // If created by super-admin, it is automatically approved. Send notifications to backend users mapped to parent lead.
  if (actorRole === "super-admin" && requestResult.created_lead?.leadId) {
    const parentLeadCode = lead.lead_code ?? `LEAD-${String(lead.id).padStart(4, "0")}`;
    const parentLeadName = customerName;
    const orderLoginUrl = `${baseUrl}/dashboard/production/order-login/details/${requestResult.created_lead.leadId}?accountId=${lead.account_id}&instance_id=${requestResult.created_lead.instanceId}`;

    // Fetch backend users mapped to parent lead
    prisma.leadUserMapping.findMany({
      where: {
        vendor_id: value.vendor_id,
        lead_id: value.lead_id,
        status: "active",
        user: {
          status: "active",
          user_type: {
            user_type: { equals: "backend", mode: "insensitive" },
          },
        },
      },
      select: {
        user: {
          select: { id: true, user_name: true, user_email: true },
        },
      },
    }).then((backendMappings) => {
      for (const mapping of backendMappings) {
        if (!mapping.user) continue;

        // 1. In-App Notification
        NotificationService.createAndSend({
          vendor_id: value.vendor_id,
          user_id: mapping.user.id,
          sender_id: value.created_by,
          type: NotificationType.TASK_ASSIGNED,
          title: "New Small Order Lead Assigned",
          message: `A Small Order lead for ${parentLeadCode} - ${parentLeadName} is assigned to you for Order Login.`,
          entity_type: "small_order_request",
          entity_id: requestResult.id,
          redirect_url: `/dashboard/production/order-login/details/${requestResult.created_lead!.leadId}?accountId=${lead.account_id}&instance_id=${requestResult.created_lead!.instanceId}`,
        }).catch((err) => {
          logger.error(`[InAppNotification] Failed to send assigned notification to backend user ${mapping.user.id}:`, err);
        });

        // 2. Email Update to Backend User
        if (mapping.user.user_email) {
          sendNewSmallOrderLeadAssignedEmail({
            vendor_id: value.vendor_id,
            toEmail: mapping.user.user_email,
            order_login_user_name: mapping.user.user_name || "Order Login User",
            leadCode: parentLeadCode,
            leadName: parentLeadName,
            projectUrl: orderLoginUrl,
          }).catch((err) => {
            logger.error(`[EmailNotification] Failed to send assigned email to backend user ${mapping.user.user_email}:`, err);
          });
        }
      }
    }).catch((err) => {
      logger.error(`Failed to fetch backend users for super-admin small order request creation:`, err);
    });
  }

  return requestResult;
};

export const actOnSmallOrderRequestTask = async (
  input: ActOnSmallOrderRequestTaskInput,
) => {
  const action = input.action?.trim().toLowerCase();
  if (action !== "approve" && action !== "reject") {
    throw new Error("Invalid action");
  }

  if (!input.lead_id || !input.task_id || !input.acted_by) {
    throw new Error("lead_id, task_id, and acted_by are required");
  }

  if (action === "reject" && !input.remark?.trim()) {
    throw new Error("Remark is required for rejection");
  }

  const actor = await prisma.userMaster.findUnique({
    where: { id: input.acted_by },
    select: {
      id: true,
      user_name: true,
      vendor_id: true,
      user_type: {
        select: {
          user_type: true,
        },
      },
    },
  });

  if (!actor) {
    throw new Error("Acting user not found");
  }

  const { task, requestId } = await getTaskBoundSmallOrderRequest(
    input.task_id,
    input.lead_id,
  );

  if (actor.vendor_id !== task.vendor_id) {
    throw new Error("User does not belong to this vendor");
  }

  const actorRole = actor.user_type.user_type.trim().toLowerCase();

  const result = await prisma.$transaction(async (tx) => {
    const smallOrderRequest = await tx.smallOrderRequest.findUnique({
      where: { id: requestId },
      include: {
        lead: {
          select: {
            lead_code: true,
            firstname: true,
            lastname: true,
            account_id: true,
          },
        },
        createdBy: {
          select: {
            id: true,
            user_name: true,
            user_email: true,
            user_type: {
              select: {
                user_type: true,
              },
            },
          },
        },
        tasks: {
          where: {
            task_type: SMALL_ORDER_REQUEST_TASK_TYPE,
            status: { not: "completed" },
          },
          select: {
            id: true,
            user_id: true,
          },
        },
      },
    });

    if (!smallOrderRequest) {
      throw new Error("Small order request not found");
    }

    const creatorRole =
      smallOrderRequest.createdBy.user_type.user_type.trim().toLowerCase();

    if (creatorRole === "super-admin") {
      throw new Error(
        "No approval action is required for small order requests raised by super-admin",
      );
    }

    if (action === "reject") {
      await tx.smallOrderRequest.update({
        where: { id: smallOrderRequest.id },
        data: {
          status: "rejected",
          rejection_reason: input.remark?.trim() || null,
          updated_by: input.acted_by,
        },
      });

      const openTasks = await tx.userLeadTask.findMany({
        where: {
          small_order_request_id: smallOrderRequest.id,
          task_type: SMALL_ORDER_REQUEST_TASK_TYPE,
          status: { not: "completed" },
        },
        select: { id: true },
      });

      for (const openTask of openTasks) {
        await closeTask(
          tx,
          openTask.id,
          input.acted_by,
          input.remark?.trim() || undefined,
        );
      }

      return {
        success: true,
        status: "rejected",
        smallOrderRequestId: smallOrderRequest.id,
        leadCode: smallOrderRequest.lead.lead_code,
        leadName: `${smallOrderRequest.lead.firstname ?? ""} ${smallOrderRequest.lead.lastname ?? ""}`.trim(),
        createdBy: smallOrderRequest.createdBy,
        actorName: actor.user_name,
        actorRole: actorRole,
        rejectionReason: input.remark?.trim() || "",
      };
    }

    const approvalData: Record<string, any> = {
      updated_by: input.acted_by,
    };

    if (creatorRole === "sales-executive") {
      if (actorRole === "site-supervisor") {
        approvalData.supervisor_approved = true;
        approvalData.supervisor_approved_at = new Date();
      } else if (actorRole === "admin" || actorRole === "super-admin") {
        approvalData.admin_approved = true;
        approvalData.admin_approved_at = new Date();
      } else {
        throw new Error("You are not allowed to approve this request");
      }
    } else if (creatorRole === "admin") {
      if (actorRole !== "site-supervisor") {
        throw new Error("Only site-supervisor can approve this request");
      }

      const approvalTimestamp = new Date();
      approvalData.supervisor_approved = true;
      approvalData.supervisor_approved_at = approvalTimestamp;
      approvalData.admin_approved = true;
      approvalData.admin_approved_at = approvalTimestamp;
    } else {
      throw new Error("Unsupported small order request creator role");
    }

    await closeTask(tx, input.task_id, input.acted_by);

    const afterApproval = await tx.smallOrderRequest.update({
      where: { id: smallOrderRequest.id },
      data: approvalData,
      select: {
        id: true,
        supervisor_approved: true,
        admin_approved: true,
      },
    });

    const isFullyApproved =
      afterApproval.supervisor_approved && afterApproval.admin_approved;

    await tx.smallOrderRequest.update({
      where: { id: smallOrderRequest.id },
      data: {
        status: isFullyApproved ? "approved" : "pending_approvals",
        updated_by: input.acted_by,
      },
    });

    let createdLead:
      | { leadId?: number; leadCode: string; instanceId?: number; alreadyExists: boolean }
      | null = null;

    if (isFullyApproved) {
      createdLead = await createSmallOrderLeadFromRequest({
        tx,
        smallOrderRequestId: smallOrderRequest.id,
      });
    }

    return {
      success: true,
      status: isFullyApproved ? "approved" : "pending_approvals",
      created_lead: createdLead,
      smallOrderRequestId: smallOrderRequest.id,
      leadCode: smallOrderRequest.lead.lead_code,
      leadName: `${smallOrderRequest.lead.firstname ?? ""} ${smallOrderRequest.lead.lastname ?? ""}`.trim(),
      leadAccountId: smallOrderRequest.lead.account_id,
      createdBy: smallOrderRequest.createdBy,
      actorName: actor.user_name,
      actorRole: actorRole,
      isFullyApproved,
    };
  });

  // Trigger email and in-app notifications outside the transaction scope
  const baseUrl = process.env.CLIENT_BASE_URL || process.env.FRONTEND_URL || "http://localhost:3000";
  const leadCode = result.leadCode ?? `LEAD-${String(result.smallOrderRequestId).padStart(4, "0")}`;
  const leadName = result.leadName;
  const relativeProjectUrl = `/dashboard/installation/under-installation/details/${input.lead_id}?accountId=${result.leadAccountId}`;
  const projectUrl = `${baseUrl}${relativeProjectUrl}`;

  if (result.status === "rejected") {
    // REJECTION ACTION
    if (result.actorRole === "site-supervisor") {
      // 1. In-App Notification
      NotificationService.createAndSend({
        vendor_id: actor.vendor_id,
        user_id: result.createdBy.id,
        sender_id: input.acted_by,
        type: NotificationType.TASK_ASSIGNED,
        title: `${result.actorName || "Site Supervisor"} Rejected`,
        message: `${result.actorName || "Site Supervisor"} has rejected the Small Order request for ${leadCode} - ${leadName}.`,
        entity_type: "small_order_request",
        entity_id: result.smallOrderRequestId,
        redirect_url: relativeProjectUrl,
      }).catch((err: any) => {
        logger.error(`[InAppNotification] Failed to send supervisor rejection notification:`, err);
      });

      // 2. Email Update to Sales Executive
      if (result.createdBy.user_email) {
        sendSmallOrderRequestSupervisorRejectedEmail({
          vendor_id: actor.vendor_id,
          toEmail: result.createdBy.user_email,
          sales_executive_name: result.createdBy.user_name || "Sales Executive",
          leadCode,
          leadName,
          site_supervisor_name: result.actorName || "Site Supervisor",
          rejection_reason: result.rejectionReason ?? "",
          projectUrl,
        }).catch((err: any) => {
          logger.error(`[EmailNotification] Failed to send supervisor rejection email:`, err);
        });
      }
    } else if (result.actorRole === "admin" || result.actorRole === "super-admin") {
      // 1. In-App Notification
      NotificationService.createAndSend({
        vendor_id: actor.vendor_id,
        user_id: result.createdBy.id,
        sender_id: input.acted_by,
        type: NotificationType.TASK_ASSIGNED,
        title: `${result.actorName || "Store Admin"} Rejected`,
        message: `${result.actorName || "Store Admin"} has rejected the Small Order request for ${leadCode} - ${leadName}.`,
        entity_type: "small_order_request",
        entity_id: result.smallOrderRequestId,
        redirect_url: relativeProjectUrl,
      }).catch((err: any) => {
        logger.error(`[InAppNotification] Failed to send store admin rejection notification:`, err);
      });

      // 2. Email Update to Sales Executive
      if (result.createdBy.user_email) {
        sendSmallOrderRequestAdminRejectedEmail({
          vendor_id: actor.vendor_id,
          toEmail: result.createdBy.user_email,
          sales_executive_name: result.createdBy.user_name || "Sales Executive",
          leadCode,
          leadName,
          store_admin_name: result.actorName || "Store Admin",
          rejection_reason: result.rejectionReason ?? "",
          projectUrl,
        }).catch((err: any) => {
          logger.error(`[EmailNotification] Failed to send store admin rejection email:`, err);
        });
      }
    }
  } else {
    // APPROVAL ACTION
    if (result.actorRole === "site-supervisor") {
      // 1. In-App Notification
      NotificationService.createAndSend({
        vendor_id: actor.vendor_id,
        user_id: result.createdBy.id,
        sender_id: input.acted_by,
        type: NotificationType.TASK_ASSIGNED,
        title: `${result.actorName || "Site Supervisor"} Approved`,
        message: `${result.actorName || "Site Supervisor"} has approved the Small Order request for ${leadCode} - ${leadName}.`,
        entity_type: "small_order_request",
        entity_id: result.smallOrderRequestId,
        redirect_url: relativeProjectUrl,
      }).catch((err: any) => {
        logger.error(`[InAppNotification] Failed to send supervisor approval notification:`, err);
      });

      // 2. Email Update to Sales Executive
      if (result.createdBy.user_email) {
        sendSmallOrderRequestSupervisorApprovedEmail({
          vendor_id: actor.vendor_id,
          toEmail: result.createdBy.user_email,
          sales_executive_name: result.createdBy.user_name || "Sales Executive",
          leadCode,
          leadName,
          site_supervisor_name: result.actorName || "Site Supervisor",
          projectUrl,
        }).catch((err: any) => {
          logger.error(`[EmailNotification] Failed to send supervisor approval email:`, err);
        });
      }
    } else if (result.actorRole === "admin" || result.actorRole === "super-admin") {
      // 1. In-App Notification
      NotificationService.createAndSend({
        vendor_id: actor.vendor_id,
        user_id: result.createdBy.id,
        sender_id: input.acted_by,
        type: NotificationType.TASK_ASSIGNED,
        title: `${result.actorName || "Store Admin"} Approved`,
        message: `${result.actorName || "Store Admin"} has approved the Small Order request for ${leadCode} - ${leadName}.`,
        entity_type: "small_order_request",
        entity_id: result.smallOrderRequestId,
        redirect_url: relativeProjectUrl,
      }).catch((err: any) => {
        logger.error(`[InAppNotification] Failed to send store admin approval notification:`, err);
      });

      // 2. Email Update to Sales Executive
      if (result.createdBy.user_email) {
        sendSmallOrderRequestAdminApprovedEmail({
          vendor_id: actor.vendor_id,
          toEmail: result.createdBy.user_email,
          sales_executive_name: result.createdBy.user_name || "Sales Executive",
          leadCode,
          leadName,
          store_admin_name: result.actorName || "Store Admin",
          projectUrl,
        }).catch((err: any) => {
          logger.error(`[EmailNotification] Failed to send store admin approval email:`, err);
        });
      }
    }

    // Fully Approved Updates
    if (result.isFullyApproved && result.created_lead?.leadId) {
      const orderLoginUrl = `${baseUrl}/dashboard/production/order-login/details/${result.created_lead.leadId}?accountId=${result.leadAccountId}&instance_id=${result.created_lead.instanceId}`;

      // 1. Email Update to Sales Executive (Creator of the Small Order Request)
      if (result.createdBy?.user_email) {
        sendSmallOrderRequestFullyApprovedEmail({
          vendor_id: actor.vendor_id,
          toEmail: result.createdBy.user_email,
          sales_executive_name: result.createdBy.user_name || "Sales Executive",
          leadCode,
          leadName,
          projectUrl: projectUrl,
        }).catch((err: any) => {
          logger.error(`[EmailNotification] Failed to send fully approved email to sales executive ${result.createdBy.user_email}:`, err);
        });
      }

      // Fetch backend users mapped to parent lead
      prisma.leadUserMapping.findMany({
        where: {
          vendor_id: actor.vendor_id,
          lead_id: input.lead_id,
          status: "active",
          user: {
            status: "active",
            user_type: {
              user_type: { equals: "backend", mode: "insensitive" },
            },
          },
        },
        select: {
          user: {
            select: { id: true, user_name: true, user_email: true },
          },
        },
      }).then((backendMappings) => {
        for (const mapping of backendMappings) {
          if (!mapping.user) continue;

          // 2. In-App Notification to Backend User (Redirect to Order Login Details)
          NotificationService.createAndSend({
            vendor_id: actor.vendor_id,
            user_id: mapping.user.id,
            sender_id: input.acted_by,
            type: NotificationType.TASK_ASSIGNED,
            title: "New Small Order Lead Assigned",
            message: `A Small Order lead for ${leadCode} - ${leadName} is assigned to you for Order Login.`,
            entity_type: "small_order_request",
            entity_id: result.smallOrderRequestId,
            redirect_url: `/dashboard/production/order-login/details/${result.created_lead!.leadId}?accountId=${result.leadAccountId}&instance_id=${result.created_lead!.instanceId}`,
          }).catch((err: any) => {
            logger.error(`[InAppNotification] Failed to send assigned notification to backend user ${mapping.user.id}:`, err);
          });

          // 3. Email Update to Backend User
          if (mapping.user.user_email) {
            sendNewSmallOrderLeadAssignedEmail({
              vendor_id: actor.vendor_id,
              toEmail: mapping.user.user_email,
              order_login_user_name: mapping.user.user_name || "Order Login User",
              leadCode,
              leadName,
              projectUrl: orderLoginUrl,
            }).catch((err: any) => {
              logger.error(`[EmailNotification] Failed to send assigned email to backend user ${mapping.user.user_email}:`, err);
            });
          }
        }
      }).catch((err) => {
        logger.error(`Failed to fetch backend users for small order fully approved update:`, err);
      });
    }
  }

  return {
    success: result.success,
    status: result.status,
    created_lead: result.created_lead,
  };
};
