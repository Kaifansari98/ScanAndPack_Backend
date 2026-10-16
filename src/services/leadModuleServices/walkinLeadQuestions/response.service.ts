import { Prisma, prisma } from "../../../prisma/client";
import { getQuestionnaire, requireWalkinSource } from "./questionnaire.service";
import { AnswerGroup, AnswerValue, parseAnswerGroups, Question, validateAnswers, WalkinValidationError } from "./validation";

async function requireUploads(db: Prisma.TransactionClient, vendorId: number, questions: Question[], answers: Record<string, AnswerValue>) {
  for (const question of questions.filter(q => q.type === "file")) {
    const ids = (answers[question.key] ?? []) as string[];
    if (!ids.length) continue;
    const uploads = await db.walkinLeadUpload.findMany({ where: { id: { in: ids }, vendor_id: vendorId } });
    if (uploads.length !== ids.length || uploads.some(file =>
      !(question.accepted_mime_types ?? ["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf"]).includes(file.mime_type) ||
      file.size_bytes > (question.max_file_size_bytes ?? 10485760)
    )) throw new WalkinValidationError(`Invalid or unavailable files for ${question.key}`);
  }
}

// Called inside the lead-creation transaction and the standalone answer transaction.
export async function saveWalkinAnswers(db: Prisma.TransactionClient, input: {
  vendorId: number; leadId: number; actorId: number; sourceId: number | null;
  productTypeIds: number[]; groups: AnswerGroup[]; draft: boolean;
}) {
  await requireWalkinSource(db, input.vendorId, input.sourceId);
  const groups = parseAnswerGroups(input.groups);
  const selectedIds = [...new Set(input.productTypeIds)];
  if (!selectedIds.length) throw new WalkinValidationError("Select at least one furniture type for walk-in answers");
  if (groups.some(g => !selectedIds.includes(g.product_type_id))) throw new WalkinValidationError("Answers contain a furniture type not selected for this lead");
  if (!input.draft && selectedIds.some(id => !groups.some(g => g.product_type_id === id))) throw new WalkinValidationError("Answer the questionnaire for every selected furniture type");

  // Validate the entire request before any writes; the caller owns the transaction.
  const prepared = [];
  for (const group of groups) {
    const form = await getQuestionnaire(input.vendorId, group.product_type_id, db);
    if (form.questionnaire_key !== group.questionnaire_key || form.questionnaire_version !== group.questionnaire_version) {
      throw new WalkinValidationError("The questionnaire changed. Reload the questions before submitting.", 409);
    }
    const result = validateAnswers(form.questions, group.answers, input.draft);
    await requireUploads(db, input.vendorId, form.questions, result.answers);
    prepared.push({ form, ...result });
  }
  const rows = [];
  for (const item of prepared) {
    const data = {
      vendor_id: input.vendorId,
      questionnaire_key: item.form.questionnaire_key,
      questionnaire_version: item.form.questionnaire_version,
      question_snapshot: item.form.questions as Prisma.InputJsonValue,
      answers: item.answers as Prisma.InputJsonValue,
      is_complete: item.is_complete,
      updated_by: input.actorId,
    };
    rows.push(await db.walkinLeadResponse.upsert({
      where: { lead_id_product_type_id: { lead_id: input.leadId, product_type_id: item.form.product_type_id } },
      create: { ...data, lead_id: input.leadId, product_type_id: item.form.product_type_id, created_by: input.actorId },
      update: data,
    }));
  }
  return rows;
}

export async function requireLeadAccess(vendorId: number, leadId: number, actorId: number, role: string) {
  const lead = await prisma.leadMaster.findFirst({ where: { id: leadId, vendor_id: vendorId, is_deleted: false } });
  if (!lead) throw new WalkinValidationError("Lead not found", 404);
  if (!["admin", "super-admin"].includes(role) && lead.created_by !== actorId && lead.assign_to !== actorId) {
    const mapping = await prisma.leadUserMapping.findFirst({ where: { vendor_id: vendorId, lead_id: leadId, user_id: actorId, status: "active" } });
    if (!mapping) throw new WalkinValidationError("You do not have access to this lead", 403);
  }
  return lead;
}
export async function updateLeadAnswers(vendorId: number, leadId: number, actorId: number, role: string, groups: AnswerGroup[]) {
  await requireLeadAccess(vendorId, leadId, actorId, role);
  return prisma.$transaction(async db => {
    const lead = await db.leadMaster.findFirst({ where: { id: leadId, vendor_id: vendorId, is_deleted: false } });
    if (!lead) throw new WalkinValidationError("Lead not found", 404);
    const mappings = await db.leadProductMapping.findMany({ where: { vendor_id: vendorId, lead_id: leadId, is_archived: false }, select: { product_type_id: true } });
    return saveWalkinAnswers(db, { vendorId, leadId, actorId, sourceId: lead.source_id, productTypeIds: mappings.map(m => m.product_type_id), groups, draft: lead.is_draft });
  });
}

// Edits one saved answer against the questions the lead was originally asked,
// so it keeps working after the questionnaire master changes.
export async function updateLeadAnswer(vendorId: number, leadId: number, actorId: number, role: string, productTypeId: number, questionKey: string, value: AnswerValue | undefined) {
  const lead = await requireLeadAccess(vendorId, leadId, actorId, role);
  return prisma.$transaction(async db => {
    const response = await db.walkinLeadResponse.findFirst({ where: { vendor_id: vendorId, lead_id: leadId, product_type_id: productTypeId } });
    if (!response) throw new WalkinValidationError("Walk-in answers not found for this furniture type", 404);
    const questions = response.question_snapshot as unknown as Question[];
    const question = questions.find(q => q.key === questionKey);
    if (!question) throw new WalkinValidationError(`Unknown question: ${questionKey}`, 404);
    const merged = { ...(response.answers as Record<string, AnswerValue>) };
    if (value === undefined) delete merged[questionKey];
    else merged[questionKey] = value;
    // Other answers may predate completion rules, so only the edited one is held to "required".
    const result = validateAnswers(questions, merged, true);
    if (question.required && !lead.is_draft && result.answers[questionKey] === undefined) {
      throw new WalkinValidationError("This question is required and cannot be left empty");
    }
    await requireUploads(db, vendorId, [question], result.answers);
    return db.walkinLeadResponse.update({
      where: { id: response.id },
      data: { answers: result.answers as Prisma.InputJsonValue, is_complete: result.is_complete, updated_by: actorId },
    });
  });
}
