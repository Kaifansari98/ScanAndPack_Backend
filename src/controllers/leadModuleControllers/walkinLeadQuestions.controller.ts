import { NextFunction, Request, Response } from "express";
import { prisma } from "../../prisma/client";
import { getQuestionnaire, requireWalkinSource, resetQuestionnaire, saveQuestionnaire } from "../../services/leadModuleServices/walkinLeadQuestions/questionnaire.service";
import { requireLeadAccess, updateLeadAnswer, updateLeadAnswers } from "../../services/leadModuleServices/walkinLeadQuestions/response.service";
import { allowedMimeTypes, maxFileSize, parseAnswerGroups, parseAnswerValue, WalkinValidationError } from "../../services/leadModuleServices/walkinLeadQuestions/validation";
import { generateSignedUrl, uploadWalkinReferenceFile } from "../../utils/wasabiClient";
import logger from "../../utils/logger";

function positiveId(value: unknown) {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw new WalkinValidationError("A positive integer ID is required");
  return id;
}
function actor(req: Request) {
  const user = (req as any).user;
  const vendorId = positiveId(req.params.vendorId);
  if (Number(user?.vendor_id) !== vendorId) throw new WalkinValidationError("Vendor access denied", 403);
  return { vendorId, userId: positiveId(user?.id), role: String(user?.user_type ?? "").toLowerCase() };
}
function admin(req: Request) {
  const user = actor(req);
  if (!["admin", "super-admin"].includes(user.role)) throw new WalkinValidationError("Only admins can configure walk-in questions", 403);
  return user;
}
const handle = (fn: (req: Request) => Promise<unknown>) => async (req: Request, res: Response) => {
  try { res.json({ success: true, data: await fn(req) }); }
  catch (error) {
    if (error instanceof WalkinValidationError) return res.status(error.statusCode).json({ success: false, message: error.message });
    logger.error("Walk-in lead questionnaire request failed", { error });
    res.status(500).json({ success: false, message: "Unable to process walk-in questionnaire" });
  }
};
export const checkWalkinVendorAccess = (req: Request, res: Response, next: NextFunction) => {
  try { actor(req); next(); }
  catch (error) { res.status(error instanceof WalkinValidationError ? error.statusCode : 403).json({ success: false, message: (error as Error).message }); }
};
// Vendors with the feature switched off get no walk-in question data at all.
export const requireWalkinFeature = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const vendor = await prisma.vendorMaster.findUnique({
      where: { id: Number(req.params.vendorId) },
      select: { is_walkin_questions_feature_enabled: true },
    });
    if (!vendor?.is_walkin_questions_feature_enabled) {
      return res.status(403).json({ success: false, message: "Walk-in questions are not enabled for this vendor" });
    }
    next();
  } catch (error) {
    logger.error("Walk-in questions feature check failed", { error });
    res.status(500).json({ success: false, message: "Unable to process walk-in questionnaire" });
  }
};
export const getQuestions = handle(async req => {
  const { vendorId } = actor(req);
  if (req.query.source_id !== undefined) await requireWalkinSource(prisma, vendorId, positiveId(req.query.source_id));
  if (typeof req.query.product_type_ids !== "string") throw new WalkinValidationError("product_type_ids must be comma-separated IDs");
  const ids = [...new Set(req.query.product_type_ids.split(",").map(positiveId))];
  if (!ids.length || ids.length > 50) throw new WalkinValidationError("Select between 1 and 50 furniture types");
  return Promise.all(ids.map(id => getQuestionnaire(vendorId, id)));
});
export const putQuestions = handle(async req => {
  const { vendorId, userId } = admin(req);
  return saveQuestionnaire(vendorId, positiveId(req.params.productTypeId), userId, req.body.questions);
});
export const deleteQuestions = handle(async req => {
  const { vendorId } = admin(req);
  return resetQuestionnaire(vendorId, positiveId(req.params.productTypeId));
});
export const putAnswers = handle(async req => {
  const { vendorId, userId, role } = actor(req);
  return updateLeadAnswers(vendorId, positiveId(req.params.leadId), userId, role, parseAnswerGroups(req.body.walkin_answers));
});
export const patchAnswer = handle(async req => {
  const { vendorId, userId, role } = actor(req);
  return updateLeadAnswer(vendorId, positiveId(req.params.leadId), userId, role, positiveId(req.params.productTypeId), String(req.params.questionKey), parseAnswerValue(req.body.value));
});
export const getAnswers = handle(async req => {
  const { vendorId, userId, role } = actor(req);
  const leadId = positiveId(req.params.leadId);
  await requireLeadAccess(vendorId, leadId, userId, role);
  const responses = await prisma.walkinLeadResponse.findMany({ where: { vendor_id: vendorId, lead_id: leadId }, include: { productType: { select: { id: true, type: true } } }, orderBy: { product_type_id: "asc" } });
  const ids = new Set<string>();
  for (const row of responses) {
    const questions = row.question_snapshot as { key: string; type: string }[];
    const answers = row.answers as Record<string, unknown>;
    for (const q of questions.filter(q => q.type === "file")) {
      const value = answers[q.key];
      if (Array.isArray(value)) value.forEach(id => ids.add(String(id)));
    }
  }
  const files = await prisma.walkinLeadUpload.findMany({ where: { id: { in: [...ids] }, vendor_id: vendorId } });
  const attachments = await Promise.all(files.map(async ({ storage_key, ...file }) => ({ ...file, url: await generateSignedUrl(storage_key, 3600, "inline", file.original_name) })));
  return { responses, attachments };
});
export const uploadReference = handle(async req => {
  const { vendorId, userId } = actor(req);
  const file = req.file;
  if (!file || !allowedMimeTypes.includes(file.mimetype) || file.size > maxFileSize) throw new WalkinValidationError("Upload a JPEG, PNG, WebP, GIF or PDF up to 10 MB");
  // Check signatures as well as the client-supplied MIME type.
  const b = file.buffer;
  const detected = b.subarray(0, 5).toString() === "%PDF-" ? "application/pdf"
    : b.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ? "image/png"
    : b[0] === 255 && b[1] === 216 && b[2] === 255 ? "image/jpeg"
    : ["GIF87a", "GIF89a"].includes(b.subarray(0, 6).toString()) ? "image/gif"
    : b.subarray(0, 4).toString() === "RIFF" && b.subarray(8, 12).toString() === "WEBP" ? "image/webp" : null;
  if (detected !== file.mimetype) throw new WalkinValidationError("File contents do not match the selected file type");
  const storageKey = await uploadWalkinReferenceFile(file.buffer, vendorId, file.mimetype);
  const { storage_key, ...saved } = await prisma.walkinLeadUpload.create({ data: { vendor_id: vendorId, created_by: userId, original_name: file.originalname.slice(0, 255), storage_key: storageKey, mime_type: file.mimetype, size_bytes: file.size } });
  return { ...saved, url: await generateSignedUrl(storage_key, 3600, "inline", saved.original_name) };
});
