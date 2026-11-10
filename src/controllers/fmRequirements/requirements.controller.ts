import { NextFunction, Request, Response } from "express";
import { prisma } from "../../prisma/client";
import {
  getFMLead,
  getFMQuestionnaire,
  requireFMLead,
  requireFMVendor,
  clearFMQuestionnaire,
  saveFMDraft,
  saveFMQuestionnaire,
  updateSavedFMAnswers,
} from "../../services/fmRequirements/requirements.service";
import {
  DOCUMENT_TYPES,
  canEditFMValues,
  FMError,
  FM_MAX_FILE_SIZE,
  parseGroups,
  validFMFileSignature,
} from "../../services/fmRequirements/schema";
import { FinalMeasurementService } from "../../services/leadModuleServices/finalMeasurementStage/finalMeasurement.service";
import {
  generateSignedUrl,
  uploadFMRequirementFile,
} from "../../utils/wasabiClient";
import logger from "../../utils/logger";
export const positiveId = (value: unknown) => {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0)
    throw new FMError("A positive integer ID is required.");
  return id;
};
function actor(req: Request, write = false, master = false) {
  const user = (req as any).user;
  const vendorId = positiveId(req.params.vendorId);
  const role = String(user?.user_type ?? "")
    .trim()
    .toLowerCase();
  if (Number(user?.vendor_id) !== vendorId)
    throw new FMError("Vendor access denied.", 403);
  if (write && !master && !canEditFMValues(role))
    throw new FMError(
      "Only site-supervisor, super-admin and head-site-supervisor can edit FM values.",
      403,
    );
  if (master && !["admin", "super-admin"].includes(role))
    throw new FMError("Only admins can manage FM Requirements.", 403);
  return { vendorId, actorId: positiveId(user?.id), role };
}
const handle =
  (fn: (req: Request) => Promise<unknown>) =>
  async (req: Request, res: Response) => {
    try {
      res.json({ success: true, data: await fn(req) });
    } catch (error) {
      const known = error as {
        statusCode?: number;
        message?: string;
        code?: string;
      };
      if (known.statusCode)
        return res
          .status(known.statusCode)
          .json({ success: false, message: known.message });
      if (known.code === "P2034")
        return res.status(409).json({
          success: false,
          message: "Requirements changed while saving. Reload and try again.",
        });
      logger.error("FM Requirements request failed", { error });
      res.status(500).json({
        success: false,
        message: "Unable to process FM Requirements.",
      });
    }
  };
export const checkFMAccess = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const user = actor(req);
    await requireFMVendor(user.vendorId);
    next();
  } catch (error) {
    res
      .status((error as FMError).statusCode ?? 500)
      .json({ success: false, message: (error as Error).message });
  }
};
export const getQuestions = handle(async (req) => {
  const { vendorId } = actor(req);
  const raw = req.query.product_type_ids;
  if (typeof raw !== "string") throw new FMError("Provide product_type_ids.");
  const ids = [...new Set(raw.split(",").map(positiveId))];
  if (ids.length > 50) throw new FMError("Select up to 50 product types.");
  return Promise.all(ids.map((id) => getFMQuestionnaire(vendorId, id)));
});
export const putQuestions = handle(async (req) => {
  const { vendorId, actorId } = actor(req, true, true);
  return saveFMQuestionnaire(
    vendorId,
    positiveId(req.params.productTypeId),
    actorId,
    req.body.fields,
    req.body.revision,
  );
});
export const clearQuestions = handle(async (req) => {
  const { vendorId } = actor(req, true, true);
  return clearFMQuestionnaire(vendorId, positiveId(req.params.productTypeId));
});
export const getLead = handle(async (req) => {
  const { vendorId, actorId, role } = actor(req);
  const data = await getFMLead(
    vendorId,
    positiveId(req.params.leadId),
    actorId,
    role,
  );
  const uploads = await Promise.all(
    data.uploads.map(async ({ storage_key, ...file }) => ({
      ...file,
      url: await generateSignedUrl(
        storage_key,
        3600,
        "inline",
        file.original_name,
      ),
    })),
  );
  return { ...data, uploads };
});
export const saveDraft = handle(async (req) => {
  const { vendorId, actorId, role } = actor(req, true);
  await saveFMDraft(
    vendorId,
    positiveId(req.params.leadId),
    actorId,
    role,
    parseGroups(req.body.groups),
  );
  return { message: "FM requirements draft saved." };
});
export const submit = handle(async (req) => {
  const { vendorId, actorId, role } = actor(req, true);
  const leadId = positiveId(req.params.leadId);
  const lead = await requireFMLead(vendorId, leadId, actorId, role);
  if (!lead.account_id)
    throw new FMError(
      "The lead needs an account before completing Final Measurement.",
    );
  const groups = parseGroups(req.body.groups);
  const notes = req.body.critical_discussion_notes;
  if (
    notes !== undefined &&
    (typeof notes !== "string" || notes.length > 10000)
  )
    throw new FMError("Notes must contain no more than 10,000 characters.");
  return new FinalMeasurementService().createFinalMeasurementStage({
    lead_id: leadId,
    account_id: lead.account_id,
    vendor_id: vendorId,
    created_by: actorId,
    baseUrl:
      req.get("origin") ||
      process.env.CLIENT_BASE_URL ||
      "http://localhost:3000",
    critical_discussion_notes: notes,
    finalMeasurementDocs: [],
    sitePhotos: [],
    fm_requirements: groups,
    fm_requirement_primary_uploads: req.body.primary_uploads,
  });
});
export const upload = handle(async (req) => {
  const { vendorId, actorId, role } = actor(req, true);
  const leadId = positiveId(req.params.leadId);
  await requireFMLead(vendorId, leadId, actorId, role);
  const file = req.file;
  if (
    !file ||
    !DOCUMENT_TYPES.includes(file.mimetype) ||
    file.size > FM_MAX_FILE_SIZE
  )
    throw new FMError(
      "Upload a supported photo, video or document up to 25 MB.",
    );
  if (!validFMFileSignature(file.buffer, file.mimetype))
    throw new FMError("File contents do not match the selected format.");
  const storage_key = await uploadFMRequirementFile(
    file.buffer,
    vendorId,
    leadId,
    file.mimetype,
  );
  const saved = await prisma.fMRequirementUpload.create({
    data: {
      vendor_id: vendorId,
      lead_id: leadId,
      created_by: actorId,
      original_name: file.originalname.slice(0, 255),
      storage_key,
      mime_type: file.mimetype,
      size_bytes: file.size,
    },
  });
  return {
    id: saved.id,
    original_name: saved.original_name,
    mime_type: saved.mime_type,
    size_bytes: saved.size_bytes,
    url: await generateSignedUrl(
      storage_key,
      3600,
      "inline",
      saved.original_name,
    ),
  };
});

export const updateAnswers = handle(async (req) => {
  const { vendorId, actorId, role } = actor(req, true);
  return updateSavedFMAnswers({
    vendorId,
    leadId: positiveId(req.params.leadId),
    productTypeId: positiveId(req.params.productTypeId),
    actorId,
    role,
    answers: req.body.answers,
    expectedUpdatedAt: req.body.expected_updated_at,
  });
});
