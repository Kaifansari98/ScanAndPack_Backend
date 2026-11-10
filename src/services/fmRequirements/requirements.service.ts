import { Prisma, prisma } from "../../prisma/client";
import { requireLeadAccess } from "../leadModuleServices/walkinLeadQuestions/response.service";
import {
  acceptedTypes,
  allFields,
  FMAnswerGroup,
  FMAnswers,
  canEditFMValues,
  FMError,
  FMField,
  FMQuestionnaire,
  parseGroups,
  validateAnswers,
  validateFields,
  visibleFields,
  FM_MAX_FILE_SIZE,
  fmContentFields,
} from "./schema";

type Db = Prisma.TransactionClient;
export async function requireFMVendor(vendorId: number, db: Db = prisma) {
  const vendor = await db.vendorMaster.findUnique({
    where: { id: vendorId },
    select: { handlesLargeScaleProjects: true },
  });
  if (!vendor || vendor.handlesLargeScaleProjects !== false)
    throw new FMError(
      "FM Requirements are available only for vendors without large-scale projects.",
      403,
    );
}
export async function getFMQuestionnaire(
  vendorId: number,
  productTypeId: number,
  db: Db = prisma,
): Promise<FMQuestionnaire> {
  await requireFMVendor(vendorId, db);
  const product = await db.productTypeMaster.findFirst({
    where: { id: productTypeId, vendor_id: vendorId, status: "active" },
  });
  if (!product)
    throw new FMError("Product type not found for this vendor.", 404);
  const custom = await db.fMRequirementMaster.findUnique({
    where: {
      vendor_id_product_type_id: {
        vendor_id: vendorId,
        product_type_id: productTypeId,
      },
    },
  });
  return {
    product_type_id: product.id,
    product_type: product.type,
    origin: custom ? "vendor" : "empty",
    revision: custom ? `vendor:${custom.id}:${custom.version}` : "empty",
    fields: validateFields(custom?.fields ?? []),
  };
}
export async function saveFMQuestionnaire(
  vendorId: number,
  productTypeId: number,
  actorId: number,
  input: unknown,
  revision: unknown,
) {
  const fields = validateFields(input);
  return prisma.$transaction(
    async (db) => {
      const current = await getFMQuestionnaire(vendorId, productTypeId, db);
      if (revision !== current.revision)
        throw new FMError("Requirements changed. Reload before saving.", 409);
      await db.fMRequirementMaster.upsert({
        where: {
          vendor_id_product_type_id: {
            vendor_id: vendorId,
            product_type_id: productTypeId,
          },
        },
        create: {
          vendor_id: vendorId,
          product_type_id: productTypeId,
          fields: fields as unknown as Prisma.InputJsonValue,
          created_by: actorId,
          updated_by: actorId,
        },
        update: {
          fields: fields as unknown as Prisma.InputJsonValue,
          version: { increment: 1 },
          updated_by: actorId,
        },
      });
      return getFMQuestionnaire(vendorId, productTypeId, db);
    },
    { isolationLevel: "Serializable" },
  );
}
export async function clearFMQuestionnaire(
  vendorId: number,
  productTypeId: number,
) {
  await getFMQuestionnaire(vendorId, productTypeId);
  await prisma.fMRequirementMaster.deleteMany({
    where: { vendor_id: vendorId, product_type_id: productTypeId },
  });
  return getFMQuestionnaire(vendorId, productTypeId);
}
export async function requireFMLead(
  vendorId: number,
  leadId: number,
  actorId: number,
  role: string,
) {
  await requireFMVendor(vendorId);
  try {
    return await requireLeadAccess(vendorId, leadId, actorId, role);
  } catch (error) {
    if (
      role !== "head-site-supervisor" ||
      (error as FMError).statusCode !== 403
    )
      throw error;
    const lead = await prisma.leadMaster.findFirst({
      where: { id: leadId, vendor_id: vendorId, is_deleted: false },
    });
    if (!lead?.franchise_id) throw error;
    const [headMapping, supervisor] = await Promise.all([
      prisma.headSiteSupervisorFranchiseMapping.findFirst({
        where: {
          vendor_id: vendorId,
          user_id: actorId,
          franchise_id: lead.franchise_id,
          status: true,
        },
      }),
      prisma.userMaster.findFirst({
        where: { id: actorId, vendor_id: vendorId, status: "active" },
        select: { franchise_id: true },
      }),
    ]);
    if (!headMapping && supervisor?.franchise_id !== lead.franchise_id)
      throw error;
    return lead;
  }
}
export async function selectedProductIds(
  db: Db,
  vendorId: number,
  leadId: number,
) {
  const mappings = await db.leadProductMapping.findMany({
    where: { vendor_id: vendorId, lead_id: leadId, is_archived: false },
    select: { product_type_id: true },
  });
  return [...new Set(mappings.map((row) => row.product_type_id))];
}
export async function getFMLead(
  vendorId: number,
  leadId: number,
  actorId: number,
  role: string,
) {
  await requireFMLead(vendorId, leadId, actorId, role);
  const ids = await selectedProductIds(prisma, vendorId, leadId);
  const candidateForms = await Promise.all(
    ids.map(async (id) => {
      try {
        return await getFMQuestionnaire(vendorId, id);
      } catch (error) {
        if (error instanceof FMError && error.statusCode === 404) return null;
        throw error;
      }
    }),
  );
  const forms = candidateForms.filter(
    (form): form is FMQuestionnaire => form !== null,
  );
  const responses = await prisma.fMRequirementResponse.findMany({
    where: { vendor_id: vendorId, lead_id: leadId },
    include: { productType: { select: { type: true } } },
  });
  // File URLs are generated only on read, never persisted in answers or snapshots.
  const keys = new Set(
    responses.flatMap((row) =>
      allFields(row.field_snapshot as unknown as FMField[])
        .filter((f) => f.type === "upload")
        .flatMap((f) => {
          const ids = (row.answers as Record<string, unknown>)[f.key];
          return Array.isArray(ids)
            ? ids.filter((id): id is string => typeof id === "string")
            : [];
        }),
    ),
  );
  const uploads = await prisma.fMRequirementUpload.findMany({
    where: { vendor_id: vendorId, lead_id: leadId, id: { in: [...keys] } },
  });
  return { forms, responses, uploads };
}
async function answerFiles(
  db: Db,
  vendorId: number,
  leadId: number,
  fields: FMField[],
  answers: FMAnswers,
) {
  const files = [];
  for (const field of visibleFields(fields, answers).filter(
    (f) => f.type === "upload",
  )) {
    const uploadIds = (answers[field.key] ?? []) as string[];
    if (!uploadIds.length) continue;
    const uploads = await db.fMRequirementUpload.findMany({
      where: {
        id: { in: uploadIds },
        vendor_id: vendorId,
        lead_id: leadId,
      },
    });
    if (
      uploads.length !== uploadIds.length ||
      uploads.some(
        (file) =>
          !acceptedTypes(field).includes(file.mime_type) ||
          file.size_bytes > FM_MAX_FILE_SIZE,
      )
    )
      throw new FMError(
        `${field.label}: files are unavailable or have an unsupported format.`,
      );
    files.push(...uploads.map((file) => ({ ...file, purpose: field.purpose })));
  }
  return files;
}

// Validate and save under the caller's transaction, together with the stage transition.
export async function saveFMAnswers(
  db: Db,
  input: {
    vendorId: number;
    leadId: number;
    actorId: number;
    groups: unknown;
    draft: boolean;
    primaryUploads?: unknown;
  },
) {
  await requireFMVendor(input.vendorId, db);
  const lead = await db.leadMaster.findFirst({
    where: { id: input.leadId, vendor_id: input.vendorId, is_deleted: false },
    include: { statusType: { select: { tag: true } } },
  });
  if (!lead) throw new FMError("Lead not found.", 404);
  if (lead.statusType?.tag !== "Type 5")
    throw new FMError(
      "This lead is no longer in Final Measurement. Refresh its details before continuing.",
      409,
    );
  const groups = parseGroups(input.groups);
  const selectedIds = await selectedProductIds(
    db,
    input.vendorId,
    input.leadId,
  );
  const configuredForms = (
    await Promise.all(
      selectedIds.map((id) => getFMQuestionnaire(input.vendorId, id, db)),
    )
  ).filter((form) => fmContentFields(form.fields).length > 0);
  const ids = configuredForms.map((form) => form.product_type_id);
  if (
    !ids.length ||
    groups.length !== ids.length ||
    groups.some((group) => !ids.includes(group.product_type_id))
  )
    throw new FMError(
      "Complete requirements for every product type selected for this lead.",
    );
  const prepared = [];
  for (const group of groups) {
    const form = configuredForms.find(
      (form) => form.product_type_id === group.product_type_id,
    )!;
    if (form.revision !== group.revision)
      throw new FMError(
        "FM Requirements changed. Reload and review the updated fields.",
        409,
      );
    const answers = validateAnswers(form.fields, group.answers, input.draft);
    const files = await answerFiles(
      db,
      input.vendorId,
      input.leadId,
      form.fields,
      answers,
    );
    prepared.push({ form, answers, files });
  }
  const primaryFiles: Array<{
    id: string;
    original_name: string;
    storage_key: string;
    purpose: "site_photos" | "measurement_document";
  }> = [];
  if (input.primaryUploads !== undefined) {
    if (
      !input.primaryUploads ||
      typeof input.primaryUploads !== "object" ||
      Array.isArray(input.primaryUploads)
    )
      throw new FMError("Invalid standard FM uploads.");
    const primary = input.primaryUploads as Record<string, unknown>;
    for (const purpose of ["site_photos", "measurement_document"] as const) {
      const uploadIds = primary[purpose] ?? [];
      if (
        !Array.isArray(uploadIds) ||
        uploadIds.length > 20 ||
        new Set(uploadIds).size !== uploadIds.length ||
        uploadIds.some(
          (id) => typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id),
        )
      )
        throw new FMError("Invalid standard FM file IDs.");
      if (!uploadIds.length) continue;
      const uploads = await db.fMRequirementUpload.findMany({
        where: {
          id: { in: uploadIds },
          vendor_id: input.vendorId,
          lead_id: input.leadId,
        },
      });
      const field: FMField = {
        key: purpose,
        label: purpose,
        type: "upload",
        required: true,
        upload_kind: purpose === "site_photos" ? "media" : "document",
      };
      if (
        uploads.length !== uploadIds.length ||
        uploads.some(
          (file) =>
            !acceptedTypes(field).includes(file.mime_type) ||
            file.size_bytes > FM_MAX_FILE_SIZE,
        )
      )
        throw new FMError(
          "Standard FM files are unavailable or have an unsupported format.",
        );
      primaryFiles.push(...uploads.map((file) => ({ ...file, purpose })));
    }
  }
  const files = [...prepared.flatMap((item) => item.files), ...primaryFiles];
  if (
    !input.draft &&
    (!files.some((file) => file.purpose === "measurement_document") ||
      !files.some((file) => file.purpose === "site_photos"))
  )
    throw new FMError(
      "Upload at least one Final Measurement document and one site photo or video.",
    );
  for (const item of prepared) {
    const data = {
      vendor_id: input.vendorId,
      revision: item.form.revision,
      field_snapshot: item.form.fields as unknown as Prisma.InputJsonValue,
      answers: item.answers as Prisma.InputJsonValue,
      is_complete: !input.draft,
      updated_by: input.actorId,
    };
    await db.fMRequirementResponse.upsert({
      where: {
        lead_id_product_type_id: {
          lead_id: input.leadId,
          product_type_id: item.form.product_type_id,
        },
      },
      create: {
        ...data,
        lead_id: input.leadId,
        product_type_id: item.form.product_type_id,
        created_by: input.actorId,
      },
      update: data,
    });
  }
  return {
    measurementDocs: [
      ...new Map(
        files
          .filter((file) => file.purpose === "measurement_document")
          .map((file) => [
            file.id,
            {
              originalName: file.original_name,
              sysName: file.storage_key,
              product_structure_instance_id: null,
            },
          ]),
      ).values(),
    ],
    sitePhotos: [
      ...new Map(
        files
          .filter((file) => file.purpose === "site_photos")
          .map((file) => [
            file.id,
            {
              originalName: file.original_name,
              sysName: file.storage_key,
              product_structure_instance_id: null,
            },
          ]),
      ).values(),
    ],
  };
}
export async function saveFMDraft(
  vendorId: number,
  leadId: number,
  actorId: number,
  role: string,
  groups: FMAnswerGroup[],
) {
  await requireFMLead(vendorId, leadId, actorId, role);
  return prisma.$transaction(
    (db) =>
      saveFMAnswers(db, { vendorId, leadId, actorId, groups, draft: true }),
    { isolationLevel: "Serializable" },
  );
}

// Updates the saved snapshot's values only. It never performs the FM stage transition.
export async function updateSavedFMAnswers(input: {
  vendorId: number;
  leadId: number;
  productTypeId: number;
  actorId: number;
  role: string;
  answers: unknown;
  expectedUpdatedAt: unknown;
}) {
  if (!canEditFMValues(input.role))
    throw new FMError(
      "Only site-supervisor, super-admin and head-site-supervisor can edit FM values.",
      403,
    );
  const lead = await requireFMLead(
    input.vendorId,
    input.leadId,
    input.actorId,
    input.role,
  );
  if (
    typeof input.expectedUpdatedAt !== "string" ||
    !Number.isFinite(Date.parse(input.expectedUpdatedAt))
  )
    throw new FMError("Provide the saved response timestamp before editing.");
  const expectedUpdatedAt = new Date(input.expectedUpdatedAt);
  return prisma.$transaction(
    async (db) => {
      const row = await db.fMRequirementResponse.findFirst({
        where: {
          vendor_id: input.vendorId,
          lead_id: input.leadId,
          product_type_id: input.productTypeId,
        },
      });
      if (!row)
        throw new FMError(
          "Saved FM values not found for this product type.",
          404,
        );
      if (row.updated_at.getTime() !== expectedUpdatedAt.getTime())
        throw new FMError(
          "These FM values were changed by someone else. Reload the saved values before editing.",
          409,
        );
      const fields = row.field_snapshot as unknown as FMField[];
      const previous = row.answers as FMAnswers;
      const answers = validateAnswers(fields, input.answers, !row.is_complete);
      const files = await answerFiles(
        db,
        input.vendorId,
        input.leadId,
        fields,
        answers,
      );
      const changed = await db.fMRequirementResponse.updateMany({
        where: {
          id: row.id,
          vendor_id: input.vendorId,
          lead_id: input.leadId,
          updated_at: expectedUpdatedAt,
        },
        data: {
          answers: answers as Prisma.InputJsonValue,
          updated_by: input.actorId,
        },
      });
      if (changed.count !== 1)
        throw new FMError(
          "These FM values were changed by someone else. Reload the saved values before editing.",
          409,
        );

      // Keep the standard FM document/photo lists consistent when their saved upload values change.
      const otherResponses = await db.fMRequirementResponse.findMany({
        where: {
          vendor_id: input.vendorId,
          lead_id: input.leadId,
          id: { not: row.id },
        },
      });
      for (const [purpose, tag] of [
        ["site_photos", "Type 10"],
        ["measurement_document", "Type 9"],
      ] as const) {
        const idsFor = (snapshot: FMField[], values: FMAnswers) =>
          visibleFields(snapshot, values)
            .filter((field) => field.purpose === purpose)
            .flatMap((field) => (values[field.key] ?? []) as string[]);
        const before = new Set(idsFor(fields, previous));
        const after = new Set(idsFor(fields, answers));
        const shared = new Set(
          otherResponses.flatMap((response) =>
            idsFor(
              response.field_snapshot as unknown as FMField[],
              response.answers as FMAnswers,
            ),
          ),
        );
        const added = files.filter(
          (file) => file.purpose === purpose && !before.has(file.id),
        );
        const removedIds = [...before].filter(
          (id) => !after.has(id) && !shared.has(id),
        );
        if (!added.length && !removedIds.length) continue;
        const type = await db.documentTypeMaster.findFirst({
          where: { vendor_id: input.vendorId, tag },
          select: { id: true },
        });
        if (!type)
          throw new FMError(
            "The standard FM document type is not configured for this vendor.",
          );
        if (removedIds.length) {
          const removed = await db.fMRequirementUpload.findMany({
            where: {
              id: { in: removedIds },
              vendor_id: input.vendorId,
              lead_id: input.leadId,
            },
          });
          await db.leadDocuments.updateMany({
            where: {
              vendor_id: input.vendorId,
              lead_id: input.leadId,
              doc_type_id: type.id,
              doc_sys_name: { in: removed.map((file) => file.storage_key) },
              is_deleted: false,
              product_structure_instance_id: null,
            },
            data: {
              is_deleted: true,
              deleted_by: input.actorId,
              deleted_at: new Date(),
            },
          });
        }
        for (const file of added) {
          const existing = await db.leadDocuments.findFirst({
            where: {
              vendor_id: input.vendorId,
              lead_id: input.leadId,
              doc_type_id: type.id,
              doc_sys_name: file.storage_key,
              is_deleted: false,
              product_structure_instance_id: null,
            },
            select: { id: true },
          });
          if (!existing)
            await db.leadDocuments.create({
              data: {
                vendor_id: input.vendorId,
                lead_id: input.leadId,
                account_id: lead.account_id,
                doc_type_id: type.id,
                doc_og_name: file.original_name,
                doc_sys_name: file.storage_key,
                created_by: input.actorId,
              },
            });
        }
      }
      return { message: "FM values updated successfully." };
    },
    { isolationLevel: "Serializable", timeout: 20000 },
  );
}
