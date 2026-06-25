import Joi from "joi";
import fs from "node:fs/promises";
import { prisma } from "../../prisma/client";
import logger from "../../utils/logger";
import { cache } from "../../utils/cache";
import { NotificationType } from "../../prisma/generated";
import {
  generateSignedUrl,
  uploadToWasabiInitialSiteMeasurementFile,
} from "../../utils/wasabiClient";
import { NotificationService } from "../notification/notification.service";
import { createTaskHistoryLog } from "../task/taskHistory.service";
import { CHSSelectionTypeMappingService } from "./desigingStage/chs-selection-type-mapping.service";

const FAST_PRODUCTION_REQUEST_TASK_TYPE = "Request Fast Production";
const FAST_PRODUCTION_REQUEST_DOCUMENT_TAG = "FAST_PRODUCTION_REQUEST_DOCUMENT";

const fastProductionDraftSchema = Joi.object({
  lead_id: Joi.number().integer().positive().required(),
  vendor_id: Joi.number().integer().positive().required(),
  created_by: Joi.number().integer().positive().required(),
  instance_id: Joi.number().integer().positive().required(),
  carcass_finish_category: Joi.array().items(Joi.string().trim()).min(1).required(),
  carcass_finish_description: Joi.string().trim().required(),
  shutter_finish_category: Joi.array().items(Joi.string().trim()).min(1).required(),
  shutter_finish_description: Joi.string().trim().required(),
  handles_finish_category: Joi.array().items(Joi.string().trim()).min(1).required(),
  handles_finish_description: Joi.string().trim().required(),
  hardware_selection: Joi.string().trim().required(),
  accessory_selection: Joi.string().trim().required(),
  special_requirements: Joi.string().trim().required(),
  client_required_delivery_date: Joi.alternatives()
    .try(Joi.string().isoDate(), Joi.date())
    .required(),
  remarks: Joi.string().allow("", null).max(1000).optional(),
  terms_version: Joi.string().allow("", null).max(100).optional(),
  documents: Joi.array().optional(),
});

const finalizeFastProductionBatchSchema = Joi.object({
  batch_id: Joi.number().integer().positive().optional(),
  lead_id: Joi.number().integer().positive().required(),
  vendor_id: Joi.number().integer().positive().required(),
  created_by: Joi.number().integer().positive().required(),
});

const fastProductionTaskActionSchema = Joi.object({
  lead_id: Joi.number().integer().positive().required(),
  task_id: Joi.number().integer().positive().required(),
  action: Joi.string().valid("approve", "reject").required(),
  acted_by: Joi.number().integer().positive().required(),
  remark: Joi.string().allow("", null).optional(),
});

type UploadedFastProductionFile = {
  originalName: string;
  sysName: string;
};

type FastProductionFinishRow = {
  component: "CARCASS" | "SHUTTER" | "HANDLE";
  finish_category: string;
  finish_description: string;
};

export interface SaveFastProductionDraftInput {
  lead_id: number;
  vendor_id: number;
  created_by: number;
  instance_id: number;
  carcass_finish_category: string[];
  carcass_finish_description: string;
  shutter_finish_category: string[];
  shutter_finish_description: string;
  handles_finish_category: string[];
  handles_finish_description: string;
  hardware_selection: string;
  accessory_selection: string;
  special_requirements: string;
  client_required_delivery_date: string | Date;
  remarks?: string | null;
  terms_version?: string | null;
  documents?: Express.Multer.File[];
}

export interface FinalizeFastProductionBatchInput {
  batch_id?: number;
  lead_id: number;
  vendor_id: number;
  created_by: number;
}

export interface ActOnFastProductionRequestTaskInput {
  lead_id: number;
  task_id: number;
  action: "approve" | "reject";
  acted_by: number;
  remark?: string | null;
}

const normalizeRole = (role?: string | null) => role?.trim().toLowerCase() ?? "";

const getMonthBucket = (date = new Date()) =>
  new Date(date.getFullYear(), date.getMonth(), 1);

const getTomorrowDueDate = () => {
  const tomorrow = new Date();
  tomorrow.setHours(0, 0, 0, 0);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return tomorrow;
};

const joinFinishValues = (values: string[]) =>
  values
    .map((value) => value.trim())
    .filter(Boolean)
    .join(", ")
    .slice(0, 255);

const splitFinishValues = (value?: string | null) =>
  String(value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

const normalizeLookupLabel = (value?: string | null) =>
  value?.trim().toLowerCase() ?? "";

const getFastProductionDocumentTypeId = async (
  tx: any,
  vendorId: number,
  stage?: string | null,
) => {
  const existingDocType = await tx.documentTypeMaster.findFirst({
    where: {
      vendor_id: vendorId,
      tag: FAST_PRODUCTION_REQUEST_DOCUMENT_TAG,
    },
    select: { id: true },
  });

  if (existingDocType) {
    return existingDocType.id;
  }

  const createdDocType = await tx.documentTypeMaster.create({
    data: {
      vendor_id: vendorId,
      tag: FAST_PRODUCTION_REQUEST_DOCUMENT_TAG,
      type: "Fast Production Request Document",
      doc_title: "Fast Production Request Documents",
      stage: stage ?? "Fast Production Request",
    },
    select: { id: true },
  });

  return createdDocType.id;
};

const uploadFastProductionFiles = async (
  files: Express.Multer.File[],
  vendorId: number,
  leadId: number,
) => {
  const uploadedFiles: UploadedFastProductionFile[] = [];

  for (const file of files) {
    const sysName = await uploadToWasabiInitialSiteMeasurementFile(
      file.path,
      vendorId,
      leadId,
      file.originalname,
      file.mimetype,
      "fast_production_requests",
    );

    uploadedFiles.push({
      originalName: file.originalname,
      sysName,
    });

    await fs.unlink(file.path).catch(() => undefined);
  }

  return uploadedFiles;
};

const syncApprovedFastProductionSelections = async (
  tx: any,
  batchId: number,
  actedBy: number,
) => {
  const requests = await tx.fastProductionRequest.findMany({
    where: { batch_id: batchId },
    select: {
      lead_id: true,
      account_id: true,
      vendor_id: true,
      instance_id: true,
      created_by: true,
      finishes: {
        select: {
          component: true,
          finish_category: true,
          finish_description: true,
        },
      },
    },
  });

  if (requests.length === 0) {
    return;
  }

  const leadId = requests[0].lead_id;
  const vendorId = requests[0].vendor_id;

  const [existingSelections, carcassTypes, shutterTypes, handleTypes] =
    await Promise.all([
      tx.leadDesignSelection.findMany({
        where: {
          lead_id: leadId,
          vendor_id: vendorId,
          type: { in: ["Carcas", "Shutter", "Handles"] },
        },
        select: {
          id: true,
          type: true,
          product_structure_instance_id: true,
        },
        orderBy: [{ updated_at: "desc" }, { created_at: "desc" }],
      }),
      tx.carcassTypeMaster.findMany({
        where: { vendor_id: vendorId },
        select: { id: true, name: true },
      }),
      tx.shutterTypeMaster.findMany({
        where: { vendor_id: vendorId },
        select: {
          id: true,
          name: true,
          subTypes: {
            select: { id: true, name: true },
            orderBy: { name: "asc" },
          },
        },
      }),
      tx.handleTypeMaster.findMany({
        where: { vendor_id: vendorId },
        select: { id: true, name: true },
      }),
    ]);

  const carcassIdByLabel = new Map<string, number[]>();
  const handleIdByLabel = new Map<string, number[]>();
  const shutterTypeMatchesByLabel = new Map<string, Array<{ shutter_type_id: number }>>();
  const shutterSubTypeMatchesByLabel = new Map<
    string,
    Array<{ shutter_type_id: number; shutter_sub_type_id: number }>
  >();

  for (const carcassType of carcassTypes) {
    const key = normalizeLookupLabel(carcassType.name);
    if (!key) continue;
    carcassIdByLabel.set(key, [...(carcassIdByLabel.get(key) ?? []), carcassType.id]);
  }

  for (const handleType of handleTypes) {
    const key = normalizeLookupLabel(handleType.name);
    if (!key) continue;
    handleIdByLabel.set(key, [...(handleIdByLabel.get(key) ?? []), handleType.id]);
  }

  for (const shutterType of shutterTypes) {
    const typeKey = normalizeLookupLabel(shutterType.name);
    if (typeKey) {
      shutterTypeMatchesByLabel.set(typeKey, [
        ...(shutterTypeMatchesByLabel.get(typeKey) ?? []),
        { shutter_type_id: shutterType.id },
      ]);
    }

    for (const subType of shutterType.subTypes ?? []) {
      const subTypeKey = normalizeLookupLabel(subType.name);
      if (!subTypeKey) continue;
      shutterSubTypeMatchesByLabel.set(subTypeKey, [
        ...(shutterSubTypeMatchesByLabel.get(subTypeKey) ?? []),
        {
          shutter_type_id: shutterType.id,
          shutter_sub_type_id: subType.id,
        },
      ]);
    }
  }

  const upsertSelectionWithMappings = async (params: {
    accountId: number;
    instanceId: number;
    createdBy: number;
    type: "Carcas" | "Shutter" | "Handles";
    desc: string;
    items: Array<{
      carcass_type_id?: number | null;
      shutter_type_id?: number | null;
      shutter_sub_type_id?: number | null;
      handle_type_id?: number | null;
    }>;
  }) => {
    const existingSelection = existingSelections.find(
      (selection: {
        type: string;
        product_structure_instance_id: number | null;
      }) =>
        selection.type === params.type &&
        (selection.product_structure_instance_id ?? null) === params.instanceId,
    );

    const savedSelection = existingSelection
      ? await tx.leadDesignSelection.update({
          where: { id: existingSelection.id },
          data: {
            desc: params.desc,
            updated_by: actedBy,
          },
          select: { id: true },
        })
      : await tx.leadDesignSelection.create({
          data: {
            lead_id: leadId,
            account_id: params.accountId,
            vendor_id: vendorId,
            type: params.type,
            desc: params.desc,
            created_by: params.createdBy,
            product_structure_instance_id: params.instanceId,
          },
          select: { id: true },
        });

    await tx.cHSSelectionTypeMapping.deleteMany({
      where: { selection_id: savedSelection.id },
    });

    if (params.items.length > 0) {
      await tx.cHSSelectionTypeMapping.createMany({
        data: params.items.map((item) => ({
          vendor_id: vendorId,
          lead_id: leadId,
          selection_id: savedSelection.id,
          carcass_type_id: item.carcass_type_id ?? null,
          shutter_type_id: item.shutter_type_id ?? null,
          shutter_sub_type_id: item.shutter_sub_type_id ?? null,
          handle_type_id: item.handle_type_id ?? null,
          created_by: actedBy,
        })),
      });
    }
  };

  for (const request of requests) {
    const finishByComponent = new Map<
      FastProductionFinishRow["component"],
      FastProductionFinishRow
    >(
      (request.finishes as FastProductionFinishRow[]).map((finish) => [
        finish.component,
        finish,
      ]),
    );

    const carcassFinish = finishByComponent.get("CARCASS");
    const shutterFinish = finishByComponent.get("SHUTTER");
    const handleFinish = finishByComponent.get("HANDLE");

    const carcassItems = splitFinishValues(carcassFinish?.finish_category).flatMap(
      (label) =>
        (carcassIdByLabel.get(normalizeLookupLabel(label)) ?? []).map((id) => ({
          carcass_type_id: id,
        })),
    );

    const selectedCarcassIds = carcassItems
      .map((item) => item.carcass_type_id)
      .filter((id): id is number => id != null);

    const candidateShutterTypeIds =
      selectedCarcassIds.length > 0
        ? new Set(
            (
              await tx.timelineRule.findMany({
                where: {
                  vendor_id: vendorId,
                  carcass_id: { in: selectedCarcassIds },
                },
                select: { shutter_id: true },
              })
            )
              .map((rule: { shutter_id: number | null }) => rule.shutter_id)
              .filter((id: number | null): id is number => id != null),
          )
        : null;

    const resolveShutterItems = (label: string) => {
      const normalizedLabel = normalizeLookupLabel(label);
      const subTypeMatches = (
        shutterSubTypeMatchesByLabel.get(normalizedLabel) ?? []
      ).filter((item) =>
        candidateShutterTypeIds ? candidateShutterTypeIds.has(item.shutter_type_id) : true,
      );

      if (subTypeMatches.length > 0) {
        return subTypeMatches;
      }

      const typeMatches = (
        shutterTypeMatchesByLabel.get(normalizedLabel) ?? []
      ).filter((item) =>
        candidateShutterTypeIds ? candidateShutterTypeIds.has(item.shutter_type_id) : true,
      );

      if (typeMatches.length > 0) {
        return typeMatches;
      }

      return [
        ...(shutterSubTypeMatchesByLabel.get(normalizedLabel) ?? []),
        ...(shutterTypeMatchesByLabel.get(normalizedLabel) ?? []),
      ];
    };

    const shutterItems = splitFinishValues(shutterFinish?.finish_category).flatMap(
      (label) => resolveShutterItems(label),
    );

    const handleItems = splitFinishValues(handleFinish?.finish_category).flatMap(
      (label) =>
        (handleIdByLabel.get(normalizeLookupLabel(label)) ?? []).map((id) => ({
          handle_type_id: id,
        })),
    );

    await upsertSelectionWithMappings({
      accountId: request.account_id,
      instanceId: request.instance_id,
      createdBy: request.created_by,
      type: "Carcas",
      desc: carcassFinish?.finish_description?.trim() || "N/A",
      items: carcassItems,
    });

    await upsertSelectionWithMappings({
      accountId: request.account_id,
      instanceId: request.instance_id,
      createdBy: request.created_by,
      type: "Shutter",
      desc: shutterFinish?.finish_description?.trim() || "N/A",
      items: shutterItems,
    });

    await upsertSelectionWithMappings({
      accountId: request.account_id,
      instanceId: request.instance_id,
      createdBy: request.created_by,
      type: "Handles",
      desc: handleFinish?.finish_description?.trim() || "N/A",
      items: handleItems,
    });
  }
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

const findFirstActiveUserByRole = async (
  tx: any,
  vendorId: number,
  role: "super-admin" | "factory",
) =>
  tx.userMaster.findFirst({
    where: {
      vendor_id: vendorId,
      status: "active",
      user_type: {
        user_type: {
          equals: role,
          mode: "insensitive",
        },
      },
    },
    orderBy: { created_at: "asc" },
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
  });

const getLatestActiveFastProductionBatch = async (tx: any, leadId: number) => {
  const [approvedBatch, pendingBatch, draftBatch] = await Promise.all([
    tx.fastProductionRequestBatch.findFirst({
      where: {
        lead_id: leadId,
        status: "approved",
      },
      orderBy: {
        approved_at: "desc",
      },
      select: {
        id: true,
        status: true,
        approved_at: true,
      },
    }),
    tx.fastProductionRequestBatch.findFirst({
      where: {
        lead_id: leadId,
        status: "pending_approvals",
      },
      orderBy: {
        updated_at: "desc",
      },
      select: {
        id: true,
        status: true,
      },
    }),
    tx.fastProductionRequestBatch.findFirst({
      where: {
        lead_id: leadId,
        status: "draft",
      },
      orderBy: {
        updated_at: "desc",
      },
      select: {
        id: true,
        status: true,
      },
    }),
  ]);

  return approvedBatch ?? pendingBatch ?? draftBatch ?? null;
};

const syncLeadFastProductionState = async (
  tx: any,
  leadId: number,
  updatedBy: number,
) => {
  const approvedBatch = await tx.fastProductionRequestBatch.findFirst({
    where: {
      lead_id: leadId,
      status: "approved",
    },
    orderBy: {
      approved_at: "desc",
    },
    select: {
      id: true,
      status: true,
      approved_at: true,
    },
  });

  const pendingBatch = !approvedBatch
    ? await tx.fastProductionRequestBatch.findFirst({
        where: {
          lead_id: leadId,
          status: "pending_approvals",
        },
        orderBy: {
          updated_at: "desc",
        },
        select: {
          id: true,
          status: true,
        },
      })
    : null;

  const latestClosedBatch =
    !approvedBatch && !pendingBatch
      ? await tx.fastProductionRequestBatch.findFirst({
          where: {
            lead_id: leadId,
            status: {
              in: ["rejected", "revoked"],
            },
          },
          orderBy: {
            updated_at: "desc",
          },
          select: {
            id: true,
            status: true,
          },
        })
      : null;

  const latestActiveBatch =
    approvedBatch ??
    pendingBatch ??
    (await getLatestActiveFastProductionBatch(tx, leadId));

  const latestClientRequiredDate = latestActiveBatch
    ? await tx.fastProductionRequest.aggregate({
        where: {
          batch_id: latestActiveBatch.id,
          lead_id: leadId,
        },
        _max: {
          client_required_delivery_date: true,
        },
      })
    : null;

  await tx.leadMaster.update({
    where: { id: leadId },
    data: {
      is_fast_production: Boolean(approvedBatch),
      fast_production_status:
        approvedBatch?.status ??
        pendingBatch?.status ??
        latestClosedBatch?.status ??
        null,
      fast_production_approved_at: approvedBatch?.approved_at ?? null,
      client_required_order_login_complition_date:
        latestClientRequiredDate?._max?.client_required_delivery_date ?? null,
      updated_by: updatedBy,
    },
  });
};

const buildBatchTaskRemark = (
  requests: Array<{
    instance: { title: string };
    hardware_selection: string;
    accessory_selection: string;
    special_requirements: string;
    client_required_delivery_date: Date;
    remarks: string | null;
    finishes: Array<{
      component: "CARCASS" | "SHUTTER" | "HANDLE";
      finish_category: string;
      finish_description: string;
    }>;
  }>,
) =>
  requests
    .flatMap((request) => {
      const carcass = request.finishes.find((item) => item.component === "CARCASS");
      const shutter = request.finishes.find((item) => item.component === "SHUTTER");
      const handle = request.finishes.find((item) => item.component === "HANDLE");

      return [
        `Instance: ${request.instance.title}`,
        carcass ? `Carcass: ${carcass.finish_category}` : null,
        carcass ? `Carcass Remark: ${carcass.finish_description}` : null,
        shutter ? `Shutter: ${shutter.finish_category}` : null,
        shutter ? `Shutter Remark: ${shutter.finish_description}` : null,
        handle ? `Handles: ${handle.finish_category}` : null,
        handle ? `Handles Remark: ${handle.finish_description}` : null,
        `Hardware: ${request.hardware_selection}`,
        `Accessory: ${request.accessory_selection}`,
        `Special Requirements: ${request.special_requirements}`,
        `Client Required Delivery Date: ${request.client_required_delivery_date
          .toISOString()
          .slice(0, 10)}`,
        request.remarks?.trim() ? `Remarks: ${request.remarks.trim()}` : null,
        "",
      ];
    })
    .filter(Boolean)
    .join("\n")
    .slice(0, 2000);

const getActorAndLead = async (vendorId: number, userId: number, leadId: number) => {
  const [actor, lead] = await Promise.all([
    prisma.userMaster.findUnique({
      where: { id: userId },
      select: {
        id: true,
        vendor_id: true,
        user_name: true,
        user_email: true,
        franchise_id: true,
        user_type: {
          select: {
            user_type: true,
          },
        },
      },
    }),
    prisma.leadMaster.findFirst({
      where: {
        id: leadId,
        vendor_id: vendorId,
        is_deleted: false,
      },
      select: {
        id: true,
        vendor_id: true,
        account_id: true,
        franchise_id: true,
        lead_code: true,
        firstname: true,
        lastname: true,
        statusType: {
          select: {
            type: true,
          },
        },
      },
    }),
  ]);

  if (!actor || actor.vendor_id !== vendorId) {
    throw new Error("Requesting user does not belong to this vendor");
  }

  if (!lead) {
    throw new Error("Lead not found");
  }

  if (!lead.account_id) {
    throw new Error("Lead account is missing");
  }

  return { actor, lead };
};

export const saveFastProductionRequestDraft = async (
  input: SaveFastProductionDraftInput,
) => {
  const { error, value } = fastProductionDraftSchema.validate(input);
  if (error) {
    throw new Error(
      `Validation failed: ${error.details.map((detail) => detail.message).join(", ")}`,
    );
  }

  const { actor, lead } = await getActorAndLead(
    value.vendor_id,
    value.created_by,
    value.lead_id,
  );

  const instance = await prisma.leadProductStructureInstance.findFirst({
    where: {
      id: value.instance_id,
      lead_id: value.lead_id,
      vendor_id: value.vendor_id,
    },
    select: {
      id: true,
      title: true,
      account_id: true,
    },
  });

  if (!instance) {
    throw new Error("Lead product structure instance not found");
  }

  const clientRequiredDeliveryDate = new Date(value.client_required_delivery_date);
  if (Number.isNaN(clientRequiredDeliveryDate.getTime())) {
    throw new Error("Client required delivery date is invalid");
  }

  const uploadedFiles = await uploadFastProductionFiles(
    input.documents ?? [],
    value.vendor_id,
    value.lead_id,
  );

  const totalInstances = await prisma.leadProductStructureInstance.count({
    where: {
      lead_id: value.lead_id,
      vendor_id: value.vendor_id,
    },
  });

  if (totalInstances === 0) {
    throw new Error("No product structure instances found for this lead");
  }

  const result = await prisma.$transaction(async (tx) => {
    const existingPendingBatch = await tx.fastProductionRequestBatch.findFirst({
      where: {
        vendor_id: value.vendor_id,
        lead_id: value.lead_id,
        status: "pending_approvals",
      },
      select: { id: true },
    });

    if (existingPendingBatch) {
      throw new Error("A fast production request is already pending approval for this lead");
    }

    let draftBatch = await tx.fastProductionRequestBatch.findFirst({
      where: {
        vendor_id: value.vendor_id,
        lead_id: value.lead_id,
        status: "draft",
      },
      orderBy: {
        created_at: "desc",
      },
      select: {
        id: true,
        requester_user_id: true,
      },
    });

    if (draftBatch && draftBatch.requester_user_id !== value.created_by) {
      throw new Error("Another fast production draft is already in progress for this lead");
    }

    if (!draftBatch) {
      draftBatch = await tx.fastProductionRequestBatch.create({
        data: {
          vendor_id: value.vendor_id,
          lead_id: value.lead_id,
          account_id: lead.account_id!,
          franchise_id: lead.franchise_id ?? actor.franchise_id ?? null,
          requester_user_id: value.created_by,
          month_bucket: getMonthBucket(),
          status: "draft",
          terms_accepted_at: new Date(),
          terms_version: value.terms_version?.trim() || "v1",
          created_by: value.created_by,
        },
        select: {
          id: true,
          requester_user_id: true,
        },
      });
    } else {
      await tx.fastProductionRequestBatch.update({
        where: { id: draftBatch.id },
        data: {
          terms_version: value.terms_version?.trim() || "v1",
          updated_by: value.created_by,
        },
      });
    }

    const conflictingRequest = await tx.fastProductionRequest.findFirst({
      where: {
        vendor_id: value.vendor_id,
        lead_id: value.lead_id,
        instance_id: value.instance_id,
        batch_id: {
          not: draftBatch.id,
        },
        status: {
          in: ["pending_approvals", "approved"],
        },
      },
      select: { id: true, status: true },
    });

    if (conflictingRequest) {
      throw new Error(
        conflictingRequest.status === "approved"
          ? "Fast production is already enabled for this instance"
          : "A fast production request is already pending approval for this instance",
      );
    }

    const request = await tx.fastProductionRequest.upsert({
      where: {
        batch_id_instance_id: {
          batch_id: draftBatch.id,
          instance_id: value.instance_id,
        },
      },
      create: {
        batch_id: draftBatch.id,
        vendor_id: value.vendor_id,
        lead_id: value.lead_id,
        account_id: instance.account_id,
        instance_id: instance.id,
        franchise_id: lead.franchise_id ?? actor.franchise_id ?? null,
        requester_user_id: value.created_by,
        month_bucket: getMonthBucket(),
        status: "draft",
        hardware_selection: value.hardware_selection.trim(),
        accessory_selection: value.accessory_selection.trim(),
        special_requirements: value.special_requirements.trim(),
        client_required_delivery_date: clientRequiredDeliveryDate,
        remarks: value.remarks?.trim() || null,
        terms_accepted_at: new Date(),
        terms_version: value.terms_version?.trim() || "v1",
        created_by: value.created_by,
      },
      update: {
        hardware_selection: value.hardware_selection.trim(),
        accessory_selection: value.accessory_selection.trim(),
        special_requirements: value.special_requirements.trim(),
        client_required_delivery_date: clientRequiredDeliveryDate,
        remarks: value.remarks?.trim() || null,
        terms_version: value.terms_version?.trim() || "v1",
        updated_by: value.created_by,
      },
      select: {
        id: true,
        status: true,
      },
    });

    await tx.fastProductionFinish.deleteMany({
      where: {
        request_id: request.id,
      },
    });

    await tx.fastProductionFinish.createMany({
      data: [
        {
          request_id: request.id,
          component: "CARCASS",
          finish_category: joinFinishValues(value.carcass_finish_category),
          finish_description: value.carcass_finish_description.trim(),
        },
        {
          request_id: request.id,
          component: "SHUTTER",
          finish_category: joinFinishValues(value.shutter_finish_category),
          finish_description: value.shutter_finish_description.trim(),
        },
        {
          request_id: request.id,
          component: "HANDLE",
          finish_category: joinFinishValues(value.handles_finish_category),
          finish_description: value.handles_finish_description.trim(),
        },
      ],
    });

    if (uploadedFiles.length > 0) {
      const documentTypeId = await getFastProductionDocumentTypeId(
        tx,
        value.vendor_id,
        lead.statusType?.type ?? "Fast Production Request",
      );

      const createdDocuments: Array<{ id: number }> = [];
      for (const file of uploadedFiles) {
        const document = await tx.leadDocuments.create({
          data: {
            doc_og_name: file.originalName,
            doc_sys_name: file.sysName,
            created_by: value.created_by,
            doc_type_id: documentTypeId,
            account_id: instance.account_id,
            lead_id: lead.id,
            vendor_id: value.vendor_id,
            product_structure_instance_id: instance.id,
          },
          select: { id: true },
        });

        createdDocuments.push(document);
      }

      await tx.fastProductionRequestDocument.createMany({
        data: createdDocuments.map((document) => ({
          request_id: request.id,
          document_id: document.id,
          created_by: value.created_by,
        })),
      });
    }

    const completedInstances = await tx.fastProductionRequest.count({
      where: {
        batch_id: draftBatch.id,
      },
    });

    await syncLeadFastProductionState(tx, value.lead_id, value.created_by);

    return {
      batchId: draftBatch.id,
      requestId: request.id,
      status: request.status,
      completedInstances,
      totalInstances,
      instanceId: instance.id,
      instanceTitle: instance.title,
    };
  });

  await cache.del(`dashboard:tasks:${value.vendor_id}:${value.created_by}`);
  await cache.del(`performance:snapshot:${value.vendor_id}:${value.created_by}`);

  return result;
};

export const finalizeFastProductionRequestBatch = async (
  input: FinalizeFastProductionBatchInput,
) => {
  const { error, value } = finalizeFastProductionBatchSchema.validate(input);
  if (error) {
    throw new Error(
      `Validation failed: ${error.details.map((detail) => detail.message).join(", ")}`,
    );
  }

  const { actor, lead } = await getActorAndLead(
    value.vendor_id,
    value.created_by,
    value.lead_id,
  );

  const actorRole = normalizeRole(actor.user_type.user_type);
  const dueDate = getTomorrowDueDate();

  const result = await prisma.$transaction(async (tx) => {
    const batch = await tx.fastProductionRequestBatch.findFirst({
      where: {
        ...(value.batch_id ? { id: value.batch_id } : {}),
        vendor_id: value.vendor_id,
        lead_id: value.lead_id,
        status: "draft",
      },
      include: {
        requests: {
          include: {
            instance: {
              select: {
                id: true,
                title: true,
              },
            },
            finishes: {
              select: {
                component: true,
                finish_category: true,
                finish_description: true,
              },
            },
          },
          orderBy: {
            instance_id: "asc",
          },
        },
      },
      orderBy: {
        created_at: "desc",
      },
    });

    if (!batch) {
      throw new Error("Fast production draft batch not found");
    }

    if (batch.requester_user_id !== value.created_by && actorRole !== "super-admin") {
      throw new Error("Only the draft owner can submit the fast production request");
    }

    const totalInstances = await tx.leadProductStructureInstance.count({
      where: {
        lead_id: value.lead_id,
        vendor_id: value.vendor_id,
      },
    });

    if (totalInstances === 0) {
      throw new Error("No product structure instances found for this lead");
    }

    if (batch.requests.length !== totalInstances) {
      throw new Error("All instances must be submitted before sending the approval request");
    }

    const [superAdminUser, factoryUser] = await Promise.all([
      findFirstActiveUserByRole(tx, value.vendor_id, "super-admin"),
      findFirstActiveUserByRole(tx, value.vendor_id, "factory"),
    ]);

    if (!superAdminUser) {
      throw new Error("No active super-admin user found for this vendor");
    }

    if (!factoryUser) {
      throw new Error("No active factory user found for this vendor");
    }

    const approvalsToCreate =
      actorRole === "super-admin"
        ? [
            {
              batch_id: batch.id,
              approver_role: "SUPER_ADMIN" as const,
              approver_user_id: superAdminUser.id,
              status: "approved" as const,
              remark: "Auto-approved because the requester is super-admin",
              acted_at: new Date(),
            },
            {
              batch_id: batch.id,
              approver_role: "FACTORY_ADMIN" as const,
              approver_user_id: factoryUser.id,
            },
          ]
        : [
            {
              batch_id: batch.id,
              approver_role: "SUPER_ADMIN" as const,
              approver_user_id: superAdminUser.id,
            },
            {
              batch_id: batch.id,
              approver_role: "FACTORY_ADMIN" as const,
              approver_user_id: factoryUser.id,
            },
          ];

    await tx.fastProductionRequestBatch.update({
      where: { id: batch.id },
      data: {
        status: "pending_approvals",
        updated_by: value.created_by,
      },
    });

    await tx.fastProductionRequest.updateMany({
      where: {
        batch_id: batch.id,
      },
      data: {
        status: "pending_approvals",
        updated_by: value.created_by,
      },
    });

    await tx.fastProductionApproval.createMany({
      data: approvalsToCreate,
      skipDuplicates: true,
    });

    await tx.fastProductionStatusLog.create({
      data: {
        batch_id: batch.id,
        from_status: "draft",
        to_status: "pending_approvals",
        actor_user_id: value.created_by,
        remark: "Fast production request submitted",
      },
    });

    const taskRemark = buildBatchTaskRemark(batch.requests);
    const recipients: Array<{ id: number; taskId: number }> = [];
    const taskRecipients =
      actorRole === "super-admin" ? [factoryUser] : [superAdminUser, factoryUser];

    for (const recipient of taskRecipients) {
      const task = await tx.userLeadTask.create({
        data: {
          lead_id: lead.id,
          account_id: lead.account_id!,
          vendor_id: value.vendor_id,
          franchise_id: lead.franchise_id ?? actor.franchise_id ?? null,
          user_id: recipient.id,
          task_type: FAST_PRODUCTION_REQUEST_TASK_TYPE,
          due_date: dueDate,
          lead_stage: lead.statusType?.type ?? null,
          remark: taskRemark,
          status: "open",
          created_by: value.created_by,
          instance_id: null,
        },
      });

      await createTaskHistoryLog({
        db: tx,
        task,
        createdBy: value.created_by,
        actionType: "CREATE",
      });

      recipients.push({ id: recipient.id, taskId: task.id });
    }

    await syncLeadFastProductionState(tx, value.lead_id, value.created_by);

    return {
      batchId: batch.id,
      status: "pending_approvals" as const,
      recipients,
      instanceCount: batch.requests.length,
    };
  });

  await cache.del(`dashboard:tasks:${value.vendor_id}:${value.created_by}`);
  await cache.del(`performance:snapshot:${value.vendor_id}:${value.created_by}`);

  for (const recipient of result.recipients) {
    await cache.del(`dashboard:tasks:${value.vendor_id}:${recipient.id}`);
    await cache.del(`performance:snapshot:${value.vendor_id}:${recipient.id}`);

    NotificationService.createAndSend({
      vendor_id: value.vendor_id,
      user_id: recipient.id,
      sender_id: value.created_by,
      type: NotificationType.TASK_ASSIGNED,
      title: "Fast Production Approval Request",
      message: `A fast production request covering ${result.instanceCount} instance(s) is pending your approval for ${lead.lead_code ?? `Lead #${lead.id}`}.`,
      entity_type: "fast_production_request",
      entity_id: result.batchId,
      redirect_url: `/dashboard/my-tasks?taskId=${recipient.taskId}`,
    }).catch((notificationError: any) => {
      logger.error("[FastProductionRequest] Notification create failed:", notificationError);
    });
  }

  return result;
};

export const actOnFastProductionRequestTask = async (
  input: ActOnFastProductionRequestTaskInput,
) => {
  const { error, value } = fastProductionTaskActionSchema.validate(input);
  if (error) {
    throw new Error(
      `Validation failed: ${error.details.map((detail) => detail.message).join(", ")}`,
    );
  }

  if (value.action === "reject" && !value.remark?.trim()) {
    throw new Error("Remark is required when rejecting a fast production request");
  }

  const actor = await prisma.userMaster.findUnique({
    where: { id: value.acted_by },
    select: {
      id: true,
      vendor_id: true,
      user_name: true,
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

  const actorRole = normalizeRole(actor.user_type.user_type);

  const task = await prisma.userLeadTask.findFirst({
    where: {
      id: value.task_id,
      lead_id: value.lead_id,
      task_type: FAST_PRODUCTION_REQUEST_TASK_TYPE,
    },
    select: {
      id: true,
      lead_id: true,
      account_id: true,
      vendor_id: true,
      user_id: true,
      status: true,
    },
  });

  if (!task) {
    throw new Error("Fast production task not found");
  }

  if (task.status === "completed") {
    throw new Error("This task is already completed");
  }

  if (task.user_id !== value.acted_by && actorRole !== "super-admin") {
    throw new Error("Only the assigned user can act on this fast production task");
  }

  const targetApproverUserId =
    actorRole === "super-admin" ? task.user_id : value.acted_by;

  const batch = await prisma.fastProductionRequestBatch.findFirst({
    where: {
      lead_id: value.lead_id,
      vendor_id: task.vendor_id,
      status: "pending_approvals",
      approvals: {
        some: {
          approver_user_id: targetApproverUserId,
          status: "pending",
        },
      },
    },
    include: {
      requester: {
        select: {
          id: true,
          user_name: true,
          user_email: true,
        },
      },
      lead: {
        select: {
          id: true,
          lead_code: true,
          firstname: true,
          lastname: true,
        },
      },
      approvals: {
        select: {
          id: true,
          approver_role: true,
          approver_user_id: true,
          status: true,
        },
      },
      requests: {
        select: {
          id: true,
          instance_id: true,
          instance: {
            select: {
              title: true,
            },
          },
        },
      },
    },
    orderBy: {
      created_at: "desc",
    },
  });

  if (!batch) {
    throw new Error("Pending fast production request not found");
  }

  const matchingApproval = batch.approvals.find((approval) => {
    if (approval.status !== "pending") return false;
    return approval.approver_user_id === targetApproverUserId;
  });

  if (!matchingApproval) {
    throw new Error("No pending fast production approval was found for this user");
  }

  const expectedRole =
    matchingApproval.approver_role === "SUPER_ADMIN" ? "super-admin" : "factory";

  if (actorRole !== expectedRole && actorRole !== "super-admin") {
    throw new Error("This user role is not allowed to act on this fast production approval");
  }

  const approverUserIds = batch.approvals
    .map((approval) => approval.approver_user_id)
    .filter((approverUserId): approverUserId is number => approverUserId != null);

  const result = await prisma.$transaction(async (tx) => {
    await tx.fastProductionApproval.update({
      where: {
        batch_id_approver_role: {
          batch_id: batch.id,
          approver_role: matchingApproval.approver_role,
        },
      },
      data: {
        status: value.action === "approve" ? "approved" : "rejected",
        remark: value.remark?.trim() || null,
        acted_at: new Date(),
      },
    });

    if (value.action === "reject") {
      await tx.fastProductionRequestBatch.update({
        where: { id: batch.id },
        data: {
          status: "rejected",
          rejected_at: new Date(),
          updated_by: value.acted_by,
        },
      });

      await tx.fastProductionRequest.updateMany({
        where: { batch_id: batch.id },
        data: {
          status: "rejected",
          rejected_at: new Date(),
          updated_by: value.acted_by,
        },
      });

      await tx.fastProductionStatusLog.create({
        data: {
          batch_id: batch.id,
          from_status: "pending_approvals",
          to_status: "rejected",
          actor_user_id: value.acted_by,
          remark: value.remark?.trim() || null,
        },
      });

      const openTasks = await tx.userLeadTask.findMany({
        where: {
          lead_id: value.lead_id,
          vendor_id: task.vendor_id,
          task_type: FAST_PRODUCTION_REQUEST_TASK_TYPE,
          status: { not: "completed" },
          user_id: {
            in: approverUserIds,
          },
        },
        select: { id: true },
      });

      for (const openTask of openTasks) {
        await closeTask(
          tx,
          openTask.id,
          value.acted_by,
          value.remark?.trim() || undefined,
        );
      }

      await syncLeadFastProductionState(tx, value.lead_id, value.acted_by);

      return {
        batchId: batch.id,
        status: "rejected" as const,
        isFullyApproved: false,
      };
    }

    await closeTask(tx, value.task_id, value.acted_by);

    const remainingPendingApprovals = await tx.fastProductionApproval.count({
      where: {
        batch_id: batch.id,
        status: "pending",
      },
    });

    if (remainingPendingApprovals === 0) {
      await syncApprovedFastProductionSelections(tx, batch.id, value.acted_by);

      await tx.fastProductionRequestBatch.update({
        where: { id: batch.id },
        data: {
          status: "approved",
          approved_at: new Date(),
          updated_by: value.acted_by,
        },
      });

      await tx.fastProductionRequest.updateMany({
        where: { batch_id: batch.id },
        data: {
          status: "approved",
          approved_at: new Date(),
          updated_by: value.acted_by,
        },
      });

      await tx.fastProductionStatusLog.create({
        data: {
          batch_id: batch.id,
          from_status: "pending_approvals",
          to_status: "approved",
          actor_user_id: value.acted_by,
          remark: value.remark?.trim() || null,
        },
      });

      await syncLeadFastProductionState(tx, value.lead_id, value.acted_by);

      return {
        batchId: batch.id,
        status: "approved" as const,
        isFullyApproved: true,
      };
    }

    return {
      batchId: batch.id,
      status: "pending_approvals" as const,
      isFullyApproved: false,
    };
  });

  const usersToRefresh = new Set<number>([value.acted_by, batch.requester.id, ...approverUserIds]);
  for (const userId of usersToRefresh) {
    await cache.del(`dashboard:tasks:${task.vendor_id}:${userId}`);
    await cache.del(`performance:snapshot:${task.vendor_id}:${userId}`);
  }

  NotificationService.createAndSend({
    vendor_id: task.vendor_id,
    user_id: batch.requester.id,
    sender_id: value.acted_by,
    type: NotificationType.TASK_ASSIGNED,
    title:
      value.action === "approve"
        ? result.isFullyApproved
          ? "Fast Production Request Approved"
          : "Fast Production Request Partially Approved"
        : "Fast Production Request Rejected",
    message:
      value.action === "approve"
        ? result.isFullyApproved
          ? "Your fast production request has been fully approved."
          : "One approval has been recorded. Awaiting the remaining approver."
        : "Your fast production request has been rejected.",
    entity_type: "fast_production_request",
    entity_id: batch.id,
    redirect_url: "/dashboard/my-tasks",
  }).catch((notificationError: any) => {
    logger.error("[FastProductionRequest] Requester notification failed:", notificationError);
  });

  if (result.isFullyApproved) {
    await CHSSelectionTypeMappingService.recomputeAndPersistManufacturingDays(
      value.lead_id,
      task.vendor_id,
    ).catch((error: any) => {
      logger.error(
        "[FastProductionRequest] Failed to recompute CHS manufacturing days after approval:",
        error,
      );
    });
  }

  return result;
};

export const getFastProductionRequestDetails = async (
  leadId: number,
  taskId: number,
) => {
  const task = await prisma.userLeadTask.findFirst({
    where: {
      id: taskId,
      lead_id: leadId,
      task_type: FAST_PRODUCTION_REQUEST_TASK_TYPE,
    },
    select: {
      id: true,
      vendor_id: true,
      user_id: true,
    },
  });

  if (!task) {
    throw new Error("Fast production task not found");
  }

  const batch: any = await prisma.fastProductionRequestBatch.findFirst({
    where: {
      lead_id: leadId,
      vendor_id: task.vendor_id,
      status: "pending_approvals",
    },
    include: {
      requester: {
        select: {
          id: true,
          user_name: true,
          user_email: true,
        },
      },
      lead: {
        select: {
          id: true,
          lead_code: true,
          firstname: true,
          lastname: true,
        },
      },
      requests: {
        include: {
          instance: {
            select: {
              id: true,
              title: true,
              productStructure: {
                select: {
                  type: true,
                },
              },
            },
          },
          finishes: true,
          documents: {
            include: {
              document: true,
            },
          },
        },
        orderBy: {
          instance_id: "asc",
        },
      },
      approvals: {
        include: {
          approver: {
            select: {
              id: true,
              user_name: true,
            },
          },
        },
      },
    },
  });

  if (!batch) {
    return null;
  }

  // Generate signed URLs for documents
  const requestsWithSignedUrls = await Promise.all(
    batch.requests.map(async (req: any) => {
      const documentsWithUrls = await Promise.all(
        req.documents.map(async (docMapping: any) => {
          const signedUrl = await generateSignedUrl(
            docMapping.document.doc_sys_name,
            3600,
            "inline",
          );
          return {
            ...docMapping,
            document: {
              ...docMapping.document,
              signedUrl,
            },
          };
        }),
      );
      return {
        ...req,
        documents: documentsWithUrls,
      };
    }),
  );

  return {
    ...batch,
    requests: requestsWithSignedUrls,
  };
};

